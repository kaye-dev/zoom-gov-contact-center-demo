import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dictionaries, locales } from "../app/i18n/dictionaries";
import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  RESERVATION_API_ERROR_CODES,
  RESERVATION_API_PERMISSIONS,
  RESERVATION_CALLER_PHONE_HEADER,
  decodeReservationCursor,
  encodeReservationCursor,
  parseReservationApiKeyIssue,
  parseReservationAvailability,
  parseReservationCallerPhone,
  parseReservationIdempotencyKey,
  parseReservationIfMatch,
  parseReservationApiUsageLimit,
  parseReservationList,
  parseReservationPatch,
  parseReservationWrite,
} from "../lib/reservation-api";
import {
  RESERVATION_API_REQUEST_LOG_PAGE_SIZE,
  RESERVATION_API_REQUEST_LOG_RETENTION_DAYS,
  decodeReservationApiRequestLogCursor,
  encodeReservationApiRequestLogCursor,
  getReservationApiRequestLog,
  listReservationApiRequestLogs,
  parseReservationApiRequestLogListQuery,
  reservationApiRequestLogCutoff,
} from "../lib/server/reservation-api-request-logs";
import { getReservationApiPeriod } from "../lib/server/reservation-api-usage";

test("reservation API permissions and strict issue payload are exact", () => {
  assert.deepEqual(RESERVATION_API_PERMISSIONS, ["LIST", "READ", "CREATE", "UPDATE", "DELETE"]);
  assert.deepEqual(parseReservationApiKeyIssue({
    name: "integration",
    permissions: ["LIST", "CREATE"],
    usageLimit: { mode: "LIMITED", monthlyLimit: "3000" },
  }), {
    name: "integration",
    permissions: ["LIST", "CREATE"],
    monthlyLimit: BigInt(3000),
  });
  assert.deepEqual(parseReservationApiKeyIssue({
    name: "unlimited",
    permissions: ["LIST"],
    usageLimit: { mode: "UNLIMITED" },
  }), { name: "unlimited", permissions: ["LIST"], monthlyLimit: null });
  for (const value of [
    { name: "", permissions: ["LIST"], usageLimit: { mode: "UNLIMITED" } },
    { name: "integration", permissions: [], usageLimit: { mode: "UNLIMITED" } },
    { name: "integration", permissions: ["LIST", "LIST"], usageLimit: { mode: "UNLIMITED" } },
    { name: "integration", permissions: ["UNKNOWN"], usageLimit: { mode: "UNLIMITED" } },
    { name: "integration", permissions: ["LIST"], usageLimit: { mode: "UNLIMITED" }, extra: true },
    { name: "integration", permissions: ["LIST"] },
    { name: "integration", permissions: ["LIST"], usageLimit: { mode: "UNLIMITED", monthlyLimit: "100" } },
  ]) assert.equal(parseReservationApiKeyIssue(value), null);
  assert.equal(parseReservationApiKeyIssue({
    name: " integration ",
    permissions: ["LIST"],
    usageLimit: { mode: "LIMITED", monthlyLimit: "100" },
  })?.name, "integration");
});

test("monthly limit accepts exact bigint rules and unlimited shape", () => {
  for (const value of ["100", "101", "9999", "10000", "10100", "9223372036854775800"]) {
    assert.notEqual(parseReservationApiUsageLimit({ mode: "LIMITED", monthlyLimit: value, expectedRevision: 1 }), null, value);
  }
  for (const value of ["", "99", "+100", "100.0", "10001", "10150", "9223372036854775801"]) {
    assert.equal(parseReservationApiUsageLimit({ mode: "LIMITED", monthlyLimit: value, expectedRevision: 1 }), null, value);
  }
  assert.deepEqual(parseReservationApiUsageLimit({ mode: "UNLIMITED", expectedRevision: 2 }), {
    mode: "UNLIMITED",
    expectedRevision: 2,
  });
  assert.equal(parseReservationApiUsageLimit({ mode: "UNLIMITED", monthlyLimit: "100", expectedRevision: 2 }), null);

  for (const value of ["100", "101", "10000", "10100", "9223372036854775800"]) {
    assert.notEqual(parseReservationApiKeyIssue({
      name: "key",
      permissions: ["LIST"],
      usageLimit: { mode: "LIMITED", monthlyLimit: value },
    }), null, value);
  }
  for (const value of ["99", "0100", "10001", "10150", "9223372036854775801"]) {
    assert.equal(parseReservationApiKeyIssue({
      name: "key",
      permissions: ["LIST"],
      usageLimit: { mode: "LIMITED", monthlyLimit: value },
    }), null, value);
  }
});

test("monthly usage follows the Asia Tokyo calendar boundary", () => {
  assert.deepEqual(getReservationApiPeriod(new Date("2026-08-31T14:59:59.000Z")), {
    periodStart: "2026-08-01",
    periodDate: new Date("2026-08-01T00:00:00.000Z"),
    resetsAt: new Date("2026-08-31T15:00:00.000Z"),
  });
  assert.equal(getReservationApiPeriod(new Date("2026-08-31T15:00:00.000Z")).periodStart, "2026-09-01");
});

test("reservation writes, patches, list query, and cursor are strict", () => {
  const write = { serviceKey: "bulky-waste", reservationDate: "2026-09-01", startMinute: 0, externalReferenceId: "zva_workflow_0001" };
  assert.deepEqual(parseReservationWrite(write), write);
  assert.equal(parseReservationWrite({ ...write, unknown: true }), null);
  assert.deepEqual(parseReservationPatch({ reservationDate: "2026-09-02" }), { reservationDate: "2026-09-02" });
  assert.equal(parseReservationPatch({}), null);
  assert.equal(parseReservationPatch({ startMinute: 1.5 }), null);
  assert.deepEqual(parseReservationPatch({ externalReferenceId: "zva_workflow_0002" }), { externalReferenceId: "zva_workflow_0002" });
  assert.equal(parseReservationPatch({ externalReferenceId: "contains@email.example" }), null);
  assert.equal(parseReservationIdempotencyKey("idempotency_key_0001"), "idempotency_key_0001");
  assert.equal(parseReservationIdempotencyKey("short"), null);
  assert.equal(parseReservationIfMatch('"reservation-booking_1-v3"', "booking_1"), 3);
  assert.equal(parseReservationIfMatch("*", "booking_1"), null);
  assert.deepEqual(
    parseReservationAvailability(new URL("https://example.test/api?dateFrom=2026-09-01&dateTo=2026-10-01")),
    { dateFrom: "2026-09-01", dateTo: "2026-10-01" },
  );
  assert.equal(parseReservationAvailability(new URL("https://example.test/api?dateFrom=2026-09-01&dateTo=2026-10-02")), null);

  const cursorInput = { createdAt: new Date("2026-08-30T00:00:00.000Z"), id: "booking_1" };
  const cursor = encodeReservationCursor(cursorInput);
  assert.deepEqual(decodeReservationCursor(cursor), cursorInput);
  assert.equal(decodeReservationCursor(`${cursor}=`), null);
  const parsed = parseReservationList(new URL(`https://example.test/api?serviceKey=bulky-waste&dateFrom=2026-09-01&dateTo=2026-09-30&limit=10&cursor=${cursor}`));
  assert.equal(parsed?.limit, 10);
  assert.equal(parseReservationList(new URL("https://example.test/api?limit=101")), null);
  assert.equal(parseReservationList(new URL("https://example.test/api?limit=1&limit=2")), null);
  assert.equal(parseReservationList(new URL("https://example.test/api?unknown=1")), null);
});

test("caller phone header accepts only canonical E.164 input", () => {
  assert.equal(RESERVATION_CALLER_PHONE_HEADER, "X-Reservation-Caller-Phone");
  assert.equal(
    RESERVATION_API_ERROR_CODES.callerPhoneRequired,
    "RESERVATION_CALLER_PHONE_REQUIRED",
  );
  assert.equal(
    RESERVATION_API_ERROR_CODES.callerPhoneInvalid,
    "RESERVATION_CALLER_PHONE_INVALID",
  );
  for (const valid of [
    "+12345678",
    "+12025550123",
    "+123456789012345",
  ]) {
    assert.equal(parseReservationCallerPhone(valid), valid);
  }
  for (const invalid of [
    null,
    "",
    "+1234567",
    "+1234567890123456",
    "+02025550123",
    "12025550123",
    " +12025550123",
    "+12025550123 ",
    "+12025550123,+12025550124",
    "+１２０２５５５０１２３",
  ]) {
    assert.equal(parseReservationCallerPhone(invalid), null, String(invalid));
  }
});

test("reservation API log query, cursor, and retention boundary are strict", () => {
  const cursorInput = {
    requestedAt: new Date("2026-08-30T07:42:18.240Z"),
    id: "request-log_1",
  };
  const cursor = encodeReservationApiRequestLogCursor(cursorInput);
  assert.deepEqual(decodeReservationApiRequestLogCursor(cursor), cursorInput);
  for (const invalid of [
    `${cursor}=`,
    Buffer.from(JSON.stringify({ v: 2, requestedAt: cursorInput.requestedAt.toISOString(), id: cursorInput.id })).toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, requestedAt: "2026-08-30", id: cursorInput.id })).toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, requestedAt: cursorInput.requestedAt.toISOString(), id: "bad/id" })).toString("base64url"),
  ]) assert.equal(decodeReservationApiRequestLogCursor(invalid), null, invalid);

  assert.deepEqual(parseReservationApiRequestLogListQuery({
    query: "  Zoom Virtual Agent  ",
    method: "POST",
    result: "client-error",
    cursor,
  }), {
    ok: true,
    value: {
      query: "Zoom Virtual Agent",
      method: "POST",
      result: "client-error",
      cursor: cursorInput,
    },
  });
  assert.deepEqual(parseReservationApiRequestLogListQuery({
    query: "   ",
    method: "",
    result: "",
  }), { ok: true, value: {} });
  for (const invalid of [
    { unknown: "1" },
    { query: ["first", "second"] },
    { query: "x".repeat(101) },
    { method: "OPTIONS" },
    { result: "redirect" },
    { cursor: "" },
    { cursor: `${cursor}=` },
  ]) assert.deepEqual(parseReservationApiRequestLogListQuery(invalid), { ok: false });

  const now = new Date("2026-08-30T12:00:00.000Z");
  assert.equal(RESERVATION_API_REQUEST_LOG_RETENTION_DAYS, 30);
  assert.equal(RESERVATION_API_REQUEST_LOG_PAGE_SIZE, 50);
  assert.equal(
    reservationApiRequestLogCutoff(now).toISOString(),
    "2026-07-31T12:00:00.000Z",
  );
});

test("reservation API log DTOs expose only allowlisted operational fields", async () => {
  const requestedAt = new Date("2026-08-30T07:42:18.240Z");
  const completedAt = new Date("2026-08-30T07:42:18.324Z");
  const databaseRow = {
    id: "request-log-safe",
    apiKeyName: "Zoom Virtual Agent",
    apiKeyPreview: "zgcc_rsv_7H3K••••9Q2M",
    permission: "CREATE" as const,
    method: "POST",
    path: "/api/public/v1/reservations",
    pathParameters: {},
    query: {},
    requestBody: {
      serviceKey: "bulky-waste",
      reservationDate: "2026-09-08",
      startMinute: 600,
    },
    responseBody: { reservation: { id: "booking-1" } },
    statusCode: 201,
    errorCode: null,
    durationMs: 84,
    requestedAt,
    completedAt,
    idempotencyOutcome: "NEW",
    responseLocation: "/api/public/v1/reservations/booking-1",
    responseEtag: '"reservation-booking-1-v1"',
    authorization: "Bearer raw-key-must-not-escape",
    secretHash: "secret-hash-must-not-escape",
    cookie: "session-cookie-must-not-escape",
    headers: { "x-internal": "header-must-not-escape" },
    stack: "stack-must-not-escape",
  };
  const prisma = {
    reservationApiRequestLog: {
      async findMany() {
        return [databaseRow];
      },
      async findFirst() {
        return databaseRow;
      },
    },
  } as unknown as PrismaClient;

  const listed = await listReservationApiRequestLogs(
    prisma,
    {},
    new Date("2026-08-30T08:00:00.000Z"),
  );
  const detail = await getReservationApiRequestLog(
    prisma,
    databaseRow.id,
    new Date("2026-08-30T08:00:00.000Z"),
  );
  assert.deepEqual(Object.keys(listed.logs[0]!).sort(), [
    "apiKeyName", "apiKeyPreview", "durationMs", "errorCode", "id", "method",
    "path", "permission", "requestedAt", "statusCode",
  ]);
  assert.deepEqual(Object.keys(detail!).sort(), [
    "apiKeyName", "apiKeyPreview", "completedAt", "durationMs", "errorCode", "id",
    "idempotencyOutcome", "method", "path", "pathParameters", "permission", "query",
    "requestBody", "requestedAt", "responseBody", "responseEtag", "responseLocation",
    "statusCode",
  ]);
  const serialized = JSON.stringify({ listed, detail });
  for (const forbidden of [
    "raw-key-must-not-escape",
    "secret-hash-must-not-escape",
    "session-cookie-must-not-escape",
    "header-must-not-escape",
    "stack-must-not-escape",
    "authorization",
    "secretHash",
    "headers",
    "cookie",
    "stack",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("all locales contain complete reservation API key copy", () => {
  for (const locale of locales) {
    const copy = dictionaries[locale].admin.reservationManagement.apiKeys;
    assert.ok(copy.title && copy.description && copy.issue && copy.usage.title && copy.keys.monthlyLimit && copy.keyUsageDialog.title, locale);
    assert.deepEqual(Object.keys(copy.api.descriptions), [...RESERVATION_API_PERMISSIONS], locale);
    assert.equal(Object.keys(copy.api.operations).length, 8, locale);
    assert.match(copy.api.description, /X-Reservation-Caller-Phone/u, locale);
    assert.ok(copy.logs.detail.credentialNotice.length > 0, locale);
  }
});

test("reservation API management UI exposes approved semantic selectors", () => {
  const source = readFileSync(new URL("../app/admin/reservations/api-keys/ReservationApiKeysView.tsx", import.meta.url), "utf8");
  for (const selector of [
    "reservation-api-key-content", "usage-limit-card", "public-api-reference", "api-key-list-card",
    "issue-dialog", "issued-dialog", "revoke-dialog", "usage-limit-dialog", "key-usage-limit-dialog", "api-key-empty",
  ]) assert.match(source, new RegExp(selector, "u"));
  assert.match(source, /htmlFor="key-usage-limit-input"/u);
  assert.match(source, /id="key-usage-limit-input" name="monthlyLimit"/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|Zoom SDK|webhook/iu);
});
