import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { Client } from "pg";

import { createAuth } from "../../../lib/auth";
import { replaceUserAdminAccessRoles } from "../../../lib/server/admin-access/authority-service";
import {
  type AdminAccessSessionLock,
  withAdminAccessSessionLock,
} from "../../../lib/server/admin-access/mutation-lock";
import { createDatabaseContext } from "../../../lib/server/prisma";
import {
  freezeLegacyRollbackAdminMutations,
  inspectAdmin,
  inspectAdminAccessMutationFreeze,
  inspectLegacyRollbackAdmins,
  prepareLegacyRollbackAdmins,
  provisionAdmin,
  unfreezeLegacyRollbackAdminMutations,
} from "../lib/admin";

const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");
const ADMIN_DATABASE_URL_ENV = "ADMIN_ACCESS_TEST_ADMIN_URL";
const DEFAULT_ADMIN_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DATABASE_NAME_PREFIX = "zoom_admin_access_test_";
const ADMIN_ACCESS_MIGRATION = "20260827150000_add_admin_access_roles";
const ADMIN_ACCESS_CAS_FIX_MIGRATION =
  "20260828120000_separate_admin_access_cas_revisions";
const ADMIN_ACCESS_FREEZE_MIGRATION =
  "20260828180000_add_admin_access_mutation_freeze";
const ADMIN_ACCESS_SINGLE_ROLE_MIGRATION =
  "20260828210000_enforce_single_admin_access_role";
const RESERVATION_BOOKINGS_MIGRATION =
  "20260830120000_add_reservation_bookings";
const MIGRATIONS_BEFORE_ADMIN_ACCESS = [
  "20260623105657_init",
  "20260804090000_add_site_settings",
  "20260804150000_add_zoom_virtual_agent_web_tag",
  "20260805040000_split_phone_and_chat_settings",
  "20260816090000_add_site_maintenance_settings",
] as const;

test("fresh database applies and reapplies the complete migration chain", async () => {
  await withIsolatedDatabase(async (databaseUrl) => {
    runPrismaMigrateDeploy(databaseUrl);
    runPrismaMigrateDeploy(databaseUrl);

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const migrations = await client.query<{ migration_name: string }>(
        `SELECT migration_name
         FROM "_prisma_migrations"
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         ORDER BY started_at`,
      );
      assert.equal(migrations.rowCount, 11);
      assert.equal(
        migrations.rows.at(-1)?.migration_name,
        RESERVATION_BOOKINGS_MIGRATION,
      );
      const developerApiColumns = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'site_developer_api_settings'
          AND column_name IN ('clientSecretEncrypted', 'secretTokenEncrypted')
        ORDER BY column_name
      `);
      assert.deepEqual(
        developerApiColumns.rows.map(({ column_name }) => column_name),
        ["clientSecretEncrypted", "secretTokenEncrypted"],
      );
      const reservationColumns = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'reservation_bookings'
        ORDER BY ordinal_position
      `);
      assert.deepEqual(
        reservationColumns.rows.map(({ column_name }) => column_name),
        ["id", "serviceKey", "reservationDate", "startMinute", "isDemo", "createdAt"],
      );
      await assertSystemRoles(client);
      await assertAssignmentRevisionTriggerState(client, false);
      await assertSingleRoleUniqueIndexState(client, true);

      const roleRevisions = await readRoleRevisions(client);
      await insertUser(client, "fresh-admin", "fresh-admin@example.test", "admin");
      await insertUser(client, "fresh-user", "fresh-user@example.test", "user");
      assert.deepEqual(await readAssignments(client), [
        { roleId: "system-full-access", userId: "fresh-admin" },
        { roleId: "system-no-access", userId: "fresh-user" },
      ]);
      await assert.rejects(
        client.query(
          `INSERT INTO admin_access_role_assignments ("userId", "roleId")
           VALUES ('fresh-user', 'system-full-access')`,
        ),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, "23505");
          return true;
        },
      );
      assert.deepEqual(await readAssignments(client), [
        { roleId: "system-full-access", userId: "fresh-admin" },
        { roleId: "system-no-access", userId: "fresh-user" },
      ]);
      await assert.rejects(
        client.query(
          `DELETE FROM admin_access_role_assignments
           WHERE "userId" = 'fresh-user'`,
        ),
        /Every user must retain exactly one access role assignment/,
      );
      assert.deepEqual(await readAssignments(client), [
        { roleId: "system-full-access", userId: "fresh-admin" },
        { roleId: "system-no-access", userId: "fresh-user" },
      ]);
      await assert.rejects(
        client.query("TRUNCATE admin_access_role_assignments"),
        /Administrative access role assignments cannot be truncated/,
      );
      assert.deepEqual(await readAssignments(client), [
        { roleId: "system-full-access", userId: "fresh-admin" },
        { roleId: "system-no-access", userId: "fresh-user" },
      ]);
      assert.deepEqual(await readRoleRevisions(client), roleRevisions);
    } finally {
      await client.end();
    }
  });
});

test("upgrade migration backfills existing users and enables insert triggers", async () => {
  await withIsolatedDatabase(async (databaseUrl) => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      for (const migration of MIGRATIONS_BEFORE_ADMIN_ACCESS) {
        await client.query(readMigration(migration));
      }
      await insertUser(client, "legacy-admin", "legacy-admin@example.test", "admin");
      await insertUser(client, "legacy-user", "legacy-user@example.test", "user");

      await client.query(readMigration(ADMIN_ACCESS_MIGRATION));
      await assertSystemRoles(client);
      await assertAssignmentRevisionTriggerState(client, true);
      assert.deepEqual(await readAssignments(client), [
        { roleId: "system-full-access", userId: "legacy-admin" },
        { roleId: "system-no-access", userId: "legacy-user" },
      ]);

      await client.query(readMigration(ADMIN_ACCESS_CAS_FIX_MIGRATION));
      await client.query(readMigration(ADMIN_ACCESS_FREEZE_MIGRATION));
      await client.query(readMigration(ADMIN_ACCESS_SINGLE_ROLE_MIGRATION));
      await assertAssignmentRevisionTriggerState(client, false);
      await assertSingleRoleUniqueIndexState(client, true);
      const freezeState = await client.query<{
        frozen: boolean;
        freezeId: string | null;
      }>(
        `SELECT frozen, "freezeId"
         FROM admin_access_mutation_state
         WHERE id = 'global'`,
      );
      assert.deepEqual(freezeState.rows, [{ frozen: false, freezeId: null }]);
      const roleRevisions = await readRoleRevisions(client);
      await insertUser(client, "post-admin", "post-admin@example.test", "admin");
      await insertUser(client, "post-user", "post-user@example.test", "user");
      assert.deepEqual(await readAssignments(client), [
        { roleId: "system-full-access", userId: "legacy-admin" },
        { roleId: "system-no-access", userId: "legacy-user" },
        { roleId: "system-full-access", userId: "post-admin" },
        { roleId: "system-no-access", userId: "post-user" },
      ]);
      assert.deepEqual(await readRoleRevisions(client), roleRevisions);
    } finally {
      await client.end();
    }
  });
});

test("single-role migration preserves invalid legacy rows until explicit repair", async () => {
  await withIsolatedDatabase(async (databaseUrl) => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      for (const migration of MIGRATIONS_BEFORE_ADMIN_ACCESS) {
        await client.query(readMigration(migration));
      }
      await client.query(readMigration(ADMIN_ACCESS_MIGRATION));
      await client.query(readMigration(ADMIN_ACCESS_CAS_FIX_MIGRATION));
      await client.query(readMigration(ADMIN_ACCESS_FREEZE_MIGRATION));
      await client.query(
        `INSERT INTO admin_access_roles
           (id, name, "nameKey", description, "systemKey")
         VALUES ('legacy-custom', 'Legacy Custom', 'legacy custom', NULL, NULL)`,
      );
      await insertUser(
        client,
        "duplicate-assignment-user",
        "duplicate-assignment-user@example.test",
        "admin",
      );
      await insertUser(
        client,
        "missing-assignment-user",
        "missing-assignment-user@example.test",
        "user",
      );
      await client.query(
        `INSERT INTO admin_access_role_assignments ("userId", "roleId")
         VALUES ('duplicate-assignment-user', 'legacy-custom')`,
      );
      await client.query(
        `DELETE FROM admin_access_role_assignments
         WHERE "userId" = 'missing-assignment-user'`,
      );

      const invalidAssignments = await readAssignments(client);
      await assert.rejects(
        client.query(readMigration(ADMIN_ACCESS_SINGLE_ROLE_MIGRATION)),
        /Cannot enforce exactly one access role per user/,
      );
      await client.query("ROLLBACK");
      assert.deepEqual(await readAssignments(client), invalidAssignments);
      await assertSingleRoleUniqueIndexState(client, false);

      await client.query(
        `DELETE FROM admin_access_role_assignments
         WHERE "userId" = 'duplicate-assignment-user'
           AND "roleId" = 'legacy-custom'`,
      );
      await client.query(
        `INSERT INTO admin_access_role_assignments ("userId", "roleId")
         VALUES ('missing-assignment-user', 'system-no-access')`,
      );
      await client.query(readMigration(ADMIN_ACCESS_SINGLE_ROLE_MIGRATION));
      await assertSingleRoleUniqueIndexState(client, true);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  });
});

test("single-role migration waits for direct writers and rechecks cardinality", async () => {
  await withIsolatedDatabase(async (databaseUrl) => {
    const migrator = new Client({ connectionString: databaseUrl });
    const writer = new Client({ connectionString: databaseUrl });
    await migrator.connect();
    await writer.connect();
    try {
      for (const migration of MIGRATIONS_BEFORE_ADMIN_ACCESS) {
        await migrator.query(readMigration(migration));
      }
      await migrator.query(readMigration(ADMIN_ACCESS_MIGRATION));
      await migrator.query(readMigration(ADMIN_ACCESS_CAS_FIX_MIGRATION));
      await migrator.query(readMigration(ADMIN_ACCESS_FREEZE_MIGRATION));
      await insertUser(
        migrator,
        "concurrent-delete-user",
        "concurrent-delete-user@example.test",
        "user",
      );

      await writer.query("BEGIN");
      await writer.query(
        `DELETE FROM admin_access_role_assignments
         WHERE "userId" = 'concurrent-delete-user'`,
      );

      const migration = migrator.query(
        readMigration(ADMIN_ACCESS_SINGLE_ROLE_MIGRATION),
      );
      assert.equal(
        await Promise.race([
          migration.then(
            () => "settled",
            () => "settled",
          ),
          delay(100).then(() => "waiting"),
        ]),
        "waiting",
      );

      await writer.query("COMMIT");
      await assert.rejects(
        migration,
        /Cannot enforce exactly one access role per user/,
      );
      await migrator.query("ROLLBACK");

      const finalState = await migrator.query<{
        assignmentCount: number;
        userExists: boolean;
      }>(
        `SELECT
           (SELECT count(*)::integer
            FROM admin_access_role_assignments
            WHERE "userId" = 'concurrent-delete-user') AS "assignmentCount",
           EXISTS (
             SELECT 1 FROM "user" WHERE id = 'concurrent-delete-user'
           ) AS "userExists"`,
      );
      assert.deepEqual(finalState.rows, [
        { assignmentCount: 0, userExists: true },
      ]);
      await assertSingleRoleUniqueIndexState(migrator, false);
    } finally {
      await writer.query("ROLLBACK").catch(() => undefined);
      await migrator.query("ROLLBACK").catch(() => undefined);
      await writer.end();
      await migrator.end();
    }
  });
});

test("settled freeze inspection waits for commit and observes rollback", async () => {
  await withIsolatedDatabase(async (databaseUrl) => {
    runPrismaMigrateDeploy(databaseUrl);
    const blocker = new Client({ connectionString: databaseUrl });
    await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(`
        UPDATE admin_access_mutation_state
        SET frozen = true,
            "freezeId" = 'freeze-in-flight',
            "frozenAt" = CURRENT_TIMESTAMP,
            reason = 'integration commit',
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);
      const committedInspection = inspectAdminAccessMutationFreeze(databaseUrl);
      assert.equal(
        await Promise.race([
          committedInspection.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 100)),
        ]),
        "waiting",
      );
      await blocker.query("COMMIT");
      const committedState = await committedInspection;
      assert.equal(committedState.frozen, true);
      assert.equal(committedState.freezeId, "freeze-in-flight");
      assert.ok(committedState.frozenAt instanceof Date);
      assert.equal(committedState.reason, "integration commit");

      await blocker.query(`
        UPDATE admin_access_mutation_state
        SET frozen = false,
            "freezeId" = NULL,
            "frozenAt" = NULL,
            reason = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);
      await blocker.query("BEGIN");
      await blocker.query(`
        UPDATE admin_access_mutation_state
        SET frozen = true,
            "freezeId" = 'freeze-rolled-back',
            "frozenAt" = CURRENT_TIMESTAMP,
            reason = 'integration rollback',
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);
      const rolledBackInspection = inspectAdminAccessMutationFreeze(databaseUrl);
      assert.equal(
        await Promise.race([
          rolledBackInspection.then(() => "settled"),
          new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 100)),
        ]),
        "waiting",
      );
      await blocker.query("ROLLBACK");
      assert.deepEqual(await rolledBackInspection, {
        frozen: false,
        freezeId: null,
        frozenAt: null,
        reason: null,
      });

      await blocker.query("BEGIN");
      await blocker.query(`
        UPDATE admin_access_mutation_state
        SET "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);
      await assert.rejects(
        inspectAdminAccessMutationFreeze(databaseUrl),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            error.message,
            "Administrative mutation freeze state could not be settled safely; recovery is blocked.",
          );
          assert.doesNotMatch(error.message, /postgres|password|freeze-timeout-secret/i);
          return true;
        },
      );
      await blocker.query("ROLLBACK");
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await blocker.end();
    }
  });
});

test("ADM-LOGIN-01..07 seed admin login bootstrap CLI is safe and recoverable", async (context) => {
  await withIsolatedDatabase(async (databaseUrl) => {
    runPrismaMigrateDeploy(databaseUrl);
    const seed = {
      email: "seed-login-admin@example.test",
      name: "Seed Login Admin",
      password: "seed-login-old-password-1",
    };
    const resetPassword = "seed-login-new-password-2";
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      await context.test("ADM-LOGIN-01 check classifies state without writing", async () => {
        const beforeMissing = await readSeedAdminToolSnapshot(client, seed.email);
        const missing = runCheckSeedAdmin(databaseUrl, seed.email);
        assert.equal(missing.status, 0, missing.stderr);
        assert.deepEqual(JSON.parse(missing.stdout), {
          email: seed.email,
          status: "MISSING",
          credentialPresent: false,
          role: null,
          banned: false,
          mustChangePassword: false,
          accessRoleIds: [],
        });
        assert.deepEqual(
          await readSeedAdminToolSnapshot(client, seed.email),
          beforeMissing,
        );
      });

      await context.test("ADM-LOGIN-02 missing state converges through the existing seed", async () => {
        runSeedAdmin(databaseUrl, seed, true);
        const beforeStandardCheck = await readSeedAdminToolSnapshot(
          client,
          seed.email,
        );
        const standard = runCheckSeedAdmin(databaseUrl, seed.email);
        assert.equal(standard.status, 0, standard.stderr);
        assert.deepEqual(JSON.parse(standard.stdout), {
          email: seed.email,
          status: "PRESENT_STANDARD",
          credentialPresent: true,
          role: "admin",
          banned: false,
          mustChangePassword: false,
          accessRoleIds: ["system-full-access"],
        });
        assert.deepEqual(
          await readSeedAdminToolSnapshot(client, seed.email),
          beforeStandardCheck,
        );
      });

      await context.test("ADM-LOGIN-03 existing nonstandard state remains read-only", async () => {
        const user = await client.query<{ id: string }>(
          `SELECT id FROM "user" WHERE email = $1`,
          [seed.email],
        );
        const userId = user.rows[0]?.id;
        assert.ok(userId);
        await client.query(
          `INSERT INTO admin_access_roles
             (id, name, "nameKey", description, "systemKey")
           VALUES ('seed-login-custom', 'Seed Login Custom', 'seed login custom', NULL, NULL)`,
        );
        await replaceAssignment(client, userId, "seed-login-custom");
        await client.query(
          `UPDATE "user"
           SET role = 'user',
               banned = true,
               "mustChangePassword" = true,
               "temporaryPasswordIssuedAt" = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [userId],
        );
        await client.query(
          `INSERT INTO session
             (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
           VALUES
             ('seed-login-session-1', CURRENT_TIMESTAMP + INTERVAL '1 hour', 'seed-login-token-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $1),
             ('seed-login-session-2', CURRENT_TIMESTAMP + INTERVAL '1 hour', 'seed-login-token-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $1)`,
          [userId],
        );

        const beforeCheck = await readSeedAdminToolSnapshot(client, seed.email);
        const nonstandard = runCheckSeedAdmin(databaseUrl, seed.email);
        assert.equal(nonstandard.status, 0, nonstandard.stderr);
        assert.deepEqual(JSON.parse(nonstandard.stdout), {
          email: seed.email,
          status: "PRESENT_NONSTANDARD",
          credentialPresent: true,
          role: "user",
          banned: true,
          mustChangePassword: true,
          accessRoleIds: ["seed-login-custom"],
        });
        assert.deepEqual(
          await readSeedAdminToolSnapshot(client, seed.email),
          beforeCheck,
        );
      });

      await context.test("ADM-LOGIN-05 reset guards fail without changing data", async () => {
        const beforeGuards = await readSeedAdminToolSnapshot(client, seed.email);
        const missingEmail = "missing-seed-admin@example.test";
        const missingBeforeGuards = await readSeedAdminToolSnapshot(
          client,
          missingEmail,
        );
        const guardCases = [
          runResetSeedAdmin(databaseUrl, seed.email, resetPassword, {
            confirmation: false,
          }),
          runResetSeedAdmin(databaseUrl, seed.email, resetPassword, {
            nodeEnv: "production",
          }),
          runResetSeedAdmin(
            "postgresql://remote-user:remote-secret@example.test/remote-db",
            seed.email,
            resetPassword,
          ),
          runResetSeedAdmin(
            databaseUrl,
            missingEmail,
            resetPassword,
          ),
        ];
        for (const result of guardCases) {
          assert.notEqual(result.status, 0, "Reset guard unexpectedly succeeded.");
          assertSecretFree(result, [resetPassword, databaseUrl, "remote-secret"]);
        }
        assert.deepEqual(
          await readSeedAdminToolSnapshot(client, seed.email),
          beforeGuards,
        );
        assert.deepEqual(
          await readSeedAdminToolSnapshot(client, missingEmail),
          missingBeforeGuards,
        );
      });

      await context.test("ADM-LOGIN-06 reset changes only credential lifecycle state", async () => {
        const beforeReset = await readSeedAdminToolSnapshot(client, seed.email);
        const reset = runResetSeedAdmin(
          databaseUrl,
          seed.email,
          resetPassword,
        );
        assert.equal(reset.status, 0, reset.stderr);
        assert.match(reset.stdout, new RegExp(seed.email, "u"));
        assertSecretFree(reset, [resetPassword, databaseUrl]);

        const afterReset = await readSeedAdminToolSnapshot(client, seed.email);
        assert.equal(afterReset.users.length, 1);
        assert.equal(afterReset.users[0]?.role, beforeReset.users[0]?.role);
        assert.equal(afterReset.users[0]?.banned, beforeReset.users[0]?.banned);
        assert.equal(afterReset.users[0]?.name, beforeReset.users[0]?.name);
        assert.deepEqual(afterReset.assignments, beforeReset.assignments);
        assert.equal(afterReset.sessions.length, 0);
        assert.equal(afterReset.users[0]?.mustChangePassword, false);
        assert.equal(afterReset.users[0]?.temporaryPasswordIssuedAt, null);
        assert.notEqual(
          afterReset.users[0]?.passwordChangedAt?.toISOString(),
          beforeReset.users[0]?.passwordChangedAt?.toISOString(),
        );
        assert.equal(afterReset.credentials.length, 1);
        assert.notEqual(
          afterReset.credentials[0]?.password,
          beforeReset.credentials[0]?.password,
        );

        await client.query(
          `DELETE FROM account
           WHERE "userId" = $1 AND "providerId" = 'credential'`,
          [afterReset.users[0]?.id],
        );
        const withoutCredential = runCheckSeedAdmin(databaseUrl, seed.email);
        assert.equal(withoutCredential.status, 0, withoutCredential.stderr);
        assert.equal(
          JSON.parse(withoutCredential.stdout).credentialPresent,
          false,
        );
        assert.equal(
          JSON.parse(withoutCredential.stdout).status,
          "PRESENT_NONSTANDARD",
        );
        const recreateCredential = runResetSeedAdmin(
          databaseUrl,
          seed.email,
          resetPassword,
        );
        assert.equal(recreateCredential.status, 0, recreateCredential.stderr);
        const afterCredentialRecreate = await readSeedAdminToolSnapshot(
          client,
          seed.email,
        );
        assert.equal(afterCredentialRecreate.credentials.length, 1);
      });

      await context.test("ADM-LOGIN-04 reset password authenticates with Better Auth", async () => {
        await client.query(
          `UPDATE "user" SET banned = false WHERE email = $1`,
          [seed.email],
        );
        const database = createDatabaseContext({
          NODE_ENV: "development",
          DATABASE_URL: databaseUrl,
        });
        try {
          const auth = createAuth(database.prisma, {
            baseURL: "http://localhost:3000",
            env: { NODE_ENV: "development" },
          });
          await assert.rejects(
            auth.api.signInEmail({
              body: { email: seed.email, password: seed.password },
            }),
          );
          const signedIn = await auth.api.signInEmail({
            body: { email: seed.email, password: resetPassword },
          });
          assert.equal(signedIn.user.email, seed.email);
        } finally {
          await database.close();
        }
      });

      await context.test("ADM-LOGIN-07 command output never reveals secrets", () => {
        const check = runCheckSeedAdmin(databaseUrl, seed.email);
        assert.equal(check.status, 0, check.stderr);
        assertSecretFree(check, [seed.password, resetPassword, databaseUrl]);
        assert.doesNotMatch(
          check.stdout,
          /passwordHash|credentialHash|sessionToken/iu,
        );
      });
    } finally {
      await client.end();
    }
  });
});

test("seed, provisioning, and legacy rollback preparation converge atomically", async () => {
  await withIsolatedDatabase(async (databaseUrl) => {
    runPrismaMigrateDeploy(databaseUrl);
    const seed = {
      email: "seed-admin@example.test",
      name: "Seed Recovery Admin",
      password: "seed-integration-password-1",
    };
    runSeedAdmin(databaseUrl, seed, true);

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO admin_access_roles
           (id, name, "nameKey", description, "systemKey")
         VALUES
           ('custom-limited', 'Custom Limited', 'custom limited', NULL, NULL),
           ('custom-deny', 'Custom Deny', 'custom deny', NULL, NULL),
           ('custom-drift', 'Custom Drift', 'custom drift', NULL, NULL)`,
      );
      await client.query(
        `INSERT INTO admin_access_role_permissions
           ("roleId", "resourceKey", action, effect)
         VALUES ('custom-deny', 'phone-settings', 'UPDATE', 'DENY')`,
      );
      const seedUser = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE email = $1`,
        [seed.email],
      );
      const seedUserId = seedUser.rows[0]?.id;
      assert.ok(seedUserId);

      await insertUser(
        client,
        "assignment-target",
        "assignment-target@example.test",
        "user",
      );
      const assignmentTargetBefore = await readUserAccess(
        client,
        "assignment-target",
      );
      const roleRevisionsBeforeAssignment = await readRoleRevisions(client);
      const database = createDatabaseContext({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
      });
      try {
        assert.deepEqual(
          await replaceUserAdminAccessRoles(
            database.prisma,
            seedUserId,
            "assignment-target",
            ["custom-limited"],
            assignmentTargetBefore.adminAccessRoleRevision,
          ),
          {
            assignmentRevision:
              assignmentTargetBefore.adminAccessRoleRevision + 1,
            roleIds: ["custom-limited"],
          },
        );
      } finally {
        await database.close();
      }
      const assignmentTargetAfter = await readUserAccess(
        client,
        "assignment-target",
      );
      assert.equal(
        assignmentTargetAfter.adminAccessRoleRevision,
        assignmentTargetBefore.adminAccessRoleRevision + 1,
      );
      assert.deepEqual(assignmentTargetAfter.roleIds, ["custom-limited"]);
      assert.deepEqual(
        await readRoleRevisions(client),
        roleRevisionsBeforeAssignment,
      );

      let blockedMutation:
        | ReturnType<typeof replaceUserAdminAccessRoles>
        | undefined;
      let blockedMutationSettled = false;
      const contentionDatabase = createDatabaseContext({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
      });
      try {
        await withAdminAccessSessionLock(databaseUrl, async () => {
          blockedMutation = replaceUserAdminAccessRoles(
            contentionDatabase.prisma,
            seedUserId,
            "assignment-target",
            ["system-no-access"],
            assignmentTargetAfter.adminAccessRoleRevision,
          );
          void blockedMutation.finally(() => {
            blockedMutationSettled = true;
          });
          await delay(100);
          assert.equal(blockedMutationSettled, false);
        });
        assert.ok(blockedMutation);
        assert.deepEqual(await blockedMutation, {
          assignmentRevision: assignmentTargetAfter.adminAccessRoleRevision + 1,
          roleIds: ["system-no-access"],
        });
      } finally {
        await contentionDatabase.close();
      }

      await assert.rejects(
        withAdminAccessSessionLock(databaseUrl, async () => {
          throw new Error("simulated rollback failure");
        }),
        /simulated rollback failure/,
      );
      let staleSessionLock: AdminAccessSessionLock | undefined;
      await withAdminAccessSessionLock(databaseUrl, async (lock) => {
        staleSessionLock = lock;
      });
      await assert.rejects(
        freezeLegacyRollbackAdminMutations(
          databaseUrl,
          staleSessionLock!,
          "stale lock must fail",
        ),
        /session lock is no longer active/,
      );
      const afterFailureDatabase = createDatabaseContext({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
      });
      try {
        assert.deepEqual(
          await replaceUserAdminAccessRoles(
            afterFailureDatabase.prisma,
            seedUserId,
            "assignment-target",
            ["custom-limited"],
            assignmentTargetAfter.adminAccessRoleRevision + 1,
          ),
          {
            assignmentRevision: assignmentTargetAfter.adminAccessRoleRevision + 2,
            roleIds: ["custom-limited"],
          },
        );
      } finally {
        await afterFailureDatabase.close();
      }

      let durableFreezeId = "";
      await assert.rejects(
        withAdminAccessSessionLock(databaseUrl, async (lock) => {
          durableFreezeId = await freezeLegacyRollbackAdminMutations(
            databaseUrl,
            lock,
            "simulated failed rollback",
          );
          throw new Error("simulated operation failure after freeze");
        }),
        /simulated operation failure after freeze/,
      );
      assert.ok(durableFreezeId);
      const frozenMutationDatabase = createDatabaseContext({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
      });
      try {
        await assert.rejects(
          replaceUserAdminAccessRoles(
            frozenMutationDatabase.prisma,
            seedUserId,
            "assignment-target",
            ["system-no-access"],
            assignmentTargetAfter.adminAccessRoleRevision + 2,
          ),
          /mutations are frozen/,
        );
      } finally {
        await frozenMutationDatabase.close();
      }
      await withAdminAccessSessionLock(databaseUrl, async (lock) => {
        await assert.rejects(
          unfreezeLegacyRollbackAdminMutations(
            databaseUrl,
            lock,
            "stale-freeze-id",
          ),
          /freeze changed after review/,
        );
        await unfreezeLegacyRollbackAdminMutations(
          databaseUrl,
          lock,
          durableFreezeId,
        );
      });

      await client.query(
        `DELETE FROM admin_access_mutation_state WHERE id = 'global'`,
      );
      const missingStateDatabase = createDatabaseContext({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
      });
      try {
        await assert.rejects(
          replaceUserAdminAccessRoles(
            missingStateDatabase.prisma,
            seedUserId,
            "assignment-target",
            ["system-no-access"],
            assignmentTargetAfter.adminAccessRoleRevision + 2,
          ),
          /freeze state is missing/,
        );
      } finally {
        await missingStateDatabase.close();
      }
      await client.query(
        `INSERT INTO admin_access_mutation_state (id) VALUES ('global')`,
      );

      await assert.rejects(
        withAdminAccessSessionLock(
          "postgresql://postgres:postgres@local-pooler.example.test/database",
          async () => undefined,
        ),
        /unpooled PostgreSQL connection/,
      );

      await client.query("BEGIN");
      try {
        await client.query(
          `UPDATE "user"
           SET name = 'Must remain on failed seed', role = 'user', banned = true,
               "mustChangePassword" = true,
               "temporaryPasswordIssuedAt" = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [seedUserId],
        );
        await client.query(
          `DELETE FROM admin_access_role_assignments WHERE "userId" = $1`,
          [seedUserId],
        );
        await client.query(
          `INSERT INTO admin_access_role_assignments ("userId", "roleId")
           VALUES ($1, 'custom-limited')`,
          [seedUserId],
        );
        await client.query(
          `UPDATE admin_access_roles SET "systemKey" = NULL
           WHERE id = 'system-full-access'`,
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      runSeedAdmin(databaseUrl, seed, false);
      const unchanged = await readUserAccess(client, seedUserId);
      assert.equal(unchanged.name, "Must remain on failed seed");
      assert.equal(unchanged.role, "user");
      assert.equal(unchanged.banned, true);
      assert.equal(unchanged.mustChangePassword, true);
      assert.deepEqual(unchanged.roleIds, ["custom-limited"]);

      await client.query(
        `UPDATE admin_access_roles SET "systemKey" = 'FULL_ACCESS'
         WHERE id = 'system-full-access'`,
      );
      runSeedAdmin(databaseUrl, seed, true);
      const convergedSeed = await readUserAccess(client, seedUserId);
      assert.equal(convergedSeed.name, seed.name);
      assert.equal(convergedSeed.role, "admin");
      assert.equal(convergedSeed.banned, false);
      assert.equal(convergedSeed.mustChangePassword, false);
      assert.equal(convergedSeed.temporaryPasswordIssuedAt, null);
      assert.deepEqual(convergedSeed.roleIds, ["system-full-access"]);

      const provisionInput = {
        email: "provisioned-admin@example.test",
        name: "Provisioned Admin",
        password: "provision-integration-password-1",
      };
      const missing = await inspectAdmin(databaseUrl, provisionInput.email);
      assert.equal(
        await provisionAdmin(databaseUrl, provisionInput, missing),
        "created",
      );
      const provisioned = await inspectAdmin(databaseUrl, provisionInput.email);
      assert.deepEqual(provisioned.accessRoleIds, ["system-full-access"]);

      await client.query(
        `UPDATE "user" SET name = 'Changed after preview' WHERE id = $1`,
        [provisioned.id],
      );
      await assert.rejects(
        provisionAdmin(
          databaseUrl,
          { ...provisionInput, name: "Must not apply" },
          provisioned,
        ),
        /state changed after review/,
      );
      const afterRejectedProvision = await readUserAccess(
        client,
        provisioned.id!,
      );
      assert.equal(afterRejectedProvision.name, "Changed after preview");

      await insertUser(
        client,
        "limited-admin",
        "limited-admin@example.test",
        "admin",
      );
      await replaceAssignment(client, "limited-admin", "custom-limited");
      await client.query(
        `INSERT INTO session
           (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
         VALUES
           ('limited-session', CURRENT_TIMESTAMP + INTERVAL '1 hour',
            'limited-session-token', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
            'limited-admin')`,
      );

      await insertUser(
        client,
        "denied-full-admin",
        "denied-full-admin@example.test",
        "admin",
      );
      await replaceAssignment(client, "denied-full-admin", "custom-deny");
      await client.query(
        `INSERT INTO session
           (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
         VALUES
           ('denied-full-session', CURRENT_TIMESTAMP + INTERVAL '1 hour',
            'denied-full-session-token', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
            'denied-full-admin')`,
      );

      const rollbackPlan = await inspectLegacyRollbackAdmins(databaseUrl);
      assert.equal(
        rollbackPlan.admins.find(({ id }) => id === "limited-admin")
          ?.hasFullAccess,
        false,
      );
      assert.deepEqual(
        rollbackPlan.admins.find(({ id }) => id === "denied-full-admin"),
        {
          id: "denied-full-admin",
          email: "denied-full-admin@example.test",
          name: "denied-full-admin",
          banned: null,
          mustChangePassword: false,
          adminAccessRoleRevision: 1,
          hasCredential: false,
          accessRoleIds: ["custom-deny"],
          hasFullAccess: false,
          customDenyPermissions: [
            {
              roleId: "custom-deny",
              resourceKey: "phone-settings",
              action: "UPDATE",
            },
          ],
        },
      );
      assert.deepEqual(
        await withAdminAccessSessionLock(databaseUrl, (lock) =>
          withTestFreeze(databaseUrl, lock, (freezeId) =>
            prepareLegacyRollbackAdmins(
              databaseUrl,
              rollbackPlan,
              lock,
              freezeId,
            ),
          ),
        ),
        { demotedCount: 2, revokedSessionCount: 2 },
      );
      const demoted = await client.query<{ id: string; role: string }>(
        `SELECT id, role
         FROM "user"
         WHERE id IN ('limited-admin', 'denied-full-admin')
         ORDER BY id`,
      );
      assert.deepEqual(demoted.rows, [
        { id: "denied-full-admin", role: "user" },
        { id: "limited-admin", role: "user" },
      ]);
      const sessions = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM session
         WHERE "userId" IN ('limited-admin', 'denied-full-admin')`,
      );
      assert.equal(sessions.rows[0]?.count, "0");

      await insertUser(
        client,
        "stale-admin",
        "stale-admin@example.test",
        "admin",
      );
      await replaceAssignment(client, "stale-admin", "custom-drift");
      const staleRollbackPlan = await inspectLegacyRollbackAdmins(databaseUrl);
      assert.deepEqual(
        staleRollbackPlan.admins.find(({ id }) => id === "stale-admin")
          ?.customDenyPermissions,
        [],
      );
      await client.query(
        `INSERT INTO admin_access_role_permissions
           ("roleId", "resourceKey", action, effect)
         VALUES ('custom-drift', 'chat-settings', 'UPDATE', 'DENY')`,
      );
      await assert.rejects(
        withAdminAccessSessionLock(databaseUrl, (lock) =>
          withTestFreeze(databaseUrl, lock, (freezeId) =>
            prepareLegacyRollbackAdmins(
              databaseUrl,
              staleRollbackPlan,
              lock,
              freezeId,
            ),
          ),
        ),
        /state changed after rollback preview/,
      );
      const stale = await client.query<{ role: string }>(
        `SELECT role FROM "user" WHERE id = 'stale-admin'`,
      );
      assert.deepEqual(stale.rows[0], { role: "admin" });

      const deniedRecoveryInput = {
        email: "denied-recovery@example.test",
        name: "Denied Recovery",
        password: "denied-recovery-password-1",
      };
      assert.equal(
        await provisionAdmin(
          databaseUrl,
          deniedRecoveryInput,
          await inspectAdmin(databaseUrl, deniedRecoveryInput.email),
        ),
        "created",
      );
      const deniedRecovery = await inspectAdmin(
        databaseUrl,
        deniedRecoveryInput.email,
      );
      assert.ok(deniedRecovery.id);
      await replaceAssignment(client, deniedRecovery.id, "custom-deny");
      await client.query(
        `UPDATE "user" SET role = 'user'
         WHERE role = 'admin' AND id <> $1`,
        [deniedRecovery.id],
      );
      const deniedOnlyPlan = await inspectLegacyRollbackAdmins(databaseUrl);
      assert.equal(deniedOnlyPlan.admins.length, 1);
      assert.equal(deniedOnlyPlan.admins[0]?.hasCredential, true);
      assert.equal(deniedOnlyPlan.admins[0]?.banned, false);
      assert.equal(deniedOnlyPlan.admins[0]?.mustChangePassword, false);
      assert.equal(deniedOnlyPlan.admins[0]?.hasFullAccess, false);
      assert.equal(deniedOnlyPlan.admins[0]?.customDenyPermissions.length, 1);
      await assert.rejects(
        withAdminAccessSessionLock(databaseUrl, (lock) =>
          withTestFreeze(databaseUrl, lock, (freezeId) =>
            prepareLegacyRollbackAdmins(
              databaseUrl,
              deniedOnlyPlan,
              lock,
              freezeId,
            ),
          ),
        ),
        /without custom DENY permissions/,
      );
      const retainedDeniedRecovery = await client.query<{ role: string }>(
        `SELECT role FROM "user" WHERE id = $1`,
        [deniedRecovery.id],
      );
      assert.deepEqual(retainedDeniedRecovery.rows[0], { role: "admin" });
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
  assert.match(databaseName, /^zoom_admin_access_test_[0-9a-f]{16}$/u);
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
  if (!/^zoom_admin_access_test_[0-9a-f]{16}$/u.test(databaseName)) {
    throw new Error("Refusing to use an unrecognized integration-test database name.");
  }
  return `"${databaseName}"`;
}

function runPrismaMigrateDeploy(databaseUrl: string): void {
  const result = spawnSync(
    "npm",
    ["exec", "--", "prisma", "migrate", "deploy"],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DATABASE_URL_UNPOOLED: databaseUrl,
      },
      timeout: 120_000,
    },
  );
  assert.equal(
    result.status,
    0,
    `Prisma migrate deploy failed:\n${result.stdout}\n${result.stderr}`,
  );
}

function runSeedAdmin(
  databaseUrl: string,
  seed: { email: string; name: string; password: string },
  expectSuccess: boolean,
): void {
  const result = spawnSync("npm", ["run", "db:seed-admin"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
      BETTER_AUTH_URL: "http://localhost:3000",
      SEED_ADMIN_EMAIL: seed.email,
      SEED_ADMIN_NAME: seed.name,
      SEED_ADMIN_PASSWORD: seed.password,
    },
    timeout: 120_000,
  });
  if (expectSuccess) {
    assert.equal(
      result.status,
      0,
      `Admin seed failed:\n${result.stdout}\n${result.stderr}`,
    );
  } else {
    assert.notEqual(result.status, 0, "Admin seed unexpectedly succeeded.");
  }
}

type SeedAdminCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function runCheckSeedAdmin(
  databaseUrl: string,
  email: string,
): SeedAdminCommandResult {
  const result = spawnSync(
    "npm",
    ["run", "--silent", "db:check-seed-admin"],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: databaseUrl,
        DATABASE_URL_UNPOOLED: databaseUrl,
        SEED_ADMIN_EMAIL: email,
      },
      timeout: 120_000,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function runResetSeedAdmin(
  databaseUrl: string,
  email: string,
  password: string,
  options: {
    confirmation?: boolean;
    nodeEnv?: "development" | "production" | "test";
  } = {},
): SeedAdminCommandResult {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: options.nodeEnv ?? "development",
    DATABASE_URL: databaseUrl,
    DATABASE_URL_UNPOOLED: databaseUrl,
    SEED_ADMIN_EMAIL: email,
    SEED_ADMIN_PASSWORD: password,
  };
  if (options.confirmation === false) {
    delete environment.CONFIRM_LOCAL_SEED_ADMIN_PASSWORD_RESET;
  } else {
    environment.CONFIRM_LOCAL_SEED_ADMIN_PASSWORD_RESET = "1";
  }
  const result = spawnSync(
    "npm",
    ["run", "--silent", "db:reset-seed-admin-password"],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: environment,
      timeout: 120_000,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

async function readSeedAdminToolSnapshot(client: Client, email: string) {
  const users = await client.query<{
    id: string;
    name: string;
    role: string | null;
    banned: boolean | null;
    mustChangePassword: boolean;
    temporaryPasswordIssuedAt: Date | null;
    passwordChangedAt: Date | null;
  }>(
    `SELECT id, name, role, banned,
            "mustChangePassword",
            "temporaryPasswordIssuedAt",
            "passwordChangedAt"
     FROM "user"
     WHERE email = $1
     ORDER BY id`,
    [email],
  );
  const userIds = users.rows.map(({ id }) => id);
  const credentials = await client.query<{
    id: string;
    password: string | null;
  }>(
    `SELECT id, password
     FROM account
     WHERE "userId" = ANY($1::text[]) AND "providerId" = 'credential'
     ORDER BY id`,
    [userIds],
  );
  const sessions = await client.query<{ id: string; token: string }>(
    `SELECT id, token
     FROM session
     WHERE "userId" = ANY($1::text[])
     ORDER BY id`,
    [userIds],
  );
  const assignments = await client.query<{ roleId: string; userId: string }>(
    `SELECT "roleId", "userId"
     FROM admin_access_role_assignments
     WHERE "userId" = ANY($1::text[])
     ORDER BY "userId", "roleId"`,
    [userIds],
  );
  return {
    users: users.rows,
    credentials: credentials.rows,
    sessions: sessions.rows,
    assignments: assignments.rows,
  };
}

function assertSecretFree(
  result: SeedAdminCommandResult,
  secrets: string[],
): void {
  const output = `${result.stdout}\n${result.stderr}`;
  for (const secret of secrets) {
    assert.ok(secret);
    assert.doesNotMatch(output, new RegExp(escapeRegExp(secret), "u"));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
  role: "admin" | "user",
): Promise<void> {
  await client.query(
    `INSERT INTO "user"
       (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
     VALUES ($1, $2, $3, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)`,
    [id, id, email, role],
  );
}

async function replaceAssignment(
  client: Client,
  userId: string,
  roleId: string,
): Promise<void> {
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function withTestFreeze<T>(
  databaseUrl: string,
  lock: Parameters<typeof freezeLegacyRollbackAdminMutations>[1],
  operation: (freezeId: string) => Promise<T>,
): Promise<T> {
  const freezeId = await freezeLegacyRollbackAdminMutations(
    databaseUrl,
    lock,
    "integration test",
  );
  try {
    return await operation(freezeId);
  } finally {
    await unfreezeLegacyRollbackAdminMutations(databaseUrl, lock, freezeId);
  }
}

async function assertSystemRoles(client: Client): Promise<void> {
  const roles = await client.query<{ id: string; systemKey: string }>(
    `SELECT id, "systemKey"
     FROM admin_access_roles
     WHERE "systemKey" IS NOT NULL
     ORDER BY id`,
  );
  assert.deepEqual(roles.rows, [
    { id: "system-full-access", systemKey: "FULL_ACCESS" },
    { id: "system-no-access", systemKey: "NO_ACCESS" },
  ]);
}

async function assertAssignmentRevisionTriggerState(
  client: Client,
  expectedPresent: boolean,
): Promise<void> {
  const triggers = await client.query<{ tgname: string }>(
    `SELECT tgname
     FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgname IN (
         'admin_access_role_assignment_revision',
         'user_initial_admin_access_role'
       )
     ORDER BY tgname`,
  );
  assert.deepEqual(
    triggers.rows.map(({ tgname }) => tgname),
    expectedPresent
      ? [
          "admin_access_role_assignment_revision",
          "user_initial_admin_access_role",
        ]
      : ["user_initial_admin_access_role"],
  );
  const functions = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM pg_proc
     WHERE proname = 'bump_admin_access_role_revision'
       AND pg_function_is_visible(oid)`,
  );
  assert.equal(functions.rows[0]?.count, expectedPresent ? "1" : "0");
}

async function assertSingleRoleUniqueIndexState(
  client: Client,
  expectedPresent: boolean,
): Promise<void> {
  const indexes = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_indexes
       WHERE schemaname = current_schema()
         AND tablename = 'admin_access_role_assignments'
         AND indexname = 'admin_access_role_assignments_userId_key'
     ) AS exists`,
  );
  assert.equal(indexes.rows[0]?.exists, expectedPresent);
}

async function readRoleRevisions(
  client: Client,
): Promise<Array<{ id: string; revision: number }>> {
  const roles = await client.query<{ id: string; revision: number }>(
    `SELECT id, revision FROM admin_access_roles ORDER BY id`,
  );
  return roles.rows;
}

async function readAssignments(
  client: Client,
): Promise<Array<{ roleId: string; userId: string }>> {
  const assignments = await client.query<{ roleId: string; userId: string }>(
    `SELECT "roleId", "userId"
     FROM admin_access_role_assignments
     ORDER BY "userId", "roleId"`,
  );
  return assignments.rows;
}

async function readUserAccess(client: Client, userId: string) {
  const user = await client.query<{
    name: string;
    role: string;
    banned: boolean | null;
    mustChangePassword: boolean;
    temporaryPasswordIssuedAt: Date | null;
    adminAccessRoleRevision: number;
    roleIds: string[];
  }>(
    `SELECT
       u.name,
       u.role,
       u.banned,
       u."mustChangePassword",
       u."temporaryPasswordIssuedAt",
       u."adminAccessRoleRevision",
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
  return user.rows[0]!;
}
