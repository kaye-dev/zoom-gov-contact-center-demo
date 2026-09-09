import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { ZoomOutreachProvider } from "../helpers/zoom-outreach-provider";
import { createDatabaseContext } from "../../lib/server/prisma";
import { encryptDeveloperApiSecret } from "../../lib/server/developer-api-crypto";
import { ZaadZoomClient } from "../../lib/server/zaad/zoom-client";
import { deleteZoomGroup, listZoomGroups, saveZoomGroup } from "../../lib/server/zaad/zoom-groups";
import { OutreachContractError } from "../../lib/zaad/outreach-contracts";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";

test("stateful provider exercises the real client and database write/readback boundaries", { timeout: 180000 }, async t => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl });
    const db = context.prisma, previousKey = process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY;
    process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      const scope: OutreachScope = { siteKey: "lg", actorId: "provider-fixture-admin", all: true, departments: ["resident-support"], live: false };
      await db.user.create({ data: { id: scope.actorId, name: "Fixture administrator", email: "provider@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      const provider = new ZoomOutreachProvider("fixture-account");
      await db.siteDeveloperApiSetting.create({ data: { siteKey: "lg", accountId: provider.accountId, clientId: "fixture-client", clientSecretEncrypted: encryptDeveloperApiSecret("fixture-secret", "clientSecret") } });
      const client = await ZaadZoomClient.fromDatabase(db, "lg", { fetchImpl: provider.fetch, apiBase: provider.apiBase, tokenUrl: provider.tokenUrl, writeGates: { contact: true, tts: false, campaign: false } });
      const input = { operationKey: "fixture_group_create", name: "検証用連絡先リスト", description: "保存・再取得の検証", departmentKey: "resident-support" };
      await t.test("connection is observed through OAuth and the actual provider client", async () => {
        assert.equal(await client.probe(), "connected");
        assert.equal((await listZoomGroups(db, scope, client)).total, 0);
      });
      await saveZoomGroup(db, scope, input, undefined, client);
      let row = (await listZoomGroups(db, scope, client)).items[0];
      assert.equal(row.name, input.name);
      await t.test("reload and duplicate submit retain one provider resource and one binding", async () => {
        await saveZoomGroup(db, scope, input, undefined, client);
        assert.equal((await listZoomGroups(db, scope, client)).total, 1);
        assert.equal(await db.zoomResourceBinding.count(), 1);
        assert.equal(provider.requests.filter(r => r.method === "POST" && r.path.endsWith("/contact_lists")).length, 1);
      });
      await t.test("update changes provider readback and advances the database version", async () => {
        await saveZoomGroup(db, scope, { ...input, operationKey: "fixture_group_update", name: "更新後の連絡先リスト", version: row.version, expectedRevision: row.revision }, row.id, client);
        const updated = (await listZoomGroups(db, scope, client)).items[0];
        assert.equal(updated.name, "更新後の連絡先リスト");
        assert.equal(updated.version, row.version + 1);
        assert.notEqual(updated.revision, row.revision);
      });
      await t.test("stale edits are rejected before a second provider write", async () => {
        const writes = provider.requests.filter(r => r.method === "PATCH").length;
        await assert.rejects(saveZoomGroup(db, scope, { ...input, operationKey: "fixture_group_conflict", version: row.version, expectedRevision: row.revision }, row.id, client), (error: unknown) => error instanceof OutreachContractError && error.code === "VERSION_CONFLICT");
        assert.equal(provider.requests.filter(r => r.method === "PATCH").length, writes);
        row = (await listZoomGroups(db, scope, client)).items[0];
      });
      await t.test("successful update with failed readback remains unknown and cannot repeat the write", async () => {
        const snapshot = provider.snapshot();
        // Exhaust the client's single GET retry after the pre-write revision check.
        snapshot.readFailures = [{ path: `/v2/contact_center/outbound_campaign/contact_lists/${row.id}`, skip: 1, remaining: 2 }];
        const uncertainProvider = new ZoomOutreachProvider(provider.accountId, snapshot);
        const uncertainClient = await ZaadZoomClient.fromDatabase(db, "lg", { fetchImpl: uncertainProvider.fetch, apiBase: uncertainProvider.apiBase, tokenUrl: uncertainProvider.tokenUrl, writeGates: { contact: true, tts: false, campaign: false } });
        const before = await db.zoomResourceBinding.findUniqueOrThrow({ where: { id: row.bindingId } });
        const payload = { ...input, operationKey: "fixture_group_uncertain", name: "再取得に失敗した更新", version: row.version, expectedRevision: row.revision };
        await assert.rejects(saveZoomGroup(db, scope, payload, row.id, uncertainClient));
        const operation = await db.outreachOperation.findFirstOrThrow({ where: { operationKey: payload.operationKey } });
        assert.equal(operation.status, "UNKNOWN");
        assert.deepEqual(await db.zoomResourceBinding.findUniqueOrThrow({ where: { id: row.bindingId } }), before);
        assert.equal((await uncertainClient.getContactList(row.id)).name, payload.name);
        const writes = uncertainProvider.requests.filter(request => request.method === "PATCH").length;
        assert.equal(writes, 1);
        await assert.rejects(saveZoomGroup(db, scope, payload, row.id, uncertainClient));
        assert.equal(uncertainProvider.requests.filter(request => request.method === "PATCH").length, writes);
        assert.equal((await db.outreachOperation.findUniqueOrThrow({ where: { id: operation.id } })).status, "UNKNOWN");
      });
      await t.test("detach retains the provider list and tombstones only the binding", async () => {
        const providerBefore = provider.snapshot();
        await deleteZoomGroup(db, scope, row.id, { operationKey: "fixture_group_delete", version: row.version }, client);
        assert.equal((await listZoomGroups(db, scope, client)).total, 0);
        assert.deepEqual(provider.snapshot(), providerBefore);
        assert.equal((await db.zoomResourceBinding.findUniqueOrThrow({ where: { id: row.bindingId } })).tombstone, true);
      });
      await t.test("unknown endpoints and external origins never fall back to live network", async () => {
        await assert.rejects(provider.fetch("https://api.zoom.us/v2/contact_center/queues"), /external origin/);
        await assert.rejects(provider.fetch(`${provider.apiBase}/unsupported`, { headers: { authorization: `Bearer fixture-${provider.accountId}` } }), /Unsupported fixture endpoint/);
      });
    } finally {
      if (previousKey === undefined) delete process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY;
      else process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = previousKey;
      await context.close();
    }
  });
});
