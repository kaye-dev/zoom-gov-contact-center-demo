import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { Client } from "pg";

import { addCalendarMonths, getReservationMonthRange } from "../../lib/reservations";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";

const TEST_AUTH_SECRET = "runtime-reservations-test-secret-0000000000";
const FULL_ADMIN = "reservations-full-admin";
const VIEW_ADMIN = "reservations-view-admin";
const NO_ACCESS_ADMIN = "reservations-no-access-admin";

type HonoRoute = typeof import("../../app/api/[[...route]]/route");
type HonoHandler = HonoRoute["GET"] | HonoRoute["POST"];
type SerializedReservation = { id: string; createdAt: string; source: "ZVA" | "DEMO" };
type SerializedSlot = { startMinute: number; reservations: SerializedReservation[] };
type SerializedCalendar = {
  month: string;
  service: { key: string; method: string };
  days: Array<{ date: string; bookable: boolean; booked: number; slots: SerializedSlot[] }>;
};

test(
  "RES-INSPECT-04 reservation routes enforce contracts, preserve non-demo rows, and serialize generation",
  { timeout: 180_000 },
  async () => {
    await withIsolatedPostgresDatabase(async (databaseUrl) => {
      const restoreEnvironment = configureRuntimeEnvironment(databaseUrl);
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        await createUser(client, FULL_ADMIN);
        await createUser(client, VIEW_ADMIN);
        await createUser(client, NO_ACCESS_ADMIN);
        await grantViewOnlyReservations(client, VIEW_ADMIN);
        await assignNoAccess(client, NO_ACCESS_ADMIN);
        for (const userId of [FULL_ADMIN, VIEW_ADMIN, NO_ACCESS_ADMIN]) {
          await createSession(client, userId, `${userId}-token`);
        }

        const route = await import("../../app/api/[[...route]]/route");
        const fullCookie = signedSessionCookie(`${FULL_ADMIN}-token`);
        const viewCookie = signedSessionCookie(`${VIEW_ADMIN}-token`);
        const noAccessCookie = signedSessionCookie(`${NO_ACCESS_ADMIN}-token`);
        const month = addCalendarMonths(getReservationMonthRange(new Date()).minimum, 1);
        const getPath = `/api/admin/reservations?service=my-number-card&month=${month}`;

        assert.equal((await invoke(route.GET, "GET", getPath)).status, 401);
        assert.equal((await invoke(route.GET, "GET", getPath, noAccessCookie)).status, 403);
        assert.equal((await invoke(route.GET, "GET", getPath, viewCookie)).status, 200);
        assert.equal(
          (await invoke(route.POST, "POST", "/api/admin/reservations/demo-fill", viewCookie, { month })).status,
          403,
        );

        for (const path of [
          `/api/admin/reservations?service=unknown&month=${month}`,
          `/api/admin/reservations?service=my-number-card&month=${month}&extra=1`,
          `/api/admin/reservations?service=my-number-card&service=bulky-waste&month=${month}`,
        ]) {
          const response = await invoke(route.GET, "GET", path, fullCookie);
          assert.equal(response.status, 400);
          assert.deepEqual(await response.json(), { error: "RESERVATION_INVALID_REQUEST" });
        }
        for (const body of [null, {}, { month, extra: true }, { month: "1999-01" }]) {
          const response = await invoke(
            route.POST,
            "POST",
            "/api/admin/reservations/demo-fill",
            fullCookie,
            body,
          );
          assert.equal(response.status, 400);
          assert.deepEqual(await response.json(), { error: "RESERVATION_INVALID_REQUEST" });
        }
        assert.equal(await bookingCount(client), 0);

        const initialResponse = await invoke(route.GET, "GET", getPath, fullCookie);
        assert.equal(initialResponse.status, 200);
        const initial = await initialResponse.json() as { calendar: SerializedCalendar };
        assert.equal(initial.calendar.month, month);
        assert.deepEqual(initial.calendar.service, { key: "my-number-card", method: "DATETIME" });
        assert.ok(initial.calendar.days.some((day) => day.bookable && day.booked === 0));

        const firstDay = initial.calendar.days.find((day) => day.bookable)!;
        const startMinute = firstDay.slots[0]!.startMinute;
        await client.query(
          `INSERT INTO reservation_bookings
             (id, "serviceKey", "reservationDate", "startMinute", "isDemo")
           VALUES ('preserved-booking', 'my-number-card', $1::date, $2, false)`,
          [firstDay.date, startMinute],
        );

        const generatedResponse = await invoke(
          route.POST,
          "POST",
          "/api/admin/reservations/demo-fill",
          fullCookie,
          { month },
        );
        assert.equal(generatedResponse.status, 200, await generatedResponse.clone().text());
        const generated = await generatedResponse.json() as {
          month: string;
          generatedCount: number;
          calendars: Record<string, { days: Array<{ status: string; slots: Array<{ status: string; reservations: SerializedReservation[] }> }> }>;
        };
        assert.equal(generated.month, month);
        assert.ok(generated.generatedCount > 0);
        assert.deepEqual(Object.keys(generated.calendars).sort(), [
          "bulky-waste",
          "civic-facility",
          "legal-consultation",
          "my-number-card",
        ]);
        const statuses = new Set(
          Object.values(generated.calendars).flatMap((calendar) =>
            calendar.days.flatMap((day) => [day.status, ...day.slots.map((slot) => slot.status)]),
          ),
        );
        assert.ok(statuses.has("AVAILABLE"));
        assert.ok(statuses.has("LIMITED"));
        assert.ok(statuses.has("FULL"));
        assert.deepEqual(await preservedBooking(client), {
          id: "preserved-booking",
          isDemo: false,
        });
        assert.deepEqual(await demoServices(client), [
          "bulky-waste",
          "civic-facility",
          "legal-consultation",
          "my-number-card",
        ]);

        const persistedResponse = await invoke(route.GET, "GET", getPath, fullCookie);
        const persisted = await persistedResponse.json() as typeof initial;
        assert.ok(persisted.calendar.days.some((day) => day.booked > 0));
        const preservedSlot = persisted.calendar.days
          .find((day) => day.date === firstDay.date)!
          .slots.find((slot) => slot.startMinute === startMinute)!;
        const preservedReservation = preservedSlot.reservations.find(({ id }) => id === "preserved-booking")!;
        assert.deepEqual(Object.keys(preservedReservation).sort(), ["createdAt", "id", "source"]);
        assert.equal(preservedReservation.source, "ZVA");
        assert.ok(Number.isFinite(Date.parse(preservedReservation.createdAt)));
        assert.ok(
          Object.values(generated.calendars).some((calendar) =>
            calendar.days.some((day) =>
              day.slots.some((slot) => slot.reservations.some(({ source }) => source === "DEMO")),
            ),
          ),
        );

        const concurrent = await Promise.all([
          invoke(route.POST, "POST", "/api/admin/reservations/demo-fill", fullCookie, { month }),
          invoke(route.POST, "POST", "/api/admin/reservations/demo-fill", fullCookie, { month }),
        ]);
        assert.deepEqual(concurrent.map(({ status }) => status), [200, 200]);
        const counts = await Promise.all(concurrent.map(async (response) =>
          ((await response.json()) as { generatedCount: number }).generatedCount,
        ));
        const finalDemoCount = await bookingCount(client, true);
        assert.ok(counts.includes(finalDemoCount));
        assert.deepEqual(await preservedBooking(client), {
          id: "preserved-booking",
          isDemo: false,
        });
      } finally {
        await client.end();
        restoreEnvironment();
      }
    });
  },
);

function configureRuntimeEnvironment(databaseUrl: string) {
  const names = ["NODE_ENV", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  Reflect.set(process.env, "NODE_ENV", "development");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL_UNPOOLED = databaseUrl;
  process.env.BETTER_AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  return () => {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else Reflect.set(process.env, name, value);
    }
  };
}

async function invoke(
  handler: HonoHandler,
  method: "GET" | "POST",
  path: string,
  cookie?: string,
  body?: unknown,
) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (method === "POST") headers.set("content-type", "application/json");
  return handler(new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  }));
}

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", TEST_AUTH_SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function createUser(client: Client, id: string) {
  await client.query(
    `INSERT INTO "user"
       (id, name, email, "emailVerified", "createdAt", "updatedAt", role,
        banned, "mustChangePassword")
     VALUES ($1, $1, $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'admin',
             false, false)`,
    [id, `${id}@example.test`],
  );
}

async function createSession(client: Client, userId: string, token: string) {
  await client.query(
    `INSERT INTO session
       (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
     VALUES ($1, CURRENT_TIMESTAMP + INTERVAL '1 hour', $2,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)`,
    [`session-${userId}`, token, userId],
  );
}

async function grantViewOnlyReservations(client: Client, userId: string) {
  await client.query(
    `INSERT INTO admin_access_roles (id, name, "nameKey", description)
     VALUES ('reservations-view-only', 'Reservations View', 'reservations view', NULL)`,
  );
  await client.query(
    `INSERT INTO admin_access_role_permissions
       ("roleId", "resourceKey", action, effect)
     VALUES ('reservations-view-only', 'reservations', 'VIEW', 'ALLOW')`,
  );
  await replaceAssignment(client, userId, "reservations-view-only");
}

async function assignNoAccess(client: Client, userId: string) {
  await replaceAssignment(client, userId, "system-no-access");
}

async function replaceAssignment(client: Client, userId: string, roleId: string) {
  await client.query("BEGIN");
  try {
    await client.query(`DELETE FROM admin_access_role_assignments WHERE "userId" = $1`, [userId]);
    await client.query(
      `INSERT INTO admin_access_role_assignments ("userId", "roleId") VALUES ($1, $2)`,
      [userId, roleId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function bookingCount(client: Client, isDemo?: boolean) {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM reservation_bookings${isDemo === undefined ? "" : ` WHERE "isDemo" = ${isDemo ? "true" : "false"}`}`,
  );
  return Number(result.rows[0]!.count);
}

async function preservedBooking(client: Client) {
  const result = await client.query<{ id: string; isDemo: boolean }>(
    `SELECT id, "isDemo" FROM reservation_bookings WHERE id = 'preserved-booking'`,
  );
  return result.rows[0];
}

async function demoServices(client: Client) {
  const result = await client.query<{ serviceKey: string }>(
    `SELECT DISTINCT "serviceKey" FROM reservation_bookings WHERE "isDemo" = true ORDER BY "serviceKey"`,
  );
  return result.rows.map(({ serviceKey }) => serviceKey);
}
