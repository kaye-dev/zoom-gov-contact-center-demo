import type { PrismaClient } from "../../lib/generated/prisma/client";
import type { AudioAsset } from "../../lib/zaad/message-import-contracts";
import { audioImportCandidates, importAudioMessages, audioDto } from "../../lib/server/zaad/message-imports";
import type { AudioAssetWriter } from "../../lib/server/zaad/message-edit";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";

export async function audioFixture(db: PrismaClient) {
  const scope: OutreachScope = { siteKey: "lg", actorId: "audio-editor", all: true, live: false };
  await db.user.create({ data: { id: scope.actorId, name: "Synthetic editor", email: "audio-editor@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
  await db.globalDeveloperApiSetting.create({ data: { id: "global", accountId: "audio-account", clientId: "synthetic" } });
  const assets: AudioAsset[] = [{ assetId: "audio", name: "Synthetic asset", type: "audio", archived: false, sourceModifiedAt: null, items: [{ assetItemId: "ja", name: "Synthetic audio", languageCode: "ja-JP", voiceId: "Takumi", body: "取得した本文", hasAudioFile: true, fileUrl: "https://file.zoom.us/synthetic?signature=private" }, { assetItemId: "en", name: "Other item", languageCode: "en-US", voiceId: null, body: null, hasAudioFile: true, fileUrl: "https://file.zoom.us/synthetic-other" }] }];
  const calls: string[] = [];
  let returnBody = true;
  const provider: AudioAssetWriter = {
    accountId: "audio-account",
    async listAudioAssets() { calls.push("LIST"); return { assets: assets.map(({ assetId, name }) => ({ assetId, name })), nextPageToken: "" }; },
    async getAudioAsset(id) { calls.push("GET"); const result = structuredClone(assets.find(asset => asset.assetId === id)!); if (!returnBody) result.items.forEach(item => { item.body = null; }); return result; },
    async updateAudioAssetItem(input) { calls.push("PATCH"); const asset = assets.find(asset => asset.assetId === input.assetId)!, item = asset.items.find(item => item.assetItemId === input.assetItemId)!; item.name = input.name; if (input.body !== undefined) { item.body = input.body; item.voiceId = input.voiceId!; } },
  };
  const candidates = await audioImportCandidates(db, scope, provider);
  const imported = await importAudioMessages(db, scope, { operationKey: "initial_audio_import", accountId: provider.accountId, items: candidates.items.filter(item => item.assetItemId === "ja").map(({ assetId, assetItemId, observedDigest, expectedUpdatedAt }) => ({ assetId, assetItemId, observedDigest, expectedUpdatedAt })) }, provider);
  const id = imported.result.ids[0];
  const current = async () => audioDto(await db.outreachImportedAudioMessage.findUniqueOrThrow({ where: { id }, include: { binding: true } }));
  let sequence = 0;
  const edit = async (patch: Record<string, unknown> = {}) => { const row = await current(); return { operationKey: `audio_edit_${++sequence}`, expectedUpdatedAt: row.updatedAt, expectedDigest: row.expectedDigest, name: row.name, replaceAudio: false, ...patch }; };
  return { scope, provider, assets, calls, id, current, edit, setReturnBody(value: boolean) { returnBody = value; } };
}
