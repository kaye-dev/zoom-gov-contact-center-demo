import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dictionaries, locales } from "../app/i18n/dictionaries";
import {
  RESERVATION_API_PERMISSIONS,
  decodeReservationCursor,
  encodeReservationCursor,
  parseReservationApiKeyIssue,
  parseReservationApiUsageLimit,
  parseReservationList,
  parseReservationPatch,
  parseReservationWrite,
} from "../lib/reservation-api";
import { getReservationApiPeriod } from "../lib/server/reservation-api-usage";

test("reservation API permissions and strict issue payload are exact", () => {
  assert.deepEqual(RESERVATION_API_PERMISSIONS, ["LIST", "READ", "CREATE", "UPDATE", "DELETE"]);
  assert.deepEqual(parseReservationApiKeyIssue({ name: "integration", permissions: ["LIST", "CREATE"] }), {
    name: "integration",
    permissions: ["LIST", "CREATE"],
  });
  for (const value of [
    { name: "", permissions: ["LIST"] },
    { name: "integration", permissions: [] },
    { name: "integration", permissions: ["LIST", "LIST"] },
    { name: "integration", permissions: ["UNKNOWN"] },
    { name: "integration", permissions: ["LIST"], extra: true },
  ]) assert.equal(parseReservationApiKeyIssue(value), null);
  assert.equal(parseReservationApiKeyIssue({ name: " integration ", permissions: ["LIST"] })?.name, "integration");
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
  const write = { serviceKey: "bulky-waste", reservationDate: "2026-09-01", startMinute: 0 };
  assert.deepEqual(parseReservationWrite(write), write);
  assert.equal(parseReservationWrite({ ...write, unknown: true }), null);
  assert.deepEqual(parseReservationPatch({ reservationDate: "2026-09-02" }), { reservationDate: "2026-09-02" });
  assert.equal(parseReservationPatch({}), null);
  assert.equal(parseReservationPatch({ startMinute: 1.5 }), null);

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

test("all locales contain complete reservation API key copy", () => {
  for (const locale of locales) {
    const copy = dictionaries[locale].admin.reservationManagement.apiKeys;
    assert.ok(copy.title && copy.description && copy.issue && copy.usage.title && copy.keys.emptyTitle, locale);
    assert.deepEqual(Object.keys(copy.api.descriptions), [...RESERVATION_API_PERMISSIONS], locale);
  }
});

test("reservation API management UI exposes approved semantic selectors", () => {
  const source = readFileSync(new URL("../app/admin/reservations/api-keys/ReservationApiKeysView.tsx", import.meta.url), "utf8");
  for (const selector of [
    "reservation-api-key-content", "usage-limit-card", "public-api-reference", "api-key-list-card",
    "issue-dialog", "issued-dialog", "revoke-dialog", "usage-limit-dialog", "api-key-empty",
  ]) assert.match(source, new RegExp(selector, "u"));
  assert.doesNotMatch(source, /localStorage|sessionStorage|Zoom SDK|webhook/iu);
});
