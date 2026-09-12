import { createHmac } from "node:crypto";
import type { Client } from "pg";
const TEST_AUTH_SECRET = "runtime-zaad-api-test-secret-000000000000000";
export function configureEnvironment(databaseUrl: string) {
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

export function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", TEST_AUTH_SECRET)
    .update(token)
    .digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

export async function createUser(client: Client, id: string) {
  await client.query(
    `INSERT INTO "user"
       (id, name, email, "emailVerified", "createdAt", "updatedAt", role,
        banned, "mustChangePassword")
     VALUES ($1, $1, $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'admin',
             false, false)`,
    [id, `${id}@example.test`],
  );
}

export async function createSession(client: Client, userId: string, token: string) {
  await client.query(
    `INSERT INTO session
       (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
     VALUES ($1, CURRENT_TIMESTAMP + INTERVAL '1 hour', $2,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)`,
    [`session-${userId}`, token, userId],
  );
}

export async function grantZaadViewOnly(client: Client, userId: string) {
  await client.query(
    `INSERT INTO admin_access_roles (id, name, "nameKey", description)
     VALUES ('access-runtime-view-only', 'ZAAD runtime view',
             'zaad runtime view', NULL)`,
  );
  await client.query(
    `INSERT INTO admin_access_role_permissions
       ("roleId", "resourceKey", action, effect)
     VALUES ('access-runtime-view-only', 'maintenance-settings', 'VIEW', 'ALLOW')`,
  );
  await replaceAssignment(client, userId, "access-runtime-view-only");
}

export async function assignNoAccess(client: Client, userId: string) {
  await replaceAssignment(client, userId, "system-no-access");
}

export async function replaceAssignment(client: Client, userId: string, roleId: string) {
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
