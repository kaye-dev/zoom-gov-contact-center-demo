import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { createDatabaseContext } from "../../lib/server/prisma";
import { audioImportCandidates, importAudioMessages, messageCatalog, getImportedAudioMessage, audioImportOperation, type AudioAssetReader } from "../../lib/server/zaad/message-imports";
import { getOutreachMessage } from "../../lib/server/zaad/message-revisions";
import { OutreachContractError } from "../../lib/zaad/outreach-contracts";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";
import type { AudioAsset } from "../../lib/zaad/message-import-contracts";

const scope: OutreachScope = { siteKey: "lg", actorId: "audio-import-actor", all: true, departments: ["resident-support"], live: false };
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (error: unknown) => error instanceof OutreachContractError && error.code === code);
test("audio imports preserve ownership, atomicity, version checks and replay", { timeout: 180000 }, async t => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl });
    const db = context.prisma;
    try {
      await db.user.create({ data: { id: scope.actorId, name: "Test", email: "audio@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      await db.globalDeveloperApiSetting.create({ data: { id: "global", accountId: "audio-account", clientId: "synthetic" } });
      const assets: AudioAsset[] = ["a", "b", "foreign"].map(id => ({ assetId: id, name: id, type: "audio", archived: false, sourceModifiedAt: null, items: [{ assetItemId: `${id}-item`, name: id, languageCode: "ja-JP", voiceId: null, hasAudioFile: true }] }));
      const reads: string[] = [];
      const reader: AudioAssetReader = { accountId: "audio-account", async listAudioAssets({ nextPageToken }) { return { assets: assets.slice(nextPageToken ? 2 : 0, nextPageToken ? 3 : 2).map(asset => ({ assetId: asset.assetId, name: asset.name })), nextPageToken: nextPageToken ? "" : "page-two" }; }, async getAudioAsset(id) { reads.push(id); return structuredClone(assets.find(asset => asset.assetId === id)!); } };
      await db.zoomResourceBinding.create({ data: { accountId: reader.accountId, zoomId: "foreign", resourceType: "ASSET", ownerSiteKey: "univ", departmentKey: "student-affairs", purpose: "REGULAR" } });
      const candidates = await audioImportCandidates(db, scope, reader);
      assert.deepEqual(candidates.items.map(item => item.assetId), ["a", "b"]);
      assert.ok(!reads.includes("foreign"));
      const input = { operationKey: "audio_import_first", accountId: reader.accountId, departmentKey: "resident-support", items: candidates.items.map(({ assetId, assetItemId, observedDigest, version }) => ({ assetId, assetItemId, observedDigest, version })) };
      await t.test("permissions and ownership reject before provider reads", async () => {
        reads.length = 0;
        await rejects(importAudioMessages(db, { ...scope, all: false }, input, reader), "FULL_ACCESS_REQUIRED");
        await rejects(importAudioMessages(db, scope, { ...input, items: [{ ...input.items[0], assetId: "foreign", assetItemId: "foreign-item" }] }, reader), "RESOURCE_OWNERSHIP_CONFLICT");
        assert.equal(reads.length, 0);
      });
      await t.test("a late version failure rolls back earlier inserts", async () => {
        await rejects(importAudioMessages(db, scope, { ...input, items: [input.items[0], { ...input.items[1], version: 9 }] }, reader), "VERSION_CONFLICT");
        assert.equal(await db.outreachImportedAudioMessage.count(), 0);
        assert.equal(await db.zoomResourceBinding.count({ where: { ownerSiteKey: "lg" } }), 0);
        assert.equal(await db.outreachOperation.count(), 0);
      });
      const result = await importAudioMessages(db, scope, input, reader);
      await t.test("replay does not re-read Zoom or create fake text revisions", async () => {
        reads.length = 0;
        assert.deepEqual(await importAudioMessages(db, scope, input, reader), result);
        assert.equal(reads.length, 0);
        assert.equal(await db.outreachImportedAudioMessage.count(), 2);
        assert.equal(await db.messageRevision.count(), 0);
        assert.equal(await db.zaadOutboundMessage.count(), 0);
        assert.equal((await audioImportOperation(db, scope, input.operationKey)).status, "COMPLETED");
        const detail = await getImportedAudioMessage(db, scope, result.result.ids[0]);
        assert.equal(detail.message.body, null);
        assert.equal(detail.message.bodyState, "UNAVAILABLE");
        assert.equal((await messageCatalog(db, scope)).total, 2);
        await rejects(getOutreachMessage(db, scope, detail.message.id), "NOT_FOUND");
        await rejects(getImportedAudioMessage(db, { ...scope, departments: ["welfare"] }, detail.message.id), "NOT_FOUND");
        await rejects(importAudioMessages(db, scope, { ...input, items: [input.items[0]] }, reader), "OPERATION_CONFLICT");
      });
      await t.test("changed metadata requires refresh and updates one stored row", async () => {
        const before = await audioImportCandidates(db, scope, reader);
        assets[0].items[0].name = "Changed name";
        const selection = (await audioImportCandidates(db, scope, reader)).items[0];
        const pick = ({ assetId, assetItemId, observedDigest, version }: typeof selection) => ({ assetId, assetItemId, observedDigest, version });
        await rejects(importAudioMessages(db, scope, { ...input, operationKey: "audio_stale_metadata", items: [pick(before.items[0])] }, reader), "AUDIO_ASSET_CHANGED");
        await importAudioMessages(db, scope, { ...input, operationKey: "audio_update_metadata", items: [pick(selection)] }, reader);
        const changed = await getImportedAudioMessage(db, scope, result.result.ids[0]);
        assert.equal(changed.message.name, "Changed name");
        assert.equal(changed.message.version, 2);
        assert.equal(await db.outreachImportedAudioMessage.count(), 2);
        await rejects(importAudioMessages(db, scope, { ...input, operationKey: "audio_stale_version", items: [pick(selection)] }, reader), "VERSION_CONFLICT");
      });
      await t.test("account changes and incomplete pagination never return partial candidates", async () => {
        await rejects(audioImportCandidates(db, scope, { ...reader, async listAudioAssets() { return { assets: [], nextPageToken: "loop" }; } }), "ASSET_PAGINATION_LOOP");
        await db.globalDeveloperApiSetting.update({ where: { id: "global" }, data: { accountId: "changed-account" } });
        await rejects(audioImportCandidates(db, scope, reader), "ACCOUNT_CHANGED");
        assert.equal(await db.outreachImportedAudioMessage.count(), 2);
      });
    } finally { await context.close(); }
  });
});
