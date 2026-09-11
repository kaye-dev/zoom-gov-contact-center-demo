import { OUTREACH_VOICES, parseMessageExpectation } from "./message-contracts";
import { fields, operationKey, OutreachContractError, record, stringValue } from "./outreach-contracts";

export function parseAudioEdit(payload: unknown) {
  const value = record(payload);
  fields(value, ["operationKey", "expectedUpdatedAt", "expectedDigest", "name", "replaceAudio", "body", "voiceId", "version", "revision"]);
  if (value.version !== undefined || value.revision !== undefined) throw new OutreachContractError("CONTENT_CHANGED", 409);
  if (typeof value.replaceAudio !== "boolean") throw new OutreachContractError("INVALID_REQUEST");
  const common = { operationKey: operationKey(value.operationKey), ...parseMessageExpectation(value), name: stringValue(value.name, 150), replaceAudio: value.replaceAudio };
  if (!value.replaceAudio) return { ...common, body: null, voiceId: null };
  const body = stringValue(value.body, 500), voiceId = stringValue(value.voiceId, 50);
  if (!OUTREACH_VOICES.includes(voiceId as typeof OUTREACH_VOICES[number])) throw new OutreachContractError("INVALID_VOICE");
  return { ...common, body, voiceId };
}
export type AudioEdit = ReturnType<typeof parseAudioEdit>;
export type AudioItemUpdate = { assetId: string; assetItemId: string; languageCode: string; name: string; body?: string; voiceId?: string };

export function audioItemUpdatePayload(input: AudioItemUpdate) {
  const hasBody = input.body !== undefined, hasVoice = input.voiceId !== undefined;
  if (hasBody !== hasVoice) throw new OutreachContractError("INVALID_REQUEST");
  if (hasBody && (input.languageCode !== "ja-JP" || !input.body?.trim() || [...input.body.trim()].length > 500 || !OUTREACH_VOICES.includes(input.voiceId as typeof OUTREACH_VOICES[number]))) throw new OutreachContractError("INVALID_VOICE_OR_BODY");
  return { items: [{ asset_id: input.assetId, asset_item_language: input.languageCode, asset_item_name: stringValue(input.name, 150), ...(hasBody ? { asset_item_content: input.body, asset_item_voice: input.voiceId } : {}) }] };
}

export function assertAudioUpdateResponse(payload: unknown, input: AudioItemUpdate) {
  const value = record(payload);
  if (!Array.isArray(value.succeeded_assets) || !Array.isArray(value.failed_assets)) throw new OutreachContractError("AUDIO_UPDATE_RESULT_UNKNOWN", 502);
  const matches = (raw: unknown) => { const row = record(raw); return row.asset_id === input.assetId && row.asset_item_language === input.languageCode; };
  if (value.failed_assets.some(raw => { const row = record(raw); return row.asset_item_language === input.languageCode && (!row.asset_id || row.asset_id === input.assetId); })) throw new OutreachContractError("AUDIO_UPDATE_REJECTED", 409);
  if (value.succeeded_assets.filter(matches).length !== 1) throw new OutreachContractError("AUDIO_UPDATE_RESULT_UNKNOWN", 502);
}
