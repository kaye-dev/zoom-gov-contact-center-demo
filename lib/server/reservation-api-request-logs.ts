import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type { ReservationApiPermission } from "@/lib/reservation-api";

export const RESERVATION_API_REQUEST_LOG_RETENTION_DAYS = 30;
export const RESERVATION_API_REQUEST_LOG_PAGE_SIZE = 50;

export const RESERVATION_API_REQUEST_LOG_METHODS = [
  "GET",
  "POST",
  "PATCH",
  "DELETE",
] as const;

export const RESERVATION_API_REQUEST_LOG_RESULTS = [
  "success",
  "client-error",
  "server-error",
] as const;

export type ReservationApiRequestLogMethod =
  (typeof RESERVATION_API_REQUEST_LOG_METHODS)[number];
export type ReservationApiRequestLogResult =
  (typeof RESERVATION_API_REQUEST_LOG_RESULTS)[number];

export type ReservationApiRequestLogSummary = {
  id: string;
  apiKeyName: string;
  apiKeyPreview: string;
  permission: ReservationApiPermission;
  method: ReservationApiRequestLogMethod;
  path: string;
  statusCode: number;
  errorCode: string | null;
  durationMs: number;
  requestedAt: string;
};

export type ReservationApiRequestLogDetail = ReservationApiRequestLogSummary & {
  completedAt: string;
  pathParameters: Prisma.JsonValue | null;
  query: Prisma.JsonValue | null;
  requestBody: Prisma.JsonValue | null;
  responseBody: Prisma.JsonValue | null;
};

export type ReservationApiRequestLogListInput = {
  query?: string;
  method?: ReservationApiRequestLogMethod;
  result?: ReservationApiRequestLogResult;
  cursor?: { requestedAt: Date; id: string };
};

export type ReservationApiRequestLogRecordInput = {
  apiKeyId: string;
  apiKeyName: string;
  apiKeyPreview: string;
  permission: ReservationApiPermission;
  method: ReservationApiRequestLogMethod;
  path: string;
  pathParameters: Prisma.JsonValue | null;
  query: Prisma.JsonValue | null;
  requestBody: Prisma.JsonValue | null;
  responseBody: Prisma.JsonValue | null;
  statusCode: number;
  errorCode: string | null;
  durationMs: number;
  requestedAt: Date;
  completedAt: Date;
};

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function parseReservationApiRequestLogListQuery(
  searchParams: SearchParamsRecord,
): { ok: true; value: ReservationApiRequestLogListInput } | { ok: false } {
  const allowedKeys = new Set(["query", "method", "result", "cursor"]);
  if (Object.keys(searchParams).some((key) => !allowedKeys.has(key))) {
    return { ok: false };
  }

  for (const value of Object.values(searchParams)) {
    if (Array.isArray(value)) return { ok: false };
  }

  const queryValue = typeof searchParams.query === "string"
    ? searchParams.query.trim()
    : undefined;
  if (queryValue && queryValue.length > 100) return { ok: false };

  const methodValue = typeof searchParams.method === "string"
    ? searchParams.method
    : undefined;
  if (methodValue && !isReservationApiRequestLogMethod(methodValue)) {
    return { ok: false };
  }

  const resultValue = typeof searchParams.result === "string"
    ? searchParams.result
    : undefined;
  if (resultValue && !isReservationApiRequestLogResult(resultValue)) {
    return { ok: false };
  }

  const cursorValue = typeof searchParams.cursor === "string"
    ? searchParams.cursor
    : undefined;
  if (searchParams.cursor !== undefined && !cursorValue) return { ok: false };
  const cursor = cursorValue
    ? decodeReservationApiRequestLogCursor(cursorValue)
    : undefined;
  if (cursorValue && !cursor) return { ok: false };

  return {
    ok: true,
    value: {
      ...(queryValue ? { query: queryValue } : {}),
      ...(methodValue
        ? { method: methodValue as ReservationApiRequestLogMethod }
        : {}),
      ...(resultValue
        ? { result: resultValue as ReservationApiRequestLogResult }
        : {}),
      ...(cursor ? { cursor } : {}),
    },
  };
}

export function encodeReservationApiRequestLogCursor(input: {
  requestedAt: Date;
  id: string;
}): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    requestedAt: input.requestedAt.toISOString(),
    id: input.id,
  }), "utf8").toString("base64url");
}

export function decodeReservationApiRequestLogCursor(
  value: string,
): { requestedAt: Date; id: string } | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!isExactRecord(parsed, ["v", "requestedAt", "id"]) || parsed.v !== 1) {
      return null;
    }
    if (typeof parsed.requestedAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    if (!isReservationApiRequestLogId(parsed.id)) return null;

    const requestedAt = new Date(parsed.requestedAt);
    if (
      !Number.isFinite(requestedAt.getTime()) ||
      requestedAt.toISOString() !== parsed.requestedAt
    ) {
      return null;
    }
    if (encodeReservationApiRequestLogCursor({ requestedAt, id: parsed.id }) !== value) {
      return null;
    }
    return { requestedAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function listReservationApiRequestLogs(
  prisma: PrismaClient,
  input: ReservationApiRequestLogListInput,
  now = new Date(),
): Promise<{ logs: ReservationApiRequestLogSummary[]; nextCursor: string | null }> {
  const statusRange = resultStatusRange(input.result);
  const conditions: Prisma.ReservationApiRequestLogWhereInput[] = [
    { requestedAt: { gte: reservationApiRequestLogCutoff(now) } },
  ];
  if (input.query) {
    conditions.push({
      OR: [
        { id: { contains: input.query, mode: "insensitive" } },
        { apiKeyName: { contains: input.query, mode: "insensitive" } },
        { apiKeyPreview: { contains: input.query, mode: "insensitive" } },
      ],
    });
  }
  if (input.cursor) {
    conditions.push({
      OR: [
        { requestedAt: { lt: input.cursor.requestedAt } },
        {
          requestedAt: input.cursor.requestedAt,
          id: { lt: input.cursor.id },
        },
      ],
    });
  }
  const rows = await prisma.reservationApiRequestLog.findMany({
    where: {
      AND: conditions,
      ...(input.method ? { method: input.method } : {}),
      ...(statusRange ? { statusCode: statusRange } : {}),
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    take: RESERVATION_API_REQUEST_LOG_PAGE_SIZE + 1,
    select: {
      id: true,
      apiKeyName: true,
      apiKeyPreview: true,
      permission: true,
      method: true,
      path: true,
      statusCode: true,
      errorCode: true,
      durationMs: true,
      requestedAt: true,
    },
  });
  const page = rows.slice(0, RESERVATION_API_REQUEST_LOG_PAGE_SIZE);
  const last = page.at(-1);
  return {
    logs: page.map(toReservationApiRequestLogSummary),
    nextCursor:
      rows.length > RESERVATION_API_REQUEST_LOG_PAGE_SIZE && last
        ? encodeReservationApiRequestLogCursor({
            requestedAt: last.requestedAt,
            id: last.id,
          })
        : null,
  };
}

export async function getReservationApiRequestLog(
  prisma: PrismaClient,
  id: string,
  now = new Date(),
): Promise<ReservationApiRequestLogDetail | null> {
  if (!isReservationApiRequestLogId(id)) return null;
  const row = await prisma.reservationApiRequestLog.findFirst({
    where: {
      id,
      requestedAt: { gte: reservationApiRequestLogCutoff(now) },
    },
    select: {
      id: true,
      apiKeyName: true,
      apiKeyPreview: true,
      permission: true,
      method: true,
      path: true,
      pathParameters: true,
      query: true,
      requestBody: true,
      responseBody: true,
      statusCode: true,
      errorCode: true,
      durationMs: true,
      requestedAt: true,
      completedAt: true,
    },
  });
  return row ? toReservationApiRequestLogDetail(row) : null;
}

export async function recordReservationApiRequestLog(
  prisma: PrismaClient,
  input: ReservationApiRequestLogRecordInput,
  now = input.completedAt,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.reservationApiRequestLog.deleteMany({
      where: { requestedAt: { lt: reservationApiRequestLogCutoff(now) } },
    });
    await transaction.reservationApiRequestLog.create({
      data: {
        apiKeyId: input.apiKeyId,
        apiKeyName: input.apiKeyName,
        apiKeyPreview: input.apiKeyPreview,
        permission: input.permission,
        method: input.method,
        path: input.path,
        pathParameters: toNullableJsonInput(input.pathParameters),
        query: toNullableJsonInput(input.query),
        requestBody: toNullableJsonInput(input.requestBody),
        responseBody: toNullableJsonInput(input.responseBody),
        statusCode: input.statusCode,
        errorCode: input.errorCode,
        durationMs: input.durationMs,
        requestedAt: input.requestedAt,
        completedAt: input.completedAt,
      },
    });
  });
}

export function reservationApiRequestLogCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() - RESERVATION_API_REQUEST_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  );
}

export function isReservationApiRequestLogId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,191}$/u.test(value);
}

function toReservationApiRequestLogSummary(row: {
  id: string;
  apiKeyName: string;
  apiKeyPreview: string;
  permission: ReservationApiPermission;
  method: string;
  path: string;
  statusCode: number;
  errorCode: string | null;
  durationMs: number;
  requestedAt: Date;
}): ReservationApiRequestLogSummary {
  return {
    id: row.id,
    apiKeyName: row.apiKeyName,
    apiKeyPreview: row.apiKeyPreview,
    permission: row.permission,
    method: row.method as ReservationApiRequestLogMethod,
    path: row.path,
    statusCode: row.statusCode,
    errorCode: row.errorCode,
    durationMs: row.durationMs,
    requestedAt: row.requestedAt.toISOString(),
  };
}

function toReservationApiRequestLogDetail(row: {
  id: string;
  apiKeyName: string;
  apiKeyPreview: string;
  permission: ReservationApiPermission;
  method: string;
  path: string;
  pathParameters: Prisma.JsonValue | null;
  query: Prisma.JsonValue | null;
  requestBody: Prisma.JsonValue | null;
  responseBody: Prisma.JsonValue | null;
  statusCode: number;
  errorCode: string | null;
  durationMs: number;
  requestedAt: Date;
  completedAt: Date;
}): ReservationApiRequestLogDetail {
  return {
    ...toReservationApiRequestLogSummary(row),
    completedAt: row.completedAt.toISOString(),
    pathParameters: canonicalizeReservationApiLogJson(row.pathParameters),
    query: canonicalizeReservationApiLogJson(row.query),
    requestBody: canonicalizeReservationApiLogJson(row.requestBody),
    responseBody: canonicalizeReservationApiLogJson(row.responseBody),
  };
}

const RESERVATION_API_LOG_JSON_KEY_ORDER = [
  "reservation",
  "items",
  "nextCursor",
  "id",
  "serviceKey",
  "reservationDate",
  "startMinute",
  "createdAt",
  "updatedAt",
  "dateFrom",
  "dateTo",
  "limit",
  "cursor",
  "error",
] as const;

function canonicalizeReservationApiLogJson(
  value: Prisma.JsonValue | null,
): Prisma.JsonValue | null {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeReservationApiLogJson(item));
  }
  const keys = Object.keys(value);
  const preferred = RESERVATION_API_LOG_JSON_KEY_ORDER.filter((key) =>
    Object.hasOwn(value, key)
  );
  const remaining = keys
    .filter((key) => !preferred.includes(key as never))
    .sort();
  return Object.fromEntries(
    [...preferred, ...remaining].map((key) => [
      key,
      canonicalizeReservationApiLogJson(value[key] ?? null),
    ]),
  );
}

function toNullableJsonInput(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value as Prisma.InputJsonValue;
}

function resultStatusRange(
  result: ReservationApiRequestLogResult | undefined,
): { gte: number; lte: number } | undefined {
  if (result === "success") return { gte: 200, lte: 299 };
  if (result === "client-error") return { gte: 400, lte: 499 };
  if (result === "server-error") return { gte: 500, lte: 599 };
  return undefined;
}

function isReservationApiRequestLogMethod(
  value: string,
): value is ReservationApiRequestLogMethod {
  return RESERVATION_API_REQUEST_LOG_METHODS.includes(
    value as ReservationApiRequestLogMethod,
  );
}

function isReservationApiRequestLogResult(
  value: string,
): value is ReservationApiRequestLogResult {
  return RESERVATION_API_REQUEST_LOG_RESULTS.includes(
    value as ReservationApiRequestLogResult,
  );
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length &&
    actualKeys.every((key) => keys.includes(key));
}
