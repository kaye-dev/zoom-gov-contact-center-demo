import {
  MAINTENANCE_CONFIG_VERSION,
  MAINTENANCE_ENVIRONMENTS,
  isValidMaintenanceRevision,
  parseMaintenanceConfig,
  type MaintenanceConfig,
  type MaintenanceEnvironment,
} from "@/lib/maintenance-config";

export const MAINTENANCE_DATABASE_ENVIRONMENTS = {
  production: "PRODUCTION",
  preview: "PREVIEW",
  development: "DEVELOPMENT",
} as const satisfies Record<MaintenanceEnvironment, string>;

export type MaintenanceDatabaseEnvironment =
  (typeof MAINTENANCE_DATABASE_ENVIRONMENTS)[MaintenanceEnvironment];

export type MaintenanceStoredSetting = {
  environment: MaintenanceEnvironment;
  config: MaintenanceConfig;
  revision: number;
};

export type MaintenanceStoreReadResult =
  | { status: "FOUND"; setting: MaintenanceStoredSetting }
  | { status: "MISSING" }
  | { status: "INVALID" };

export type MaintenanceSettingReader = (
  environment: MaintenanceEnvironment,
) => Promise<MaintenanceStoreReadResult>;

type MaintenanceStoreUpdateBase = {
  environment: MaintenanceEnvironment;
  expectedRevision: number;
  updatedAt: string;
};

export type MaintenanceStoreUpdate =
  | (MaintenanceStoreUpdateBase & {
      mode: "DISABLED" | "ENABLED";
    })
  | (MaintenanceStoreUpdateBase & {
      mode: "SCHEDULED";
      scheduledStartAt: string;
      scheduledEndAt: string;
    });

export type MaintenanceStoreWriteResult =
  | { status: "UPDATED"; setting: MaintenanceStoredSetting }
  | { status: "CONFLICT" };

export type MaintenanceSettingWriter = (
  update: MaintenanceStoreUpdate,
) => Promise<MaintenanceStoreWriteResult>;

export type MaintenanceEnvironmentVariables = Readonly<
  Record<string, string | undefined>
>;

export class MaintenanceStoreReadError extends Error {
  constructor() {
    super("Maintenance configuration could not be read.");
    this.name = "MaintenanceStoreReadError";
  }
}

export class MaintenanceStoreWriteError extends Error {
  constructor() {
    super("Maintenance configuration could not be saved.");
    this.name = "MaintenanceStoreWriteError";
  }
}

const DATABASE_ROW_KEYS = [
  "environment",
  "version",
  "mode",
  "scheduledStartAt",
  "scheduledEndAt",
  "revision",
  "updatedAt",
] as const;

export function parseMaintenanceStoreRow(
  value: unknown,
): MaintenanceStoredSetting | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, DATABASE_ROW_KEYS) ||
    typeof value.environment !== "string" ||
    !isValidMaintenanceRevision(value.revision)
  ) {
    return null;
  }

  const environment = fromMaintenanceDatabaseEnvironment(
    value.environment,
  );
  const scheduledStartAt = normalizeNullableInstant(
    value.scheduledStartAt,
  );
  const scheduledEndAt = normalizeNullableInstant(value.scheduledEndAt);
  const updatedAt = normalizeInstant(value.updatedAt);

  if (
    environment === null ||
    scheduledStartAt === undefined ||
    scheduledEndAt === undefined ||
    updatedAt === null
  ) {
    return null;
  }

  const config = parseMaintenanceConfig({
    version: value.version,
    mode: value.mode,
    scheduledStartAt,
    scheduledEndAt,
    updatedAt,
  });
  if (config === null) return null;

  return {
    environment,
    config,
    revision: value.revision,
  };
}

export function toMaintenanceDatabaseEnvironment(
  environment: MaintenanceEnvironment,
): MaintenanceDatabaseEnvironment {
  return MAINTENANCE_DATABASE_ENVIRONMENTS[environment];
}

export function fromMaintenanceDatabaseEnvironment(
  value: string,
): MaintenanceEnvironment | null {
  for (const environment of MAINTENANCE_ENVIRONMENTS) {
    if (MAINTENANCE_DATABASE_ENVIRONMENTS[environment] === value) {
      return environment;
    }
  }

  return null;
}

export function isValidMaintenanceStoreUpdate(
  update: MaintenanceStoreUpdate,
): boolean {
  if (
    !MAINTENANCE_ENVIRONMENTS.includes(update.environment) ||
    !isValidMaintenanceRevision(update.expectedRevision)
  ) {
    return false;
  }

  return (
    parseMaintenanceConfig({
      version: MAINTENANCE_CONFIG_VERSION,
      mode: update.mode,
      scheduledStartAt:
        update.mode === "SCHEDULED" ? update.scheduledStartAt : null,
      scheduledEndAt:
        update.mode === "SCHEDULED" ? update.scheduledEndAt : null,
      updatedAt: update.updatedAt,
    }) !== null
  );
}

function normalizeNullableInstant(
  value: unknown,
): string | null | undefined {
  if (value === null) return null;

  return normalizeInstant(value) ?? undefined;
}

function normalizeInstant(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== "string") return null;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
