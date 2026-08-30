import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { test } from "node:test";

import { Client } from "pg";

import { DEVELOPER_API_ERROR_CODES } from "../../lib/developer-api-settings";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";

const TEST_AUTH_SECRET = "runtime-developer-api-test-secret-000000000";
const FULL_ADMIN = "developer-api-full-admin";
const VIEW_ADMIN = "developer-api-view-admin";
const NO_ACCESS_ADMIN = "developer-api-no-access-admin";
const PASSWORD_ADMIN = "developer-api-password-admin";

type HonoRoute = typeof import("../../app/api/[[...route]]/route");
type HonoHandler = HonoRoute["POST"];

test(
  "Developer API Hono routes enforce authorization, validation, encryption, and redaction",
  { timeout: 180_000 },
  async () => {
    await withIsolatedPostgresDatabase(async (databaseUrl) => {
      const restoreEnvironment = configureRuntimeEnvironment(databaseUrl);
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();

      try {
        await createUser(client, FULL_ADMIN, false);
        await createUser(client, VIEW_ADMIN, false);
        await createUser(client, NO_ACCESS_ADMIN, false);
        await createUser(client, PASSWORD_ADMIN, true);
        await grantViewOnlyDeveloperApi(client, VIEW_ADMIN);
        await assignNoAccess(client, NO_ACCESS_ADMIN);
        for (const userId of [
          FULL_ADMIN,
          VIEW_ADMIN,
          NO_ACCESS_ADMIN,
          PASSWORD_ADMIN,
        ]) {
          await createSession(client, userId, `${userId}-token`);
        }

        const route = await import("../../app/api/[[...route]]/route");
        const fullCookie = signedSessionCookie(`${FULL_ADMIN}-token`);
        const viewCookie = signedSessionCookie(`${VIEW_ADMIN}-token`);
        const noAccessCookie = signedSessionCookie(`${NO_ACCESS_ADMIN}-token`);
        const passwordCookie = signedSessionCookie(`${PASSWORD_ADMIN}-token`);

        const validOauth = {
          section: "server-to-server-oauth",
          accountId: " account ",
          clientId: " client ",
          clientSecret: "client-secret-plain",
        };

        assert.equal(
          (await invokeJson(route.PUT, "PUT", "/api/admin/developer-api", undefined, validOauth)).status,
          401,
        );
        assert.equal(
          (await invokeJson(route.PUT, "PUT", "/api/admin/developer-api", viewCookie, validOauth)).status,
          403,
        );
        const passwordResponse = await invokeJson(
          route.PUT,
          "PUT",
          "/api/admin/developer-api",
          passwordCookie,
          validOauth,
        );
        assert.equal(passwordResponse.status, 403);
        assert.deepEqual(await passwordResponse.json(), {
          error: "PASSWORD_CHANGE_REQUIRED",
        });
        assert.equal(await settingsCount(client), 0);

        assert.equal(
          (await invokeRaw(route.PUT, "PUT", "/api/admin/developer-api", fullCookie, "{")).status,
          400,
        );
        assert.equal(
          (
            await invokeJson(route.PUT, "PUT", "/api/admin/developer-api", fullCookie, {
              ...validOauth,
              secretToken: "cross-section",
            })
          ).status,
          400,
        );
        const missingOauth = await invokeJson(
          route.PUT,
          "PUT",
          "/api/admin/developer-api",
          fullCookie,
          {
            section: "server-to-server-oauth",
            accountId: "account",
            clientId: "client",
          },
        );
        assert.equal(missingOauth.status, 400);
        assert.deepEqual(await missingOauth.json(), {
          error: DEVELOPER_API_ERROR_CODES.oauthSecretRequired,
        });
        const missingWebhook = await invokeJson(
          route.PUT,
          "PUT",
          "/api/admin/developer-api",
          fullCookie,
          { section: "webhook-only-app" },
        );
        assert.equal(missingWebhook.status, 400);
        assert.deepEqual(await missingWebhook.json(), {
          error: DEVELOPER_API_ERROR_CODES.webhookSecretRequired,
        });

        const validKey = process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY!;
        process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = "invalid";
        const unavailableSave = await invokeJson(
          route.PUT,
          "PUT",
          "/api/admin/developer-api",
          fullCookie,
          validOauth,
        );
        assert.equal(unavailableSave.status, 503);
        assert.deepEqual(await unavailableSave.json(), {
          error: DEVELOPER_API_ERROR_CODES.encryptionUnavailable,
        });
        assert.equal(await settingsCount(client), 0);
        process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = validKey;

        for (const [cookie, expectedStatus] of [
          [undefined, 401],
          [noAccessCookie, 403],
          [passwordCookie, 403],
        ] as const) {
          const response = await invokeJson(
            route.POST,
            "POST",
            "/api/admin/developer-api/reveal",
            cookie,
            { field: "clientSecret" },
          );
          assert.equal(response.status, expectedStatus);
          assertNoStore(response);
        }
        for (const response of [
          await invokeRaw(
            route.POST,
            "POST",
            "/api/admin/developer-api/reveal",
            fullCookie,
            "{",
          ),
          await invokeJson(
            route.POST,
            "POST",
            "/api/admin/developer-api/reveal",
            fullCookie,
            { field: "clientSecret", extra: true },
          ),
          await invokeJson(
            route.POST,
            "POST",
            "/api/admin/developer-api/reveal",
            fullCookie,
            { field: "unknown" },
          ),
        ]) {
          assert.equal(response.status, 400);
          assert.deepEqual(await response.json(), {
            error: DEVELOPER_API_ERROR_CODES.invalidRequest,
          });
          assertNoStore(response);
        }
        const notConfigured = await invokeJson(
          route.POST,
          "POST",
          "/api/admin/developer-api/reveal",
          viewCookie,
          { field: "clientSecret" },
        );
        assert.equal(notConfigured.status, 404);
        assert.deepEqual(await notConfigured.json(), {
          error: DEVELOPER_API_ERROR_CODES.secretNotConfigured,
        });
        assertNoStore(notConfigured);

        const oauthResponse = await invokeJson(
          route.PUT,
          "PUT",
          "/api/admin/developer-api",
          fullCookie,
          validOauth,
        );
        assert.equal(oauthResponse.status, 200, await oauthResponse.clone().text());
        const oauthText = await oauthResponse.text();
        assert.deepEqual(JSON.parse(oauthText), {
          settings: {
            accountId: "account",
            clientId: "client",
            clientSecretConfigured: true,
            secretTokenConfigured: false,
          },
        });
        assert.equal(oauthText.includes("client-secret-plain"), false);
        assert.equal(oauthText.includes("Encrypted"), false);

        const webhookResponse = await invokeJson(
          route.PUT,
          "PUT",
          "/api/admin/developer-api",
          fullCookie,
          { section: "webhook-only-app", secretToken: "secret-token-plain" },
        );
        assert.equal(webhookResponse.status, 200, await webhookResponse.clone().text());
        const webhookText = await webhookResponse.text();
        assert.deepEqual(JSON.parse(webhookText), {
          settings: {
            accountId: "account",
            clientId: "client",
            clientSecretConfigured: true,
            secretTokenConfigured: true,
          },
        });
        assert.equal(webhookText.includes("secret-token-plain"), false);

        const ciphertextsBefore = await readCiphertexts(client);
        const idOnlyResponse = await invokeJson(
          route.PUT,
          "PUT",
          "/api/admin/developer-api",
          fullCookie,
          {
            section: "server-to-server-oauth",
            accountId: "account-2",
            clientId: "client-2",
          },
        );
        assert.equal(idOnlyResponse.status, 200);
        assert.deepEqual(await readCiphertexts(client), ciphertextsBefore);

        for (const [field, expectedValue] of [
          ["clientSecret", "client-secret-plain"],
          ["secretToken", "secret-token-plain"],
        ] as const) {
          for (const cookie of [fullCookie, viewCookie]) {
            const response = await invokeJson(
              route.POST,
              "POST",
              "/api/admin/developer-api/reveal",
              cookie,
              { field },
            );
            assert.equal(response.status, 200, await response.clone().text());
            assertNoStore(response);
            assert.deepEqual(await response.json(), { field, value: expectedValue });
          }
        }

        process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = "invalid";
        const unavailableReveal = await invokeJson(
          route.POST,
          "POST",
          "/api/admin/developer-api/reveal",
          fullCookie,
          { field: "clientSecret" },
        );
        assert.equal(unavailableReveal.status, 503);
        assert.deepEqual(await unavailableReveal.json(), {
          error: DEVELOPER_API_ERROR_CODES.encryptionUnavailable,
        });
        assertNoStore(unavailableReveal);
        process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = validKey;

        await client.query(
          `UPDATE site_developer_api_settings
           SET "clientSecretEncrypted" = 'v1.invalid.invalid.invalid'
           WHERE id = 1`,
        );
        const originalConsoleError = console.error;
        const logged: unknown[][] = [];
        console.error = (...arguments_) => logged.push(arguments_);
        try {
          const failedReveal = await invokeJson(
            route.POST,
            "POST",
            "/api/admin/developer-api/reveal",
            fullCookie,
            { field: "clientSecret" },
          );
          assert.equal(failedReveal.status, 500);
          assert.deepEqual(await failedReveal.json(), {
            error: DEVELOPER_API_ERROR_CODES.secretRevealFailed,
          });
          assertNoStore(failedReveal);
        } finally {
          console.error = originalConsoleError;
        }
        assert.deepEqual(logged, [["Failed to reveal a Developer API secret."]]);
      } finally {
        await client.end();
        restoreEnvironment();
      }
    });
  },
);

function configureRuntimeEnvironment(databaseUrl: string) {
  const names = [
    "NODE_ENV",
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "DEVELOPER_API_SETTINGS_ENCRYPTION_KEY",
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  Reflect.set(process.env, "NODE_ENV", "development");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL_UNPOOLED = databaseUrl;
  process.env.BETTER_AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
  return () => {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else Reflect.set(process.env, name, value);
    }
  };
}

async function invokeJson(
  handler: HonoHandler,
  method: "POST" | "PUT",
  path: string,
  cookie: string | undefined,
  body: unknown,
) {
  return invokeRaw(handler, method, path, cookie, JSON.stringify(body));
}

async function invokeRaw(
  handler: HonoHandler,
  method: "POST" | "PUT",
  path: string,
  cookie: string | undefined,
  body: string,
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return handler(
    new Request(`http://localhost:3000${path}`, {
      method,
      headers,
      body,
    }),
  );
}

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", TEST_AUTH_SECRET)
    .update(token)
    .digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function createUser(
  client: Client,
  id: string,
  mustChangePassword: boolean,
) {
  await client.query(
    `INSERT INTO "user"
       (id, name, email, "emailVerified", "createdAt", "updatedAt", role,
        banned, "mustChangePassword")
     VALUES ($1, $1, $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'admin',
             false, $3)`,
    [id, `${id}@example.test`, mustChangePassword],
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

async function grantViewOnlyDeveloperApi(client: Client, userId: string) {
  await client.query(
    `INSERT INTO admin_access_roles (id, name, "nameKey", description)
     VALUES ('developer-api-view-only', 'Developer API View',
             'developer api view', NULL)`,
  );
  await client.query(
    `INSERT INTO admin_access_role_permissions
       ("roleId", "resourceKey", action, effect)
     VALUES ('developer-api-view-only', 'developer-api', 'VIEW', 'ALLOW')`,
  );
  await client.query("BEGIN");
  try {
    await client.query(
      `DELETE FROM admin_access_role_assignments WHERE "userId" = $1`,
      [userId],
    );
    await client.query(
      `INSERT INTO admin_access_role_assignments ("userId", "roleId")
       VALUES ($1, 'developer-api-view-only')`,
      [userId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function assignNoAccess(client: Client, userId: string) {
  await client.query("BEGIN");
  try {
    await client.query(
      `DELETE FROM admin_access_role_assignments WHERE "userId" = $1`,
      [userId],
    );
    await client.query(
      `INSERT INTO admin_access_role_assignments ("userId", "roleId")
       VALUES ($1, 'system-no-access')`,
      [userId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function settingsCount(client: Client) {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM site_developer_api_settings`,
  );
  return Number(result.rows[0]?.count);
}

async function readCiphertexts(client: Client) {
  const result = await client.query<{
    clientSecretEncrypted: string | null;
    secretTokenEncrypted: string | null;
  }>(
    `SELECT "clientSecretEncrypted", "secretTokenEncrypted"
     FROM site_developer_api_settings WHERE id = 1`,
  );
  return result.rows[0];
}

function assertNoStore(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
}
