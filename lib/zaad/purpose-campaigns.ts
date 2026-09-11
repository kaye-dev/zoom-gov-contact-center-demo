import { MUNICIPAL_PURPOSES, type MunicipalPurpose } from "./municipal/contracts";
import { OutreachContractError } from "./outreach-contracts";
export type PurposeMode = "regular" | "one-time";
export function purposeCampaignKey(siteKey: string, mode: string, purpose: string) {
  if (siteKey !== "lg") throw new OutreachContractError("ADMIN_ACCESS_DENIED", 403);
  if (!(mode === "regular" && MUNICIPAL_PURPOSES.includes(purpose as MunicipalPurpose)) && !(mode === "one-time" && purpose === "FRAUD_ALERT")) throw new OutreachContractError("INVALID_PURPOSE", 400);
  return { siteKey, mode: mode as PurposeMode, purpose: purpose as MunicipalPurpose };
}
export type PurposeBinding = { mode: PurposeMode; purpose: MunicipalPurpose; version: number; campaignId: string | null; campaignName: string | null; accountId: string | null; contactListName: string | null; status: string | null; available: boolean };
export type PurposeCandidate = { id: string; name: string; selectable: boolean; disabledReason: string | null };
export type PurposeCandidates = { tenantKey: string; accountId: string; revision: number; current: PurposeBinding; items: PurposeCandidate[]; nextCursor: string | null; incomplete: boolean };
