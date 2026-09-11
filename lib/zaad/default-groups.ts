import type { TenantKey } from "@/lib/tenants";

export const DEFAULT_GROUP_TOPICS = {
  univ: ["scholarship", "class-change", "facility", "group", "continuity"],
  lg: ["elder-watch", "procedure-support", "service-confirmation", "fraud-alert", "disaster-radio"],
} as const satisfies Record<TenantKey, readonly string[]>;

export type RegistrationOrigin = "UNIVERSITY_REGISTRATION" | "MUNICIPAL_CONTACT" | "DISASTER_RADIO";
export type MemberSyncStatus = "REGISTERED" | "SYNCED" | "PENDING" | "FAILED" | "SYNCING" | "UNKNOWN" | "DIFFERENCE" | "WITHDRAWN";
export type DefaultGroupDto = {
  id: string; kind: "DEFAULT"; defaultGroupId: string; topicKey: string;
  name: string; description: string; version: number;
  revision: string; rebindCount: number; contactCount: number | null; accountId: string | null;
  contactListId: string | null; bindingState: "CONFIGURED" | "MISSING" | "ACCOUNT_CHANGED";
};
export type SyncedGroupMember = {
  id: string; displayName: string; phones: { number: string }[];
  source: "Zoom" | "SITE"; syncStatus: MemberSyncStatus;
  zoomContactId: string | null; version: number; lastErrorCode: string | null;
  observedDigest: string | null; retryAfter: string | null;
};
export type GroupMemberSummary = { total: number | null; unsynced: number | null; synced: number | null; zoomOnly: number | null };
export type DefaultGroupDetail = {
  tenantKey: TenantKey; group: DefaultGroupDto; items: SyncedGroupMember[];
  summary: GroupMemberSummary; total: number; nextCursor: string | null;
  observedAt: string; providerState: string;
};
export type GroupSyncResult = {
  tenantKey: TenantKey; operationId: string; status: string;
  counts: { total: number; pending: number; synced: number; failed: number };
};
export type DefaultGroupCandidate = {
  id: string; name: string; selectable: boolean;
  disabledReason: null | "ASSIGNED_DEFAULT" | "OTHER_INDUSTRY" | "INTERNAL_RESOURCE";
};
export type DefaultGroupCandidatesResponse = {
  tenantKey: TenantKey; accountId: string; revision: number;
  items: DefaultGroupCandidate[];
  current: { id: string; name: string; selectable: boolean; unavailableReason: null | "MISSING" | "ACCOUNT_CHANGED" | "CONFLICT" } | null;
  nextCursor: string | null;
};
export function defaultGroupId(site: TenantKey, topic: string) { return `default-${site}-${topic}`; }
export function isPendingSync(status: string) { return !["REGISTERED", "SYNCED", "WITHDRAWN"].includes(status); }
