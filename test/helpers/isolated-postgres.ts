import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { Client } from "pg";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const ADMIN_DATABASE_URL_ENV = "ADMIN_ACCESS_TEST_ADMIN_URL";
const DEFAULT_ADMIN_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DATABASE_NAME_PREFIX = "zoom_admin_access_runtime_test_";
const DATABASE_NAME_PATTERN = /^zoom_admin_access_runtime_test_[0-9a-f]{16}$/u;

export async function withIsolatedPostgresDatabase(
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
    runPrismaMigrateDeploy(databaseUrl.href);
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
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
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
