import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { Client } from "pg";

import {
  captureAdminAccessBaseSnapshot,
  verifyAdminAccessPostMigration,
} from "../lib/admin-access-rehearsal";

const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");
const ADMIN_DATABASE_URL_ENV = "ADMIN_ACCESS_TEST_ADMIN_URL";
const DEFAULT_ADMIN_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DATABASE_NAME_PREFIX = "zoom_admin_access_rehearsal_test_";
const DATABASE_NAME_PATTERN =
  /^zoom_admin_access_rehearsal_test_[0-9a-f]{16}$/u;

const MIGRATIONS_BEFORE_ADMIN_ACCESS = [
  "20260623105657_init",
  "20260804090000_add_site_settings",
  "20260804150000_add_zoom_virtual_agent_web_tag",
  "20260805040000_split_phone_and_chat_settings",
  "20260816090000_add_site_maintenance_settings",
] as const;

const REVIEWED_ADMIN_ACCESS_MIGRATIONS = [
  "20260827150000_add_admin_access_roles",
  "20260828120000_separate_admin_access_cas_revisions",
  "20260828180000_add_admin_access_mutation_freeze",
  "20260828210000_enforce_single_admin_access_role",
] as const;

test("base-five snapshot and reviewed post-migration verifier reject semantic and catalog drift", async () => {
  await withIsolatedDatabase(async (databaseUrl) => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      for (const migration of MIGRATIONS_BEFORE_ADMIN_ACCESS) {
        await client.query(readMigration(migration));
      }

      const sensitiveUserId = "private-rehearsal-user";
      await insertUser(
        client,
        sensitiveUserId,
        "private-rehearsal-user@example.test",
        "admin",
      );
      await insertUser(
        client,
        "ordinary-rehearsal-user",
        "ordinary-rehearsal-user@example.test",
        "user",
      );
      await insertUser(
        client,
        "null-role-rehearsal-user",
        "null-role-rehearsal-user@example.test",
        null,
      );

      const sourceSnapshot =
        await captureAdminAccessBaseSnapshot(databaseUrl);
      assert.equal(sourceSnapshot.schemaVersion, 1);
      assert.equal(sourceSnapshot.userCount, 3);
      assert.match(sourceSnapshot.userRoleDigest, /^[0-9a-f]{64}$/u);

      for (const migration of REVIEWED_ADMIN_ACCESS_MIGRATIONS) {
        await client.query(readMigration(migration));
      }

      await assert.rejects(
        captureAdminAccessBaseSnapshot(databaseUrl),
        (error: unknown) => {
          assertSafeError(
            error,
            "Administrative access rehearsal base snapshot is not the reviewed pre-migration schema.",
            sensitiveUserId,
          );
          return true;
        },
      );

      assert.deepEqual(
        await verifyAdminAccessPostMigration(databaseUrl, sourceSnapshot),
        {
          ...sourceSnapshot,
          assignmentCount: 3,
        },
      );

      await client.query(
        `UPDATE public.admin_access_role_assignments
         SET "roleId" = 'system-no-access'
         WHERE "userId" = $1`,
        [sensitiveUserId],
      );
      await assert.rejects(
        verifyAdminAccessPostMigration(databaseUrl, sourceSnapshot),
        (error: unknown) => {
          assertSafeError(
            error,
            "Administrative access rehearsal post-migration user backfill verification failed.",
            sensitiveUserId,
          );
          return true;
        },
      );
      await client.query(
        `UPDATE public.admin_access_role_assignments
         SET "roleId" = 'system-full-access'
         WHERE "userId" = $1`,
        [sensitiveUserId],
      );

      await client.query(
        `UPDATE public."user"
         SET "adminAccessRoleRevision" = 2
         WHERE id = $1`,
        [sensitiveUserId],
      );
      await assert.rejects(
        verifyAdminAccessPostMigration(databaseUrl, sourceSnapshot),
        (error: unknown) => {
          assertSafeError(
            error,
            "Administrative access rehearsal post-migration user backfill verification failed.",
            sensitiveUserId,
          );
          return true;
        },
      );
      await client.query(
        `UPDATE public."user"
         SET "adminAccessRoleRevision" = 1
         WHERE id = $1`,
        [sensitiveUserId],
      );

      await client.query(
        `UPDATE public."user" SET role = 'user' WHERE id = $1`,
        [sensitiveUserId],
      );
      await assert.rejects(
        verifyAdminAccessPostMigration(databaseUrl, sourceSnapshot),
        (error: unknown) => {
          assertSafeError(
            error,
            "Administrative access rehearsal source data digest changed; migration verification is blocked.",
            sensitiveUserId,
          );
          return true;
        },
      );
      await client.query(
        `UPDATE public."user" SET role = 'admin' WHERE id = $1`,
        [sensitiveUserId],
      );

      await client.query(`
        DROP TRIGGER "admin_access_role_assignment_exactly_one"
        ON public.admin_access_role_assignments
      `);
      await assert.rejects(
        verifyAdminAccessPostMigration(databaseUrl, sourceSnapshot),
        (error: unknown) => {
          assertSafeError(
            error,
            "Administrative access rehearsal post-migration catalog verification failed.",
            sensitiveUserId,
          );
          return true;
        },
      );
    } finally {
      await client.end();
    }
  });
});

async function withIsolatedDatabase(
  operation: (databaseUrl: string) => Promise<void>,
): Promise<void> {
  const adminUrl = readLocalAdminDatabaseUrl();
  const databaseName = `${DATABASE_NAME_PREFIX}${randomBytes(8).toString("hex")}`;
  assert.match(databaseName, DATABASE_NAME_PATTERN);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl });
  let created = false;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteDatabaseName(databaseName)}`);
    created = true;
    await operation(databaseUrl.href);
  } finally {
    if (created) {
      await admin.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [databaseName],
      );
      await admin.query(`DROP DATABASE ${quoteDatabaseName(databaseName)}`);
    }
    await admin.end();
  }
}

function readLocalAdminDatabaseUrl(): string {
  const raw =
    process.env[ADMIN_DATABASE_URL_ENV]?.trim() || DEFAULT_ADMIN_DATABASE_URL;
  const url = new URL(raw);
  if (
    url.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost", "db"].includes(url.hostname) ||
    url.pathname !== "/postgres" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `${ADMIN_DATABASE_URL_ENV} must target the local PostgreSQL maintenance database exactly.`,
    );
  }
  return url.href;
}

function quoteDatabaseName(databaseName: string): string {
  if (!DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      "Refusing to use an unrecognized integration-test database name.",
    );
  }
  return `"${databaseName}"`;
}

function readMigration(name: string): string {
  return readFileSync(
    join(PROJECT_ROOT, "prisma", "migrations", name, "migration.sql"),
    "utf8",
  );
}

async function insertUser(
  client: Client,
  id: string,
  email: string,
  role: "admin" | "user" | null,
): Promise<void> {
  await client.query(
    `INSERT INTO public."user"
       (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
     VALUES ($1, $2, $3, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)`,
    [id, id, email, role],
  );
}

function assertSafeError(
  error: unknown,
  expectedMessage: string,
  sensitiveUserId: string,
): void {
  assert.ok(error instanceof Error);
  assert.equal(error.message, expectedMessage);
  assert.equal(error.message.includes(sensitiveUserId), false);
  assert.doesNotMatch(error.message, /postgresql:|password|example\.test/iu);
}
