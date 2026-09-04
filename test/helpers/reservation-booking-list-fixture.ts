import { createDatabaseContext } from "../../lib/server/prisma";

export const RESERVATION_BOOKING_LIST_FIXTURE_IDS = [
  "cmf7n8c2x0001reservation",
  "cmf7mzkf10002reservation",
  "demo-9d72-4cab-9bc1",
  "demo-4e39-44c5-a092",
] as const;

const APPROVED_DATABASE_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "db",
  "host.docker.internal",
]);

export function validateReservationBookingListFixtureEnvironment(
  environment: NodeJS.ProcessEnv,
) {
  if (environment.NODE_ENV !== "development") {
    throw new Error("Reservation list fixture requires NODE_ENV=development.");
  }
  if (environment.CONFIRM_RESERVATION_LIST_FIXTURE !== "1") {
    throw new Error(
      "Reservation list fixture requires CONFIRM_RESERVATION_LIST_FIXTURE=1.",
    );
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(environment.DATABASE_URL ?? "");
  } catch {
    throw new Error("Reservation list fixture requires a local PostgreSQL URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !APPROVED_DATABASE_HOSTS.has(databaseUrl.hostname)
  ) {
    throw new Error("Reservation list fixture is restricted to a local development database.");
  }
}

export async function applyReservationBookingListFixture() {
  validateReservationBookingListFixtureEnvironment(process.env);
  const database = createDatabaseContext();
  try {
    const rows = fixtureRows();
    await database.prisma.$transaction(
      rows.map((row) => database.prisma.reservationBooking.upsert({
        where: { id: row.id },
        update: row,
        create: row,
      })),
    );
    const count = await database.prisma.reservationBooking.count({
      where: { id: { in: [...RESERVATION_BOOKING_LIST_FIXTURE_IDS] } },
    });
    if (count !== rows.length) {
      throw new Error("Reservation list fixture readback failed.");
    }
    return count;
  } finally {
    await database.close();
  }
}

export async function cleanupReservationBookingListFixture() {
  validateReservationBookingListFixtureEnvironment(process.env);
  const database = createDatabaseContext();
  try {
    await database.prisma.reservationBooking.deleteMany({
      where: { id: { in: [...RESERVATION_BOOKING_LIST_FIXTURE_IDS] } },
    });
    const count = await database.prisma.reservationBooking.count({
      where: { id: { in: [...RESERVATION_BOOKING_LIST_FIXTURE_IDS] } },
    });
    if (count !== 0) {
      throw new Error("Reservation list fixture cleanup readback failed.");
    }
    return count;
  } finally {
    await database.close();
  }
}

function fixtureRows() {
  return [
    {
      id: RESERVATION_BOOKING_LIST_FIXTURE_IDS[0],
      serviceKey: "civic-facility",
      reservationDate: new Date("2026-09-18T00:00:00.000Z"),
      startMinute: 780,
      isDemo: false,
      createdAt: new Date("2026-09-04T01:42:00.000Z"),
    },
    {
      id: RESERVATION_BOOKING_LIST_FIXTURE_IDS[1],
      serviceKey: "my-number-card",
      reservationDate: new Date("2026-09-14T00:00:00.000Z"),
      startMinute: 570,
      isDemo: false,
      createdAt: new Date("2026-09-04T01:28:00.000Z"),
    },
    {
      id: RESERVATION_BOOKING_LIST_FIXTURE_IDS[2],
      serviceKey: "legal-consultation",
      reservationDate: new Date("2026-09-16T00:00:00.000Z"),
      startMinute: 780,
      isDemo: true,
      createdAt: new Date("2026-09-04T01:35:00.000Z"),
    },
    {
      id: RESERVATION_BOOKING_LIST_FIXTURE_IDS[3],
      serviceKey: "bulky-waste",
      reservationDate: new Date("2026-09-12T00:00:00.000Z"),
      startMinute: 0,
      isDemo: true,
      createdAt: new Date("2026-09-04T01:20:00.000Z"),
    },
  ];
}

async function main() {
  const operation = process.argv[2];
  if (operation === "apply") {
    const count = await applyReservationBookingListFixture();
    console.log(JSON.stringify({ operation, fixtureCount: count }));
    return;
  }
  if (operation === "cleanup") {
    const count = await cleanupReservationBookingListFixture();
    console.log(JSON.stringify({ operation, fixtureCount: count }));
    return;
  }
  throw new Error("Usage: reservation-booking-list-fixture.ts <apply|cleanup>");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
