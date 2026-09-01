import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dictionaries, locales } from "../app/i18n/dictionaries";
import {
  RESERVATION_SERVICE_CATALOG,
  RESERVATION_SERVICE_KEYS,
  getReservationAvailabilityStatus,
  getReservationMonthRange,
  getReservationSlotsForDate,
  isReservationMonthInRange,
} from "../lib/reservations";
import { buildReservationCalendarSnapshot } from "../lib/server/reservations";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const now = new Date("2026-08-30T03:00:00.000Z");

test("service catalog fixes the four date and time booking scenarios", () => {
  assert.deepEqual(RESERVATION_SERVICE_KEYS, [
    "my-number-card",
    "legal-consultation",
    "bulky-waste",
    "civic-facility",
  ]);
  assert.deepEqual(
    RESERVATION_SERVICE_CATALOG.map(({ key, method, weekdays, slots }) => ({
      key,
      method,
      weekdays: [...weekdays],
      slots: slots.map((slot) => ({ ...slot })),
    })),
    [
      {
        key: "my-number-card",
        method: "DATETIME",
        weekdays: [1, 2, 3, 4, 5],
        slots: Array.from({ length: 16 }, (_, index) => ({
          startMinute: 540 + index * 30,
          endMinute: 570 + index * 30,
          capacity: 3,
        })),
      },
      {
        key: "legal-consultation",
        method: "DATETIME",
        weekdays: [3],
        slots: [
          { startMinute: 780, endMinute: 840, capacity: 1 },
          { startMinute: 840, endMinute: 900, capacity: 1 },
          { startMinute: 900, endMinute: 960, capacity: 1 },
        ],
      },
      {
        key: "bulky-waste",
        method: "DATE",
        weekdays: [1, 2, 3, 4, 5, 6],
        slots: [{ startMinute: 0, endMinute: 1440, capacity: 20 }],
      },
      {
        key: "civic-facility",
        method: "DATETIME",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        slots: [
          { startMinute: 540, endMinute: 720, capacity: 2 },
          { startMinute: 780, endMinute: 1020, capacity: 2 },
          { startMinute: 1080, endMinute: 1260, capacity: 2 },
        ],
      },
    ],
  );
});

test("availability thresholds and disabled date boundaries are deterministic", () => {
  assert.equal(getReservationAvailabilityStatus(20, 6), "AVAILABLE");
  assert.equal(getReservationAvailabilityStatus(20, 5), "LIMITED");
  assert.equal(getReservationAvailabilityStatus(3, 2), "AVAILABLE");
  assert.equal(getReservationAvailabilityStatus(3, 1), "LIMITED");
  assert.equal(getReservationAvailabilityStatus(1, 1), "LIMITED");
  assert.equal(getReservationAvailabilityStatus(1, 0), "FULL");
  assert.equal(getReservationAvailabilityStatus(0, 0), "UNAVAILABLE");

  assert.deepEqual(getReservationMonthRange(now), {
    minimum: "2026-08",
    maximum: "2027-07",
  });
  assert.equal(isReservationMonthInRange("2026-08", now), true);
  assert.equal(isReservationMonthInRange("2027-07", now), true);
  assert.equal(isReservationMonthInRange("2026-07", now), false);
  assert.equal(isReservationMonthInRange("2027-08", now), false);

  const myNumber = RESERVATION_SERVICE_CATALOG[0];
  assert.equal(getReservationSlotsForDate(myNumber, "2026-08-29", now).length, 0);
  assert.equal(getReservationSlotsForDate(myNumber, "2026-08-30", now).length, 0);
  assert.equal(getReservationSlotsForDate(myNumber, "2026-08-31", now).length, 16);
});

test("calendar snapshots expose empty slots and aggregate booking rows", () => {
  const empty = buildReservationCalendarSnapshot(
    { service: "my-number-card", month: "2026-09", now },
    [],
  );
  const septemberFirst = empty.days.find(({ date }) => date === "2026-09-01")!;
  assert.equal(septemberFirst.bookable, true);
  assert.equal(septemberFirst.slots.length, 16);
  assert.equal(septemberFirst.booked, 0);
  assert.equal(septemberFirst.remaining, 48);

  const occupied = buildReservationCalendarSnapshot(
    { service: "my-number-card", month: "2026-09", now },
    [
      { serviceKey: "my-number-card", reservationDate: new Date("2026-09-01T00:00:00Z"), startMinute: 540 },
      { serviceKey: "my-number-card", reservationDate: new Date("2026-09-01T00:00:00Z"), startMinute: 540 },
    ],
  );
  const slot = occupied.days[0]!.slots[0]!;
  assert.deepEqual(slot, {
    startMinute: 540,
    endMinute: 570,
    capacity: 3,
    booked: 2,
    remaining: 1,
    status: "LIMITED",
  });
});

test("reservation navigation, page, and semantic controls follow the approved contract", () => {
  const shell = source("../app/admin/AdminShell.tsx");
  const layout = source("../app/admin/layout.tsx");
  const page = source("../app/admin/reservations/page.tsx");
  const view = source("../app/admin/reservations/ReservationSystemView.tsx");

  assert.match(shell, /href="\/admin\/reservations"/u);
  assert.match(shell, /visibleItems\.includes\("reservations"\)/u);
  assert.match(layout, /canAdminAccess\(actor, "reservations", "VIEW"\)/u);
  assert.match(page, /requireAdminAccess\(\s*"reservations",\s*"VIEW"/u);
  assert.match(view, /id="reservation-system-content"/u);
  assert.match(view, /id="calendar-grid"[^>]*role="grid"/u);
  assert.match(view, /aria-pressed=\{selected\}/u);
  assert.match(view, /id="random-fill-button"/u);
  assert.match(view, /aria-busy=\{isGenerating \|\| undefined\}/u);
  assert.match(view, /requestAnimationFrame\(\(\) => randomButtonRef\.current\?\.focus\(\)\)/u);
  assert.match(view, /disabled=\{!canEdit \|\| isGenerating\}/u);
  assert.match(view, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(18rem,24rem\)\]/u);
});

test("all locales contain complete reservation copy and access catalog entries", () => {
  for (const locale of locales) {
    const admin = dictionaries[locale].admin;
    const copy = admin.reservationManagement;
    assert.ok(admin.reservations.length > 0, locale);
    assert.deepEqual(Object.keys(copy.services), [...RESERVATION_SERVICE_KEYS], locale);
    assert.deepEqual(Object.keys(copy.statuses).sort(), ["AVAILABLE", "FULL", "LIMITED", "UNAVAILABLE"], locale);
    assert.equal(copy.weekdays.length, 7, locale);
    assert.ok(copy.title.length > 0 && copy.generated.length > 0 && copy.generationError.length > 0, locale);
    assert.ok(admin.accessControl.resourceTitles.reservations.length > 0, locale);
    assert.ok(admin.accessControl.resourceDescriptions.reservations.length > 0, locale);
  }
});

test("reservation persistence contains no raw PII and no Virtual Agent integration", () => {
  const schema = source("../prisma/schema.prisma");
  const migration = source("../prisma/migrations/20260830120000_add_reservation_bookings/migration.sql");
  const implementation = [
    source("../lib/reservations.ts"),
    source("../lib/server/reservations.ts"),
    source("../app/admin/reservations/page.tsx"),
    source("../app/admin/reservations/ReservationSystemView.tsx"),
  ].join("\n");
  const modelStart = schema.indexOf("model ReservationBooking");
  const nextModel = schema.indexOf("\nmodel ", modelStart + 1);
  const model = schema.slice(modelStart, nextModel === -1 ? undefined : nextModel);
  assert.match(model, /callerAniDigest\s+String\?/u);
  assert.doesNotMatch(model, /\b(?:callerAni|callerPhone|phoneNumber)\s+String/u);
  for (const forbidden of ["name", "address", "email", "phone", "consultationContent", "receiptNumber"]) {
    assert.doesNotMatch(model, new RegExp(`\\b${forbidden}\\b`, "iu"));
    assert.doesNotMatch(migration, new RegExp(`\\b${forbidden}\\b`, "iu"));
  }
  assert.doesNotMatch(implementation, /Virtual Agent|Zoom SDK|webhook/iu);
});
