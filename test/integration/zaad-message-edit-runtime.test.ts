import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { audioFixture } from "../helpers/outreach-audio";
import { createDatabaseContext } from "../../lib/server/prisma";
import { editImportedAudioMessage, unlinkImportedAudioMessage } from "../../lib/server/zaad/message-edit";
import { audioImportCandidates, getImportedAudioMessage, importAudioMessages, messageCatalog } from "../../lib/server/zaad/message-imports";
import { saveOutreachMessage } from "../../lib/server/zaad/message-revisions";
import { ZaadZoomError } from "../../lib/server/zaad/zoom-client";
import { ZAAD_ERROR_CODES } from "../../lib/zaad/contracts";
import { OutreachContractError } from "../../lib/zaad/outreach-contracts";

const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, error => error instanceof OutreachContractError && error.code === code);
test("MESSAGE-WRITE-02: persistent edit ownership, replay, provider uncertainty and local unlink", { timeout: 180_000 }, async t => {
  await withIsolatedPostgresDatabase(async url => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }), db = context.prisma;
    try {
      const f = await audioFixture(db), { scope, id, provider } = f;
      const text = await saveOutreachMessage(db, scope, { name: "Separate text", body: "Historical text", languageCode: "ja-JP", voiceId: "Takumi" });
      const originalSnapshots = await db.messageRevision.findMany(), other = structuredClone(f.assets[0].items[1]);
      await t.test("same content expectation protects updates and keys replay without another provider PATCH", async () => {
        const input = await f.edit({ name: "Renamed" });
        await rejects(editImportedAudioMessage(db, { ...scope, all: false }, id, input, provider), "FULL_ACCESS_REQUIRED");
        await rejects(editImportedAudioMessage(db, { ...scope, siteKey: "univ" }, id, input, provider), "NOT_FOUND");
        const first = await editImportedAudioMessage(db, scope, id, input, provider), count = f.calls.filter(call => call === "PATCH").length;
        assert.equal((await f.current()).name, "Renamed");
        assert.deepEqual(await editImportedAudioMessage(db, scope, id, input, provider), first);
        assert.equal(f.calls.filter(call => call === "PATCH").length, count);
        await rejects(editImportedAudioMessage(db, scope, id, { ...input, name: "Other" }, provider), "OPERATION_CONFLICT");
        await rejects(editImportedAudioMessage(db, scope, id, { ...input, operationKey: "stale_edit_attempt" }, provider), "CONTENT_CHANGED");
        assert.equal((await f.current()).bodyState, "PROVIDER_RETURNED");
      });
      await t.test("missing readback text records explicit authored text and later GET records its actual origin", async () => {
        f.setReturnBody(false); await getImportedAudioMessage(db, scope, id, provider);
        const input = await f.edit({ replaceAudio: true, body: "新しく入力した全文", voiceId: "Tomoko" });
        await editImportedAudioMessage(db, scope, id, input, provider);
        assert.equal((await f.current()).bodyState, "USER_AUTHORED");
        assert.equal((await f.current()).body, "新しく入力した全文");
        f.setReturnBody(true);
        assert.equal((await getImportedAudioMessage(db, scope, id, provider)).message.bodyState, "PROVIDER_RETURNED");
        const before = await f.current();
        const failed = await getImportedAudioMessage(db, scope, id, { ...provider, async getAudioAsset() { throw new Error("synthetic read failure"); } });
        assert.equal(failed.message.bodyState, "UNCHECKED"); assert.equal(failed.message.body, before.body); assert.equal(failed.message.bodyFetchedAt, before.bodyFetchedAt);
        assert.equal((await f.current()).bodyState, "PROVIDER_RETURNED");
      });
      await t.test("same-item edit, unlink and import cannot overlap an applying provider operation", async () => {
        const input = await f.edit({ name: "Concurrent rename" });
        let release!: () => void, started!: () => void;
        const barrier = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
        const pending = editImportedAudioMessage(db, scope, id, input, { ...provider, async updateAudioAssetItem(value) { started(); await barrier; await provider.updateAudioAssetItem(value); } });
        await entered;
        await rejects(editImportedAudioMessage(db, scope, id, await f.edit({ name: "Second" }), provider), "AUDIO_OPERATION_IN_PROGRESS");
        const { operationKey, expectedUpdatedAt, expectedDigest } = await f.edit();
        const unlink = { operationKey, expectedUpdatedAt, expectedDigest };
        await rejects(unlinkImportedAudioMessage(db, scope, id, unlink), "AUDIO_OPERATION_IN_PROGRESS");
        const candidates = await audioImportCandidates(db, scope, provider);
        await rejects(importAudioMessages(db, scope, { operationKey: "concurrent_audio_import", accountId: provider.accountId, items: candidates.items.filter(row => row.assetItemId === "ja").map(({ assetId, assetItemId, observedDigest, expectedUpdatedAt }) => ({ assetId, assetItemId, observedDigest, expectedUpdatedAt })) }, provider), "AUDIO_OPERATION_IN_PROGRESS");
        release(); await pending;
      });
      await t.test("uncertain TTS never resubmits; missing text cannot promote metadata to success", async () => {
        f.setReturnBody(false); await getImportedAudioMessage(db, scope, id, provider);
        const input = await f.edit({ replaceAudio: true, body: "結果確認が必要な全文", voiceId: "Takumi" });
        const uncertain = { ...provider, async updateAudioAssetItem(value: Parameters<typeof provider.updateAudioAssetItem>[0]) { await provider.updateAudioAssetItem(value); throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true); } };
        await rejects(editImportedAudioMessage(db, scope, id, input, uncertain), "AUDIO_UPDATE_RESULT_UNKNOWN");
        const writes = f.calls.filter(call => call === "PATCH").length;
        await rejects(editImportedAudioMessage(db, scope, id, input, uncertain), "AUDIO_UPDATE_RESULT_UNKNOWN");
        assert.equal(f.calls.filter(call => call === "PATCH").length, writes);
        assert.equal(await db.outreachMessageLock.count(), 1);
        f.setReturnBody(true);
        await editImportedAudioMessage(db, scope, id, input, uncertain);
        assert.equal(f.calls.filter(call => call === "PATCH").length, writes);
        assert.equal(await db.outreachMessageLock.count(), 0);
      });
      await t.test("external success plus readback or local commit failure remains recoverable by the same key", async () => {
        const input = await f.edit({ name: "Recoverable" }); let patched = false;
        await rejects(editImportedAudioMessage(db, scope, id, input, { ...provider, async updateAudioAssetItem(value) { await provider.updateAudioAssetItem(value); patched = true; }, async getAudioAsset(assetId) { if (patched) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502); return provider.getAudioAsset(assetId); } }), "AUDIO_UPDATE_RESULT_UNKNOWN");
        assert.equal(await db.outreachMessageLock.count(), 1);
        await editImportedAudioMessage(db, scope, id, input, provider);
        const next = await f.edit({ name: "DB recovery" });
        let transactions = 0;
        const proxy = new Proxy(db, { get(target, key) { if (key === "$transaction") return (...args: unknown[]) => { transactions++; if (transactions === 2) throw new Error("synthetic commit failure"); return Reflect.apply(target.$transaction, target, args); }; return Reflect.get(target, key); } });
        await rejects(editImportedAudioMessage(proxy, scope, id, next, provider), "AUDIO_UPDATE_RESULT_UNKNOWN");
        const writes = f.calls.filter(call => call === "PATCH").length;
        await editImportedAudioMessage(db, scope, id, next, provider);
        assert.equal((await f.current()).name, "DB recovery"); assert.equal(f.calls.filter(call => call === "PATCH").length, writes);
      });
      await t.test("unlink preserves provider, ownership and history; only explicit reimport restores the row", async () => {
        const { operationKey, expectedUpdatedAt: unlinkUpdatedAt, expectedDigest } = await f.edit();
        const input = { operationKey, expectedUpdatedAt: unlinkUpdatedAt, expectedDigest };
        const before = f.calls.length;
        const result = await unlinkImportedAudioMessage(db, scope, id, input);
        assert.equal(f.calls.length, before);
        assert.deepEqual(await unlinkImportedAudioMessage(db, scope, id, input), result);
        assert.equal((await messageCatalog(db, scope)).items.some(row => row.id === id), false);
        await rejects(getImportedAudioMessage(db, scope, id, provider), "NOT_FOUND");
        assert.equal((await audioImportCandidates(db, { ...scope, siteKey: "univ" }, provider)).items.length, 0);
        const candidates = await audioImportCandidates(db, scope, provider), candidate = candidates.items.find(item => item.assetItemId === "ja")!;
        assert.equal(candidate.imported, false);
        const { assetId, assetItemId, observedDigest, expectedUpdatedAt } = candidate;
        const restored = await importAudioMessages(db, scope, { operationKey: "restore_audio_import", accountId: provider.accountId, items: [{ assetId, assetItemId, observedDigest, expectedUpdatedAt }] }, provider);
        assert.deepEqual(restored.result.ids, [id]);
        assert.deepEqual(await db.messageRevision.findMany(), originalSnapshots);
        assert.equal((await db.zaadOutboundMessage.findUniqueOrThrow({ where: { id: text.id } })).body, "Historical text");
        assert.deepEqual(f.assets[0].items[1], other);
        assert.doesNotMatch(JSON.stringify(await db.outreachOperation.findMany()), /file\.zoom\.us|signature=/);
      });
    } finally { await context.close(); }
  });
});
