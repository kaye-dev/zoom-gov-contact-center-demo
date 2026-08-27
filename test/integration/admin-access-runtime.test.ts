import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { Client } from "pg";

import { ADMIN_RESOURCE_CATALOG } from "../../lib/admin-access/catalog";
import type { PermissionInput } from "../../lib/admin-access/validation";
import {
  AdminAccessServiceError,
  replaceAdminRolePermissions,
  replaceUserAdminAccessRoles,
} from "../../lib/server/admin-access/authority-service";
import { createDatabaseContext } from "../../lib/server/prisma";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";

const TEST_AUTH_SECRET = "runtime-admin-access-test-secret-000000000000";
const FULL_ACCESS_ROLE_ID = "system-full-access";
const NO_ACCESS_ROLE_ID = "system-no-access";
const ADMIN_ENDPOINTS = [
  { method: "POST", path: "/set-role", body: { userId: "route-target", role: "user" } },
  { method: "GET", path: "/get-user?userId=route-target" },
  {
    method: "POST",
    path: "/create-user",
    body: {
      name: "Blocked User",
      email: "blocked-user@example.test",
      password: "blocked-user-password-1",
      role: "user",
    },
  },
  {
    method: "POST",
    path: "/update-user",
    body: { userId: "route-target", data: { name: "Blocked update" } },
  },
  { method: "GET", path: "/list-users" },
  { method: "POST", path: "/list-user-sessions", body: { userId: "route-target" } },
  { method: "POST", path: "/unban-user", body: { userId: "route-target" } },
  { method: "POST", path: "/ban-user", body: { userId: "route-target" } },
  { method: "POST", path: "/impersonate-user", body: { userId: "route-target" } },
  { method: "POST", path: "/stop-impersonating", body: {} },
  {
    method: "POST",
    path: "/revoke-user-session",
    body: { sessionToken: "route-target-token" },
  },
  { method: "POST", path: "/revoke-user-sessions", body: { userId: "route-target" } },
  { method: "POST", path: "/remove-user", body: { userId: "route-target" } },
  {
    method: "POST",
    path: "/set-user-password",
    body: { userId: "route-target", newPassword: "blocked-password-2" },
  },
  {
    method: "POST",
    path: "/has-permission",
    body: { userId: "route-target", permissions: { user: ["list"] } },
  },
] as const;

test(
  "runtime admin routes fail closed and concurrent authority mutations use CAS",
  { timeout: 180_000 },
  async (t) => {
    await withIsolatedPostgresDatabase(async (databaseUrl) => {
      const restoreEnvironment = configureRuntimeEnvironment(databaseUrl);
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();

      try {
        await createUser(client, "full-admin", "full-admin@example.test", "admin");
        await createUser(client, "denied-admin", "denied-admin@example.test", "admin");
        await replaceAssignmentsDirectly(client, "denied-admin", [NO_ACCESS_ROLE_ID]);
        await createUser(client, "route-target", "route-target@example.test", "user");
        await createSession(client, "full-admin", "full-admin-token");
        await createSession(client, "denied-admin", "denied-admin-token");

        const authRoute = await import("../../app/api/auth/[...all]/route");
        const honoRoute = await import("../../app/api/[[...route]]/route");
        const fullCookie = signedSessionCookie("full-admin-token");
        const deniedCookie = signedSessionCookie("denied-admin-token");

        await t.test(
          "all Better Auth admin endpoints return 404 for every actor without database mutation",
          async () => {
            const before = await readMutationSnapshot(client);
            const actors = [undefined, deniedCookie, fullCookie] as const;

            for (const cookie of actors) {
              for (const endpoint of ADMIN_ENDPOINTS) {
                const response = await invokeAuthRoute(authRoute, endpoint, cookie);
                assert.equal(
                  response.status,
                  404,
                  `${endpoint.method} ${endpoint.path} was not hidden`,
                );
              }
            }

            for (const path of [
              "/api/auth/%61dmin/list-users",
              "/api/auth/admin%2Flist-users",
              "/api/auth//admin/list-users",
              "/api/auth/ADMIN/list-users",
              "/api/auth/admin./list-users",
              "/api/auth/%2e/admin/list-users",
            ]) {
              const response = await authRoute.GET(
                new Request(`http://localhost:3000${path}`, {
                  headers: { cookie: fullCookie },
                }),
              );
              assert.equal(response.status, 404, `${path} bypassed the blocker`);
            }

            assert.deepEqual(await readMutationSnapshot(client), before);
          },
        );

        await t.test("Hono role and assignment routes enforce 401, 403, and stale 409", async () => {
          const roleCountBefore = await countRows(client, "admin_access_roles");
          assert.equal(
            (await invokeHono(honoRoute.POST, "POST", "/api/admin/roles", undefined, {
              name: "Anonymous role",
              description: null,
            })).status,
            401,
          );
          assert.equal(
            (await invokeHono(honoRoute.POST, "POST", "/api/admin/roles", deniedCookie, {
              name: "Denied role",
              description: null,
            })).status,
            403,
          );
          assert.equal(await countRows(client, "admin_access_roles"), roleCountBefore);

          const createdResponse = await invokeHono(
            honoRoute.POST,
            "POST",
            "/api/admin/roles",
            fullCookie,
            { name: "Runtime role", description: "Runtime authorization test" },
          );
          assert.equal(createdResponse.status, 201);
          const createdBody = (await createdResponse.json()) as {
            role: { id: string; revision: number };
          };
          assert.equal(createdBody.role.revision, 1);

          const updatedResponse = await invokeHono(
            honoRoute.PATCH,
            "PATCH",
            `/api/admin/roles/${createdBody.role.id}`,
            fullCookie,
            {
              expectedRevision: 1,
              name: "Runtime role updated",
              description: "Runtime authorization test",
            },
          );
          assert.equal(updatedResponse.status, 200);
          assert.equal(
            (await invokeHono(
              honoRoute.PATCH,
              "PATCH",
              `/api/admin/roles/${createdBody.role.id}`,
              fullCookie,
              {
                expectedRevision: 1,
                name: "Stale overwrite",
                description: null,
              },
            )).status,
            409,
          );
          assert.equal(
            await readRoleName(client, createdBody.role.id),
            "Runtime role updated",
          );

          const assignmentPath = "/api/admin/users/route-target/access-roles";
          assert.equal(
            (await invokeHono(honoRoute.PUT, "PUT", assignmentPath, undefined, {
              roleIds: [createdBody.role.id],
              expectedAssignmentRevision: 1,
            })).status,
            401,
          );
          assert.equal(
            (await invokeHono(honoRoute.PUT, "PUT", assignmentPath, deniedCookie, {
              roleIds: [createdBody.role.id],
              expectedAssignmentRevision: 1,
            })).status,
            403,
          );
          assert.equal(
            (await invokeHono(honoRoute.PUT, "PUT", assignmentPath, fullCookie, {
              roleIds: [createdBody.role.id],
              expectedAssignmentRevision: 999,
            })).status,
            409,
          );
          assert.deepEqual(await readUserAssignment(client, "route-target"), {
            revision: 1,
            roleIds: [NO_ACCESS_ROLE_ID],
          });

          const assigned = await invokeHono(
            honoRoute.PUT,
            "PUT",
            assignmentPath,
            fullCookie,
            {
              roleIds: [createdBody.role.id],
              expectedAssignmentRevision: 1,
            },
          );
          assert.equal(assigned.status, 200, await assigned.clone().text());
          assert.equal(
            (await invokeHono(honoRoute.PUT, "PUT", assignmentPath, fullCookie, {
              roleIds: [],
              expectedAssignmentRevision: 1,
            })).status,
            409,
          );
          assert.deepEqual(await readUserAssignment(client, "route-target"), {
            revision: 2,
            roleIds: [createdBody.role.id],
          });
        });

        await t.test(
          "a NULL-banned FULL_ACCESS administrator remains an active recovery administrator",
          async () => {
            await createUser(
              client,
              "nullable-recovery-admin",
              "nullable-recovery-admin@example.test",
              "admin",
              null,
            );
            await createUser(
              client,
              "nullable-recovery-target",
              "nullable-recovery-target@example.test",
              "user",
            );
            await createCustomRole(
              client,
              "nullable-recovery-role",
              "Nullable recovery role",
            );
            await client.query(
              `UPDATE "user" SET role = 'user' WHERE id = 'full-admin'`,
            );

            const database = createDatabaseContext({
              NODE_ENV: "production",
              DATABASE_URL: databaseUrl,
            });
            try {
              const role = await replaceAdminRolePermissions(
                database.prisma,
                "nullable-recovery-admin",
                "nullable-recovery-role",
                1,
                emptyPermissionMatrix(),
              );
              assert.equal(role.revision, 2);

              const assignment = await replaceUserAdminAccessRoles(
                database.prisma,
                "nullable-recovery-admin",
                "nullable-recovery-target",
                ["nullable-recovery-role"],
                1,
              );
              assert.deepEqual(assignment, {
                assignmentRevision: 2,
                roleIds: ["nullable-recovery-role"],
              });
            } finally {
              await database.close();
              await client.query(
                `UPDATE "user"
                 SET role = CASE
                   WHEN id = 'full-admin' THEN 'admin'
                   ELSE 'user'
                 END
                 WHERE id IN ('full-admin', 'nullable-recovery-admin')`,
              );
            }
          },
        );

        await t.test("separate database connections allow only one role CAS winner", async () => {
          await createCustomRole(client, "concurrent-role-a", "Concurrent role A");
          const permissions = emptyPermissionMatrix();
          const first = createDatabaseContext({
            NODE_ENV: "production",
            DATABASE_URL: databaseUrl,
          });
          const second = createDatabaseContext({
            NODE_ENV: "production",
            DATABASE_URL: databaseUrl,
          });
          try {
            const results = await Promise.allSettled([
              replaceAdminRolePermissions(
                first.prisma,
                "full-admin",
                "concurrent-role-a",
                1,
                permissions,
              ),
              replaceAdminRolePermissions(
                second.prisma,
                "full-admin",
                "concurrent-role-a",
                1,
                permissions,
              ),
            ]);
            assertOneSuccessAndOneServiceError(results, "ROLE_CONFLICT");
          } finally {
            await Promise.all([first.close(), second.close()]);
          }
          assert.equal(await readRoleRevision(client, "concurrent-role-a"), 2);
        });

        await t.test("separate database connections allow only one assignment CAS winner", async () => {
          await createCustomRole(client, "assignment-role-a", "Assignment role A");
          await createCustomRole(client, "assignment-role-b", "Assignment role B");
          await createUser(
            client,
            "concurrent-target",
            "concurrent-target@example.test",
            "user",
          );
          const first = createDatabaseContext({
            NODE_ENV: "production",
            DATABASE_URL: databaseUrl,
          });
          const second = createDatabaseContext({
            NODE_ENV: "production",
            DATABASE_URL: databaseUrl,
          });
          try {
            const results = await Promise.allSettled([
              replaceUserAdminAccessRoles(
                first.prisma,
                "full-admin",
                "concurrent-target",
                ["assignment-role-a"],
                1,
              ),
              replaceUserAdminAccessRoles(
                second.prisma,
                "full-admin",
                "concurrent-target",
                ["assignment-role-b"],
                1,
              ),
            ]);
            assertOneSuccessAndOneServiceError(
              results,
              "ROLE_ASSIGNMENT_CONFLICT",
            );
          } finally {
            await Promise.all([first.close(), second.close()]);
          }
          const assignment = await readUserAssignment(client, "concurrent-target");
          assert.equal(assignment.revision, 2);
          assert.equal(assignment.roleIds.length, 1);
          assert.ok(
            ["assignment-role-a", "assignment-role-b"].includes(
              assignment.roleIds[0]!,
            ),
          );
        });

        await t.test("the recovery-admin mutex preserves one winner across connections", async () => {
          await createUser(client, "recovery-a", "recovery-a@example.test", "admin");
          await createUser(client, "recovery-b", "recovery-b@example.test", "admin");
          await client.query(`UPDATE "user" SET role = 'user' WHERE id = 'full-admin'`);

          const first = createDatabaseContext({
            NODE_ENV: "production",
            DATABASE_URL: databaseUrl,
          });
          const second = createDatabaseContext({
            NODE_ENV: "production",
            DATABASE_URL: databaseUrl,
          });
          try {
            const results = await Promise.allSettled([
              replaceUserAdminAccessRoles(
                first.prisma,
                "recovery-a",
                "recovery-b",
                [],
                1,
              ),
              replaceUserAdminAccessRoles(
                second.prisma,
                "recovery-b",
                "recovery-a",
                [],
                1,
              ),
            ]);
            assertOneSuccessAndOneServiceError(
              results,
              "ADMIN_ACCESS_DENIED",
            );
          } finally {
            await Promise.all([first.close(), second.close()]);
          }
          assert.equal(await countRecoveryAdmins(client), 1);
        });
      } finally {
        await client.end();
        restoreEnvironment();
      }
    });
  },
);

type AuthRoute = typeof import("../../app/api/auth/[...all]/route");
type HonoRoute = typeof import("../../app/api/[[...route]]/route");
type HonoHandler = HonoRoute["GET"];

function configureRuntimeEnvironment(databaseUrl: string) {
  const names = [
    "NODE_ENV",
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
  ] as const;
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

async function invokeAuthRoute(
  route: AuthRoute,
  endpoint: (typeof ADMIN_ENDPOINTS)[number],
  cookie: string | undefined,
) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (endpoint.method === "POST") headers.set("content-type", "application/json");
  return route[endpoint.method](
    new Request(`http://localhost:3000/api/auth/admin${endpoint.path}`, {
      method: endpoint.method,
      headers,
      body:
        endpoint.method === "POST"
          ? JSON.stringify("body" in endpoint ? endpoint.body : {})
          : undefined,
    }),
  );
}

async function invokeHono(
  handler: HonoHandler,
  method: "POST" | "PUT" | "PATCH",
  path: string,
  cookie: string | undefined,
  body?: unknown,
) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return handler(
    new Request(`http://localhost:3000${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
  email: string,
  role: "admin" | "user",
  banned: boolean | null = false,
) {
  await client.query(
    `INSERT INTO "user"
       (id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned)
     VALUES ($1, $1, $2, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3, $4)`,
    [id, email, role, banned],
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

async function createCustomRole(client: Client, id: string, name: string) {
  await client.query(
    `INSERT INTO admin_access_roles (id, name, "nameKey", description, "systemKey")
     VALUES ($1, $2, $1, NULL, NULL)`,
    [id, name],
  );
}

async function replaceAssignmentsDirectly(
  client: Client,
  userId: string,
  roleIds: string[],
) {
  await client.query(
    `DELETE FROM admin_access_role_assignments WHERE "userId" = $1`,
    [userId],
  );
  for (const roleId of roleIds) {
    await client.query(
      `INSERT INTO admin_access_role_assignments ("userId", "roleId")
       VALUES ($1, $2)`,
      [userId, roleId],
    );
  }
}

function emptyPermissionMatrix(): PermissionInput[] {
  return ADMIN_RESOURCE_CATALOG.flatMap((resource) =>
    resource.supportedActions.map((action) => ({
      resourceKey: resource.key,
      action,
      effect: null,
    })),
  );
}

function assertOneSuccessAndOneServiceError(
  results: PromiseSettledResult<unknown>[],
  expectedCode: string,
) {
  assert.equal(
    results.filter(({ status }) => status === "fulfilled").length,
    1,
    describeSettledResults(results),
  );
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  assert.ok(rejected);
  assert.ok(rejected.reason instanceof AdminAccessServiceError);
  assert.equal(rejected.reason.code, expectedCode);
}

function describeSettledResults(results: PromiseSettledResult<unknown>[]) {
  return results
    .map((result) =>
      result.status === "fulfilled"
        ? "fulfilled"
        : `rejected: ${String(result.reason)}`,
    )
    .join("; ");
}

async function readMutationSnapshot(client: Client) {
  const result = await client.query(
    `SELECT
       (SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id), '[]'::jsonb)
          FROM "user" AS u) AS users,
       (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb)
          FROM session AS s) AS sessions,
       (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
          FROM account AS a) AS accounts,
       (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id), '[]'::jsonb)
          FROM verification AS v) AS verifications,
       (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)
          FROM admin_access_roles AS r) AS roles,
       (SELECT coalesce(
          jsonb_agg(
            to_jsonb(p)
            ORDER BY p."roleId", p."resourceKey", p.action
          ),
          '[]'::jsonb
        ) FROM admin_access_role_permissions AS p) AS permissions,
       (SELECT coalesce(
          jsonb_agg(to_jsonb(ra) ORDER BY ra."userId", ra."roleId"),
          '[]'::jsonb
        ) FROM admin_access_role_assignments AS ra) AS assignments`,
  );
  return result.rows[0];
}

async function countRows(client: Client, table: "admin_access_roles") {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table}`,
  );
  return Number(result.rows[0]?.count);
}

async function readRoleName(client: Client, roleId: string) {
  const result = await client.query<{ name: string }>(
    `SELECT name FROM admin_access_roles WHERE id = $1`,
    [roleId],
  );
  return result.rows[0]?.name;
}

async function readRoleRevision(client: Client, roleId: string) {
  const result = await client.query<{ revision: number }>(
    `SELECT revision FROM admin_access_roles WHERE id = $1`,
    [roleId],
  );
  return result.rows[0]?.revision;
}

async function readUserAssignment(client: Client, userId: string) {
  const result = await client.query<{ revision: number; roleIds: string[] }>(
    `SELECT
       u."adminAccessRoleRevision" AS revision,
       coalesce(
         array_agg(a."roleId" ORDER BY a."roleId")
           FILTER (WHERE a."roleId" IS NOT NULL),
         ARRAY[]::text[]
       ) AS "roleIds"
     FROM "user" AS u
     LEFT JOIN admin_access_role_assignments AS a ON a."userId" = u.id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId],
  );
  return result.rows[0];
}

async function countRecoveryAdmins(client: Client) {
  const result = await client.query<{ count: string }>(
    `SELECT count(DISTINCT u.id)::text AS count
     FROM "user" AS u
     JOIN admin_access_role_assignments AS a ON a."userId" = u.id
     WHERE u.role = 'admin'
       AND u.banned IS NOT TRUE
       AND a."roleId" = $1`,
    [FULL_ACCESS_ROLE_ID],
  );
  return Number(result.rows[0]?.count);
}
