import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../prisma/migrations/20260827150000_add_admin_access_roles/migration.sql",
  import.meta.url,
);
const casFixMigrationPath = new URL(
  "../prisma/migrations/20260828120000_separate_admin_access_cas_revisions/migration.sql",
  import.meta.url,
);
const mutationFreezeMigrationPath = new URL(
  "../prisma/migrations/20260828180000_add_admin_access_mutation_freeze/migration.sql",
  import.meta.url,
);
const singleRoleMigrationPath = new URL(
  "../prisma/migrations/20260828210000_enforce_single_admin_access_role/migration.sql",
  import.meta.url,
);

test("admin access migration is additive and backfills every existing user", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /ADD COLUMN "adminAccessRoleRevision"/);
  assert.match(sql, /CREATE TABLE "admin_access_roles"/);
  assert.match(sql, /CREATE TABLE "admin_access_role_permissions"/);
  assert.match(sql, /CREATE TABLE "admin_access_role_assignments"/);
  assert.match(sql, /'system-full-access'/);
  assert.match(sql, /'system-no-access'/);
  assert.match(sql, /WHEN "role" = 'admin' THEN 'system-full-access'/);
  assert.match(sql, /ELSE 'system-no-access'/);
  assert.match(sql, /Every existing user must receive exactly one initial access role/);
  assert.match(sql, /CREATE TRIGGER "user_initial_admin_access_role"/);
  assert.match(sql, /CREATE TRIGGER "admin_access_role_assignment_revision"/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN/);
});

test("role permissions and assignments have explicit uniqueness and referential actions", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /PRIMARY KEY \("roleId", "resourceKey", "action"\)/);
  assert.match(sql, /PRIMARY KEY \("userId", "roleId"\)/);
  assert.match(sql, /ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.match(sql, /ON DELETE RESTRICT ON UPDATE CASCADE/);
  assert.match(sql, /ON DELETE SET NULL ON UPDATE CASCADE/);
});

test("follow-up migration separates role and assignment CAS revisions", async () => {
  const original = await readFile(migrationPath, "utf8");
  const fix = await readFile(casFixMigrationPath, "utf8");

  assert.match(original, /CREATE TRIGGER "admin_access_role_assignment_revision"/);
  assert.match(original, /CREATE FUNCTION "bump_admin_access_role_revision"/);
  assert.match(
    fix,
    /DROP TRIGGER "admin_access_role_assignment_revision"\s+ON "admin_access_role_assignments";/,
  );
  assert.match(fix, /DROP FUNCTION "bump_admin_access_role_revision"\(\);/);
  assert.doesNotMatch(fix, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
});

test("mutation freeze migration adds a coherent singleton without destructive changes", async () => {
  const sql = await readFile(mutationFreezeMigrationPath, "utf8");

  assert.match(sql, /CREATE TABLE "admin_access_mutation_state"/);
  assert.match(sql, /CHECK \("id" = 'global'\)/);
  assert.match(sql, /CHECK \(\s*\("frozen" AND "freezeId" IS NOT NULL/);
  assert.match(sql, /INSERT INTO "admin_access_mutation_state"/);
  assert.match(sql, /\("id"\) VALUES \('global'\)/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
});

test("single-role migration serializes authority writes and fails closed on invalid cardinality", async () => {
  const sql = await readFile(singleRoleMigrationPath, "utf8");

  assert.match(sql, /SELECT pg_advisory_xact_lock\(1515344707, 1\)/);
  assert.match(
    sql,
    /LOCK TABLE "user" IN SHARE MODE;\s+LOCK TABLE "admin_access_role_assignments" IN SHARE MODE;/,
  );
  assert.match(sql, /FROM "user" AS u/);
  assert.match(sql, /LEFT JOIN "admin_access_role_assignments" AS a/);
  assert.match(sql, /GROUP BY u\."id"/);
  assert.match(sql, /HAVING count\(a\."roleId"\) <> 1/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "admin_access_role_assignments_userId_key"/,
  );
  assert.match(sql, /CREATE FUNCTION "assert_exactly_one_admin_access_role"/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER "admin_access_role_assignment_exactly_one"/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(
    sql,
    /CREATE TRIGGER "admin_access_role_assignment_no_truncate"\s+BEFORE TRUNCATE ON "admin_access_role_assignments"\s+FOR EACH STATEMENT/,
  );
  assert.doesNotMatch(
    sql,
    /DELETE FROM|^\s*TRUNCATE(?:\s+TABLE)?\s+|DROP TABLE|DROP COLUMN/im,
  );
});
