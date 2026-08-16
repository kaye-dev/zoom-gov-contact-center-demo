import { Client } from "pg";

export const MAINTENANCE_ENVIRONMENTS = [
  "PRODUCTION",
  "PREVIEW",
  "DEVELOPMENT",
] as const;

export type MaintenanceEnvironment =
  (typeof MAINTENANCE_ENVIRONMENTS)[number];

export type MaintenanceMode = "DISABLED" | "ENABLED" | "SCHEDULED";

export type MaintenanceSetting = {
  environment: MaintenanceEnvironment;
  version: 1;
  mode: MaintenanceMode;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  revision: number;
  updatedAt: string;
};

export type MaintenanceSettingsSnapshot = Record<
  MaintenanceEnvironment,
  MaintenanceSetting
>;

export type MaintenancePublicExpectation = {
  environment: MaintenanceEnvironment;
  status: 200 | 503;
  retryAfter?: string;
};

export type MaintenanceDatabaseClient = {
  connect(): Promise<unknown>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
};

export type MaintenanceDatabaseClientFactory = (
  directUrl: string,
) => MaintenanceDatabaseClient;

type MaintenanceConstraintRow = {
  name: string;
  definition: string;
};

const MAINTENANCE_SETTING_FIELDS = [
  "environment",
  "mode",
  "revision",
  "scheduledEndAt",
  "scheduledStartAt",
  "updatedAt",
  "version",
] as const;

const EXPECTED_CONSTRAINTS = new Map<string, RegExp>([
  [
    "site_maintenance_settings_version_check",
    /^CHECK version = 1$/i,
  ],
  [
    "site_maintenance_settings_revision_check",
    /^CHECK revision > 0$/i,
  ],
  [
    "site_maintenance_settings_schedule_pair_check",
    /^CHECK scheduledStartAt IS NULL = scheduledEndAt IS NULL$/i,
  ],
  [
    "site_maintenance_settings_schedule_order_check",
    /^CHECK scheduledStartAt IS NULL OR scheduledStartAt < scheduledEndAt$/i,
  ],
  [
    "site_maintenance_settings_scheduled_mode_check",
    /^CHECK mode <> 'SCHEDULED'(?:::[A-Za-z_][A-Za-z0-9_]*)? OR scheduledStartAt IS NOT NULL AND scheduledEndAt IS NOT NULL$/i,
  ],
]);

const MAINTENANCE_ROWS_SQL = `
  SELECT
    "environment"::text AS "environment",
    "version" AS "version",
    "mode"::text AS "mode",
    CASE
      WHEN "scheduledStartAt" IS NULL THEN NULL
      ELSE to_char(
        "scheduledStartAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    END AS "scheduledStartAt",
    CASE
      WHEN "scheduledEndAt" IS NULL THEN NULL
      ELSE to_char(
        "scheduledEndAt" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    END AS "scheduledEndAt",
    "revision" AS "revision",
    to_char(
      "updatedAt" AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) AS "updatedAt"
  FROM public."site_maintenance_settings"
  ORDER BY "environment"::text
`;

const MAINTENANCE_CONSTRAINTS_SQL = `
  SELECT
    constraint_record.conname AS "name",
    pg_get_constraintdef(constraint_record.oid, true) AS "definition"
  FROM pg_catalog.pg_constraint AS constraint_record
  JOIN pg_catalog.pg_class AS table_record
    ON table_record.oid = constraint_record.conrelid
  JOIN pg_catalog.pg_namespace AS namespace_record
    ON namespace_record.oid = table_record.relnamespace
  WHERE namespace_record.nspname = 'public'
    AND table_record.relname = 'site_maintenance_settings'
    AND constraint_record.contype = 'c'
  ORDER BY constraint_record.conname
`;

export async function verifyMaintenanceSettingsDatabase(
  directUrl: string,
  createClient: MaintenanceDatabaseClientFactory = createPgClient,
): Promise<MaintenanceSettingsSnapshot> {
  if (!directUrl.trim()) {
    throw new Error("Maintenance settings database verification failed.");
  }

  let client: MaintenanceDatabaseClient;
  try {
    client = createClient(directUrl);
  } catch {
    throw new Error("Maintenance settings database verification failed.");
  }
  let transactionStarted = false;
  try {
    await client.connect();
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    transactionStarted = true;
    const constraints = await client.query<MaintenanceConstraintRow>(
      MAINTENANCE_CONSTRAINTS_SQL,
    );
    assertMaintenanceConstraints(constraints.rows);
    const settings = await client.query<Record<string, unknown>>(
      MAINTENANCE_ROWS_SQL,
    );
    const snapshot = parseMaintenanceSettingRows(settings.rows);
    await client.query("ROLLBACK");
    transactionStarted = false;
    return snapshot;
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    if (error instanceof MaintenanceSettingsVerificationError) {
      throw error;
    }
    throw new Error("Maintenance settings database verification failed.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function readMaintenanceSettingsDatabase(
  directUrl: string,
  createClient: MaintenanceDatabaseClientFactory = createPgClient,
): Promise<MaintenanceSettingsSnapshot> {
  return verifyMaintenanceSettingsDatabase(directUrl, createClient);
}

export function parseMaintenanceSettingRows(
  rows: readonly Record<string, unknown>[],
): MaintenanceSettingsSnapshot {
  if (rows.length !== MAINTENANCE_ENVIRONMENTS.length) {
    throw new MaintenanceSettingsVerificationError(
      "Maintenance settings must contain exactly three environment rows.",
    );
  }

  const settings = new Map<MaintenanceEnvironment, MaintenanceSetting>();
  for (const row of rows) {
    const setting = parseMaintenanceSetting(row);
    if (settings.has(setting.environment)) {
      throw invalidMaintenanceSetting(setting.environment);
    }
    settings.set(setting.environment, setting);
  }

  for (const environment of MAINTENANCE_ENVIRONMENTS) {
    if (!settings.has(environment)) {
      throw invalidMaintenanceSetting(environment);
    }
  }

  return Object.fromEntries(settings) as MaintenanceSettingsSnapshot;
}

export function assertMaintenanceConstraints(
  rows: readonly MaintenanceConstraintRow[],
): void {
  if (rows.length !== EXPECTED_CONSTRAINTS.size) {
    throw new MaintenanceSettingsVerificationError(
      "Maintenance settings database constraints are incomplete or unexpected.",
    );
  }

  const actual = new Map(rows.map((row) => [row.name, row.definition]));
  if (actual.size !== rows.length) {
    throw new MaintenanceSettingsVerificationError(
      "Maintenance settings database constraints are duplicated.",
    );
  }

  for (const [name, expectedDefinition] of EXPECTED_CONSTRAINTS) {
    const definition = actual.get(name);
    if (
      typeof definition !== "string" ||
      !expectedDefinition.test(normalizeConstraintDefinition(definition))
    ) {
      throw new MaintenanceSettingsVerificationError(
        `Maintenance settings database constraint ${name} is missing or invalid.`,
      );
    }
  }
}

export function createMaintenancePublicExpectation(
  snapshot: MaintenanceSettingsSnapshot,
  environment: MaintenanceEnvironment,
  now = new Date(),
): MaintenancePublicExpectation {
  const setting = snapshot[environment];
  if (setting.mode === "ENABLED") {
    return { environment, status: 503 };
  }
  if (
    setting.mode === "SCHEDULED" &&
    Date.parse(setting.scheduledStartAt!) <= now.getTime() &&
    now.getTime() < Date.parse(setting.scheduledEndAt!)
  ) {
    return {
      environment,
      status: 503,
      retryAfter: new Date(setting.scheduledEndAt!).toUTCString(),
    };
  }
  return { environment, status: 200 };
}

class MaintenanceSettingsVerificationError extends Error {}

function parseMaintenanceSetting(
  row: Record<string, unknown>,
): MaintenanceSetting {
  const fields = Object.keys(row).sort();
  if (
    fields.length !== MAINTENANCE_SETTING_FIELDS.length ||
    fields.some((field, index) => field !== MAINTENANCE_SETTING_FIELDS[index]) ||
    !isMaintenanceEnvironment(row.environment) ||
    row.version !== 1 ||
    !isMaintenanceMode(row.mode) ||
    !isNullableUtcIsoTimestamp(row.scheduledStartAt) ||
    !isNullableUtcIsoTimestamp(row.scheduledEndAt) ||
    !Number.isSafeInteger(row.revision) ||
    (row.revision as number) <= 0 ||
    !isUtcIsoTimestamp(row.updatedAt)
  ) {
    throw invalidMaintenanceSetting(
      isMaintenanceEnvironment(row.environment) ? row.environment : undefined,
    );
  }

  const hasScheduledStart = row.scheduledStartAt !== null;
  const hasScheduledEnd = row.scheduledEndAt !== null;
  if (
    hasScheduledStart !== hasScheduledEnd ||
    (hasScheduledStart &&
      hasScheduledEnd &&
      Date.parse(row.scheduledStartAt as string) >=
        Date.parse(row.scheduledEndAt as string)) ||
    (row.mode === "SCHEDULED" && (!hasScheduledStart || !hasScheduledEnd))
  ) {
    throw invalidMaintenanceSetting(row.environment);
  }

  return {
    environment: row.environment,
    version: 1,
    mode: row.mode,
    scheduledStartAt: row.scheduledStartAt,
    scheduledEndAt: row.scheduledEndAt,
    revision: row.revision as number,
    updatedAt: row.updatedAt,
  };
}

function createPgClient(directUrl: string): MaintenanceDatabaseClient {
  return new Client({
    connectionString: directUrl,
    application_name: "zoom-gov-demo-maintenance-deploy-audit",
    connectionTimeoutMillis: 45_000,
    query_timeout: 30_000,
  });
}

function normalizeConstraintDefinition(value: string): string {
  return value
    .replaceAll('"', "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMaintenanceEnvironment(
  value: unknown,
): value is MaintenanceEnvironment {
  return (
    typeof value === "string" &&
    (MAINTENANCE_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

function isMaintenanceMode(value: unknown): value is MaintenanceMode {
  return value === "DISABLED" || value === "ENABLED" || value === "SCHEDULED";
}

function isNullableUtcIsoTimestamp(value: unknown): value is string | null {
  return value === null || isUtcIsoTimestamp(value);
}

function isUtcIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(
      value,
    );
  if (!match) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function invalidMaintenanceSetting(
  environment: MaintenanceEnvironment | undefined,
): MaintenanceSettingsVerificationError {
  return new MaintenanceSettingsVerificationError(
    environment
      ? `Maintenance settings row ${environment} is invalid.`
      : "Maintenance settings contain an invalid environment row.",
  );
}
