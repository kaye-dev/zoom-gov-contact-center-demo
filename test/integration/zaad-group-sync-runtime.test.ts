import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { ZoomOutreachProvider } from "../helpers/zoom-outreach-provider";
import { createDatabaseContext } from "../../lib/server/prisma";
import { encryptDeveloperApiSecret } from "../../lib/server/developer-api-crypto";
import { ZaadZoomClient } from "../../lib/server/zaad/zoom-client";
import { groupSyncCandidates, syncContactLists, groupSyncOperation, type ContactListReader } from "../../lib/server/zaad/group-sync";
import { deleteZoomGroup, listZoomGroups, requireZoomBinding, saveZoomGroup } from "../../lib/server/zaad/zoom-groups";
import { OutreachContractError } from "../../lib/zaad/outreach-contracts";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, error => error instanceof OutreachContractError && error.code === code);

test("group sync shares only lists, preserves CRM and migrates existing bindings without data loss", { timeout: 180000 }, async t => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl }), db = context.prisma;
    const priorKey = process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY;
    process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    const scope: OutreachScope = { siteKey: "lg", actorId: "group-sync-admin", all: true, live: false };
    const univ: OutreachScope = { ...scope, siteKey: "univ" };
    try {
      await db.user.create({ data: { id: scope.actorId, name: "Fixture admin", email: "group-sync@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      const accountId = "fixture-group-account";
      await db.globalDeveloperApiSetting.create({ data: { id: "global", accountId, clientId: "fixture-client", clientSecretEncrypted: encryptDeveloperApiSecret("fixture-secret", "clientSecret") } });
      const provider = new ZoomOutreachProvider(accountId, {
        accountId, lists: [1, 2, 3, 4, 5].map(n => ({ contact_list_id: `fixture-list-${n}`, contact_list_name: `Fixture list ${n}`, contact_list_type: "contact", updated_at: "2026-09-09T01:00:00Z" })),
        members: { "fixture-list-1": [{ contact_id: "fixture-contact-10", display_name: "Fixture person", phone_numbers: [{ phone_number: "+819000000010", phone_type: "mobile" }] }] }, campaigns: [],
      });
      const client = await ZaadZoomClient.fromDatabase(db, "lg", { fetchImpl: provider.fetch, apiBase: provider.apiBase, tokenUrl: provider.tokenUrl, writeGates: { contact: true, tts: false, campaign: false } });
      const payload = (key: string, ids = ["fixture-list-1", "fixture-list-2"]) => ({ operationKey: `fixture-${key}`, accountId, contactListIds: ids });
      const oldBinding = await db.zoomResourceBinding.create({ data: { ownerSiteKey: "lg", accountId, resourceType: "CONTACT_LIST", zoomId: "fixture-list-1", purpose: "REGULAR" } });
      const crm = await db.municipalContact.create({ data: { siteKey: "lg", name: "Fixture existing person", phone: "+819000000010", source: "MANUAL" } });
      const membership = await db.zoomContactMembership.create({ data: { siteKey: "lg", bindingId: oldBinding.id, zoomContactId: "fixture-contact-10", personOrigin: "MUNICIPAL_CONTACT", personId: crm.id, observedDigest: "fixture", syncState: "LINKED" } });
      const crmBefore = await db.municipalContact.findMany();
      const snapshotBefore = provider.snapshot();
      await t.test("upgrade preserves IDs, departments and memberships", async () => {
        const sql = new Client({ connectionString: databaseUrl }); await sql.connect();
        try {
          await sql.query('DROP INDEX "zoom_resource_bindings_site_resource_key"; DROP INDEX "zoom_resource_bindings_exclusive_resource_key"; CREATE UNIQUE INDEX "zoom_resource_bindings_accountId_resourceType_zoomId_key" ON "zoom_resource_bindings"("accountId", "resourceType", "zoomId")');
          await sql.query(await readFile(new URL("../../prisma/migrations/20260909130000_shared_contact_list_bindings/migration.sql", import.meta.url), "utf8"));
        } finally { await sql.end(); }
        assert.deepEqual(await db.zoomResourceBinding.findUnique({ where: { id: oldBinding.id } }), oldBinding);
        assert.deepEqual(await db.zoomContactMembership.findUnique({ where: { id: membership.id } }), membership);
      });
      await t.test("same list can be added to both tenants without importing CRM contacts or Zoom writes", async () => {
        assert.equal((await syncContactLists(db, scope, payload("sync-lg"), client)).status, "COMPLETED");
        assert.equal((await syncContactLists(db, univ, payload("sync-univ"), client)).status, "COMPLETED");
        assert.equal((await listZoomGroups(db, scope, client)).total, 2);
        assert.equal((await listZoomGroups(db, univ, client)).total, 2);
        assert.equal((await groupSyncCandidates(db, scope, client)).items.filter(row => row.added).length, 2);
        assert.deepEqual(await db.municipalContact.findMany(), crmBefore);
        for (const count of [await db.universityContact.count(), await db.outreachImportCandidate.count(), await db.crmImportJob.count()]) assert.equal(count, 0);
        assert.deepEqual(provider.snapshot(), snapshotBefore);
        assert.equal(provider.requests.some(row => row.method !== "GET" && row.path !== "/oauth/token"), false);
      });
      await t.test("operation replay is idempotent and a different selection conflicts", async () => {
        const bindings = await db.zoomResourceBinding.findMany();
        await syncContactLists(db, scope, payload("sync-lg"), client);
        await syncContactLists(db, scope, payload("sync-lg-second-key"), client);
        assert.deepEqual(await db.zoomResourceBinding.findMany(), bindings);
        assert.equal((await groupSyncOperation(db, scope, "fixture-sync-lg")).status, "COMPLETED");
        await rejects(groupSyncOperation(db, { ...scope, actorId: "different-actor" }, "fixture-sync-lg"), "NOT_FOUND");
        await rejects(syncContactLists(db, scope, payload("sync-lg", ["fixture-list-3"]), client), "OPERATION_CONFLICT");
      });
      await t.test("sharing preserves tenant membership and other resource ownership", async () => {
        const common = { accountId, ownerSiteKey: "lg", purpose: "REGULAR", zoomId: "fixture-resource" };
        for (const resourceType of ["CAMPAIGN", "FLOW", "ASSET"]) {
          await db.zoomResourceBinding.create({ data: { ...common, resourceType } });
          await assert.rejects(db.zoomResourceBinding.create({ data: { ...common, resourceType, ownerSiteKey: "univ" } }));
        }
        await assert.rejects(db.zoomResourceBinding.create({ data: { ...common, resourceType: "CONTACT_LIST", zoomId: "fixture-list-1" } }));
        assert.equal((await listZoomGroups(db, { ...univ, all: false }, client)).total, 2);
        assert.equal((await requireZoomBinding(db, { ...univ, all: false }, client, "CONTACT_LIST", "fixture-list-1")).ownerSiteKey, "univ");
      });
      await t.test("detach affects only the current tenant and re-add restores the same binding", async () => {
        const before = await db.zoomResourceBinding.findFirstOrThrow({ where: { ownerSiteKey: "lg", zoomId: "fixture-list-1", resourceType: "CONTACT_LIST" } });
        const univBefore = await db.zoomResourceBinding.findFirstOrThrow({ where: { ownerSiteKey: "univ", zoomId: "fixture-list-1", resourceType: "CONTACT_LIST" } });
        const calls = provider.requests.length;
        await deleteZoomGroup(db, scope, before.zoomId, { operationKey: "detach-list", version: before.version }, client);
        await deleteZoomGroup(db, scope, before.zoomId, { operationKey: "detach-list", version: before.version }, client);
        assert.equal(provider.requests.length, calls);
        assert.equal((await listZoomGroups(db, scope, client)).total, 1);
        assert.deepEqual(await db.zoomResourceBinding.findUnique({ where: { id: univBefore.id } }), univBefore);
        assert.deepEqual(await db.zoomContactMembership.findUnique({ where: { id: membership.id } }), membership);
        assert.deepEqual(await db.municipalContact.findMany(), crmBefore);
        await syncContactLists(db, scope, payload("re-add", [before.zoomId]), client);
        const restored = await db.zoomResourceBinding.findUniqueOrThrow({ where: { id: before.id } });
        assert.equal(restored.tombstone, false); assert.equal("departmentKey" in restored, false);
        assert.deepEqual(await db.zoomContactMembership.findUnique({ where: { id: membership.id } }), membership);
        assert.deepEqual(provider.snapshot(), snapshotBefore);
      });
      await t.test("account changes during provider read roll back the entire addition", async () => {
        let changed = false;
        const reader: ContactListReader = { accountId, listContactLists: client.listContactLists.bind(client), getContactList: async id => { const result = await client.getContactList(id); if (!changed) { changed = true; await db.globalDeveloperApiSetting.update({ where: { id: "global" }, data: { accountId: "changed" } }); } return result; } };
        await rejects(syncContactLists(db, scope, payload("account-race", ["fixture-list-3"]), reader), "ACCOUNT_CHANGED");
        assert.equal(await db.zoomResourceBinding.count({ where: { zoomId: "fixture-list-3" } }), 0);
        await db.globalDeveloperApiSetting.update({ where: { id: "global" }, data: { accountId } });
      });
      await t.test("missing IDs and internal dispatch resources cannot partially add lists", async () => {
        await assert.rejects(syncContactLists(db, scope, payload("missing-id", ["fixture-list-3", "fixture-list-99"]), client));
        assert.equal(await db.zoomResourceBinding.count({ where: { zoomId: "fixture-list-3" } }), 0);
        await db.zoomResourceBinding.create({ data: { ownerSiteKey: "univ", accountId, resourceType: "CONTACT_LIST", zoomId: "fixture-list-4", purpose: "ONE_TIME", dispatchId: "fixture-dispatch" } });
        await rejects(syncContactLists(db, scope, payload("internal-list", ["fixture-list-3", "fixture-list-4"]), client), "RESOURCE_OWNERSHIP_CONFLICT");
        assert.equal(await db.zoomResourceBinding.count({ where: { zoomId: "fixture-list-3" } }), 0);
      });
      await t.test("concurrent additions can be retried without duplicate bindings", async () => {
        const inputs = [payload("concurrent-a", ["fixture-list-3"]), payload("concurrent-b", ["fixture-list-3"])];
        const outcomes = await Promise.allSettled(inputs.map(input => syncContactLists(db, scope, input, client)));
        for (let i = 0; i < outcomes.length; i++) if (outcomes[i].status === "rejected") await syncContactLists(db, scope, inputs[i], client);
        assert.equal(await db.zoomResourceBinding.count({ where: { ownerSiteKey: "lg", accountId, zoomId: "fixture-list-3", resourceType: "CONTACT_LIST" } }), 1);
      });
      await t.test("editing a shared list updates Zoom and the other tenant observes it", async () => {
        const before = (await listZoomGroups(db, scope, client)).items.find(row => row.id === "fixture-list-1")!;
        await saveZoomGroup(db, scope, { operationKey: "shared-edit", name: "Shared updated group", description: "Updated", version: before.version, expectedRevision: before.revision }, before.id, client);
        const other = (await listZoomGroups(db, univ, client)).items.find(row => row.id === before.id)!;
        assert.equal(other.name, "Shared updated group");
        assert.deepEqual(await db.municipalContact.findMany(), crmBefore);
      });
    } finally {
      if (priorKey === undefined) delete process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY; else process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = priorKey;
      await context.close();
    }
  });
});
