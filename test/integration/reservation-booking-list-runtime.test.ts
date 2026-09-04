import assert from "node:assert/strict";
import test from "node:test";

import { createDatabaseContext } from "../../lib/server/prisma";
import {
  decodeReservationBookingListCursor,
  listReservationBookings,
} from "../../lib/server/reservation-bookings";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";

test(
  "RES-LIST-DB-01/02/03 reservation list pages, filters, and fallback are stable in PostgreSQL",
  { timeout: 180_000 },
  async () => {
    await withIsolatedPostgresDatabase(async (databaseUrl) => {
      const previousUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = databaseUrl;
      const database = createDatabaseContext();
      try {
        const firstCreatedAt = new Date("2026-09-04T02:00:00.000Z");
        const pageRows = Array.from({ length: 52 }, (_, index) => ({
          id: `reservation-list-page-${index.toString().padStart(3, "0")}`,
          serviceKey: "my-number-card",
          reservationDate: new Date("2026-09-18T00:00:00.000Z"),
          startMinute: index === 1 ? 999 : 540,
          isDemo: index % 2 === 0,
          createdAt: index <= 1
            ? firstCreatedAt
            : new Date(firstCreatedAt.getTime() - index * 1_000),
        }));
        const filterRows = [
          booking("reservation-list-zva-civic", "civic-facility", false, 780),
          booking("reservation-list-zva-bulky", "bulky-waste", false, 0),
          booking("reservation-list-demo-legal", "legal-consultation", true, 780),
          booking("reservation-list-demo-civic", "civic-facility", true, 540),
        ];
        await database.prisma.reservationBooking.createMany({
          data: [...pageRows, ...filterRows],
        });

        const first = await listReservationBookings(database.prisma, {});
        assert.equal(first.bookings.length, 50);
        assert.ok(first.nextCursor);
        assert.deepEqual(first.bookings.slice(0, 2).map(({ id }) => id), [
          "reservation-list-page-001",
          "reservation-list-page-000",
        ]);
        assert.equal(first.bookings[0]!.startMinute, 999);

        const second = await listReservationBookings(database.prisma, {
          cursor: decodeReservationBookingListCursor(first.nextCursor!)!,
        });
        assert.equal(second.bookings.length, 6);
        assert.equal(second.nextCursor, null);
        assert.equal(
          new Set([...first.bookings, ...second.bookings].map(({ id }) => id)).size,
          56,
        );

        const zva = await listReservationBookings(database.prisma, { source: "ZVA" });
        assert.ok(zva.bookings.length > 0);
        assert.ok(zva.bookings.every(({ source }) => source === "ZVA"));
        assert.equal(zva.bookings.some(({ id }) => id.includes("demo")), false);

        const demos = await listReservationBookings(database.prisma, { source: "DEMO" });
        assert.ok(demos.bookings.length > 0);
        assert.ok(demos.bookings.every(({ source }) => source === "DEMO"));

        const legalZva = await listReservationBookings(database.prisma, {
          service: "legal-consultation",
          source: "ZVA",
        });
        assert.deepEqual(legalZva, { bookings: [], nextCursor: null });

        const civicDemos = await listReservationBookings(database.prisma, {
          service: "civic-facility",
          source: "DEMO",
        });
        assert.deepEqual(civicDemos.bookings.map(({ id }) => id), [
          "reservation-list-demo-civic",
        ]);
      } finally {
        await database.close();
        if (previousUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousUrl;
      }
    });
  },
);

function booking(
  id: string,
  serviceKey: "legal-consultation" | "bulky-waste" | "civic-facility",
  isDemo: boolean,
  startMinute: number,
) {
  return {
    id,
    serviceKey,
    reservationDate: new Date("2026-09-12T00:00:00.000Z"),
    startMinute,
    isDemo,
    createdAt: new Date("2026-09-04T00:00:00.000Z"),
  };
}
