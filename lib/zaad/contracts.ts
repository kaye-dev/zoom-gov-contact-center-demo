import { isRecord } from "@/lib/disaster-radio-subscriptions/validation";

export const ZAAD_ERROR_CODES = {
  invalidRequest: "ZAAD_INVALID_REQUEST",
  invalidCsv: "ZAAD_INVALID_CSV",
  residentConflict: "ZAAD_RESIDENT_CONFLICT",
  residentNotFound: "ZAAD_RESIDENT_NOT_FOUND",
  messageConflict: "ZAAD_MESSAGE_CONFLICT",
  messageNotFound: "ZAAD_MESSAGE_NOT_FOUND",
  contactListConflict: "ZAAD_CONTACT_LIST_CONFLICT",
  contactListNotFound: "ZAAD_CONTACT_LIST_NOT_FOUND",
  registrationSettingConflict: "ZAAD_REGISTRATION_SETTING_CONFLICT",
  campaignStatusConflict: "ZAAD_CAMPAIGN_STATUS_CONFLICT",
  campaignStatusUnknown: "ZAAD_CAMPAIGN_STATUS_UNKNOWN",
  campaignNotAgentless: "ZAAD_CAMPAIGN_NOT_AGENTLESS",
  oneTimeSnapshotStale: "ZAAD_ONE_TIME_SNAPSHOT_STALE",
  oneTimeSnapshotExpired: "ZAAD_ONE_TIME_SNAPSHOT_EXPIRED",
  oneTimeRecipientsInvalid: "ZAAD_ONE_TIME_RECIPIENTS_INVALID",
  oneTimeResultUnknown: "ZAAD_ONE_TIME_RESULT_UNKNOWN",
  zoomNotConfigured: "ZAAD_ZOOM_NOT_CONFIGURED",
  zoomCredentialsInvalid: "ZAAD_ZOOM_CREDENTIALS_INVALID",
  zoomContractUnconfirmed: "ZAAD_ZOOM_CONTRACT_UNCONFIRMED",
  zoomScopeRequired: "ZAAD_ZOOM_SCOPE_REQUIRED",
  zoomRateLimited: "ZAAD_ZOOM_RATE_LIMITED",
  zoomUnavailable: "ZAAD_ZOOM_UNAVAILABLE",
  zoomResultUnknown: "ZAAD_ZOOM_RESULT_UNKNOWN",
  zoomInvalidResponse: "ZAAD_ZOOM_INVALID_RESPONSE",
  zoomContactRejected: "ZAAD_ZOOM_CONTACT_REJECTED",
  zoomNotFound: "ZAAD_ZOOM_NOT_FOUND",
  zoomInUse: "ZAAD_ZOOM_RESOURCE_IN_USE",
} as const;

export type ZaadErrorCode = (typeof ZAAD_ERROR_CODES)[keyof typeof ZAAD_ERROR_CODES];

export const ZAAD_VOICES = ["Tomoko", "Takumi", "Mizuki", "Kazuha"] as const;
export type ZaadVoiceId = (typeof ZAAD_VOICES)[number];

export const ZAAD_LIMITS = {
  label: 100,
  description: 500,
  messageBody: 1_000,
  sourceLists: 20,
  residentSelections: 1_000,
  recipients: 1_000,
  operationKey: 100,
} as const;

export type ZaadMessageInput = {
  name: string;
  body: string;
  languageCode: "ja-JP";
  voiceId: ZaadVoiceId;
  revision?: number;
};

export type ZaadContactListInput = {
  name: string;
  description: string;
  revision?: string;
};

export type ZaadRegistrationSettingInput = {
  contactListId: string | null;
  revision: number;
};

export type ZaadCampaignStatusInput = {
  status: "running" | "paused";
  expectedStatus: "ready" | "paused" | "running";
};

export type ZaadResidentSelection = { id: string; revision: number };

export type ZaadOneTimeInput = {
  operationKey: string;
  name: string;
  body: string;
  languageCode: "ja-JP";
  voiceId: ZaadVoiceId;
  baseCampaignId: string;
  contactListIds: string[];
  residentSelections: ZaadResidentSelection[];
};

export type ZaadOneTimePrepareInput = ZaadOneTimeInput & {
  preflightToken: string;
  acknowledged: true;
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: typeof ZAAD_ERROR_CODES.invalidRequest };

export function parseZaadMessageInput(value: unknown, requireRevision = false): ParseResult<ZaadMessageInput> {
  const allowed = requireRevision
    ? ["name", "body", "languageCode", "voiceId", "revision"]
    : ["name", "body", "languageCode", "voiceId"];
  if (!hasExactKeys(value, allowed)) return invalid();
  const name = parseLabel(value.name, ZAAD_LIMITS.label);
  const body = parseLabel(value.body, ZAAD_LIMITS.messageBody, true);
  const revision = requireRevision ? parsePositiveInteger(value.revision) : undefined;
  if (
    !name ||
    !body ||
    value.languageCode !== "ja-JP" ||
    !isZaadVoiceId(value.voiceId) ||
    (requireRevision && !revision)
  ) return invalid();
  return { ok: true, value: { name, body, languageCode: "ja-JP", voiceId: value.voiceId, revision: revision ?? undefined } };
}

export function parseZaadContactListInput(value: unknown, requireRevision = false): ParseResult<ZaadContactListInput> {
  const allowed = requireRevision ? ["name", "description", "revision"] : ["name", "description"];
  if (!hasExactKeys(value, allowed)) return invalid();
  const name = parseLabel(value.name, ZAAD_LIMITS.label);
  const description = typeof value.description === "string"
    ? value.description.trim().normalize("NFKC")
    : null;
  if (!name || description === null || description.length > ZAAD_LIMITS.description || containsControl(description)) {
    return invalid();
  }
  const revision = typeof value.revision === "string" ? value.revision.trim() : undefined;
  if (requireRevision && !revision) return invalid();
  return {
    ok: true,
    value: {
      name,
      description,
      revision: requireRevision ? revision : undefined,
    },
  };
}

export function parseZaadRegistrationSettingInput(value: unknown): ParseResult<ZaadRegistrationSettingInput> {
  if (!hasExactKeys(value, ["contactListId", "revision"])) return invalid();
  const revision = parsePositiveInteger(value.revision);
  if (!revision) return invalid();
  if (value.contactListId === null) return { ok: true, value: { contactListId: null, revision } };
  const contactListId = parseOpaqueId(value.contactListId);
  if (!contactListId) return invalid();
  return { ok: true, value: { contactListId, revision } };
}

export function parseZaadCampaignStatusInput(value: unknown): ParseResult<ZaadCampaignStatusInput> {
  if (!hasExactKeys(value, ["status", "expectedStatus"])) return invalid();
  if ((value.status !== "running" && value.status !== "paused") ||
      (value.expectedStatus !== "ready" && value.expectedStatus !== "paused" && value.expectedStatus !== "running")) {
    return invalid();
  }
  return { ok: true, value: { status: value.status, expectedStatus: value.expectedStatus } };
}

export function parseZaadOneTimeInput(value: unknown, requireToken = false): ParseResult<ZaadOneTimeInput | ZaadOneTimePrepareInput> {
  const keys = [
    "operationKey", "name", "body", "languageCode", "voiceId", "baseCampaignId",
    "contactListIds", "residentSelections",
    ...(requireToken ? ["preflightToken", "acknowledged"] : []),
  ];
  if (!hasExactKeys(value, keys)) return invalid();
  const operationKey = parseLabel(value.operationKey, ZAAD_LIMITS.operationKey);
  const name = parseLabel(value.name, ZAAD_LIMITS.label);
  const body = parseLabel(value.body, ZAAD_LIMITS.messageBody, true);
  const baseCampaignId = parseOpaqueId(value.baseCampaignId);
  if (!operationKey || !name || !body || !baseCampaignId || value.languageCode !== "ja-JP" || !isZaadVoiceId(value.voiceId)) {
    return invalid();
  }
  if (!Array.isArray(value.contactListIds) || value.contactListIds.length > ZAAD_LIMITS.sourceLists) return invalid();
  const contactListIds = value.contactListIds.map(parseOpaqueId);
  if (contactListIds.some((entry) => !entry) || new Set(contactListIds).size !== contactListIds.length) return invalid();
  if (!Array.isArray(value.residentSelections) || value.residentSelections.length > ZAAD_LIMITS.residentSelections) return invalid();
  const residentSelections: ZaadResidentSelection[] = [];
  for (const selection of value.residentSelections) {
    if (!hasExactKeys(selection, ["id", "revision"])) return invalid();
    const id = parseOpaqueId(selection.id);
    const revision = parsePositiveInteger(selection.revision);
    if (!id || !revision) return invalid();
    residentSelections.push({ id, revision });
  }
  if (new Set(residentSelections.map(({ id }) => id)).size !== residentSelections.length) return invalid();
  if (contactListIds.length === 0 && residentSelections.length === 0) return invalid();
  const base: ZaadOneTimeInput = {
    operationKey,
    name,
    body,
    languageCode: "ja-JP",
    voiceId: value.voiceId,
    baseCampaignId,
    contactListIds: contactListIds as string[],
    residentSelections,
  };
  if (!requireToken) return { ok: true, value: base };
  if (typeof value.preflightToken !== "string" || value.preflightToken.length < 20 || value.preflightToken.length > 8_192 || value.acknowledged !== true) {
    return invalid();
  }
  return { ok: true, value: { ...base, preflightToken: value.preflightToken, acknowledged: true } };
}

export function parsePositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null;
}

export function parseOpaqueId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= 200 && !containsControl(result) ? result : null;
}

export function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseLabel(value: unknown, maximum: number, allowNewlines = false): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().normalize("NFKC");
  if (!result || [...result].length > maximum) return null;
  if (allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(result) : containsControl(result)) return null;
  return result;
}

function containsControl(value: string) {
  return /[\u0000-\u001F\u007F]/u.test(value);
}

function isZaadVoiceId(value: unknown): value is ZaadVoiceId {
  return typeof value === "string" && (ZAAD_VOICES as readonly string[]).includes(value);
}

function invalid(): { ok: false; code: typeof ZAAD_ERROR_CODES.invalidRequest } {
  return { ok: false, code: ZAAD_ERROR_CODES.invalidRequest };
}
