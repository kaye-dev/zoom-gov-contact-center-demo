import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { Client } from "pg";

import {
  calendarDateToUtc,
  getReservationService,
  getReservationSlotsForDate,
  getTokyoCalendarDate,
  utcDateToCalendarDate,
} from "../../lib/reservations";
import { getReservationApiPeriod } from "../../lib/server/reservation-api-usage";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";

const AUTH_SECRET = "runtime-reservation-api-test-secret-000000000";
const FULL_ADMIN = "reservation-api-full-admin";
const VIEW_ADMIN = "reservation-api-view-admin";

type Route = typeof import("../../app/api/[[...route]]/route");
type Handler = Route["GET"] | Route["POST"] | Route["PUT"] | Route["PATCH"] | Route["DELETE"];

test("reservation API keys, scopes, CRUD, quota, and revocation work end to end", { timeout: 180_000 }, async () => {
  await withIsolatedPostgresDatabase(async (databaseUrl) => {
    const restore = configureEnvironment(databaseUrl);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await createUser(client, FULL_ADMIN);
      await createUser(client, VIEW_ADMIN);
      await grantViewOnly(client, VIEW_ADMIN);
      await createSession(client, FULL_ADMIN, "full-token");
      await createSession(client, VIEW_ADMIN, "view-token");
      const route = await import("../../app/api/[[...route]]/route");
      const fullCookie = sessionCookie("full-token");
      const viewCookie = sessionCookie("view-token");

      assert.equal((await invoke(route.GET, "GET", "/api/admin/reservation-api-keys")).status, 401);
      assert.equal((await invoke(route.GET, "GET", "/api/admin/reservation-api-keys", { cookie: viewCookie })).status, 200);
      assert.equal((await invoke(route.GET, "GET", "/api/admin/reservation-api-usage-limit", { cookie: viewCookie })).status, 200);
      assert.equal((await invoke(route.PUT, "PUT", "/api/admin/reservation-api-usage-limit", { cookie: viewCookie, body: { mode: "UNLIMITED", expectedRevision: 1 } })).status, 403);
      assert.equal((await invoke(route.POST, "POST", "/api/admin/reservation-api-keys", { cookie: viewCookie, body: { name: "denied", permissions: ["LIST"] } })).status, 403);

      const issue = await invoke(route.POST, "POST", "/api/admin/reservation-api-keys", {
        cookie: fullCookie,
        body: { name: "all operations", permissions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE"] },
      });
      assert.equal(issue.status, 201, await issue.clone().text());
      const issued = await issue.json() as { apiKey: { id: string; revision: number }; rawKey: string };
      assert.match(issued.rawKey, /^zgcc_rsv_/u);

      const limitedIssue = await invoke(route.POST, "POST", "/api/admin/reservation-api-keys", {
        cookie: fullCookie,
        body: { name: "list only", permissions: ["LIST"] },
      });
      const limitedKey = ((await limitedIssue.json()) as { rawKey: string }).rawKey;
      const keysResponse = await invoke(route.GET, "GET", "/api/admin/reservation-api-keys", { cookie: fullCookie });
      const keysText = await keysResponse.text();
      assert.equal(keysText.includes(issued.rawKey), false);
      assert.equal(keysText.includes("secretHash"), false);

      const date = nextMyNumberDate(new Date());
      const payload = { serviceKey: "my-number-card", reservationDate: date, startMinute: 540 };
      assert.equal((await invoke(route.POST, "POST", "/api/public/v1/reservations", { bearer: limitedKey, body: payload })).status, 403);
      assert.equal((await invoke(route.GET, "GET", "/api/public/v1/reservations")).status, 401);
      assert.equal((await invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: "invalid" })).status, 401);

      const createdResponse = await invoke(route.POST, "POST", "/api/public/v1/reservations", { bearer: issued.rawKey, body: payload });
      assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
      const created = (await createdResponse.json()) as { reservation: { id: string; reservationDate: string; startMinute: number } };
      assert.equal(created.reservation.reservationDate, date);

      await client.query(
        `INSERT INTO reservation_bookings (id, "serviceKey", "reservationDate", "startMinute", "isDemo") VALUES ('hidden-demo', 'my-number-card', $1::date, 570, true)`,
        [date],
      );
      const listResponse = await invoke(route.GET, "GET", `/api/public/v1/reservations?serviceKey=my-number-card&dateFrom=${date}&dateTo=${date}&limit=1`, { bearer: issued.rawKey });
      assert.equal(listResponse.status, 200);
      const list = await listResponse.json() as { items: Array<{ id: string }>; nextCursor: string | null };
      assert.deepEqual(list.items.map(({ id }) => id), [created.reservation.id]);
      assert.equal(list.nextCursor, null);
      assert.equal((await invoke(route.GET, "GET", "/api/public/v1/reservations/hidden-demo", { bearer: issued.rawKey })).status, 404);

      const read = await invoke(route.GET, "GET", `/api/public/v1/reservations/${created.reservation.id}`, { bearer: issued.rawKey });
      assert.equal(read.status, 200);
      const patched = await invoke(route.PATCH, "PATCH", `/api/public/v1/reservations/${created.reservation.id}`, {
        bearer: issued.rawKey,
        body: { startMinute: 570 },
      });
      assert.equal(patched.status, 200, await patched.clone().text());
      assert.equal(((await patched.json()) as { reservation: { startMinute: number } }).reservation.startMinute, 570);
      assert.equal((await invoke(route.DELETE, "DELETE", `/api/public/v1/reservations/${created.reservation.id}`, { bearer: issued.rawKey })).status, 204);
      assert.equal((await invoke(route.DELETE, "DELETE", "/api/public/v1/reservations/hidden-demo", { bearer: issued.rawKey })).status, 404);

      const usage = await invoke(route.GET, "GET", "/api/admin/reservation-api-usage-limit", { cookie: fullCookie });
      const usageBody = await usage.json() as { usageLimit: { requestCount: string; revision: number } };
      assert.ok(Number(usageBody.usageLimit.requestCount) >= 8);
      const changed = await invoke(route.PUT, "PUT", "/api/admin/reservation-api-usage-limit", {
        cookie: fullCookie,
        body: { mode: "LIMITED", monthlyLimit: "100", expectedRevision: usageBody.usageLimit.revision },
      });
      assert.equal(changed.status, 200);
      assert.equal((await invoke(route.PUT, "PUT", "/api/admin/reservation-api-usage-limit", {
        cookie: fullCookie,
        body: { mode: "UNLIMITED", expectedRevision: usageBody.usageLimit.revision },
      })).status, 409);
      const period = getReservationApiPeriod(new Date());
      await client.query(`UPDATE reservation_api_monthly_usage SET "requestCount" = 99 WHERE "periodStart" = $1::date`, [period.periodStart]);
      const concurrentQuota = await Promise.all([
        invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: issued.rawKey }),
        invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: limitedKey }),
      ]);
      assert.deepEqual(concurrentQuota.map(({ status }) => status).sort(), [200, 429]);
      const exceeded = concurrentQuota.find(({ status }) => status === 429)!;
      assert.ok(Number(exceeded.headers.get("retry-after")) > 0);
      assert.deepEqual(await exceeded.json(), { error: "RESERVATION_API_MONTHLY_LIMIT_EXCEEDED" });
      const counter = await client.query<{ requestCount: string }>(`SELECT "requestCount"::text AS "requestCount" FROM reservation_api_monthly_usage WHERE "periodStart" = $1::date`, [period.periodStart]);
      assert.equal(counter.rows[0]?.requestCount, "100");

      const currentSetting = (await (await invoke(route.GET, "GET", "/api/admin/reservation-api-usage-limit", { cookie: fullCookie })).json()) as { usageLimit: { revision: number } };
      assert.equal((await invoke(route.PUT, "PUT", "/api/admin/reservation-api-usage-limit", { cookie: fullCookie, body: { mode: "UNLIMITED", expectedRevision: currentSetting.usageLimit.revision } })).status, 200);
      assert.equal((await invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: issued.rawKey })).status, 200);

      const legalDate = nextServiceDate("legal-consultation", new Date());
      const concurrentCapacity = await Promise.all([
        invoke(route.POST, "POST", "/api/public/v1/reservations", { bearer: issued.rawKey, body: { serviceKey: "legal-consultation", reservationDate: legalDate, startMinute: 780 } }),
        invoke(route.POST, "POST", "/api/public/v1/reservations", { bearer: issued.rawKey, body: { serviceKey: "legal-consultation", reservationDate: legalDate, startMinute: 780 } }),
      ]);
      assert.deepEqual(concurrentCapacity.map(({ status }) => status).sort(), [201, 409]);
      const capacityCount = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM reservation_bookings WHERE "serviceKey" = 'legal-consultation' AND "reservationDate" = $1::date AND "startMinute" = 780`, [legalDate]);
      assert.equal(capacityCount.rows[0]?.count, "1");

      const revoke = await invoke(route.DELETE, "DELETE", `/api/admin/reservation-api-keys/${issued.apiKey.id}`, {
        cookie: fullCookie,
        body: { expectedRevision: issued.apiKey.revision },
      });
      assert.equal(revoke.status, 204);
      const unauthorized = await invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: issued.rawKey });
      assert.equal(unauthorized.status, 401);
      assert.equal(unauthorized.headers.get("www-authenticate"), "Bearer");
    } finally {
      await client.end();
      restore();
    }
  });
});

function configureEnvironment(databaseUrl: string) {
  const names = ["NODE_ENV", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  Reflect.set(process.env, "NODE_ENV", "development");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL_UNPOOLED = databaseUrl;
  process.env.BETTER_AUTH_SECRET = AUTH_SECRET;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  return () => {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else Reflect.set(process.env, name, value);
    }
  };
}

async function invoke(handler: Handler, method: string, path: string, options: { cookie?: string; bearer?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return handler(new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }));
}

function sessionCookie(token: string) {
  const signature = createHmac("sha256", AUTH_SECRET).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function createUser(client: Client, id: string) {
  await client.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned, "mustChangePassword") VALUES ($1, $1, $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'admin', false, false)`, [id, `${id}@example.test`]);
}

async function createSession(client: Client, userId: string, token: string) {
  await client.query(`INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, CURRENT_TIMESTAMP + INTERVAL '1 hour', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)`, [`session-${userId}`, token, userId]);
}

async function grantViewOnly(client: Client, userId: string) {
  await client.query(`INSERT INTO admin_access_roles (id, name, "nameKey", description) VALUES ('reservation-api-view-only', 'Reservation API View', 'reservation api view', NULL)`);
  await client.query(`INSERT INTO admin_access_role_permissions ("roleId", "resourceKey", action, effect) VALUES ('reservation-api-view-only', 'reservations', 'VIEW', 'ALLOW')`);
  await client.query("BEGIN");
  try {
    await client.query(`DELETE FROM admin_access_role_assignments WHERE "userId" = $1`, [userId]);
    await client.query(`INSERT INTO admin_access_role_assignments ("userId", "roleId") VALUES ($1, 'reservation-api-view-only')`, [userId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function nextMyNumberDate(now: Date) {
  return nextServiceDate("my-number-card", now);
}

function nextServiceDate(serviceKey: "my-number-card" | "legal-consultation", now: Date) {
  const service = getReservationService(serviceKey);
  const start = calendarDateToUtc(getTokyoCalendarDate(now));
  for (let offset = 0; offset < 31; offset += 1) {
    const candidate = new Date(start.getTime() + offset * 86_400_000);
    const date = utcDateToCalendarDate(candidate);
    if (getReservationSlotsForDate(service, date, now).length > 0) return date;
  }
  throw new Error("No reservation date found.");
}
