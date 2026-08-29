import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseInspection } from "../lib/database";
import {
  createMigrationPlan,
  readReviewedMigrationChain,
  type LocalMigration,
} from "../lib/migrations";
import type { CommandRunner } from "../lib/process";
import {
  ADMIN_ACCESS_REVIEWED_BATCH_ID,
  createAdminAccessReviewedMigrationBatchPlan,
  createAdminAccessReviewedMigrationBatchPlanFromSnapshot,
  createAdminAccessReviewedMigrationPlan,
} from "../lib/reviewed-migrations";

const projectRoot = process.cwd();
const currentChain = readReviewedMigrationChain(projectRoot);
const baseLength = 5;

function exactBaseHistory(): DatabaseInspection["migrations"] {
  return currentChain.slice(0, baseLength).map((migration) => ({
    name: migration.name,
    checksum: migration.hash,
    finished: true,
    rolledBack: false,
    logs: null,
  }));
}

function databaseInspection(
  overrides: Partial<DatabaseInspection> = {},
): DatabaseInspection {
  return {
    migrationsTableExists: true,
    migrations: exactBaseHistory(),
    userTables: ["account", "session", "user"],
    userObjects: ["table:account", "table:session", "table:user"],
    tablesWithData: ["user"],
    adminAccessRoleCardinalityViolations: null,
    ...overrides,
  };
}

test("one-time admin access plan accepts only the exact base-five and pending-four window", () => {
  const plan = createAdminAccessReviewedMigrationBatchPlan({
    projectRoot,
    database: databaseInspection(),
  });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.batchId, ADMIN_ACCESS_REVIEWED_BATCH_ID);
  assert.equal(plan.state, "pending");
  assert.deepEqual(
    plan.appliedPrefix.map(({ name }) => name),
    currentChain.slice(0, baseLength).map(({ name }) => name),
  );
  assert.deepEqual(
    plan.pending.map(({ name, sha256 }) => ({ name, sha256 })),
    currentChain.slice(baseLength).map(({ name, hash }) => ({
      name,
      sha256: hash,
    })),
  );
  assert.equal(plan.appliedPrefix.length, 5);
  assert.equal(plan.pending.length, 4);
  assert.match(plan.batchDigest, /^[0-9a-f]{64}$/u);
});

test("batch digest is order-stable for inventories and changes with database evidence", () => {
  const first = createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
    currentChain,
    databaseInspection(),
  );
  const reordered = createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
    currentChain,
    databaseInspection({
      userTables: ["user", "session", "account"],
      userObjects: ["table:user", "table:session", "table:account"],
    }),
  );
  const changed = createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
    currentChain,
    databaseInspection({
      userObjects: [
        "table:account",
        "table:session",
        "table:unexpected",
        "table:user",
      ],
    }),
  );

  assert.equal(reordered.batchDigest, first.batchDigest);
  assert.notEqual(changed.batchDigest, first.batchDigest);
});

test("future, missing, reordered, or SHA-mismatched local chains are rejected", () => {
  const future: LocalMigration = {
    name: "20260830000000_future_migration",
    sql: "CREATE TABLE future_migration (id text);",
    hash: "f".repeat(64),
    classification: "expand-compatible",
    affectedTables: ["future_migration"],
    destructiveStatements: [],
  };
  const reordered = [...currentChain];
  [reordered[5], reordered[6]] = [reordered[6]!, reordered[5]!];
  const checksumMismatch = currentChain.map((migration, index) =>
    index === 5 ? { ...migration, hash: "0".repeat(64) } : migration,
  );

  for (const chain of [
    [...currentChain, future],
    currentChain.slice(0, -1),
    reordered,
    checksumMismatch,
  ]) {
    assert.throws(
      () =>
        createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
          chain,
          databaseInspection(),
        ),
      /exact reviewed|exact name, SHA-256/u,
    );
  }
});

test("missing, failed, rolled-back, partial, diverged, and checksum-mismatched histories are rejected", () => {
  const exact = exactBaseHistory();
  const firstPending = currentChain[baseLength];
  assert.ok(firstPending);
  const historyCases: DatabaseInspection["migrations"][] = [
    exact.slice(0, -1),
    exact.map((attempt, index) =>
      index === 4 ? { ...attempt, finished: false } : attempt,
    ),
    exact.map((attempt, index) =>
      index === 4 ? { ...attempt, finished: false, rolledBack: true } : attempt,
    ),
    [
      ...exact,
      {
        name: firstPending.name,
        checksum: firstPending.hash,
        finished: true,
        rolledBack: false,
        logs: null,
      },
    ],
    exact.map((attempt, index) =>
      index === 4 ? { ...attempt, name: "unexpected_migration" } : attempt,
    ),
    exact.map((attempt, index) =>
      index === 4 ? { ...attempt, checksum: "0".repeat(64) } : attempt,
    ),
  ];

  for (const migrations of historyCases) {
    assert.throws(
      () =>
        createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
          currentChain,
          databaseInspection({ migrations }),
        ),
      /exactly 5 applied migration attempts|failed, incomplete, or rolled back|exact reviewed base prefix/u,
    );
  }
});

test("the one-time batch never treats an empty migration history as bootstrap", () => {
  assert.throws(
    () =>
      createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
        currentChain,
        databaseInspection({ migrationsTableExists: false, migrations: [] }),
      ),
    /existing Prisma migration history/u,
  );
});

test("reviewed plan binds Prisma status and schema diff without weakening automatic deploy", async () => {
  const database = databaseInspection();
  const runner: CommandRunner = {
    run(_command, arguments_) {
      if (arguments_.includes("status")) {
        return {
          status: 1,
          stdout: "The following migrations have not yet been applied",
          stderr: "",
        };
      }
      if (arguments_.includes("diff")) {
        return {
          status: 2,
          stdout: 'ALTER TABLE "user" ADD COLUMN "adminAccessRoleRevision" INTEGER;',
          stderr: "",
        };
      }
      throw new Error(`Unexpected command: ${arguments_.join(" ")}`);
    },
  };
  const options = {
    projectRoot,
    directUrl: "postgresql://redacted.invalid/app",
    runner,
    inspect: async () => database,
  };

  const reviewed = await createAdminAccessReviewedMigrationPlan(options);
  assert.equal(reviewed.migration.state, "pending");
  assert.equal(reviewed.batch.pending.length, 4);
  assert.match(reviewed.reviewedPlanDigest, /^[0-9a-f]{64}$/u);

  await assert.rejects(
    createMigrationPlan(options),
    /Only reviewed expand-compatible migrations/u,
  );
});
