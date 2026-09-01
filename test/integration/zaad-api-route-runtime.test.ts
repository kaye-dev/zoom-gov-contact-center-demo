import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { Client } from "pg";

import { ZAAD_ERROR_CODES } from "../../lib/zaad/contracts";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";

const TEST_AUTH_SECRET = "runtime-zaad-api-test-secret-000000000000000";
const FULL_ADMIN = "zaad-runtime-full-admin";
const VIEW_ADMIN = "zaad-runtime-view-admin";
const NO_ACCESS_ADMIN = "zaad-runtime-no-access-admin";

type Route = typeof import("../../app/api/[[...route]]/route");
type Handler = Route["GET"] | Route["POST"] | Route["PUT"] | Route["PATCH"];

test(
  "ZAAD public and admin API routes preserve registration, RBAC, CSV, CAS, and audit boundaries",
  { timeout: 180_000 },
  async (t) => {
    await withIsolatedPostgresDatabase(async (databaseUrl) => {
      const restoreEnvironment = configureEnvironment(databaseUrl);
      const client = new Client({ connectionString: databaseUrl });
      const originalFetch = globalThis.fetch;
      const externalFetches: string[] = [];
      globalThis.fetch = (async (input) => {
        externalFetches.push(String(input));
        throw new Error("ZAAD integration tests must not perform external fetches.");
      }) as typeof fetch;
      await client.connect();

      try {
        await createUser(client, FULL_ADMIN);
        await createUser(client, VIEW_ADMIN);
        await createUser(client, NO_ACCESS_ADMIN);
        await grantZaadViewOnly(client, VIEW_ADMIN);
        await assignNoAccess(client, NO_ACCESS_ADMIN);
        for (const userId of [FULL_ADMIN, VIEW_ADMIN, NO_ACCESS_ADMIN]) {
          await createSession(client, userId, `${userId}-token`);
        }

        const route = await import("../../app/api/[[...route]]/route");
        const fullCookie = signedSessionCookie(`${FULL_ADMIN}-token`);
        const viewCookie = signedSessionCookie(`${VIEW_ADMIN}-token`);
        const noAccessCookie = signedSessionCookie(`${NO_ACCESS_ADMIN}-token`);

        await t.test("anonymous public registration accepts only the exact payload and hides duplicates", async () => {
          const exactPayload = {
            name: "山田 花子",
            email: "HANAKO.YAMADA@example.jp",
            phone: "090-1234-5678",
            consent: true,
          };
          const unknownField = await invoke(route.POST, "POST", "/api/disaster-radio-subscriptions", {
            body: { ...exactPayload, source: "forged" },
          });
          assert.equal(unknownField.status, 400, await unknownField.clone().text());
          assert.equal((await unknownField.json() as { error: string }).error, ZAAD_ERROR_CODES.invalidRequest);
          assert.equal(await residentCount(client), 0);

          const created = await invoke(route.POST, "POST", "/api/disaster-radio-subscriptions", {
            body: exactPayload,
          });
          assert.equal(created.status, 200, await created.clone().text());
          assert.deepEqual(await created.json(), { status: "accepted" });

          const duplicate = await invoke(route.POST, "POST", "/api/disaster-radio-subscriptions", {
            body: {
              ...exactPayload,
              name: "再送信された氏名",
              email: "hanako.yamada@example.jp",
              phone: "+819012345678",
            },
          });
          assert.equal(duplicate.status, 200, await duplicate.clone().text());
          assert.deepEqual(await duplicate.json(), { status: "accepted" });
          assert.equal(await residentCount(client), 1);

          const resident = await client.query<{
            name: string;
            normalizedEmail: string;
            normalizedPhone: string;
            consentStatus: string;
            consentVersion: string;
            source: string;
            syncStatus: string;
          }>(
            `SELECT name, "normalizedEmail", "normalizedPhone", "consentStatus",
                    "consentVersion", source, "syncStatus"
             FROM disaster_radio_subscriptions`,
          );
          assert.deepEqual(resident.rows, [{
            name: "山田 花子",
            normalizedEmail: "hanako.yamada@example.jp",
            normalizedPhone: "+819012345678",
            consentStatus: "CONSENTED",
            consentVersion: "disaster-radio-v1",
            source: "PUBLIC_FORM",
            syncStatus: "NOT_ASSIGNED",
          }]);
        });

        let adminResidentId = "";
        await t.test("admin resident routes enforce authentication, permissions, and revision CAS", async () => {
          const path = "/api/admin/zaad/residents";
          const anonymous = await invoke(route.GET, "GET", path);
          assert.equal(anonymous.status, 401);
          assert.deepEqual(await anonymous.json(), { error: "AUTHENTICATION_REQUIRED" });

          const denied = await invoke(route.GET, "GET", path, { cookie: noAccessCookie });
          assert.equal(denied.status, 403);
          assert.deepEqual(await denied.json(), { error: "ADMIN_ACCESS_DENIED" });

          const view = await invoke(route.GET, "GET", path, { cookie: viewCookie });
          assert.equal(view.status, 200, await view.clone().text());
          assert.equal((await view.json() as { metrics: { total: number } }).metrics.total, 1);

          const createPayload = {
            name: "佐藤 健",
            email: "ken.sato@example.jp",
            phone: "080-2345-6789",
            consentStatus: "CONSENTED",
          };
          assert.equal(
            (await invoke(route.POST, "POST", path, { cookie: viewCookie, body: createPayload })).status,
            403,
          );
          const created = await invoke(route.POST, "POST", path, {
            cookie: fullCookie,
            body: createPayload,
          });
          assert.equal(created.status, 201, await created.clone().text());
          const createdBody = await created.json() as {
            resident: { id: string; revision: number; source: string; syncStatus: string };
          };
          adminResidentId = createdBody.resident.id;
          assert.equal(createdBody.resident.revision, 1);
          assert.equal(createdBody.resident.source, "ADMIN_FORM");
          assert.equal(createdBody.resident.syncStatus, "NOT_ASSIGNED");

          const stalePayload = {
            ...createPayload,
            name: "stale overwrite",
            revision: 999,
          };
          const stale = await invoke(
            route.PATCH,
            "PATCH",
            `${path}/${encodeURIComponent(adminResidentId)}`,
            { cookie: fullCookie, body: stalePayload },
          );
          assert.equal(stale.status, 409);
          assert.equal((await stale.json() as { error: string }).error, ZAAD_ERROR_CODES.residentConflict);

          const updated = await invoke(
            route.PATCH,
            "PATCH",
            `${path}/${encodeURIComponent(adminResidentId)}`,
            {
              cookie: fullCookie,
              body: { ...createPayload, name: "佐藤 健一", revision: 1 },
            },
          );
          assert.equal(updated.status, 200, await updated.clone().text());
          const updatedBody = await updated.json() as {
            resident: { name: string; revision: number };
          };
          assert.equal(updatedBody.resident.name, "佐藤 健一");
          assert.equal(updatedBody.resident.revision, 2);

          const secondStale = await invoke(
            route.PATCH,
            "PATCH",
            `${path}/${encodeURIComponent(adminResidentId)}`,
            {
              cookie: fullCookie,
              body: { ...createPayload, name: "再上書き", revision: 1 },
            },
          );
          assert.equal(secondStale.status, 409);
          assert.equal(await residentName(client, adminResidentId), "佐藤 健一");

          const connection = await invoke(
            route.GET,
            "GET",
            "/api/admin/zaad/connection",
            { cookie: fullCookie },
          );
          assert.equal(connection.status, 200);
          assert.deepEqual(await connection.json(), { state: "missing" });
        });

        await t.test("CSV multipart import is atomic and rejects unknown parts", async () => {
          const csv = [
            "name,email,phone,consent_status",
            "鈴木 美咲,misaki.suzuki@example.jp,070-3456-7890,CONSENTED",
            "高橋 翼,tsubasa.takahashi@example.jp,090-4567-8901,NOT_CONSENTED",
          ].join("\r\n");
          const upload = multipartCsv(csv);
          const imported = await invoke(
            route.POST,
            "POST",
            "/api/admin/zaad/residents/imports",
            {
              cookie: fullCookie,
              rawBody: upload.body,
              headers: {
                "content-type": upload.contentType,
                "content-length": String(upload.contentLength),
              },
            },
          );
          assert.equal(imported.status, 201, await imported.clone().text());
          assert.deepEqual(await imported.json(), {
            totalRows: 2,
            createdCount: 2,
            duplicateCount: 0,
          });
          assert.equal(await residentCount(client), 4);

          const withUnknownPart = multipartCsv(csv, true);
          const rejected = await invoke(
            route.POST,
            "POST",
            "/api/admin/zaad/residents/imports",
            {
              cookie: fullCookie,
              rawBody: withUnknownPart.body,
              headers: {
                "content-type": withUnknownPart.contentType,
                "content-length": String(withUnknownPart.contentLength),
              },
            },
          );
          assert.equal(rejected.status, 400, await rejected.clone().text());
          assert.equal((await rejected.json() as { error: string }).error, ZAAD_ERROR_CODES.invalidCsv);
          assert.equal(await residentCount(client), 4);
        });

        await t.test("registration settings allow null without a Zoom lookup and use CAS", async () => {
          const path = "/api/admin/zaad/registration-settings";
          const initial = await invoke(route.GET, "GET", path, { cookie: fullCookie });
          assert.equal(initial.status, 200, await initial.clone().text());
          const initialBody = await initial.json() as {
            setting: { contactListId: string | null; contactListName: string | null; revision: number };
          };
          assert.deepEqual(
            {
              contactListId: initialBody.setting.contactListId,
              contactListName: initialBody.setting.contactListName,
              revision: initialBody.setting.revision,
            },
            { contactListId: null, contactListName: null, revision: 1 },
          );

          assert.equal(
            (await invoke(route.PUT, "PUT", path, {
              cookie: viewCookie,
              body: { contactListId: null, revision: 1 },
            })).status,
            403,
          );
          const updated = await invoke(route.PUT, "PUT", path, {
            cookie: fullCookie,
            body: { contactListId: null, revision: 1 },
          });
          assert.equal(updated.status, 200, await updated.clone().text());
          const updatedBody = await updated.json() as {
            setting: { contactListId: string | null; contactListName: string | null; revision: number };
          };
          assert.deepEqual(
            {
              contactListId: updatedBody.setting.contactListId,
              contactListName: updatedBody.setting.contactListName,
              revision: updatedBody.setting.revision,
            },
            { contactListId: null, contactListName: null, revision: 2 },
          );

          const stale = await invoke(route.PUT, "PUT", path, {
            cookie: fullCookie,
            body: { contactListId: null, revision: 1 },
          });
          assert.equal(stale.status, 409);
          assert.equal(
            (await stale.json() as { error: string }).error,
            ZAAD_ERROR_CODES.registrationSettingConflict,
          );
        });

        await t.test("audit rows contain field names and opaque references but no resident PII", async () => {
          const result = await client.query<{
            actorUserId: string | null;
            targetRef: string;
            changedFieldNames: string[];
            resourceKind: string;
            action: string;
            fromConsentStatus: string | null;
            toConsentStatus: string | null;
          }>(
            `SELECT "actorUserId", "targetRef", "changedFieldNames",
                    "resourceKind", action, "fromConsentStatus", "toConsentStatus"
             FROM zaad_admin_audits
             ORDER BY "createdAt", id`,
          );
          assert.equal(result.rows.length, 5);
          assert.ok(result.rows.every(({ targetRef }) => /^[A-Za-z0-9_-]{43}$/u.test(targetRef)));
          assert.ok(result.rows.some(({ actorUserId }) => actorUserId === null));
          assert.ok(result.rows.some(({ actorUserId }) => actorUserId === FULL_ADMIN));
          assert.ok(result.rows.some(({ action }) => action === "CSV_CREATE"));
          assert.ok(result.rows.some(({ action }) => action === "UPDATE"));
          assert.ok(
            result.rows.some(({ changedFieldNames }) =>
              changedFieldNames.includes("email") && changedFieldNames.includes("phone")),
          );

          const auditText = JSON.stringify(result.rows);
          for (const pii of [
            "山田 花子",
            "hanako.yamada@example.jp",
            "+819012345678",
            "佐藤 健一",
            "ken.sato@example.jp",
            "+818023456789",
            "鈴木 美咲",
            "misaki.suzuki@example.jp",
            "+817034567890",
            "高橋 翼",
            "tsubasa.takahashi@example.jp",
            "+819045678901",
            adminResidentId,
          ]) {
            assert.equal(auditText.includes(pii), false, pii);
          }
        });

        assert.deepEqual(externalFetches, []);
      } finally {
        globalThis.fetch = originalFetch;
        await client.end();
        restoreEnvironment();
      }
    });
  },
);

type InvokeOptions = {
  cookie?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
};

async function invoke(
  handler: Handler,
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  options: InvokeOptions = {},
) {
  assert.equal(
    options.body === undefined || options.rawBody === undefined,
    true,
    "body and rawBody cannot be used together",
  );
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return handler(new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body: options.rawBody ?? (
      options.body === undefined ? undefined : JSON.stringify(options.body)
    ),
  }));
}

function multipartCsv(csv: string, includeUnknownPart = false) {
  const boundary = "zaad-runtime-boundary-7MA4YWxkTrZu0gW";
  const parts = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="file"; filename="residents.csv"\r\n',
    "Content-Type: text/csv\r\n\r\n",
    csv,
    "\r\n",
    ...(includeUnknownPart
      ? [
          `--${boundary}\r\n`,
          'Content-Disposition: form-data; name="unexpected"\r\n\r\n',
          "forged\r\n",
        ]
      : []),
    `--${boundary}--\r\n`,
  ];
  const body = parts.join("");
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength: Buffer.byteLength(body, "utf8"),
  };
}

function configureEnvironment(databaseUrl: string) {
  const names = [
    "NODE_ENV",
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "ZAAD_AUDIT_HMAC_KEY",
    "ZAAD_ZOOM_CONTACT_WRITE_CONTRACT_CONFIRMED",
    "ZAAD_ZOOM_TTS_WRITE_CONTRACT_CONFIRMED",
    "ZAAD_ZOOM_CAMPAIGN_WRITE_CONTRACT_CONFIRMED",
    "ZAAD_ZOOM_API_BASE_URL",
    "ZAAD_ZOOM_TOKEN_URL",
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  Reflect.set(process.env, "NODE_ENV", "development");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL_UNPOOLED = databaseUrl;
  process.env.BETTER_AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.ZAAD_AUDIT_HMAC_KEY = "zaad-runtime-audit-hmac-key";
  process.env.ZAAD_ZOOM_CONTACT_WRITE_CONTRACT_CONFIRMED = "0";
  process.env.ZAAD_ZOOM_TTS_WRITE_CONTRACT_CONFIRMED = "0";
  process.env.ZAAD_ZOOM_CAMPAIGN_WRITE_CONTRACT_CONFIRMED = "0";
  process.env.ZAAD_ZOOM_API_BASE_URL = "http://127.0.0.1:1/v2";
  process.env.ZAAD_ZOOM_TOKEN_URL = "http://127.0.0.1:1/oauth/token";
  return () => {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else Reflect.set(process.env, name, value);
    }
  };
}

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", TEST_AUTH_SECRET)
    .update(token)
    .digest("base64");
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

async function grantZaadViewOnly(client: Client, userId: string) {
  await client.query(
    `INSERT INTO admin_access_roles (id, name, "nameKey", description)
     VALUES ('zaad-runtime-view-only', 'ZAAD runtime view',
             'zaad runtime view', NULL)`,
  );
  await client.query(
    `INSERT INTO admin_access_role_permissions
       ("roleId", "resourceKey", action, effect)
     VALUES ('zaad-runtime-view-only', 'zaad', 'VIEW', 'ALLOW')`,
  );
  await replaceAssignment(client, userId, "zaad-runtime-view-only");
}

async function assignNoAccess(client: Client, userId: string) {
  await replaceAssignment(client, userId, "system-no-access");
}

async function replaceAssignment(client: Client, userId: string, roleId: string) {
  await client.query("BEGIN");
  try {
    await client.query(
      `DELETE FROM admin_access_role_assignments WHERE "userId" = $1`,
      [userId],
    );
    await client.query(
      `INSERT INTO admin_access_role_assignments ("userId", "roleId")
       VALUES ($1, $2)`,
      [userId, roleId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function residentCount(client: Client) {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM disaster_radio_subscriptions`,
  );
  return Number(result.rows[0]?.count);
}

async function residentName(client: Client, id: string) {
  const result = await client.query<{ name: string }>(
    `SELECT name FROM disaster_radio_subscriptions WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.name;
}
