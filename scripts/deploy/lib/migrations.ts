import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DatabaseInspection } from "./database";
import {
  assertCommandSucceeded,
  combinedOutput,
  type CommandRunner,
} from "./process";

const REVIEWED_MIGRATION_COUNT = 8;
const REVIEWED_SCHEMA_INVISIBLE_MIGRATION_HASHES = new Map([
  [
    "20260828120000_separate_admin_access_cas_revisions",
    "1c6be2aaf76e7f185eb8605b16263484aa9de9ec827374f7d58a205349236e27",
  ],
]);

export type LocalMigration = {
  name: string;
  sql: string;
  hash: string;
  affectedTables: string[];
  destructiveStatements: string[];
};

export type MigrationPlan = {
  state: "up-to-date" | "pending";
  pending: LocalMigration[];
  appliedNames: string[];
  predictedDiff: string;
  predictedDiffHash: string;
  planHash: string;
  freshDatabase: boolean;
  databaseTables: string[];
  databaseObjects: string[];
  tablesWithData: string[];
  statusSummary: string;
  totalMigrationCount: number;
};

export type MigrationSnapshotOptions = {
  projectRoot: string;
  directUrl: string;
  runner: CommandRunner;
  inspect: (directUrl: string) => Promise<DatabaseInspection>;
};

export async function createMigrationPlan(
  options: MigrationSnapshotOptions,
): Promise<MigrationPlan> {
  const migrations = readLocalMigrations(
    join(options.projectRoot, "prisma", "migrations"),
  );
  if (migrations.length !== REVIEWED_MIGRATION_COUNT) {
    throw new Error(
      `Expected the reviewed chain of ${REVIEWED_MIGRATION_COUNT} Prisma migrations, found ${migrations.length}.`,
    );
  }

  let database: DatabaseInspection;
  try {
    database = await options.inspect(options.directUrl);
  } catch (error) {
    throw new Error(
      `Could not inspect the Neon database: ${error instanceof Error ? error.message : "unknown connection error"}`,
    );
  }

  validateMigrationHistory(migrations, database);
  const appliedNames = database.migrations
    .filter((migration) => migration.finished && !migration.rolledBack)
    .map((migration) => migration.name);
  const pending = migrations.slice(appliedNames.length);
  const migrationEnvironment = {
    ...process.env,
    DATABASE_URL: options.directUrl,
    DATABASE_URL_UNPOOLED: options.directUrl,
  };
  const status = options.runner.run(
    "npm",
    ["exec", "--", "prisma", "migrate", "status"],
    { env: migrationEnvironment },
  );
  const statusOutput = combinedOutput(status);
  const statusState = classifyPrismaStatus(status.status, statusOutput);
  const diff = options.runner.run(
    "npm",
    [
      "exec",
      "--",
      "prisma",
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
      "--exit-code",
    ],
    { env: migrationEnvironment },
  );
  if (diff.status !== 0 && diff.status !== 2) {
    assertCommandSucceeded(diff, "Prisma schema diff");
  }
  const predictedDiff = normalizePrismaDiff(diff.stdout);

  if (pending.length === 0) {
    if (statusState !== "up-to-date") {
      throw new Error(
        "Prisma status disagrees with the verified migration history; refusing to continue.",
      );
    }
    if (diff.status !== 0 || predictedDiff) {
      throw new Error(
        "Schema drift exists even though no migration is pending. Create and review a forward migration before deploying.",
      );
    }
  } else {
    if (statusState !== "pending") {
      throw new Error(
        "Prisma did not confirm the expected pending migrations; refusing to continue.",
      );
    }
    const reviewedSchemaInvisibleOnly =
      pending.length > 0 &&
      pending.every(isReviewedSchemaInvisibleMigration);
    if (
      (diff.status !== 2 || !predictedDiff) &&
      !(
        reviewedSchemaInvisibleOnly &&
        diff.status === 0 &&
        predictedDiff === ""
      )
    ) {
      throw new Error(
        "Pending migrations did not produce a schema diff; refusing to infer a safe migration state.",
      );
    }
  }

  const freshDatabase =
    migrations.length === REVIEWED_MIGRATION_COUNT &&
    appliedNames.length === 0 &&
    pending.length === migrations.length &&
    database.userObjects.length === 0;
  const destructive = pending.flatMap((migration) =>
    isReviewedSchemaInvisibleMigration(migration)
      ? []
      : migration.destructiveStatements.map(
          (statement) => `${migration.name}: ${statement}`,
        ),
  );
  if (destructive.length > 0 && !freshDatabase) {
    throw new Error(
      [
        "Destructive DDL is only eligible for automatic execution when an empty database receives the complete migration chain.",
        `Tables with data: ${database.tablesWithData.join(", ")}`,
        "Prepare a separate reviewed migration plan; deploy.sh will not apply this automatically.",
      ].join("\n"),
    );
  }

  const predictedDiffHash = sha256(predictedDiff);
  const planHash = sha256(
    JSON.stringify({
      appliedNames,
      pending: pending.map(({ name, hash }) => ({ name, hash })),
      predictedDiffHash,
      databaseTables: database.userTables,
      databaseObjects: database.userObjects,
      tablesWithData: database.tablesWithData,
    }),
  );

  return {
    state: pending.length === 0 ? "up-to-date" : "pending",
    pending,
    appliedNames,
    predictedDiff,
    predictedDiffHash,
    planHash,
    freshDatabase,
    databaseTables: database.userTables,
    databaseObjects: database.userObjects,
    tablesWithData: database.tablesWithData,
    statusSummary: statusOutput,
    totalMigrationCount: migrations.length,
  };
}

function isReviewedSchemaInvisibleMigration(
  migration: LocalMigration,
): boolean {
  return (
    REVIEWED_SCHEMA_INVISIBLE_MIGRATION_HASHES.get(migration.name) ===
    migration.hash
  );
}

export function readLocalMigrations(directory: string): LocalMigration[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(join(directory, name, "migration.sql"), "utf8");
      return {
        name,
        sql,
        hash: sha256(sql),
        affectedTables: findAffectedTables(sql),
        destructiveStatements: findDestructiveStatements(sql),
      };
    });
}

export function validateMigrationHistory(
  local: readonly LocalMigration[],
  database: DatabaseInspection,
): void {
  const failed = database.migrations.filter(
    (migration) => !migration.finished && !migration.rolledBack,
  );
  if (failed.length > 0) {
    throw new Error(
      `Failed or incomplete migration history detected: ${failed.map((item) => item.name).join(", ")}`,
    );
  }
  const rolledBack = database.migrations.filter(
    (migration) => migration.rolledBack,
  );
  if (rolledBack.length > 0) {
    throw new Error(
      `Rolled-back migration history requires manual review: ${rolledBack.map((item) => item.name).join(", ")}`,
    );
  }

  const applied = database.migrations.filter((migration) => migration.finished);
  if (new Set(applied.map((migration) => migration.name)).size !== applied.length) {
    throw new Error("Duplicate applied migration names were found in Neon.");
  }
  for (let index = 0; index < applied.length; index += 1) {
    const expected = local[index];
    const actual = applied[index];
    if (!expected || expected.name !== actual?.name) {
      throw new Error(
        "Migration history has diverged from the ordered local migration chain.",
      );
    }
    if (expected.hash !== actual.checksum) {
      throw new Error(
        `Migration checksum mismatch for '${expected.name}'. The applied SQL must not be rewritten.`,
      );
    }
  }
}

export function classifyPrismaStatus(
  exitCode: number,
  output: string,
): "up-to-date" | "pending" {
  if (/database schema is up to date/i.test(output) && exitCode === 0) {
    return "up-to-date";
  }
  if (
    /following migration(?:s)? have not yet been applied|pending migration/i.test(
      output,
    ) &&
    (exitCode === 0 || exitCode === 1)
  ) {
    return "pending";
  }
  throw new Error(
    "Prisma migration status was neither verified up-to-date nor confirmed pending. Connection errors, failed history, and drift are never auto-repaired.",
  );
}

export function normalizePrismaDiff(output: string): string {
  const trimmed = output.trim();
  if (trimmed === "-- This is an empty migration.") {
    return "";
  }
  return trimmed;
}

export function renderMigrationPlan(plan: MigrationPlan): string {
  if (plan.state === "up-to-date") {
    return [
      "Migration state: up to date",
      `Applied migrations: ${plan.appliedNames.length}`,
      ...plan.appliedNames.map(
        (name, index) => `  ${index + 1}. ${name}`,
      ),
      "Prisma migrate status:",
      plan.statusSummary.trim() || "(none)",
      "Schema diff:",
      plan.predictedDiff || "(none)",
      `Schema diff SHA-256: ${plan.predictedDiffHash}`,
    ].join("\n");
  }

  const lines = [
    "Migration state: pending",
    `Fresh empty database: ${plan.freshDatabase ? "yes" : "no"}`,
    `Plan SHA-256: ${plan.planHash}`,
    `Predicted schema diff SHA-256: ${plan.predictedDiffHash}`,
    `Existing tables: ${plan.databaseTables.join(", ") || "none"}`,
    `Existing public schema objects: ${plan.databaseObjects.join(", ") || "none"}`,
    `Tables containing data: ${plan.tablesWithData.join(", ") || "none"}`,
    "Pending migrations in execution order:",
  ];
  if (plan.freshDatabase && plan.pending.length === plan.totalMigrationCount) {
    lines.push(
      "WARNING: This is the only destructive-DDL exception: every local migration will be applied to a verified fresh empty database.",
    );
  }
  for (const [index, migration] of plan.pending.entries()) {
    lines.push(
      `${index + 1}. ${migration.name}`,
      `   SQL SHA-256: ${migration.hash}`,
      `   Affected tables: ${migration.affectedTables.join(", ") || "not detected"}`,
      `   Destructive DDL: ${migration.destructiveStatements.join(" | ") || "none detected"}`,
      "----- migration.sql -----",
      migration.sql.trimEnd(),
      "----- end migration.sql -----",
    );
  }
  lines.push(
    "----- predicted schema diff -----",
    plan.predictedDiff,
    "----- end predicted schema diff -----",
  );
  return lines.join("\n");
}

export function applyMigrationPlan(
  runner: CommandRunner,
  directUrl: string,
): void {
  const result = runner.run(
    "npm",
    ["exec", "--", "prisma", "migrate", "deploy"],
    {
      env: {
        ...process.env,
        DATABASE_URL: directUrl,
        DATABASE_URL_UNPOOLED: directUrl,
      },
    },
  );
  assertCommandSucceeded(result, "Prisma migrate deploy");
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function findAffectedTables(sql: string): string[] {
  const names = new Set<string>();
  const expression =
    /\b(?:CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE(?:\s+TABLE)?|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:"public"\.)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi;
  for (const match of sql.matchAll(expression)) {
    const name = match[1] ?? match[2];
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort();
}

export function findDestructiveStatements(sql: string): string[] {
  return sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter((statement) =>
      /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b.*(?:\bRENAME\b|\bALTER\b.*\bTYPE\b)/i.test(
        statement,
      ),
    )
    .map((statement) => `${statement.slice(0, 220)};`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
