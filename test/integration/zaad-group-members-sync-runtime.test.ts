import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { createDatabaseContext } from "../../lib/server/prisma";
import { ZoomOutreachProvider } from "../helpers/zoom-outreach-provider";
import { ZaadZoomClient } from "../../lib/server/zaad/zoom-client";
import { encryptDeveloperApiSecret } from "../../lib/server/developer-api-crypto";
import { saveZoomGroup, saveZoomMember, zoomGroupMembers } from "../../lib/server/zaad/zoom-groups";
import { startRegularGroupSync, advanceRegularSync, regularSyncOperation } from "../../lib/server/zaad/regular-group-sync";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";

test("regular group union, tenant scope, durable concurrent sync and external changes", async () => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl }), db = context.prisma;
    const scope: OutreachScope = { siteKey: "lg", actorId: "regular-sync", all: true, live: false };
    const oldKey = process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY; process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      await db.user.create({ data: { id: scope.actorId, name: "Fixture", email: "regular@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      const provider = new ZoomOutreachProvider("fixture-account");
      await db.globalDeveloperApiSetting.create({ data: { id: "global", accountId: provider.accountId, clientId: "fixture", clientSecretEncrypted: encryptDeveloperApiSecret("fixture-secret", "clientSecret") } });
      const client = await ZaadZoomClient.fromDatabase(db, "lg", { fetchImpl: provider.fetch, apiBase: provider.apiBase, tokenUrl: provider.tokenUrl, writeGates: { contact: true, tts: false, campaign: false } });
      const created = await saveZoomGroup(db, scope, { operationKey: "regular-create", name: "Fixture", description: "" }, undefined, client) as { group: { id: string } };
      const person = await db.municipalContact.create({ data: { siteKey: "lg", name: "Original", phone: "+819000000099", district: "central", source: "HP" } });
      await saveZoomMember(db, scope, created.group.id, { operationKey: "regular-member", reference: { siteKey: "lg", kind: "resident", origin: "MUNICIPAL_CONTACT", id: person.id } }, undefined, client);
      await client.createContact(created.group.id, { name: "Remote only", phone: person.phone, email: "" });
      let detail = await zoomGroupMembers(db, scope, created.group.id, client);
      assert.deepEqual(detail.summary, { total: 2, unsynced: 0, synced: 1, zoomOnly: 1 });
      await db.municipalContact.update({ where: { id: person.id }, data: { name: "Changed", version: { increment: 1 } } });
      detail = await zoomGroupMembers(db, scope, created.group.id, client);
      assert.equal(detail.summary.unsynced, 1);
      const payload = { operationKey: "regular-synchronize", revision: detail.group.version };
      const [first, second] = await Promise.all([startRegularGroupSync(db, scope, created.group.id, payload, client), startRegularGroupSync(db, scope, created.group.id, payload, client)]);
      assert.equal(first.operationId, second.operationId);
      await Promise.all([advanceRegularSync(db, scope, first.operationId, client), advanceRegularSync(db, scope, first.operationId, client)]);
      assert.equal((await regularSyncOperation(db, scope, first.operationId, client)).counts.synced, 1);
      detail = await zoomGroupMembers(db, scope, created.group.id, client);
      assert.equal(detail.summary.unsynced, 0);
      assert.equal((await zoomGroupMembers(db, { ...scope, all: false }, created.group.id, client)).summary.unsynced, 0);
      await assert.rejects(regularSyncOperation(db, { ...scope, actorId: "other" }, first.operationId, client));
      await assert.rejects(regularSyncOperation(db, { ...scope, siteKey: "univ" }, first.operationId, client));
      const mapping = await db.zoomContactMembership.findFirstOrThrow({ where: { personId: person.id } });
      await client.updateContact(created.group.id, mapping.zoomContactId, { name: "External edit", phone: person.phone, email: "" });
      const conflict = await startRegularGroupSync(db, scope, created.group.id, { ...payload, operationKey: "regular-conflict" }, client);
      assert.equal((await advanceRegularSync(db, scope, conflict.operationId, client)).status, "PARTIAL");
      assert.equal((await client.listContacts(created.group.id)).find(c => c.id === mapping.zoomContactId)?.displayName, "External edit");
      await client.deleteContact(created.group.id, mapping.zoomContactId);
      detail = await zoomGroupMembers(db, scope, created.group.id, client);
      assert.equal(detail.items.length, 2); assert.equal(detail.items.filter(i => !i.remotePresent).length, 1);
      const unavailable = { ...client, accountId: client.accountId, getContactList: client.getContactList.bind(client), listContacts: async () => { throw new Error("unavailable"); } } as unknown as typeof client;
      assert.equal((await zoomGroupMembers(db, scope, created.group.id, unavailable)).summary.total, null);
    } finally { if (oldKey === undefined) delete process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY; else process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = oldKey; await context.close(); }
  });
});
