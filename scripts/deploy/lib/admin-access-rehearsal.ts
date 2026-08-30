import { createHash } from "node:crypto";

import { Client } from "pg";

const SNAPSHOT_SCHEMA_VERSION = 1 as const;
const USER_DIGEST_DOMAIN = "zoom-admin-access-user-role-v1";

const BASE_READ_ERROR =
  "Administrative access rehearsal base snapshot could not be read safely.";
const BASE_SCHEMA_ERROR =
  "Administrative access rehearsal base snapshot is not the reviewed pre-migration schema.";
const POST_READ_ERROR =
  "Administrative access rehearsal post-migration state could not be read safely.";
const SOURCE_DIGEST_ERROR =
  "Administrative access rehearsal source data digest changed; migration verification is blocked.";
const CARDINALITY_ERROR =
  "Administrative access rehearsal post-migration cardinality verification failed.";
const USER_BACKFILL_ERROR =
  "Administrative access rehearsal post-migration user backfill verification failed.";
const SYSTEM_ROLE_ERROR =
  "Administrative access rehearsal system-role verification failed.";
const FREEZE_STATE_ERROR =
  "Administrative access rehearsal mutation-freeze verification failed.";
const CATALOG_ERROR =
  "Administrative access rehearsal post-migration catalog verification failed.";

type UserRoleRow = {
  id: string;
  role: string | null;
};

type CountRow = {
  count: number;
};

type AssignmentSummaryRow = {
  assignmentCount: number;
  invalidUserCount: number;
  orphanAssignmentCount: number;
  invalidSystemRoleCount: number;
  invalidRevisionCount: number;
};

type SystemRoleRow = {
  id: string;
  systemKey: string;
};

type FreezeSummaryRow = {
  rowCount: number;
  validRowCount: number;
};

type IndexRow = {
  tableName: string;
  unique: boolean;
  valid: boolean;
  ready: boolean;
  live: boolean;
  keyCount: number;
  attributeCount: number;
  noPredicate: boolean;
  noExpressions: boolean;
  keyColumn: string | null;
};

type TriggerRow = {
  name: string;
  tableName: string;
  functionName: string;
  enabled: string;
  internal: boolean;
  constraint: boolean;
  deferrable: boolean;
  initiallyDeferred: boolean;
  type: number;
};

type FunctionRow = {
  name: string;
  identityArguments: string;
  result: string;
  language: string;
  kind: string;
};

export type AdminAccessBaseSnapshot = Readonly<{
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  userCount: number;
  userRoleDigest: string;
}>;

export type AdminAccessPostMigrationVerification = Readonly<{
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  userCount: number;
  userRoleDigest: string;
  assignmentCount: number;
}>;

class SafeAdminAccessRehearsalError extends Error {}

/**
 * Captures only a count and a domain-separated SHA-256. User identifiers and
 * roles are never returned to callers or included in error messages.
 */
export function createAdminAccessUserSemanticSnapshot(
  rows: readonly UserRoleRow[],
): AdminAccessBaseSnapshot {
  const users = rows
    .map(({ id, role }) => [id, role] as const)
    .sort(([leftId], [rightId]) =>
      Buffer.compare(Buffer.from(leftId, "utf8"), Buffer.from(rightId, "utf8")),
    );
  const canonical = JSON.stringify({
    domain: USER_DIGEST_DOMAIN,
    users,
  });

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    userCount: users.length,
    userRoleDigest: createHash("sha256").update(canonical).digest("hex"),
  };
}

/**
 * Captures the reviewed base-five source state in one read-only snapshot.
 */
export async function captureAdminAccessBaseSnapshot(
  directUrl: string,
): Promise<AdminAccessBaseSnapshot> {
  return withReadOnlySnapshot(directUrl, BASE_READ_ERROR, async (client) => {
    const users = await readUserRoles(client);
    const knownObjects = await client.query<CountRow>(`
        SELECT (
          (
            SELECT count(*)
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = ANY (ARRAY[
                'admin_access_roles',
                'admin_access_role_permissions',
                'admin_access_role_assignments',
                'admin_access_mutation_state',
                'admin_access_roles_pkey',
                'admin_access_role_permissions_pkey',
                'admin_access_role_assignments_pkey',
                'admin_access_mutation_state_pkey',
                'admin_access_roles_nameKey_key',
                'admin_access_roles_systemKey_key',
                'admin_access_role_assignments_roleId_idx',
                'admin_access_role_assignments_assignedByUserId_idx',
                'admin_access_role_assignments_userId_key'
              ]::text[])
          ) +
          (
            SELECT count(*)
            FROM pg_catalog.pg_type AS type_entry
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = type_entry.typnamespace
            WHERE namespace.nspname = 'public'
              AND type_entry.typtype = 'e'
              AND type_entry.typname = ANY (ARRAY[
                'AdminAccessAction',
                'AdminAccessEffect',
                'AdminAccessSystemRole'
              ]::text[])
          ) +
          (
            SELECT count(*)
            FROM pg_catalog.pg_proc AS proc_entry
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = proc_entry.pronamespace
            WHERE namespace.nspname = 'public'
              AND proc_entry.proname = ANY (ARRAY[
                'bump_admin_access_role_revision',
                'assign_initial_admin_access_role',
                'assert_exactly_one_admin_access_role'
              ]::text[])
          ) +
          (
            SELECT count(*)
            FROM pg_catalog.pg_trigger AS trigger_entry
            JOIN pg_catalog.pg_class AS relation
              ON relation.oid = trigger_entry.tgrelid
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND trigger_entry.tgname = ANY (ARRAY[
                'admin_access_role_assignment_revision',
                'user_initial_admin_access_role',
                'admin_access_role_assignment_exactly_one',
                'admin_access_role_assignment_no_truncate'
              ]::text[])
          ) +
          (
            SELECT count(*)
            FROM pg_catalog.pg_attribute AS attribute
            JOIN pg_catalog.pg_class AS relation
              ON relation.oid = attribute.attrelid
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = 'user'
              AND attribute.attname = 'adminAccessRoleRevision'
              AND attribute.attnum > 0
              AND NOT attribute.attisdropped
          )
        )::integer AS count
      `);

    if (knownObjects.rows[0]?.count !== 0) {
      failSafely(BASE_SCHEMA_ERROR);
    }
    return createAdminAccessUserSemanticSnapshot(users);
  });
}

/**
 * Verifies the reviewed four-migration result without returning row values.
 */
export async function verifyAdminAccessPostMigration(
  directUrl: string,
  sourceSnapshot: AdminAccessBaseSnapshot,
): Promise<AdminAccessPostMigrationVerification> {
  assertValidSourceSnapshot(sourceSnapshot);

  return withReadOnlySnapshot(directUrl, POST_READ_ERROR, async (client) => {
    const users = await readUserRoles(client);
    const assignmentSummary = await client.query<AssignmentSummaryRow>(`
        WITH assignment_counts AS (
          SELECT
            user_row.id,
            user_row.role,
            user_row."adminAccessRoleRevision",
            count(assignment."roleId")::integer AS count,
            min(assignment."roleId") AS "roleId"
          FROM public."user" AS user_row
          LEFT JOIN public.admin_access_role_assignments AS assignment
            ON assignment."userId" = user_row.id
          GROUP BY
            user_row.id,
            user_row.role,
            user_row."adminAccessRoleRevision"
        )
        SELECT
          (
            SELECT count(*)::integer
            FROM public.admin_access_role_assignments
          ) AS "assignmentCount",
          count(*) FILTER (WHERE assignment_counts.count <> 1)::integer
            AS "invalidUserCount",
          (
            SELECT count(*)::integer
            FROM public.admin_access_role_assignments AS assignment
            LEFT JOIN public."user" AS user_row
              ON user_row.id = assignment."userId"
            WHERE user_row.id IS NULL
          ) AS "orphanAssignmentCount",
          count(*) FILTER (
            WHERE assignment_counts."roleId" IS DISTINCT FROM
              CASE
                WHEN assignment_counts.role = 'admin'
                  THEN 'system-full-access'
                ELSE 'system-no-access'
              END
          )::integer AS "invalidSystemRoleCount",
          count(*) FILTER (
            WHERE assignment_counts."adminAccessRoleRevision" IS DISTINCT FROM 1
          )::integer AS "invalidRevisionCount"
        FROM assignment_counts
      `);
    const systemRoles = await client.query<SystemRoleRow>(`
        SELECT id, "systemKey"::text AS "systemKey"
        FROM public.admin_access_roles
        WHERE "systemKey" IS NOT NULL
        ORDER BY id COLLATE "C"
      `);
    const freezeSummary = await client.query<FreezeSummaryRow>(`
        SELECT
          count(*)::integer AS "rowCount",
          count(*) FILTER (
            WHERE id = 'global'
              AND frozen = false
              AND "freezeId" IS NULL
              AND "frozenAt" IS NULL
              AND reason IS NULL
          )::integer AS "validRowCount"
        FROM public.admin_access_mutation_state
      `);
    const indexes = await client.query<IndexRow>(`
        SELECT
          table_relation.relname AS "tableName",
          index_entry.indisunique AS unique,
          index_entry.indisvalid AS valid,
          index_entry.indisready AS ready,
          index_entry.indislive AS live,
          index_entry.indnkeyatts::integer AS "keyCount",
          index_entry.indnatts::integer AS "attributeCount",
          index_entry.indpred IS NULL AS "noPredicate",
          index_entry.indexprs IS NULL AS "noExpressions",
          key_attribute.attname AS "keyColumn"
        FROM pg_catalog.pg_class AS index_relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = index_relation.relnamespace
        JOIN pg_catalog.pg_index AS index_entry
          ON index_entry.indexrelid = index_relation.oid
        JOIN pg_catalog.pg_class AS table_relation
          ON table_relation.oid = index_entry.indrelid
        LEFT JOIN pg_catalog.pg_attribute AS key_attribute
          ON key_attribute.attrelid = table_relation.oid
         AND key_attribute.attnum = index_entry.indkey[0]
        WHERE namespace.nspname = 'public'
          AND index_relation.relname =
            'admin_access_role_assignments_userId_key'
      `);
    const triggers = await client.query<TriggerRow>(`
        SELECT
          trigger_entry.tgname AS name,
          relation.relname AS "tableName",
          proc_entry.proname AS "functionName",
          trigger_entry.tgenabled AS enabled,
          trigger_entry.tgisinternal AS internal,
          trigger_entry.tgconstraint <> 0 AS constraint,
          trigger_entry.tgdeferrable AS deferrable,
          trigger_entry.tginitdeferred AS "initiallyDeferred",
          trigger_entry.tgtype::integer AS type
        FROM pg_catalog.pg_trigger AS trigger_entry
        JOIN pg_catalog.pg_class AS relation
          ON relation.oid = trigger_entry.tgrelid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_proc AS proc_entry
          ON proc_entry.oid = trigger_entry.tgfoid
        WHERE namespace.nspname = 'public'
          AND trigger_entry.tgname = ANY (ARRAY[
            'admin_access_role_assignment_revision',
            'user_initial_admin_access_role',
            'admin_access_role_assignment_exactly_one',
            'admin_access_role_assignment_no_truncate'
          ]::text[])
        ORDER BY trigger_entry.tgname COLLATE "C"
      `);
    const functions = await client.query<FunctionRow>(`
        SELECT
          proc_entry.proname AS name,
          pg_catalog.pg_get_function_identity_arguments(proc_entry.oid)
            AS "identityArguments",
          pg_catalog.pg_get_function_result(proc_entry.oid) AS result,
          language.lanname AS language,
          proc_entry.prokind::text AS kind
        FROM pg_catalog.pg_proc AS proc_entry
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = proc_entry.pronamespace
        JOIN pg_catalog.pg_language AS language
          ON language.oid = proc_entry.prolang
        WHERE namespace.nspname = 'public'
          AND proc_entry.proname = ANY (ARRAY[
            'bump_admin_access_role_revision',
            'assign_initial_admin_access_role',
            'assert_exactly_one_admin_access_role'
          ]::text[])
        ORDER BY proc_entry.proname COLLATE "C",
          pg_catalog.pg_get_function_identity_arguments(proc_entry.oid)
      `);

    const postSnapshot = createAdminAccessUserSemanticSnapshot(users);
    if (
      postSnapshot.userCount !== sourceSnapshot.userCount ||
      postSnapshot.userRoleDigest !== sourceSnapshot.userRoleDigest
    ) {
      failSafely(SOURCE_DIGEST_ERROR);
    }

    const assignments = assignmentSummary.rows[0];
    if (
      assignments === undefined ||
      assignments.invalidUserCount !== 0 ||
      assignments.orphanAssignmentCount !== 0 ||
      assignments.assignmentCount !== postSnapshot.userCount
    ) {
      failSafely(CARDINALITY_ERROR);
    }
    if (
      assignments.invalidSystemRoleCount !== 0 ||
      assignments.invalidRevisionCount !== 0
    ) {
      failSafely(USER_BACKFILL_ERROR);
    }

    if (
      !sameJson(systemRoles.rows, [
        { id: "system-full-access", systemKey: "FULL_ACCESS" },
        { id: "system-no-access", systemKey: "NO_ACCESS" },
      ])
    ) {
      failSafely(SYSTEM_ROLE_ERROR);
    }

    const freeze = freezeSummary.rows[0];
    if (
      freeze === undefined ||
      freeze.rowCount !== 1 ||
      freeze.validRowCount !== 1
    ) {
      failSafely(FREEZE_STATE_ERROR);
    }

    if (
      !sameJson(indexes.rows, [
        {
          tableName: "admin_access_role_assignments",
          unique: true,
          valid: true,
          ready: true,
          live: true,
          keyCount: 1,
          attributeCount: 1,
          noPredicate: true,
          noExpressions: true,
          keyColumn: "userId",
        },
      ]) ||
      !sameJson(triggers.rows, [
        {
          name: "admin_access_role_assignment_exactly_one",
          tableName: "admin_access_role_assignments",
          functionName: "assert_exactly_one_admin_access_role",
          enabled: "O",
          internal: false,
          constraint: true,
          deferrable: true,
          initiallyDeferred: true,
          type: 29,
        },
        {
          name: "admin_access_role_assignment_no_truncate",
          tableName: "admin_access_role_assignments",
          functionName: "assert_exactly_one_admin_access_role",
          enabled: "O",
          internal: false,
          constraint: false,
          deferrable: false,
          initiallyDeferred: false,
          type: 34,
        },
        {
          name: "user_initial_admin_access_role",
          tableName: "user",
          functionName: "assign_initial_admin_access_role",
          enabled: "O",
          internal: false,
          constraint: false,
          deferrable: false,
          initiallyDeferred: false,
          type: 5,
        },
      ]) ||
      !sameJson(functions.rows, [
        {
          name: "assert_exactly_one_admin_access_role",
          identityArguments: "",
          result: "trigger",
          language: "plpgsql",
          kind: "f",
        },
        {
          name: "assign_initial_admin_access_role",
          identityArguments: "",
          result: "trigger",
          language: "plpgsql",
          kind: "f",
        },
      ])
    ) {
      failSafely(CATALOG_ERROR);
    }

    return {
      ...postSnapshot,
      assignmentCount: assignments.assignmentCount,
    };
  });
}

async function readUserRoles(client: Client): Promise<UserRoleRow[]> {
  return (
    await client.query<UserRoleRow>(`
      SELECT id, role
      FROM public."user"
      ORDER BY id COLLATE "C"
    `)
  ).rows;
}

async function withReadOnlySnapshot<Result>(
  directUrl: string,
  safeReadError: string,
  operation: (client: Client) => Promise<Result>,
): Promise<Result> {
  const client = new Client({
    connectionString: directUrl,
    application_name: "zoom-gov-demo-admin-access-rehearsal",
    connectionTimeoutMillis: 45_000,
  });
  let transactionStarted = false;

  try {
    await client.connect();
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    transactionStarted = true;
    const result = await operation(client);
    await client.query("ROLLBACK");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    if (error instanceof SafeAdminAccessRehearsalError) {
      throw error;
    }
    throw new SafeAdminAccessRehearsalError(safeReadError);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function assertValidSourceSnapshot(
  snapshot: AdminAccessBaseSnapshot,
): void {
  if (
    snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
    !Number.isSafeInteger(snapshot.userCount) ||
    snapshot.userCount < 0 ||
    !/^[0-9a-f]{64}$/u.test(snapshot.userRoleDigest)
  ) {
    failSafely(SOURCE_DIGEST_ERROR);
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function failSafely(message: string): never {
  throw new SafeAdminAccessRehearsalError(message);
}
