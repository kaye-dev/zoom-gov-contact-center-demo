import { Client } from "pg";

export type AppliedMigration = {
  name: string;
  checksum: string;
  finished: boolean;
  rolledBack: boolean;
  logs: string | null;
};

export type DatabaseInspection = {
  migrationsTableExists: boolean;
  migrations: AppliedMigration[];
  userTables: string[];
  userObjects: string[];
  tablesWithData: string[];
  adminAccessRoleCardinalityViolations: number | null;
};

export async function inspectDatabase(
  directUrl: string,
): Promise<DatabaseInspection> {
  const client = new Client({
    connectionString: directUrl,
    application_name: "zoom-gov-demo-deploy-audit",
    connectionTimeoutMillis: 45_000,
  });

  try {
    await client.connect();
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const tableResult = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists`,
    );
    const migrationsTableExists = tableResult.rows[0]?.exists === true;
    const migrations = migrationsTableExists
      ? (
          await client.query<{
            migration_name: string;
            checksum: string;
            finished: boolean;
            rolled_back: boolean;
            logs: string | null;
          }>(`
            SELECT
              migration_name,
              checksum,
              finished_at IS NOT NULL AS finished,
              rolled_back_at IS NOT NULL AS rolled_back,
              logs
            FROM public._prisma_migrations
            ORDER BY started_at ASC, id ASC
          `)
        ).rows.map((row) => ({
          name: row.migration_name,
          checksum: row.checksum,
          finished: row.finished,
          rolledBack: row.rolled_back,
          logs: row.logs,
        }))
      : [];

    const tableRows = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `);
    const userTables = tableRows.rows.map((row) => row.table_name);
    const objectRows = await client.query<{
      object_kind: string;
      object_name: string;
    }>(`
      SELECT object_kind, object_name
      FROM (
        SELECT
          CASE c.relkind
            WHEN 'r' THEN 'table'
            WHEN 'p' THEN 'partitioned-table'
            WHEN 'v' THEN 'view'
            WHEN 'm' THEN 'materialized-view'
            WHEN 'S' THEN 'sequence'
            WHEN 'f' THEN 'foreign-table'
            ELSE c.relkind::text
          END AS object_kind,
          c.relname AS object_name
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
          AND c.relname <> '_prisma_migrations'
        UNION ALL
        SELECT
          CASE t.typtype WHEN 'e' THEN 'enum' ELSE 'domain' END,
          t.typname
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
        UNION ALL
        SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
      ) AS objects
      ORDER BY object_kind, object_name
    `);
    const userObjects = objectRows.rows.map(
      (row) => `${row.object_kind}:${row.object_name}`,
    );
    const tablesWithData: string[] = [];

    for (const table of userTables) {
      const quoted = `"${table.replaceAll('"', '""')}"`;
      const result = await client.query<{ has_rows: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM public.${quoted} LIMIT 1) AS has_rows`,
      );
      if (result.rows[0]?.has_rows === true) {
        tablesWithData.push(table);
      }
    }

    const adminAccessRoleCardinalityViolations =
      userTables.includes("user") &&
      userTables.includes("admin_access_role_assignments")
        ? (
            await client.query<{ count: number }>(`
              SELECT count(*)::integer AS count
              FROM (
                SELECT u.id
                FROM public."user" AS u
                LEFT JOIN public."admin_access_role_assignments" AS a
                  ON a."userId" = u.id
                GROUP BY u.id
                HAVING count(a."roleId") <> 1
              ) AS invalid_assignments
            `)
          ).rows[0]?.count ?? 0
        : null;

    await client.query("ROLLBACK");
    return {
      migrationsTableExists,
      migrations,
      userTables,
      userObjects,
      tablesWithData,
      adminAccessRoleCardinalityViolations,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}
