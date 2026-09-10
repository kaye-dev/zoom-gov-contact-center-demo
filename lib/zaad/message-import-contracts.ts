import type { TenantKey } from "@/lib/tenants";
import { fields, operationKey, OutreachContractError, record, stringValue, whole } from "./outreach-contracts";

export type AudioAsset = {
  assetId: string; name: string; type: string; archived: boolean; sourceModifiedAt: string | null;
  items: { assetItemId: string; name: string; languageCode: string; voiceId: string | null; hasAudioFile: boolean }[];
};
export type AudioAssetsPage = { assets: { assetId: string; name: string }[]; nextPageToken: string };
export type AudioCandidate = {
  assetId: string; assetItemId: string; name: string; languageCode: string; voiceId: string | null;
  observedDigest: string; version: number; selectable: boolean; disabledReason: string | null; imported: boolean;
};
export type AudioCandidates = { tenantKey: TenantKey; accountId: string; items: AudioCandidate[]; nextCursor: null; incomplete: false };
export type ImportedAudioMessage = {
  id: string; sourceKind: "IMPORTED_AUDIO"; name: string; body: null; bodyState: "UNAVAILABLE";
  voiceId: string | null; languageCode: string; departmentKey: string; version: number; generationState: "IMPORTED_AUDIO";
  zoomAssetId: string; assetItemId: string; updatedAt: string;
};
export type AudioImportInput = { operationKey: string; accountId: string; departmentKey: string; items: { assetId: string; assetItemId: string; observedDigest: string; version: number }[] };
export type AudioImportResult = { tenantKey: TenantKey; status: "COMPLETED"; result: { ids: string[] } };
export function parseAudioImport(payload: unknown): AudioImportInput {
  const value = record(payload); fields(value, ["operationKey", "accountId", "departmentKey", "items"]);
  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 100) throw new OutreachContractError("INVALID_IMPORT_SELECTION");
  const seen = new Set<string>();
  const items = value.items.map(raw => {
    const item = record(raw); fields(item, ["assetId", "assetItemId", "observedDigest", "version"]);
    const assetId = stringValue(item.assetId, 100), assetItemId = stringValue(item.assetItemId, 100), observedDigest = stringValue(item.observedDigest, 64);
    if (!/^[a-f0-9]{64}$/.test(observedDigest)) throw new OutreachContractError("INVALID_DIGEST");
    const key = JSON.stringify([assetId, assetItemId]); if (seen.has(key)) throw new OutreachContractError("DUPLICATE_IMPORT_ITEM"); seen.add(key);
    return { assetId, assetItemId, observedDigest, version: whole(item.version, 0) };
  }).sort((a, b) => a.assetId.localeCompare(b.assetId) || a.assetItemId.localeCompare(b.assetItemId));
  return { operationKey: operationKey(value.operationKey), accountId: stringValue(value.accountId), departmentKey: stringValue(value.departmentKey), items };
}
export const isImportedAudio = (message: { sourceKind?: string }): message is ImportedAudioMessage => message.sourceKind === "IMPORTED_AUDIO";
