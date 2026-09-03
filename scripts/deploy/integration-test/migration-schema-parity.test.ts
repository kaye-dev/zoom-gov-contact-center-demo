import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

import { withIsolatedPostgresDatabase } from "../../../test/helpers/isolated-postgres";

const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");

test("MSP-DB-01: 全migration再生結果とschema.prismaが一致する", async () => {
  await withIsolatedPostgresDatabase(async (databaseUrl) => {
    const status = runPrisma(["migrate", "status"], databaseUrl);
    assert.equal(
      status.status,
      0,
      formatCommandFailure("Prisma migrate status", status, databaseUrl),
    );
    assert.match(status.stdout, /Database schema is up to date!/u);

    const diff = runPrisma(
      [
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--script",
        "--exit-code",
      ],
      databaseUrl,
    );
    assert.equal(
      diff.status,
      0,
      formatCommandFailure("Prisma migrate diff", diff, databaseUrl),
    );
    assert.equal(diff.stdout.trim(), "-- This is an empty migration.");
  });
});

function runPrisma(
  args: readonly string[],
  databaseUrl: string,
): SpawnSyncReturns<string> {
  return spawnSync("npm", ["exec", "--", "prisma", ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
    },
    timeout: 120_000,
  });
}

function formatCommandFailure(
  label: string,
  result: SpawnSyncReturns<string>,
  databaseUrl: string,
): string {
  const output = [result.error?.message, result.stdout, result.stderr]
    .filter((value): value is string => typeof value === "string" && value !== "")
    .join("\n");
  return `${label} failed with status ${String(result.status)}:\n${redactDatabaseUrl(output, databaseUrl)}`;
}

function redactDatabaseUrl(output: string, databaseUrl: string): string {
  const password = new URL(databaseUrl).password;
  let redacted = output.replaceAll(databaseUrl, "postgresql://[REDACTED]");
  if (password !== "") {
    redacted = redacted.replaceAll(password, "[REDACTED]");
  }
  return redacted.replace(/postgresql:\/\/[^\s]+/giu, "postgresql://[REDACTED]");
}
