import { choice, fields, record, stringValue, whole } from "./outreach-contracts";
export const OUTREACH_VOICES = ["Takumi", "Kazuha", "Tomoko", "Mizuki"] as const;
export const audioCapabilities = { languageCode: "ja-JP", voices: OUTREACH_VOICES, source: "PUBLISHED_API" as const, generationEnabled: false, previewEnabled: false, disabledReason: "AUDIO_CONTRACT_NOT_VERIFIED" };
export function parseOutreachMessage(payload: unknown, editing = false) {
  const v = record(payload); fields(v, ["name", "body", "voiceId", "languageCode", "departmentKey", ...(editing ? ["version"] : [])]);
  return { name: stringValue(v.name, 100), body: stringValue(v.body, 2000, true), voiceId: choice(v.voiceId, OUTREACH_VOICES), languageCode: choice(v.languageCode, ["ja-JP"]), departmentKey: stringValue(v.departmentKey), ...(editing ? { version: whole(v.version) } : {}) };
}
