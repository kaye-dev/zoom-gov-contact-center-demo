import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  RESERVATION_BOOKING_LIST_PAGE_SIZE,
  decodeReservationBookingListCursor,
  encodeReservationBookingListCursor,
  listReservationBookings,
  parseReservationBookingListQuery,
} from "../lib/server/reservation-bookings";
import { buildReservationBookingListNextHref } from "../app/admin/reservations/bookings/ReservationBookingsView";
import { validateReservationBookingListFixtureEnvironment } from "./helpers/reservation-booking-list-fixture";

const createdAt = new Date("2026-09-04T01:00:00.000Z");

test("RES-LIST-PARSE-01 accepts canonical filters and rejects unknown or duplicate input", () => {
  const cursor = encodeReservationBookingListCursor({
    createdAt,
    id: "booking-cursor",
  });
  assert.deepEqual(parseReservationBookingListQuery({
    service: "legal-consultation",
    source: "ZVA",
    cursor,
    theme: "dark",
  }), {
    ok: true,
    value: {
      service: "legal-consultation",
      source: "ZVA",
      cursor: { createdAt, id: "booking-cursor" },
    },
  });
  assert.deepEqual(parseReservationBookingListQuery({ service: "", source: "" }), {
    ok: true,
    value: {},
  });
  for (const invalid of [
    { extra: "1" },
    { service: "unknown" },
    { source: "OTHER" },
    { source: ["ZVA", "DEMO"] },
    { cursor: "" },
    { cursor: "not-canonical" },
    { theme: "system" },
  ]) {
    assert.deepEqual(parseReservationBookingListQuery(invalid), { ok: false });
  }
});

test("RES-LIST-QUERY-01 uses a 51-row allowlisted query and a stable composite cursor", async () => {
  let query: unknown;
  const rows = Array.from(
    { length: RESERVATION_BOOKING_LIST_PAGE_SIZE + 1 },
    (_, index) => ({
      id: `booking-${index.toString().padStart(3, "0")}`,
      serviceKey: "my-number-card",
      reservationDate: new Date("2026-09-18T00:00:00.000Z"),
      startMinute: 540,
      isDemo: index % 2 === 0,
      createdAt: new Date(createdAt.getTime() - index * 1_000),
    }),
  );
  const prisma = {
    reservationBooking: {
      async findMany(input: unknown) {
        query = input;
        return rows;
      },
    },
  } as unknown as PrismaClient;

  const cursor = { createdAt, id: "booking-cursor" };
  const result = await listReservationBookings(prisma, {
    service: "my-number-card",
    source: "ZVA",
    cursor,
  });

  assert.deepEqual(query, {
    where: {
      AND: [{
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: "booking-cursor" } },
        ],
      }],
      serviceKey: "my-number-card",
      isDemo: false,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
    select: {
      id: true,
      serviceKey: true,
      reservationDate: true,
      startMinute: true,
      isDemo: true,
      createdAt: true,
    },
  });
  assert.equal(result.bookings.length, 50);
  assert.deepEqual(result.bookings[0], {
    id: "booking-000",
    serviceKey: "my-number-card",
    reservationDate: "2026-09-18",
    startMinute: 540,
    createdAt: "2026-09-04T01:00:00.000Z",
    source: "DEMO",
  });
  assert.deepEqual(Object.keys(result.bookings[0]!).sort(), [
    "createdAt",
    "id",
    "reservationDate",
    "serviceKey",
    "source",
    "startMinute",
  ]);
  const decoded = decodeReservationBookingListCursor(result.nextCursor!);
  assert.deepEqual(decoded, {
    createdAt: rows[49]!.createdAt,
    id: rows[49]!.id,
  });
});

test("RES-LIST-FILTER-01 maps source filters to Prisma isDemo conditions", async () => {
  const whereValues: unknown[] = [];
  const prisma = {
    reservationBooking: {
      async findMany(input: { where: unknown }) {
        whereValues.push(input.where);
        return [];
      },
    },
  } as unknown as PrismaClient;

  await listReservationBookings(prisma, {});
  await listReservationBookings(prisma, { source: "ZVA" });
  await listReservationBookings(prisma, { source: "DEMO" });
  assert.deepEqual(whereValues, [{}, { isDemo: false }, { isDemo: true }]);
});

test("RES-LIST-HREF-01 preserves selected filters and adds one cursor", () => {
  const href = buildReservationBookingListNextHref(
    { service: "bulky-waste", source: "DEMO" },
    "cursor-value",
  );
  const url = new URL(href, "http://localhost");
  assert.equal(url.pathname, "/admin/reservations/bookings");
  assert.equal(url.searchParams.get("service"), "bulky-waste");
  assert.equal(url.searchParams.get("source"), "DEMO");
  assert.deepEqual(url.searchParams.getAll("cursor"), ["cursor-value"]);
});

test("RES-LIST-PRIVACY-01 keeps internal identifiers out of the query and UI", () => {
  const server = source("../lib/server/reservation-bookings.ts");
  const view = source("../app/admin/reservations/bookings/ReservationBookingsView.tsx");
  const select = server.slice(server.indexOf("select: {"), server.indexOf("},\n  });", server.indexOf("select: {")));
  for (const forbidden of ["callerAniDigest", "apiKeyId", "externalReferenceId", "revision"]) {
    assert.doesNotMatch(select, new RegExp(forbidden, "u"));
    assert.doesNotMatch(view, new RegExp(forbidden, "u"));
  }
});

test("reservation list Browser fixture requires development, confirmation, and a local database", () => {
  assert.doesNotThrow(() => validateReservationBookingListFixtureEnvironment({
    NODE_ENV: "development",
    CONFIRM_RESERVATION_LIST_FIXTURE: "1",
    DATABASE_URL: "postgresql://postgres:postgres@db:5432/zoom_demo",
  }));
  assert.throws(() => validateReservationBookingListFixtureEnvironment({
    NODE_ENV: "production",
    CONFIRM_RESERVATION_LIST_FIXTURE: "1",
    DATABASE_URL: "postgresql://postgres:postgres@db:5432/zoom_demo",
  }), /NODE_ENV=development/u);
  assert.throws(() => validateReservationBookingListFixtureEnvironment({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres:postgres@db:5432/zoom_demo",
  }), /CONFIRM_RESERVATION_LIST_FIXTURE=1/u);
  assert.throws(() => validateReservationBookingListFixtureEnvironment({
    NODE_ENV: "development",
    CONFIRM_RESERVATION_LIST_FIXTURE: "1",
    DATABASE_URL: "postgresql://postgres:postgres@example.com:5432/production",
  }), /local development database/u);
});

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}
