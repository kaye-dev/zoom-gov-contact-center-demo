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
import { generateReservationApiKey } from "../../lib/server/reservation-api-keys";
import {
  decodeReservationApiRequestLogCursor,
  listReservationApiRequestLogs,
} from "../../lib/server/reservation-api-request-logs";
import { getReservationApiPeriod } from "../../lib/server/reservation-api-usage";
import { withPrisma } from "../../lib/server/prisma";
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
        body: {
          name: "all operations",
          permissions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE"],
          usageLimit: { mode: "LIMITED", monthlyLimit: "10000" },
        },
      });
      assert.equal(issue.status, 201, await issue.clone().text());
      const issued = await issue.json() as {
        apiKey: {
          id: string;
          revision: number;
          usage: { mode: string; monthlyLimit: string | null; requestCount: string };
        };
        rawKey: string;
      };
      assert.match(issued.rawKey, /^zgcc_rsv_/u);
      assert.deepEqual(issued.apiKey.usage, {
        mode: "LIMITED",
        monthlyLimit: "10000",
        periodStart: getReservationApiPeriod(new Date()).periodStart,
        requestCount: "0",
        remaining: "10000",
        resetsAt: getReservationApiPeriod(new Date()).resetsAt.toISOString(),
      });

      const limitedIssue = await invoke(route.POST, "POST", "/api/admin/reservation-api-keys", {
        cookie: fullCookie,
        body: {
          name: "list only",
          permissions: ["LIST"],
          usageLimit: { mode: "UNLIMITED" },
        },
      });
      assert.equal(limitedIssue.status, 201, await limitedIssue.clone().text());
      const limitedIssued = (await limitedIssue.json()) as {
        apiKey: { id: string; revision: number; usage: { mode: string; monthlyLimit: string | null } };
        rawKey: string;
      };
      const limitedKey = limitedIssued.rawKey;
      assert.equal(limitedIssued.apiKey.usage.mode, "UNLIMITED");
      assert.equal(limitedIssued.apiKey.usage.monthlyLimit, null);
      const keysResponse = await invoke(route.GET, "GET", "/api/admin/reservation-api-keys", { cookie: fullCookie });
      const keysText = await keysResponse.text();
      assert.equal(keysText.includes(issued.rawKey), false);
      assert.equal(keysText.includes("secretHash"), false);
      const listedKeys = JSON.parse(keysText) as { apiKeys: Array<{ id: string; usage: { requestCount: string } }> };
      assert.equal(listedKeys.apiKeys.find(({ id }) => id === issued.apiKey.id)?.usage.requestCount, "0");

      const keyLimitPath = `/api/admin/reservation-api-keys/${issued.apiKey.id}/usage-limit`;
      assert.equal((await invoke(route.PUT, "PUT", keyLimitPath, {
        body: { mode: "UNLIMITED", expectedRevision: issued.apiKey.revision },
      })).status, 401);
      assert.equal((await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: viewCookie,
        body: { mode: "UNLIMITED", expectedRevision: issued.apiKey.revision },
      })).status, 403);
      assert.equal((await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: fullCookie,
        body: { mode: "LIMITED", monthlyLimit: "99", expectedRevision: issued.apiKey.revision },
      })).status, 400);
      assert.equal((await invoke(route.PUT, "PUT", "/api/admin/reservation-api-keys/missing/usage-limit", {
        cookie: fullCookie,
        body: { mode: "UNLIMITED", expectedRevision: 1 },
      })).status, 404);
      const keyLimitUpdate = await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: fullCookie,
        body: { mode: "LIMITED", monthlyLimit: "5000", expectedRevision: issued.apiKey.revision },
      });
      assert.equal(keyLimitUpdate.status, 200, await keyLimitUpdate.clone().text());
      const updatedKey = (await keyLimitUpdate.json()) as {
        apiKey: { revision: number; usage: { monthlyLimit: string | null; requestCount: string } };
      };
      assert.equal(updatedKey.apiKey.usage.monthlyLimit, "5000");
      assert.equal(updatedKey.apiKey.usage.requestCount, "0");
      assert.equal((await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: fullCookie,
        body: { mode: "UNLIMITED", expectedRevision: issued.apiKey.revision },
      })).status, 409);
      let issuedRevision = updatedKey.apiKey.revision;

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
      assert.equal((await invoke(route.DELETE, "DELETE", `/api/public/v1/reservations/${created.reservation.id}`, {
        bearer: issued.rawKey,
        body: { unexpected: true },
      })).status, 400);
      assert.equal((await invoke(route.GET, "GET", `/api/public/v1/reservations/${created.reservation.id}`, { bearer: issued.rawKey })).status, 200);
      assert.equal((await invoke(route.DELETE, "DELETE", `/api/public/v1/reservations/${created.reservation.id}`, {
        bearer: issued.rawKey,
        rawBody: "",
      })).status, 204);
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

      const keyLimit100 = await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: fullCookie,
        body: { mode: "LIMITED", monthlyLimit: "100", expectedRevision: issuedRevision },
      });
      assert.equal(keyLimit100.status, 200, await keyLimit100.clone().text());
      issuedRevision = ((await keyLimit100.json()) as { apiKey: { revision: number } }).apiKey.revision;
      await client.query(
        `UPDATE reservation_api_key_monthly_usage SET "requestCount" = 99 WHERE "apiKeyId" = $1 AND "periodStart" = $2::date`,
        [issued.apiKey.id, period.periodStart],
      );
      const globalBeforeKeyQuota = await client.query<{ requestCount: string }>(
        `SELECT "requestCount"::text AS "requestCount" FROM reservation_api_monthly_usage WHERE "periodStart" = $1::date`,
        [period.periodStart],
      );
      const concurrentKeyQuota = await Promise.all([
        invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: issued.rawKey }),
        invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: issued.rawKey }),
      ]);
      assert.deepEqual(concurrentKeyQuota.map(({ status }) => status).sort(), [200, 429]);
      const keyExceeded = concurrentKeyQuota.find(({ status }) => status === 429)!;
      assert.deepEqual(await keyExceeded.json(), { error: "RESERVATION_API_KEY_MONTHLY_LIMIT_EXCEEDED" });
      assert.ok(Number(keyExceeded.headers.get("retry-after")) > 0);
      assert.match(keyExceeded.headers.get("cache-control") ?? "", /no-store/u);
      const [keyCounter, globalAfterKeyQuota] = await Promise.all([
        client.query<{ requestCount: string }>(
          `SELECT "requestCount"::text AS "requestCount" FROM reservation_api_key_monthly_usage WHERE "apiKeyId" = $1 AND "periodStart" = $2::date`,
          [issued.apiKey.id, period.periodStart],
        ),
        client.query<{ requestCount: string }>(
          `SELECT "requestCount"::text AS "requestCount" FROM reservation_api_monthly_usage WHERE "periodStart" = $1::date`,
          [period.periodStart],
        ),
      ]);
      assert.equal(keyCounter.rows[0]?.requestCount, "100");
      assert.equal(
        globalAfterKeyQuota.rows[0]?.requestCount,
        (BigInt(globalBeforeKeyQuota.rows[0]!.requestCount) + BigInt(1)).toString(),
      );

      const keyUnlimited = await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: fullCookie,
        body: { mode: "UNLIMITED", expectedRevision: issuedRevision },
      });
      assert.equal(keyUnlimited.status, 200);
      const unlimitedKeyBody = (await keyUnlimited.json()) as {
        apiKey: { revision: number; usage: { mode: string; requestCount: string } };
      };
      issuedRevision = unlimitedKeyBody.apiKey.revision;
      assert.equal(unlimitedKeyBody.apiKey.usage.mode, "UNLIMITED");
      assert.equal(unlimitedKeyBody.apiKey.usage.requestCount, "100");
      assert.equal((await invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: issued.rawKey })).status, 200);

      const keyLimitedAgain = await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: fullCookie,
        body: { mode: "LIMITED", monthlyLimit: "100", expectedRevision: issuedRevision },
      });
      issuedRevision = ((await keyLimitedAgain.json()) as { apiKey: { revision: number } }).apiKey.revision;
      const globalForPrecedence = (await (await invoke(route.GET, "GET", "/api/admin/reservation-api-usage-limit", { cookie: fullCookie })).json()) as { usageLimit: { revision: number } };
      assert.equal((await invoke(route.PUT, "PUT", "/api/admin/reservation-api-usage-limit", {
        cookie: fullCookie,
        body: { mode: "LIMITED", monthlyLimit: "100", expectedRevision: globalForPrecedence.usageLimit.revision },
      })).status, 200);
      const bothExceeded = await invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: issued.rawKey });
      assert.equal(bothExceeded.status, 429);
      assert.deepEqual(await bothExceeded.json(), { error: "RESERVATION_API_MONTHLY_LIMIT_EXCEEDED" });

      const globalRestore = (await (await invoke(route.GET, "GET", "/api/admin/reservation-api-usage-limit", { cookie: fullCookie })).json()) as { usageLimit: { revision: number } };
      assert.equal((await invoke(route.PUT, "PUT", "/api/admin/reservation-api-usage-limit", {
        cookie: fullCookie,
        body: { mode: "UNLIMITED", expectedRevision: globalRestore.usageLimit.revision },
      })).status, 200);
      const keyRestore = await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: fullCookie,
        body: { mode: "UNLIMITED", expectedRevision: issuedRevision },
      });
      issuedRevision = ((await keyRestore.json()) as { apiKey: { revision: number } }).apiKey.revision;

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
        body: { expectedRevision: issuedRevision },
      });
      assert.equal(revoke.status, 204);
      assert.equal((await invoke(route.PUT, "PUT", keyLimitPath, {
        cookie: fullCookie,
        body: { mode: "UNLIMITED", expectedRevision: issuedRevision + 1 },
      })).status, 409);
      const unauthorized = await invoke(route.GET, "GET", "/api/public/v1/reservations", { bearer: issued.rawKey });
      assert.equal(unauthorized.status, 401);
      assert.equal(unauthorized.headers.get("www-authenticate"), "Bearer");
    } finally {
      await client.end();
      restore();
    }
  });
});

test("authenticated reservation API outcomes create bounded request logs without changing responses", { timeout: 180_000 }, async () => {
  await withIsolatedPostgresDatabase(async (databaseUrl) => {
    const restore = configureEnvironment(databaseUrl);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await createUser(client, FULL_ADMIN);
      await createSession(client, FULL_ADMIN, "request-log-full-token");
      const route = await import("../../app/api/[[...route]]/route");
      const fullCookie = sessionCookie("request-log-full-token");
      const fullKey = await issueKey(route, fullCookie, {
        name: "Request log full access",
        permissions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE"],
      });
      const listOnlyKey = await issueKey(route, fullCookie, {
        name: "Request log list only",
        permissions: ["LIST"],
      });
      const quotaKey = await issueKey(route, fullCookie, {
        name: "Request log quota key",
        permissions: ["LIST"],
      });

      const date = nextMyNumberDate(new Date());
      const createPayload = {
        serviceKey: "my-number-card",
        reservationDate: date,
        startMinute: 540,
      };
      const createdCall = await invokeExpectingOneLog(
        client,
        route.POST,
        "POST",
        "/api/public/v1/reservations",
        { bearer: fullKey.rawKey, body: createPayload },
      );
      assert.equal(createdCall.response.status, 201);
      const createdBody = await createdCall.response.json() as {
        reservation: { id: string; reservationDate: string; startMinute: number };
      };
      assert.equal(createdCall.log.apiKeyId, fullKey.apiKey.id);
      assert.equal(createdCall.log.apiKeyName, fullKey.apiKey.name);
      assert.equal(createdCall.log.apiKeyPreview, fullKey.apiKey.keyPreview);
      assert.equal(createdCall.log.permission, "CREATE");
      assert.equal(createdCall.log.method, "POST");
      assert.equal(createdCall.log.path, "/api/public/v1/reservations");
      assert.deepEqual(createdCall.log.pathParameters, {});
      assert.deepEqual(createdCall.log.query, {});
      assert.deepEqual(createdCall.log.requestBody, createPayload);
      assert.deepEqual(createdCall.log.responseBody, createdBody);
      assert.equal(createdCall.log.statusCode, 201);
      assert.equal(createdCall.log.errorCode, null);
      assert.ok(createdCall.log.durationMs >= 0);
      assert.ok(createdCall.log.completedAt.getTime() >= createdCall.log.requestedAt.getTime());

      const listCall = await invokeExpectingOneLog(
        client,
        route.GET,
        "GET",
        `/api/public/v1/reservations?serviceKey=my-number-card&dateFrom=${date}&dateTo=${date}&limit=1`,
        { bearer: fullKey.rawKey },
      );
      assert.equal(listCall.response.status, 200);
      assert.equal(listCall.log.permission, "LIST");
      assert.deepEqual(listCall.log.pathParameters, {});
      assert.deepEqual(listCall.log.query, {
        serviceKey: "my-number-card",
        dateFrom: date,
        dateTo: date,
        limit: 1,
      });
      assert.deepEqual(listCall.log.responseBody, await listCall.response.json());

      const readCall = await invokeExpectingOneLog(
        client,
        route.GET,
        "GET",
        `/api/public/v1/reservations/${createdBody.reservation.id}`,
        { bearer: fullKey.rawKey },
      );
      assert.equal(readCall.response.status, 200);
      assert.equal(readCall.log.permission, "READ");
      assert.deepEqual(readCall.log.pathParameters, { id: createdBody.reservation.id });

      const patchCall = await invokeExpectingOneLog(
        client,
        route.PATCH,
        "PATCH",
        `/api/public/v1/reservations/${createdBody.reservation.id}`,
        { bearer: fullKey.rawKey, body: { startMinute: 570 } },
      );
      assert.equal(patchCall.response.status, 200);
      assert.equal(patchCall.log.permission, "UPDATE");
      assert.deepEqual(patchCall.log.requestBody, { startMinute: 570 });

      const deleteCall = await invokeExpectingOneLog(
        client,
        route.DELETE,
        "DELETE",
        `/api/public/v1/reservations/${createdBody.reservation.id}`,
        { bearer: fullKey.rawKey },
      );
      assert.equal(deleteCall.response.status, 204);
      assert.equal(await deleteCall.response.text(), "");
      assert.equal(deleteCall.log.permission, "DELETE");
      assert.equal(deleteCall.log.responseBody, null);

      const forbiddenCall = await invokeExpectingOneLog(
        client,
        route.POST,
        "POST",
        "/api/public/v1/reservations",
        { bearer: listOnlyKey.rawKey, body: createPayload },
      );
      assert.equal(forbiddenCall.response.status, 403);
      assert.equal(forbiddenCall.log.apiKeyId, listOnlyKey.apiKey.id);
      assert.equal(forbiddenCall.log.apiKeyName, listOnlyKey.apiKey.name);
      assert.equal(forbiddenCall.log.permission, "CREATE");
      assert.equal(forbiddenCall.log.errorCode, "RESERVATION_API_FORBIDDEN");
      assert.equal(forbiddenCall.log.requestBody, null);
      assert.deepEqual(forbiddenCall.log.responseBody, {
        error: "RESERVATION_API_FORBIDDEN",
      });

      const credentialSentinel = "unparsed-credential-sentinel-must-not-be-stored";
      const invalidCall = await invokeExpectingOneLog(
        client,
        route.POST,
        "POST",
        "/api/public/v1/reservations",
        {
          bearer: fullKey.rawKey,
          body: { ...createPayload, unknown: credentialSentinel },
        },
      );
      assert.equal(invalidCall.response.status, 400);
      assert.equal(invalidCall.log.requestBody, null);
      assert.equal(invalidCall.log.errorCode, "RESERVATION_API_INVALID_REQUEST");

      const missingCall = await invokeExpectingOneLog(
        client,
        route.GET,
        "GET",
        "/api/public/v1/reservations/missing-request-log-booking",
        { bearer: fullKey.rawKey },
      );
      assert.equal(missingCall.response.status, 404);
      assert.equal(missingCall.log.errorCode, "RESERVATION_API_NOT_FOUND");
      assert.deepEqual(missingCall.log.pathParameters, {
        id: "missing-request-log-booking",
      });

      const legalDate = nextServiceDate("legal-consultation", new Date());
      const capacityPayload = {
        serviceKey: "legal-consultation",
        reservationDate: legalDate,
        startMinute: 780,
      };
      assert.equal((await invokeExpectingOneLog(
        client,
        route.POST,
        "POST",
        "/api/public/v1/reservations",
        { bearer: fullKey.rawKey, body: capacityPayload },
      )).response.status, 201);
      const conflictCall = await invokeExpectingOneLog(
        client,
        route.POST,
        "POST",
        "/api/public/v1/reservations",
        { bearer: fullKey.rawKey, body: capacityPayload },
      );
      assert.equal(conflictCall.response.status, 409);
      assert.equal(conflictCall.log.errorCode, "RESERVATION_SLOT_FULL");
      assert.deepEqual(conflictCall.log.responseBody, {
        error: "RESERVATION_SLOT_FULL",
      });

      await client.query(
        `INSERT INTO reservation_bookings (id, "serviceKey", "reservationDate", "startMinute", "isDemo")
         VALUES ('request-log-server-error', 'my-number-card', $1::date, 540, false)`,
        [date],
      );
      await installFailingReservationUpdateTrigger(client);
      let serverErrorCall: Awaited<ReturnType<typeof invokeExpectingOneLog>>;
      try {
        serverErrorCall = await invokeExpectingOneLog(
          client,
          route.PATCH,
          "PATCH",
          "/api/public/v1/reservations/request-log-server-error",
          { bearer: fullKey.rawKey, body: { startMinute: 570 } },
        );
      } finally {
        await removeFailingReservationUpdateTrigger(client);
      }
      assert.equal(serverErrorCall.response.status, 500);
      assert.equal(serverErrorCall.log.errorCode, "RESERVATION_API_OPERATION_FAILED");
      assert.deepEqual(serverErrorCall.log.responseBody, {
        error: "RESERVATION_API_OPERATION_FAILED",
      });

      const period = getReservationApiPeriod(new Date());
      await client.query(
        `UPDATE reservation_api_keys SET "monthlyLimit" = 100 WHERE id = $1`,
        [quotaKey.apiKey.id],
      );
      await client.query(
        `INSERT INTO reservation_api_key_monthly_usage ("apiKeyId", "periodStart", "requestCount", "updatedAt")
         VALUES ($1, $2::date, 100, CURRENT_TIMESTAMP)
         ON CONFLICT ("apiKeyId", "periodStart")
         DO UPDATE SET "requestCount" = EXCLUDED."requestCount"`,
        [quotaKey.apiKey.id, period.periodStart],
      );
      const limitedCall = await invokeExpectingOneLog(
        client,
        route.GET,
        "GET",
        "/api/public/v1/reservations",
        { bearer: quotaKey.rawKey },
      );
      assert.equal(limitedCall.response.status, 429);
      assert.equal(limitedCall.log.apiKeyId, quotaKey.apiKey.id);
      assert.equal(limitedCall.log.errorCode, "RESERVATION_API_KEY_MONTHLY_LIMIT_EXCEEDED");

      await client.query(`DELETE FROM reservation_api_usage_settings WHERE id = 1`);
      let quotaFailureCall: Awaited<ReturnType<typeof invokeExpectingOneLog>>;
      try {
        quotaFailureCall = await invokeExpectingOneLog(
          client,
          route.GET,
          "GET",
          "/api/public/v1/reservations",
          { bearer: fullKey.rawKey },
        );
      } finally {
        await client.query(
          `INSERT INTO reservation_api_usage_settings
             (id, "monthlyLimit", revision, "updatedAt", "updatedByUserId")
           VALUES (1, NULL, 1, CURRENT_TIMESTAMP, NULL)
           ON CONFLICT (id) DO NOTHING`,
        );
      }
      assert.equal(quotaFailureCall.response.status, 500);
      assert.equal(quotaFailureCall.log.apiKeyId, fullKey.apiKey.id);
      assert.equal(quotaFailureCall.log.errorCode, "RESERVATION_API_OPERATION_FAILED");
      assert.deepEqual(quotaFailureCall.log.responseBody, {
        error: "RESERVATION_API_OPERATION_FAILED",
      });

      await invokeExpectingNoLog(client, route.GET, "GET", "/api/public/v1/reservations");
      await invokeExpectingNoLog(
        client,
        route.GET,
        "GET",
        "/api/public/v1/reservations",
        { authorization: "Basic malformed-credential" },
      );
      await invokeExpectingNoLog(
        client,
        route.GET,
        "GET",
        "/api/public/v1/reservations",
        { bearer: generateReservationApiKey().rawKey },
      );
      const revoke = await invoke(
        route.DELETE,
        "DELETE",
        `/api/admin/reservation-api-keys/${listOnlyKey.apiKey.id}`,
        {
          cookie: fullCookie,
          body: { expectedRevision: listOnlyKey.apiKey.revision },
        },
      );
      assert.equal(revoke.status, 204);
      const revokedResponse = await invokeExpectingNoLog(
        client,
        route.GET,
        "GET",
        "/api/public/v1/reservations",
        { bearer: listOnlyKey.rawKey },
      );
      assert.equal(revokedResponse.status, 401);
      assert.equal(revokedResponse.headers.get("www-authenticate"), "Bearer");

      const secret = await client.query<{ secretHash: string }>(
        `SELECT "secretHash" FROM reservation_api_keys WHERE id = $1`,
        [fullKey.apiKey.id],
      );
      const serializedLogs = JSON.stringify(await readRequestLogs(client));
      for (const forbidden of [
        fullKey.rawKey,
        listOnlyKey.rawKey,
        quotaKey.rawKey,
        secret.rows[0]!.secretHash,
        credentialSentinel,
        "Authorization",
        "Cookie",
        "secretHash",
        "stack",
      ]) assert.equal(serializedLogs.includes(forbidden), false, forbidden);

      const retentionNow = new Date();
      await insertSyntheticRequestLog(client, {
        id: "request-log-expired",
        apiKeyId: fullKey.apiKey.id,
        apiKeyName: fullKey.apiKey.name,
        apiKeyPreview: fullKey.apiKey.keyPreview,
        requestedAt: new Date(retentionNow.getTime() - 31 * 24 * 60 * 60 * 1_000),
      });
      await insertSyntheticRequestLog(client, {
        id: "request-log-retained",
        apiKeyId: fullKey.apiKey.id,
        apiKeyName: fullKey.apiKey.name,
        apiKeyPreview: fullKey.apiKey.keyPreview,
        requestedAt: new Date(retentionNow.getTime() - 29 * 24 * 60 * 60 * 1_000),
      });
      await invokeExpectingOneLog(
        client,
        route.GET,
        "GET",
        "/api/public/v1/reservations",
        { bearer: fullKey.rawKey },
      );
      const retained = await client.query<{ id: string }>(
        `SELECT id FROM reservation_api_request_logs
         WHERE id IN ('request-log-expired', 'request-log-retained') ORDER BY id`,
      );
      assert.deepEqual(retained.rows.map(({ id }) => id), ["request-log-retained"]);

      const paginationNow = new Date();
      await insertPaginationLogs(client, fullKey, paginationNow);
      const directory = await withPrisma(async (prisma) => {
        const first = await listReservationApiRequestLogs(
          prisma,
          { query: "Pagination Fixture" },
          paginationNow,
        );
        assert.ok(first.nextCursor);
        const second = await listReservationApiRequestLogs(
          prisma,
          {
            query: "Pagination Fixture",
            cursor: first.nextCursor
              ? decodeReservationApiRequestLogCursor(first.nextCursor) ?? undefined
              : undefined,
          },
          paginationNow,
        );
        const filtered = await listReservationApiRequestLogs(
          prisma,
          { query: "PKEY••••LOGS", method: "POST", result: "client-error" },
          paginationNow,
        );
        const byId = await listReservationApiRequestLogs(
          prisma,
          { query: "pagination-log-051" },
          paginationNow,
        );
        const byPreview = await listReservationApiRequestLogs(
          prisma,
          { query: "PKEY••••LOGS" },
          paginationNow,
        );
        return { first, second, filtered, byId, byPreview };
      });
      assert.equal(directory.first.logs.length, 50);
      assert.equal(directory.second.logs.length, 2);
      assert.equal(directory.second.nextCursor, null);
      assert.equal(
        new Set([...directory.first.logs, ...directory.second.logs].map(({ id }) => id)).size,
        52,
      );
      assert.ok(directory.filtered.logs.length > 0);
      assert.ok(directory.filtered.logs.every(({ method, statusCode }) =>
        method === "POST" && statusCode >= 400 && statusCode <= 499));
      assert.deepEqual(directory.byId.logs.map(({ id }) => id), ["pagination-log-051"]);
      assert.equal(directory.byPreview.logs.length, 50);

      await client.query(`DELETE FROM reservation_api_keys WHERE id = $1`, [listOnlyKey.apiKey.id]);
      const snapshot = await client.query<{
        apiKeyId: string | null;
        apiKeyName: string;
        apiKeyPreview: string;
      }>(
        `SELECT "apiKeyId", "apiKeyName", "apiKeyPreview"
         FROM reservation_api_request_logs WHERE id = $1`,
        [forbiddenCall.log.id],
      );
      assert.deepEqual(snapshot.rows[0], {
        apiKeyId: null,
        apiKeyName: listOnlyKey.apiKey.name,
        apiKeyPreview: listOnlyKey.apiKey.keyPreview,
      });

      const baseline = await invokeExpectingOneLog(
        client,
        route.GET,
        "GET",
        "/api/public/v1/reservations",
        { bearer: fullKey.rawKey },
      );
      const baselineBody = await baseline.response.text();
      await installFailingRequestLogTrigger(client);
      const originalConsoleError = console.error;
      const serverErrors: string[] = [];
      console.error = (...values: unknown[]) => {
        serverErrors.push(values.map(String).join(" "));
      };
      let failedLogResponse: Response;
      try {
        failedLogResponse = await invokeExpectingNoLog(
          client,
          route.GET,
          "GET",
          "/api/public/v1/reservations",
          { bearer: fullKey.rawKey },
        );
      } finally {
        console.error = originalConsoleError;
        await removeFailingRequestLogTrigger(client);
      }
      assert.equal(failedLogResponse.status, baseline.response.status);
      assert.equal(
        failedLogResponse.headers.get("cache-control"),
        baseline.response.headers.get("cache-control"),
      );
      assert.equal(await failedLogResponse.text(), baselineBody);
      assert.deepEqual(serverErrors, [
        "Failed to record a reservation API request log.",
      ]);
    } finally {
      await client.end();
      restore();
    }
  });
});

type IssuedKey = {
  apiKey: {
    id: string;
    name: string;
    keyPreview: string;
    revision: number;
  };
  rawKey: string;
};

type RequestLogRow = {
  id: string;
  apiKeyId: string | null;
  apiKeyName: string;
  apiKeyPreview: string;
  permission: string;
  method: string;
  path: string;
  pathParameters: unknown | null;
  query: unknown | null;
  requestBody: unknown | null;
  responseBody: unknown | null;
  statusCode: number;
  errorCode: string | null;
  durationMs: number;
  requestedAt: Date;
  completedAt: Date;
};

async function issueKey(
  route: Route,
  cookie: string,
  input: { name: string; permissions: string[] },
): Promise<IssuedKey> {
  const response = await invoke(
    route.POST,
    "POST",
    "/api/admin/reservation-api-keys",
    {
      cookie,
      body: {
        ...input,
        usageLimit: { mode: "UNLIMITED" },
      },
    },
  );
  assert.equal(response.status, 201, await response.clone().text());
  return await response.json() as IssuedKey;
}

async function readRequestLogs(client: Client): Promise<RequestLogRow[]> {
  const result = await client.query<RequestLogRow>(`
    SELECT id, "apiKeyId", "apiKeyName", "apiKeyPreview", permission, method,
           path, "pathParameters", query, "requestBody", "responseBody",
           "statusCode", "errorCode", "durationMs", "requestedAt", "completedAt"
    FROM reservation_api_request_logs
    ORDER BY "requestedAt" DESC, id DESC
  `);
  return result.rows;
}

async function invokeExpectingOneLog(
  client: Client,
  handler: Handler,
  method: string,
  path: string,
  options: InvokeOptions = {},
) {
  const before = new Set((await readRequestLogs(client)).map(({ id }) => id));
  const response = await invoke(handler, method, path, options);
  const created = (await readRequestLogs(client)).filter(({ id }) => !before.has(id));
  assert.equal(
    created.length,
    1,
    `${method} ${path} must create exactly one request log`,
  );
  return { response, log: created[0]! };
}

async function invokeExpectingNoLog(
  client: Client,
  handler: Handler,
  method: string,
  path: string,
  options: InvokeOptions = {},
) {
  const before = (await readRequestLogs(client)).map(({ id }) => id).sort();
  const response = await invoke(handler, method, path, options);
  const after = (await readRequestLogs(client)).map(({ id }) => id).sort();
  assert.deepEqual(after, before, `${method} ${path} must not create a request log`);
  return response;
}

async function insertSyntheticRequestLog(
  client: Client,
  input: {
    id: string;
    apiKeyId: string;
    apiKeyName: string;
    apiKeyPreview: string;
    requestedAt: Date;
  },
) {
  await client.query(
    `INSERT INTO reservation_api_request_logs (
       id, "apiKeyId", "apiKeyName", "apiKeyPreview", permission, method, path,
       "pathParameters", query, "requestBody", "responseBody", "statusCode",
       "errorCode", "durationMs", "requestedAt", "completedAt"
     ) VALUES (
       $1, $2, $3, $4, 'LIST', 'GET', '/api/public/v1/reservations',
       '{}'::jsonb, '{}'::jsonb, NULL, '{"items":[],"nextCursor":null}'::jsonb,
       200, NULL, 1, $5, $6
     )`,
    [
      input.id,
      input.apiKeyId,
      input.apiKeyName,
      input.apiKeyPreview,
      input.requestedAt,
      new Date(input.requestedAt.getTime() + 1),
    ],
  );
}

async function insertPaginationLogs(
  client: Client,
  key: IssuedKey,
  now: Date,
) {
  await client.query(
    `INSERT INTO reservation_api_request_logs (
       id, "apiKeyId", "apiKeyName", "apiKeyPreview", permission, method, path,
       "pathParameters", query, "requestBody", "responseBody", "statusCode",
       "errorCode", "durationMs", "requestedAt", "completedAt"
     )
     SELECT
       'pagination-log-' || lpad(series::text, 3, '0'),
       $1,
       'Pagination Fixture',
       'zgcc_rsv_PKEY••••LOGS',
       'CREATE'::"ReservationApiPermission",
       CASE WHEN MOD(series, 2) = 0 THEN 'GET' ELSE 'POST' END,
       '/api/public/v1/reservations',
       '{}'::jsonb,
       '{}'::jsonb,
       NULL,
       CASE
         WHEN MOD(series, 3) = 0 THEN '{"error":"RESERVATION_API_FORBIDDEN"}'::jsonb
         ELSE '{"reservation":{"id":"pagination"}}'::jsonb
       END,
       CASE WHEN MOD(series, 3) = 0 THEN 403 ELSE 201 END,
       CASE WHEN MOD(series, 3) = 0 THEN 'RESERVATION_API_FORBIDDEN' ELSE NULL END,
       10,
       $2::timestamptz - series * INTERVAL '1 second',
       $2::timestamptz - series * INTERVAL '1 second' + INTERVAL '10 milliseconds'
     FROM generate_series(0, 51) AS series`,
    [key.apiKey.id, now],
  );
}

async function installFailingRequestLogTrigger(client: Client) {
  await client.query(`
    CREATE FUNCTION fail_reservation_api_request_log_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $request_log_failure$
    BEGIN
      RAISE EXCEPTION 'synthetic request log persistence failure';
    END;
    $request_log_failure$;

    CREATE TRIGGER fail_reservation_api_request_log_insert
    BEFORE INSERT ON reservation_api_request_logs
    FOR EACH ROW EXECUTE FUNCTION fail_reservation_api_request_log_insert();
  `);
}

async function installFailingReservationUpdateTrigger(client: Client) {
  await client.query(`
    CREATE FUNCTION fail_request_log_reservation_update()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $reservation_failure$
    BEGIN
      IF OLD.id = 'request-log-server-error' THEN
        RAISE EXCEPTION 'synthetic reservation update failure';
      END IF;
      RETURN NEW;
    END;
    $reservation_failure$;

    CREATE TRIGGER fail_request_log_reservation_update
    BEFORE UPDATE ON reservation_bookings
    FOR EACH ROW EXECUTE FUNCTION fail_request_log_reservation_update();
  `);
}

async function removeFailingReservationUpdateTrigger(client: Client) {
  await client.query(`
    DROP TRIGGER IF EXISTS fail_request_log_reservation_update
      ON reservation_bookings;
    DROP FUNCTION IF EXISTS fail_request_log_reservation_update();
  `);
}

async function removeFailingRequestLogTrigger(client: Client) {
  await client.query(`
    DROP TRIGGER IF EXISTS fail_reservation_api_request_log_insert
      ON reservation_api_request_logs;
    DROP FUNCTION IF EXISTS fail_reservation_api_request_log_insert();
  `);
}

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

type InvokeOptions = {
  cookie?: string;
  bearer?: string;
  authorization?: string;
  body?: unknown;
  rawBody?: string;
};

async function invoke(
  handler: Handler,
  method: string,
  path: string,
  options: InvokeOptions = {},
) {
  assert.equal(
    options.body === undefined || options.rawBody === undefined,
    true,
    "body and rawBody cannot be used together",
  );
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.authorization) headers.set("authorization", options.authorization);
  else if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return handler(new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body: options.rawBody ?? (
      options.body === undefined ? undefined : JSON.stringify(options.body)
    ),
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
