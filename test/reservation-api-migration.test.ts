import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("../prisma/migrations/20260830180000_add_reservation_api_keys/migration.sql", import.meta.url);
const keyUsageMigrationPath = new URL("../prisma/migrations/20260830230000_add_reservation_api_key_usage_limits/migration.sql", import.meta.url);
const requestLogMigrationPath = new URL("../prisma/migrations/20260831010000_add_reservation_api_request_logs/migration.sql", import.meta.url);

test("reservation API migration is additive and manifest hash is exact", () => {
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /CREATE TYPE "ReservationApiPermission"/u);
  for (const table of ["reservation_api_keys", "reservation_api_key_permissions", "reservation_api_usage_settings", "reservation_api_monthly_usage"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`, "u"));
  }
  assert.match(migration, /ADD COLUMN "updatedAt"/u);
  assert.match(migration, /VALUES \(1, 10000\)/u);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|RENAME)\b/iu);

  const keyUsageMigration = readFileSync(keyUsageMigrationPath, "utf8");
  assert.match(keyUsageMigration, /ADD COLUMN "monthlyLimit" BIGINT/u);
  assert.match(keyUsageMigration, /CREATE TABLE "reservation_api_key_monthly_usage"/u);
  assert.match(keyUsageMigration, /PRIMARY KEY \("apiKeyId", "periodStart"\)/u);
  assert.match(keyUsageMigration, /CHECK \("requestCount" >= 0\)/u);
  assert.match(keyUsageMigration, /CREATE INDEX "reservation_api_key_monthly_usage_periodStart_idx"/u);
  assert.match(keyUsageMigration, /ON DELETE CASCADE/u);
  assert.doesNotMatch(keyUsageMigration, /^\s*(?:DROP|TRUNCATE|RENAME|UPDATE)\b/imu);

  const keyUsageSha256 = createHash("sha256").update(keyUsageMigration).digest("hex");
  const requestLogMigration = readFileSync(requestLogMigrationPath, "utf8");
  assert.match(requestLogMigration, /CREATE TABLE "reservation_api_request_logs"/u);
  assert.match(requestLogMigration, /"apiKeyId" TEXT,/u);
  assert.match(requestLogMigration, /CHECK \("statusCode" BETWEEN 100 AND 599\)/u);
  assert.match(requestLogMigration, /CHECK \("durationMs" >= 0\)/u);
  assert.match(requestLogMigration, /ON DELETE SET NULL/u);
  assert.equal(
    [...requestLogMigration.matchAll(/^CREATE INDEX /gmu)].length,
    4,
  );
  for (const index of [
    "reservation_api_request_logs_requestedAt_id_idx",
    "reservation_api_request_logs_apiKeyId_requestedAt_idx",
    "reservation_api_request_logs_method_requestedAt_idx",
    "reservation_api_request_logs_statusCode_requestedAt_idx",
  ]) {
    assert.match(requestLogMigration, new RegExp(`CREATE INDEX "${index}"`, "u"));
  }
  assert.doesNotMatch(requestLogMigration, /^\s*(?:DROP|TRUNCATE|RENAME|UPDATE)\b/imu);

  const requestLogSha256 = createHash("sha256").update(requestLogMigration).digest("hex");
  const manifest = JSON.parse(readFileSync(new URL("../scripts/deploy/migrations.manifest.json", import.meta.url), "utf8")) as {
    migrations: Array<{ name: string; sha256: string; classification: string }>;
  };
  assert.deepEqual(
    manifest.migrations.find(({ name }) => name === "20260830230000_add_reservation_api_key_usage_limits"),
    {
      name: "20260830230000_add_reservation_api_key_usage_limits",
      sha256: keyUsageSha256,
      classification: "expand-compatible",
    },
  );
  assert.deepEqual(manifest.migrations.at(-1), {
    name: "20260831010000_add_reservation_api_request_logs",
    sha256: requestLogSha256,
    classification: "expand-compatible",
  });
  const reviewed = readFileSync(new URL("../scripts/deploy/lib/reviewed-migrations.ts", import.meta.url), "utf8");
  assert.match(reviewed, new RegExp(keyUsageSha256, "u"));
  assert.match(reviewed, new RegExp(requestLogSha256, "u"));
});
