import { parseMessageExpectation } from "./message-contracts";
import type { TenantKey } from "@/lib/tenants";
import { fields, operationKey, OutreachContractError, record, stringValue } from "./outreach-contracts";

export type AudioBodyState = "PROVIDER_RETURNED" | "UNAVAILABLE" | "UNCHECKED" | "USER_AUTHORED";
/** Server-only provider data; fileUrl must never enter a DTO, digest or stored JSON. */
export type AudioAsset = {
  assetId: string; name: string; type: string; archived: boolean; sourceModifiedAt: string | null;
  items: { assetItemId: string; name: string; languageCode: string; voiceId: string | null; hasAudioFile: boolean; body: string | null; fileUrl: string | null }[];
};
export type AudioAssetsPage = { assets: { assetId: string; name: string }[]; nextPageToken: string };
export type AudioCandidate = {
  assetId: string; assetItemId: string; name: string; languageCode: string; voiceId: string | null;
  observedDigest: string; expectedUpdatedAt: string | null; body: string | null; bodyState: "PROVIDER_RETURNED" | "UNAVAILABLE"; selectable: boolean; disabledReason: string | null; imported: boolean;
};
export type AudioCandidates = { tenantKey: TenantKey; accountId: string; items: AudioCandidate[]; nextCursor: null; incomplete: false };
export type ImportedAudioMessage = {
  id: string; sourceKind: "IMPORTED_AUDIO"; name: string; body: string | null; bodyState: AudioBodyState; bodyFetchedAt: string | null;
  voiceId: string | null; languageCode: string; observedDigest: string; expectedDigest: string; generationState: "IMPORTED_AUDIO";
  zoomAssetId: string; assetItemId: string; updatedAt: string;
};
export type AudioImportInput = { operationKey: string; accountId: string; items: { assetId: string; assetItemId: string; observedDigest: string; expectedUpdatedAt: string | null }[] };
export type AudioImportResult = { tenantKey: TenantKey; status: "COMPLETED"; result: { ids: string[] } };
export function parseAudioImport(payload: unknown): AudioImportInput {
  const value = record(payload); fields(value, ["operationKey", "accountId", "departmentKey", "items"]);
  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 100) throw new OutreachContractError("INVALID_IMPORT_SELECTION");
  const seen = new Set<string>();
  const items = value.items.map(raw => {
    const item = record(raw); fields(item, ["assetId", "assetItemId", "observedDigest", "expectedUpdatedAt", "version"]);
    const assetId = stringValue(item.assetId, 100), assetItemId = stringValue(item.assetItemId, 100), observedDigest = stringValue(item.observedDigest, 64);
    if (!/^[a-f0-9]{64}$/.test(observedDigest)) throw new OutreachContractError("INVALID_DIGEST");
    const key = JSON.stringify([assetId, assetItemId]); if (seen.has(key)) throw new OutreachContractError("DUPLICATE_IMPORT_ITEM"); seen.add(key);
    if (item.version !== undefined || item.expectedUpdatedAt === undefined) throw new OutreachContractError("CONTENT_CHANGED", 409);
    const expectedUpdatedAt = item.expectedUpdatedAt === null ? null : parseMessageExpectation({ expectedUpdatedAt: item.expectedUpdatedAt, expectedDigest: observedDigest }).expectedUpdatedAt;
    return { assetId, assetItemId, observedDigest, expectedUpdatedAt };
  }).sort((a, b) => a.assetId.localeCompare(b.assetId) || a.assetItemId.localeCompare(b.assetItemId));
  return { operationKey: operationKey(value.operationKey), accountId: stringValue(value.accountId), items };
}
export const isImportedAudio = (message: { sourceKind?: string }): message is ImportedAudioMessage => message.sourceKind === "IMPORTED_AUDIO";
