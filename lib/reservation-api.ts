import {
  isReservationDate,
  isReservationServiceKey,
  type ReservationServiceKey,
} from "@/lib/reservations";

export const RESERVATION_API_PERMISSIONS = [
  "LIST",
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
] as const;

export type ReservationApiPermission =
  (typeof RESERVATION_API_PERMISSIONS)[number];

export const RESERVATION_API_ERROR_CODES = {
  invalidRequest: "RESERVATION_API_INVALID_REQUEST",
  unauthorized: "RESERVATION_API_UNAUTHORIZED",
  forbidden: "RESERVATION_API_FORBIDDEN",
  notFound: "RESERVATION_API_NOT_FOUND",
  slotFull: "RESERVATION_SLOT_FULL",
  monthlyLimitExceeded: "RESERVATION_API_MONTHLY_LIMIT_EXCEEDED",
  operationFailed: "RESERVATION_API_OPERATION_FAILED",
  keyNotFound: "RESERVATION_API_KEY_NOT_FOUND",
  keyConflict: "RESERVATION_API_KEY_CONFLICT",
  usageLimitConflict: "RESERVATION_API_USAGE_LIMIT_CONFLICT",
} as const;

export const MAX_MONTHLY_REQUEST_LIMIT = BigInt("9223372036854775800");

export type ReservationDto = {
  id: string;
  serviceKey: ReservationServiceKey;
  reservationDate: string;
  startMinute: number;
  createdAt: string;
  updatedAt: string;
};

export type ReservationApiUsageLimitDto = {
  mode: "LIMITED" | "UNLIMITED";
  monthlyLimit: string | null;
  revision: number;
  periodStart: string;
  requestCount: string;
  remaining: string | null;
  resetsAt: string;
};

export type ReservationWriteInput = {
  serviceKey: ReservationServiceKey;
  reservationDate: string;
  startMinute: number;
};

export type ReservationPatchInput = Partial<ReservationWriteInput>;

export type ReservationListInput = {
  serviceKey?: ReservationServiceKey;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  cursor?: { createdAt: Date; id: string };
};

export function isReservationApiPermission(
  value: unknown,
): value is ReservationApiPermission {
  return typeof value === "string" &&
    RESERVATION_API_PERMISSIONS.includes(value as ReservationApiPermission);
}

export function parseReservationApiKeyIssue(value: unknown) {
  if (!isExactRecord(value, ["name", "permissions"])) return null;
  if (typeof value.name !== "string") return null;
  const name = value.name.trim();
  if (name.length < 1 || name.length > 100) return null;
  if (!Array.isArray(value.permissions) || value.permissions.length < 1) return null;
  if (!value.permissions.every(isReservationApiPermission)) return null;
  const permissions = value.permissions as ReservationApiPermission[];
  if (new Set(permissions).size !== permissions.length) return null;
  return { name, permissions };
}

export function parseReservationApiKeyRevoke(value: unknown) {
  if (!isExactRecord(value, ["expectedRevision"])) return null;
  return isPositiveSafeInteger(value.expectedRevision)
    ? { expectedRevision: value.expectedRevision }
    : null;
}

export function parseReservationApiUsageLimit(value: unknown) {
  if (!isRecord(value) || typeof value.mode !== "string") return null;
  if (value.mode === "UNLIMITED") {
    if (!hasExactKeys(value, ["mode", "expectedRevision"]) ||
        !isPositiveSafeInteger(value.expectedRevision)) return null;
    return { mode: "UNLIMITED" as const, expectedRevision: value.expectedRevision };
  }
  if (value.mode !== "LIMITED" ||
      !hasExactKeys(value, ["mode", "monthlyLimit", "expectedRevision"]) ||
      typeof value.monthlyLimit !== "string" ||
      !isPositiveSafeInteger(value.expectedRevision)) return null;
  if (!/^(0|[1-9]\d*)$/u.test(value.monthlyLimit)) return null;
  const monthlyLimit = BigInt(value.monthlyLimit);
  if (!isValidMonthlyLimit(monthlyLimit)) return null;
  return {
    mode: "LIMITED" as const,
    monthlyLimit,
    expectedRevision: value.expectedRevision,
  };
}

export function isValidMonthlyLimit(value: bigint): boolean {
  return value >= BigInt(100) &&
    value <= MAX_MONTHLY_REQUEST_LIMIT &&
    (value <= BigInt(10_000) || value % BigInt(100) === BigInt(0));
}

export function parseReservationWrite(value: unknown): ReservationWriteInput | null {
  if (!isExactRecord(value, ["serviceKey", "reservationDate", "startMinute"])) return null;
  if (typeof value.serviceKey !== "string" || !isReservationServiceKey(value.serviceKey) ||
      typeof value.reservationDate !== "string" || !isReservationDate(value.reservationDate) ||
      !Number.isInteger(value.startMinute) || Number(value.startMinute) < 0 || Number(value.startMinute) > 1439) {
    return null;
  }
  return {
    serviceKey: value.serviceKey,
    reservationDate: value.reservationDate,
    startMinute: Number(value.startMinute),
  };
}

export function parseReservationPatch(value: unknown): ReservationPatchInput | null {
  if (!isRecord(value)) return null;
  const allowed = ["serviceKey", "reservationDate", "startMinute"];
  const keys = Object.keys(value);
  if (keys.length < 1 || keys.some((key) => !allowed.includes(key))) return null;
  const result: ReservationPatchInput = {};
  if ("serviceKey" in value) {
    if (typeof value.serviceKey !== "string" || !isReservationServiceKey(value.serviceKey)) return null;
    result.serviceKey = value.serviceKey;
  }
  if ("reservationDate" in value) {
    if (typeof value.reservationDate !== "string" || !isReservationDate(value.reservationDate)) return null;
    result.reservationDate = value.reservationDate;
  }
  if ("startMinute" in value) {
    if (!Number.isInteger(value.startMinute) || Number(value.startMinute) < 0 || Number(value.startMinute) > 1439) return null;
    result.startMinute = Number(value.startMinute);
  }
  return result;
}

export function parseReservationId(value: string): string | null {
  return /^[A-Za-z0-9_-]{1,191}$/u.test(value) ? value : null;
}

export function parseReservationList(url: URL): ReservationListInput | null {
  const allowed = new Set(["serviceKey", "dateFrom", "dateTo", "limit", "cursor"]);
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !allowed.has(key)) ||
      [...allowed].some((key) => url.searchParams.getAll(key).length > 1)) return null;
  const serviceKey = url.searchParams.get("serviceKey") ?? undefined;
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
  const dateTo = url.searchParams.get("dateTo") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const cursorRaw = url.searchParams.get("cursor") ?? undefined;
  if (serviceKey && !isReservationServiceKey(serviceKey)) return null;
  if (dateFrom && !isReservationDate(dateFrom)) return null;
  if (dateTo && !isReservationDate(dateTo)) return null;
  if (dateFrom && dateTo && dateFrom > dateTo) return null;
  const limit = limitRaw === null ? 50 : Number(limitRaw);
  if (!/^[1-9]\d*$/u.test(limitRaw ?? "50") || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null;
  const cursor = cursorRaw ? decodeReservationCursor(cursorRaw) : undefined;
  if (cursorRaw && !cursor) return null;
  return { serviceKey: serviceKey as ReservationServiceKey | undefined, dateFrom, dateTo, limit, cursor: cursor ?? undefined };
}

export function encodeReservationCursor(input: { createdAt: Date; id: string }): string {
  return btoa(JSON.stringify({ v: 1, createdAt: input.createdAt.toISOString(), id: input.id }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function decodeReservationCursor(value: string): { createdAt: Date; id: string } | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    if (!isExactRecord(parsed, ["v", "createdAt", "id"]) || parsed.v !== 1 ||
        typeof parsed.createdAt !== "string" || typeof parsed.id !== "string" ||
        !parseReservationId(parsed.id)) return null;
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) return null;
    if (encodeReservationCursor({ createdAt, id: parsed.id }) !== value) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}
