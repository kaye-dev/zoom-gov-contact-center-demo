import type { ZaadDictionary } from "./zaad-dictionaries";
import { ZAAD_ERROR_CODES } from "@/lib/zaad/contracts";

const ERROR_GROUPS = {
  conflict: new Set<string>([
    ZAAD_ERROR_CODES.residentConflict,
    ZAAD_ERROR_CODES.messageConflict,
    ZAAD_ERROR_CODES.contactListConflict,
    ZAAD_ERROR_CODES.registrationSettingConflict,
    ZAAD_ERROR_CODES.campaignStatusConflict,
    ZAAD_ERROR_CODES.oneTimeSnapshotStale,
    ZAAD_ERROR_CODES.oneTimeSnapshotExpired,
  ]),
  resultUnknown: new Set<string>([
    ZAAD_ERROR_CODES.campaignStatusUnknown,
    ZAAD_ERROR_CODES.oneTimeResultUnknown,
    ZAAD_ERROR_CODES.zoomResultUnknown,
  ]),
  notFound: new Set<string>([
    ZAAD_ERROR_CODES.residentNotFound,
    ZAAD_ERROR_CODES.messageNotFound,
    ZAAD_ERROR_CODES.contactListNotFound,
    ZAAD_ERROR_CODES.zoomNotFound,
  ]),
  invalid: new Set<string>([
    ZAAD_ERROR_CODES.invalidRequest,
    ZAAD_ERROR_CODES.invalidCsv,
    ZAAD_ERROR_CODES.campaignNotAgentless,
    ZAAD_ERROR_CODES.oneTimeRecipientsInvalid,
    ZAAD_ERROR_CODES.zoomContactRejected,
  ]),
} as const;

export type ZaadCsvErrorDetail = { row: number; field: string; code: string };

export function getZaadErrorMessage(
  code: string | null,
  copy: ZaadDictionary,
): string {
  if (code === "ADMIN_ACCESS_DENIED") return copy.errors.permission;
  if (code === "AUTHENTICATION_REQUIRED") return copy.errors.authenticationRequired;
  if (code === "PASSWORD_CHANGE_REQUIRED") return copy.errors.passwordChangeRequired;
  if (code === ZAAD_ERROR_CODES.zoomContractUnconfirmed) return copy.errors.zoomContract;
  if (code === ZAAD_ERROR_CODES.zoomNotConfigured) return copy.errors.zoomMissing;
  if (code === ZAAD_ERROR_CODES.zoomScopeRequired) return copy.errors.zoomScope;
  if (code === ZAAD_ERROR_CODES.zoomCredentialsInvalid) return copy.errors.zoomCredentials;
  if (code === ZAAD_ERROR_CODES.zoomRateLimited) return copy.errors.rateLimited;
  if (code === ZAAD_ERROR_CODES.zoomUnavailable || code === ZAAD_ERROR_CODES.zoomInvalidResponse) {
    return copy.errors.transient;
  }
  if (code === ZAAD_ERROR_CODES.zoomInUse) return copy.errors.resourceInUse;
  if (code && ERROR_GROUPS.conflict.has(code)) return copy.errors.conflict;
  if (code && ERROR_GROUPS.resultUnknown.has(code)) return copy.errors.resultUnknown;
  if (code && ERROR_GROUPS.notFound.has(code)) return copy.errors.notFound;
  if (code && ERROR_GROUPS.invalid.has(code)) return copy.errors.invalid;
  return copy.errors.generic;
}

export function sanitizeZaadCsvErrorDetails(value: unknown): ZaadCsvErrorDetail[] {
  if (!Array.isArray(value)) return [];
  const details: ZaadCsvErrorDetail[] = [];
  for (const entry of value.slice(0, 20)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    if (!Number.isSafeInteger(candidate.row) || (candidate.row as number) < 1) continue;
    if (typeof candidate.field !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/u.test(candidate.field)) continue;
    if (typeof candidate.code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/u.test(candidate.code)) continue;
    details.push({ row: candidate.row as number, field: candidate.field, code: candidate.code });
  }
  return details;
}

export function getZaadCsvFieldLabel(field: string, copy: ZaadDictionary) {
  if (field === "name") return copy.residents.name;
  if (field === "email") return copy.residents.email;
  if (field === "phone") return copy.residents.phone;
  if (field === "consentStatus") return copy.residents.consent;
  if (field === "header") return copy.residents.csvFieldHeader;
  if (field === "file") return copy.residents.csvFieldFile;
  return copy.residents.csvFieldRow;
}

export function getZaadCsvReasonLabel(code: string, copy: ZaadDictionary) {
  if (code === "REQUIRED") return copy.residents.csvReasonRequired;
  if (code === "INVALID_FORMAT") return copy.residents.csvReasonInvalidFormat;
  if (code === "INVALID_VALUE") return copy.residents.csvReasonInvalidValue;
  if (code === "TOO_LONG") return copy.residents.csvReasonTooLong;
  if (code === "CONTROL_CHARACTER") return copy.residents.csvReasonControlCharacter;
  if (code === "EMPTY") return copy.residents.csvReasonEmpty;
  if (code === "TOO_LARGE") return copy.residents.csvReasonTooLarge;
  if (code === "INVALID_UTF8") return copy.residents.csvReasonInvalidUtf8;
  if (code === "INVALID_STRUCTURE") return copy.residents.csvReasonInvalidStructure;
  if (code === "INVALID_HEADER") return copy.residents.csvReasonInvalidHeader;
  if (code === "TOO_MANY_ROWS") return copy.residents.csvReasonTooManyRows;
  return copy.residents.csvReasonInvalidValue;
}
