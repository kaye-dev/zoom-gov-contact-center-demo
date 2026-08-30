import { createHash } from "node:crypto";

import type { DatabaseInspection } from "./database";
import {
  createMigrationSnapshot,
  readReviewedMigrationChain,
  type LocalMigration,
  type MigrationClassification,
  type MigrationPlan,
  type MigrationSnapshotOptions,
} from "./migrations";

export const ADMIN_ACCESS_REVIEWED_BATCH_ID = "admin-access-v1" as const;

type ExactBatchMigration = {
  name: string;
  sha256: string;
  classification: MigrationClassification;
};

const EXACT_MIGRATION_CHAIN = [
  {
    name: "20260623105657_init",
    sha256: "b9390d2923e3109951e5699d0112ebcf3461cee2b4a8632018b871c1ebe5e052",
    classification: "bootstrap-only",
  },
  {
    name: "20260804090000_add_site_settings",
    sha256: "cee50868ab0fa97ddef94f0e2f4c301dffd44ac0a3d7933ce1ff2b496d33e611",
    classification: "expand-compatible",
  },
  {
    name: "20260804150000_add_zoom_virtual_agent_web_tag",
    sha256: "bcfba7754e324bcf58e99dafdd9db9739d31bf7c8d0f885e6e08349da52bd5e9",
    classification: "expand-compatible",
  },
  {
    name: "20260805040000_split_phone_and_chat_settings",
    sha256: "0f92c69d08b1b2df29b2e6a22de78513ae83bbcad781367a2134539acca722e8",
    classification: "destructive-reviewed",
  },
  {
    name: "20260816090000_add_site_maintenance_settings",
    sha256: "bbdbed98ed1b8e1bca9624d51a9fd85287f31f28b3ef5bd658b04f9d1bc41f45",
    classification: "expand-compatible",
  },
  {
    name: "20260827150000_add_admin_access_roles",
    sha256: "39d1305a7ecb85a261142b610f323273fa956be5cc5cd3309d8ab4f32fbe054b",
    classification: "destructive-reviewed",
  },
  {
    name: "20260828120000_separate_admin_access_cas_revisions",
    sha256: "1c6be2aaf76e7f185eb8605b16263484aa9de9ec827374f7d58a205349236e27",
    classification: "destructive-reviewed",
  },
  {
    name: "20260828180000_add_admin_access_mutation_freeze",
    sha256: "d124fa6a5bf164afaaf6ec7d57d1261d87b65ddb06c32e636e62f33c3faa9dc7",
    classification: "expand-compatible",
  },
  {
    name: "20260828210000_enforce_single_admin_access_role",
    sha256: "ab3399e4fcf00a061bc35b8afad3ec56b9a3b35b393f2a3e4742186c4b7af62d",
    classification: "destructive-reviewed",
  },
] as const satisfies readonly ExactBatchMigration[];

const EXACT_APPLIED_PREFIX_LENGTH = 5;

const EXACT_POST_REVIEWED_CHAIN = [
  {
    name: "20260829231500_add_developer_api_settings",
    sha256: "73fdf3fb7c5d101b9a0abce16c7ae29b825e1e1560d68dad02f0e530e0ac430a",
    classification: "expand-compatible",
  },
  {
    name: "20260830120000_add_reservation_bookings",
    sha256: "396d117b293417b8b473be2f9f9f13a8fa31bc0bea72d44067d2e41243bee435",
    classification: "expand-compatible",
  },
  {
    name: "20260830180000_add_reservation_api_keys",
    sha256: "2e3b69bf591e470c53b0426d71e6f2bbd078d6df5db4f5da1ef889ccbdfc78e0",
    classification: "expand-compatible",
  },
  {
    name: "20260830230000_add_reservation_api_key_usage_limits",
    sha256: "fe3246f27e40d804363e42180085b33f5f36665889cedb42b2062634c3eb9753",
    classification: "expand-compatible",
  },
  {
    name: "20260831010000_add_reservation_api_request_logs",
    sha256: "8f92d235319a63c922924e28bea781c6c91fde06ab0bfa1eab1f077516929e9c",
    classification: "expand-compatible",
  },
] as const satisfies readonly ExactBatchMigration[];

export type ReviewedMigrationBatchPlan = {
  schemaVersion: 1;
  batchId: typeof ADMIN_ACCESS_REVIEWED_BATCH_ID;
  state: "pending";
  appliedPrefix: ExactBatchMigration[];
  pending: ExactBatchMigration[];
  databaseTables: string[];
  databaseObjects: string[];
  tablesWithData: string[];
  batchDigest: string;
};

export type ReviewedMigrationBatchPlanOptions = {
  projectRoot: string;
  database: DatabaseInspection;
};

export type AdminAccessReviewedMigrationPlan = {
  migration: MigrationPlan & { state: "pending" };
  batch: ReviewedMigrationBatchPlan;
  reviewedPlanDigest: string;
};

/**
 * Produces executable evidence for the one-time batch while keeping the normal
 * expand-only planner unchanged. The generic snapshot proves Prisma status and
 * schema diff; the batch validator then binds it to the exact base-five and
 * pending-four history.
 */
export async function createAdminAccessReviewedMigrationPlan(
  options: MigrationSnapshotOptions,
): Promise<AdminAccessReviewedMigrationPlan> {
  let database: DatabaseInspection | undefined;
  const migration = await createMigrationSnapshot({
    ...options,
    inspect: async (directUrl) => {
      database = await options.inspect(directUrl);
      return database;
    },
  });
  if (database === undefined) {
    throw new Error("The reviewed migration database snapshot is unavailable.");
  }
  const batch = createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
    readReviewedMigrationChain(options.projectRoot),
    database,
  );
  if (
    migration.state !== "pending" ||
    migration.appliedNames.length !== batch.appliedPrefix.length ||
    migration.appliedNames.some(
      (name, index) => name !== batch.appliedPrefix[index]?.name,
    ) ||
    migration.pending.length < batch.pending.length ||
    batch.pending.some(
      (item, index) =>
        migration.pending[index]?.name !== item.name ||
        migration.pending[index]?.hash !== item.sha256 ||
        migration.pending[index]?.classification !== item.classification,
    )
  ) {
    throw new Error(
      `Prisma status and the exact '${ADMIN_ACCESS_REVIEWED_BATCH_ID}' batch window disagree.`,
    );
  }
  const pendingMigration = migration as MigrationPlan & { state: "pending" };
  return {
    migration: pendingMigration,
    batch,
    reviewedPlanDigest: sha256(
      JSON.stringify({
        schemaVersion: 1,
        batchId: batch.batchId,
        batchDigest: batch.batchDigest,
        migrationPlanHash: pendingMigration.planHash,
        predictedDiffHash: pendingMigration.predictedDiffHash,
      }),
    ),
  };
}

/**
 * Builds the only reviewed one-time batch recognized by this release. This is
 * deliberately separate from createMigrationPlan: the normal deployment path
 * remains limited to expand-compatible migrations.
 */
export function createAdminAccessReviewedMigrationBatchPlan(
  options: ReviewedMigrationBatchPlanOptions,
): ReviewedMigrationBatchPlan {
  return createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
    readReviewedMigrationChain(options.projectRoot),
    options.database,
  );
}

/**
 * Pure snapshot validator used by unit tests and by callers that already read
 * the immutable migration chain. A caller must not treat arbitrary metadata as
 * migration evidence; the exact names and SQL hashes below are the authority.
 */
export function createAdminAccessReviewedMigrationBatchPlanFromSnapshot(
  migrations: readonly LocalMigration[],
  database: DatabaseInspection,
): ReviewedMigrationBatchPlan {
  assertExactLocalMigrationChain(migrations);
  assertExactAppliedPrefix(database);

  const appliedPrefix = copyBatchMigrations(
    EXACT_MIGRATION_CHAIN.slice(0, EXACT_APPLIED_PREFIX_LENGTH),
  );
  const pending = copyBatchMigrations(
    EXACT_MIGRATION_CHAIN.slice(EXACT_APPLIED_PREFIX_LENGTH),
  );
  const databaseTables = normalizeInventory(
    database.userTables,
    "database table inventory",
  );
  const databaseObjects = normalizeInventory(
    database.userObjects,
    "database object inventory",
  );
  const tablesWithData = normalizeInventory(
    database.tablesWithData,
    "database data inventory",
  );
  const batchDigest = sha256(
    JSON.stringify({
      schemaVersion: 1,
      batchId: ADMIN_ACCESS_REVIEWED_BATCH_ID,
      localChain: EXACT_MIGRATION_CHAIN,
      appliedPrefix: database.migrations.map(
        ({ name, checksum, finished, rolledBack }) => ({
          name,
          checksum,
          finished,
          rolledBack,
        }),
      ),
      pending,
      database: {
        migrationsTableExists: database.migrationsTableExists,
        databaseTables,
        databaseObjects,
        tablesWithData,
        adminAccessRoleCardinalityViolations:
          database.adminAccessRoleCardinalityViolations,
      },
    }),
  );

  return {
    schemaVersion: 1,
    batchId: ADMIN_ACCESS_REVIEWED_BATCH_ID,
    state: "pending",
    appliedPrefix,
    pending,
    databaseTables,
    databaseObjects,
    tablesWithData,
    batchDigest,
  };
}

function assertExactLocalMigrationChain(
  migrations: readonly LocalMigration[],
): void {
  if (migrations.length < EXACT_MIGRATION_CHAIN.length) {
    throw new Error(
      `The '${ADMIN_ACCESS_REVIEWED_BATCH_ID}' batch requires the exact reviewed ${EXACT_MIGRATION_CHAIN.length}-migration local chain prefix; found ${migrations.length}.`,
    );
  }

  for (const [index, expected] of EXACT_MIGRATION_CHAIN.entries()) {
    const actual = migrations[index];
    if (
      actual === undefined ||
      actual.name !== expected.name ||
      actual.hash !== expected.sha256 ||
      actual.classification !== expected.classification
    ) {
      throw new Error(
        `Local migration position ${index + 1} does not match the exact name, SHA-256, and classification reviewed for '${ADMIN_ACCESS_REVIEWED_BATCH_ID}'.`,
      );
    }
  }

  const postReviewedMigrations = migrations.slice(EXACT_MIGRATION_CHAIN.length);
  if (postReviewedMigrations.length !== EXACT_POST_REVIEWED_CHAIN.length) {
    throw new Error(
      `The local chain does not match the exact reviewed post-'${ADMIN_ACCESS_REVIEWED_BATCH_ID}' chain.`,
    );
  }

  for (const [index, migration] of postReviewedMigrations.entries()) {
    const expected = EXACT_POST_REVIEWED_CHAIN[index];
    if (
      expected === undefined ||
      migration.name !== expected.name ||
      migration.hash !== expected.sha256 ||
      migration.classification !== expected.classification
    ) {
      throw new Error(
        `Local migration '${migration.name}' does not match the exact reviewed post-'${ADMIN_ACCESS_REVIEWED_BATCH_ID}' chain.`,
      );
    }
  }
}

function assertExactAppliedPrefix(database: DatabaseInspection): void {
  if (!database.migrationsTableExists) {
    throw new Error(
      `The '${ADMIN_ACCESS_REVIEWED_BATCH_ID}' batch requires an existing Prisma migration history.`,
    );
  }
  if (database.migrations.length !== EXACT_APPLIED_PREFIX_LENGTH) {
    throw new Error(
      `The '${ADMIN_ACCESS_REVIEWED_BATCH_ID}' batch requires exactly ${EXACT_APPLIED_PREFIX_LENGTH} applied migration attempts and no partial batch history; found ${database.migrations.length}.`,
    );
  }

  for (let index = 0; index < EXACT_APPLIED_PREFIX_LENGTH; index += 1) {
    const expected = EXACT_MIGRATION_CHAIN[index];
    const actual = database.migrations[index];
    if (expected === undefined || actual === undefined) {
      throw new Error("The reviewed migration prefix is incomplete.");
    }
    if (!actual.finished || actual.rolledBack) {
      throw new Error(
        `Migration history position ${index + 1} is failed, incomplete, or rolled back; the one-time batch cannot repair migration history.`,
      );
    }
    if (actual.name !== expected.name || actual.checksum !== expected.sha256) {
      throw new Error(
        `Migration history position ${index + 1} does not match the exact reviewed base prefix for '${ADMIN_ACCESS_REVIEWED_BATCH_ID}'.`,
      );
    }
  }
}

function copyBatchMigrations(
  migrations: readonly ExactBatchMigration[],
): ExactBatchMigration[] {
  return migrations.map(({ name, sha256, classification }) => ({
    name,
    sha256,
    classification,
  }));
}

function normalizeInventory(
  values: readonly string[],
  description: string,
): string[] {
  if (
    values.some(
      (value) => !value || value.length > 512 || /[\r\n\0]/u.test(value),
    ) ||
    new Set(values).size !== values.length
  ) {
    throw new Error(`The ${description} is invalid.`);
  }
  return [...values].sort();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
