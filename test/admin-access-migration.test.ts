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
