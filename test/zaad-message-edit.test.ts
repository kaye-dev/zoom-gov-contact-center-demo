import assert from "node:assert/strict";
import test from "node:test";
import { parseAudioEdit, audioItemUpdatePayload, assertAudioUpdateResponse } from "../lib/zaad/message-edit-contracts";
import { verifyAudioUpdate } from "../lib/server/zaad/message-edit";
import { ZaadZoomClient, clearZaadZoomTokenCache } from "../lib/server/zaad/zoom-client";
import type { AudioAsset } from "../lib/zaad/message-import-contracts";

const input = { operationKey: "message_edit_test", expectedUpdatedAt: "2026-09-11T00:00:00.000Z", expectedDigest: "a".repeat(64), name: "更新名", replaceAudio: false };
const target = { assetId: "asset", assetItemId: "item", languageCode: "ja-JP", name: "更新名" };
test("MESSAGE-WRITE-01: edited TTS retains line breaks while rejecting control characters", () => {
  const body = "これは大学の更新後の音声です。\n名称と本文の保存を確認しています。";
  const edited = parseAudioEdit({ ...input, replaceAudio: true, body, voiceId: "Takumi" });
  assert.equal(edited.body, body);
  assert.equal(audioItemUpdatePayload({ ...target, body: edited.body!, voiceId: edited.voiceId! }).items[0].asset_item_content, body);
  assert.throws(() => parseAudioEdit({ ...input, replaceAudio: true, body: "本文\u0000", voiceId: "Takumi" }));
});
test("MESSAGE-WRITE-01: name-only sends exactly one identified item and TTS requires the complete valid body", () => {
  assert.equal(parseAudioEdit({ ...input, body: "ignored", voiceId: "ignored" }).body, null);
  assert.deepEqual(audioItemUpdatePayload(target), { items: [{ asset_id: "asset", asset_item_language: "ja-JP", asset_item_name: "更新名" }] });
  const full = parseAudioEdit({ ...input, replaceAudio: true, body: "  本文  ", voiceId: "Takumi" });
  assert.equal(full.body, "本文");
  const payload = audioItemUpdatePayload({ ...target, body: full.body!, voiceId: full.voiceId! });
  assert.equal(payload.items.length, 1); assert.equal(payload.items[0].asset_item_content, "本文");
  assert.doesNotMatch(JSON.stringify(payload), /upload_|shared|asset_items/);
  for (const patch of [{ body: "" }, { body: "あ".repeat(501) }, { voiceId: "Joanna" }, { expectedUpdatedAt: "bad" }, { expectedDigest: "bad" }, { version: 1 }]) assert.throws(() => parseAudioEdit({ ...input, replaceAudio: true, body: "本文", voiceId: "Takumi", ...patch }));
  assert.throws(() => audioItemUpdatePayload({ ...target, languageCode: "en-US", body: "Text", voiceId: "Takumi" }));
});
test("MESSAGE-WRITE-01: HTTP 200 must include explicit matching success and no matching failure", () => {
  const success = { asset_id: "asset", asset_item_language: "ja-JP" };
  assertAudioUpdateResponse({ succeeded_assets: [success], failed_assets: [] }, target);
  for (const payload of [{}, { succeeded_assets: [], failed_assets: [] }, { succeeded_assets: [success], failed_assets: [success] }, { succeeded_assets: [{ ...success, asset_id: "other" }], failed_assets: [] }, { succeeded_assets: [success], failed_assets: [{ asset_item_language: "ja-JP", error_code: 10026 }] }]) assert.throws(() => assertAudioUpdateResponse(payload, target));
});
const asset: AudioAsset = { assetId: "asset", name: "asset name", type: "audio", archived: false, sourceModifiedAt: null, items: [{ assetItemId: "item", name: "old", languageCode: "ja-JP", voiceId: "Tomoko", body: "old body", hasAudioFile: true, fileUrl: "https://file.zoom.us/test" }, { assetItemId: "other", name: "other", languageCode: "en-US", voiceId: null, body: null, hasAudioFile: true, fileUrl: null }] };
test("MESSAGE-WRITE-01: readback preserves other items and never treats missing body as verified text", () => {
  const after = structuredClone(asset); after.items[0].name = "更新名";
  const nameOnly = parseAudioEdit(input);
  verifyAudioUpdate(asset, after, "item", nameOnly, true);
  after.items[1].name = "changed"; assert.throws(() => verifyAudioUpdate(asset, after, "item", nameOnly, true)); after.items[1].name = "other";
  const full = parseAudioEdit({ ...input, replaceAudio: true, body: "new body", voiceId: "Takumi" });
  after.items[0].voiceId = "Takumi";
  assert.throws(() => verifyAudioUpdate(asset, after, "item", full, true));
  after.items[0].body = null;
  assert.throws(() => verifyAudioUpdate(asset, after, "item", full, false));
  assert.equal(verifyAudioUpdate(asset, after, "item", full, true).body, null);
  after.items[0].body = "new body"; verifyAudioUpdate(asset, after, "item", full, false);
});
test("MESSAGE-WRITE-01: client keeps deployment gate and never retries unauthorized, throttled or uncertain writes", async () => {
  type Constructor = new (...args: unknown[]) => ZaadZoomClient;
  for (const status of [200, 401, 403, 429, 0]) {
    clearZaadZoomTokenCache(); let writes = 0;
    const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/oauth/token")) return Response.json({ access_token: "synthetic", expires_in: 3600 });
      writes++; assert.equal(init?.method, "PATCH"); assert.match(String(url), /asset_library\/assets\/items$/);
      if (!status) throw new Error("synthetic timeout");
      return Response.json(status === 200 ? { succeeded_assets: [{ asset_id: "asset", asset_item_language: "ja-JP" }], failed_assets: [] } : {}, { status });
    };
    const create = (enabled: boolean) => new (ZaadZoomClient as unknown as Constructor)({ accountId: "synthetic-account", clientId: "client", clientSecret: "synthetic" }, fetcher, "https://api.zoom.test/v2", "https://zoom.test/oauth/token", { contact: false, tts: enabled, campaign: false });
    await assert.rejects(create(false).updateAudioAssetItem(target)); assert.equal(writes, 0);
    if (status === 200) await create(true).updateAudioAssetItem(target); else await assert.rejects(create(true).updateAudioAssetItem(target));
    assert.equal(writes, 1);
  }
});
