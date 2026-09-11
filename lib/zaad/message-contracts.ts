import { choice, fields, record, stringValue, OutreachContractError } from "./outreach-contracts";
export const OUTREACH_VOICES = ["Takumi", "Kazuha", "Tomoko", "Mizuki"] as const;
export const audioCapabilities = { languageCode: "ja-JP", voices: OUTREACH_VOICES, source: "PUBLISHED_API" as const, generationEnabled: false, previewEnabled: false, disabledReason: "AUDIO_CONTRACT_NOT_VERIFIED" };
export type MessageExpectation = { expectedUpdatedAt: string; expectedDigest: string };
export function parseMessageExpectation(value: Record<string, unknown>): MessageExpectation {
  if (typeof value.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(value.expectedUpdatedAt)) || typeof value.expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.expectedDigest)) throw new OutreachContractError("CONTENT_CHANGED", 409);
  return { expectedUpdatedAt: new Date(value.expectedUpdatedAt).toISOString(), expectedDigest: value.expectedDigest };
}
export function parseOutreachMessage(payload: unknown, editing = false) {
  const v = record(payload);
  fields(v, ["name", "body", "voiceId", "languageCode", "departmentKey", ...(editing ? ["version", "revision", "expectedUpdatedAt", "expectedDigest"] : [])]);
  if (editing && (v.version !== undefined || v.revision !== undefined)) throw new OutreachContractError("CONTENT_CHANGED", 409);
  return { name: stringValue(v.name, 100), body: stringValue(v.body, 2000, true), voiceId: choice(v.voiceId, OUTREACH_VOICES), languageCode: choice(v.languageCode, ["ja-JP"]), ...(editing ? parseMessageExpectation(v) : {}) };
}
