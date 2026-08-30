import { Pool, type PoolConfig } from "pg";

import {
  MAINTENANCE_ENVIRONMENTS,
  type MaintenanceEnvironment,
} from "@/lib/maintenance-config";

import {
  MaintenanceStoreReadError,
  parseMaintenanceStoreRow,
  toMaintenanceDatabaseEnvironment,
  type MaintenanceEnvironmentVariables,
  type MaintenanceStoreReadResult,
} from "./maintenance-store";

const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/zoom_demo";

export const MAINTENANCE_POSTGRES_POOL_MAX = 2;
// Vercel Routing Middleware executes globally, so a request can establish its
// first pooled connection across regions before it reaches the Singapore DB.
// Keep the read bounded and fail closed, but allow that cold connection to
// complete instead of classifying ordinary cross-region latency as downtime.
export const MAINTENANCE_POSTGRES_CONNECTION_TIMEOUT_MS = 10_000;
export const MAINTENANCE_POSTGRES_QUERY_TIMEOUT_MS = 2_000;
export const MAINTENANCE_POSTGRES_READ_TIMEOUT_MS = 15_000;
export const MAINTENANCE_POSTGRES_IDLE_TIMEOUT_MS = 10_000;

export const MAINTENANCE_POSTGRES_READ_QUERY = `
SELECT
  "environment",
  "version",
  "mode",
  "scheduledStartAt",
  "scheduledEndAt",
  "revision",
  "updatedAt"
FROM "site_maintenance_settings"
WHERE "environment" = $1::"MaintenanceEnvironment"
LIMIT 1
`.trim();

type MaintenancePostgresClient = {
  query(input: {
    text: string;
    values: unknown[];
  }): Promise<{ rows: unknown[] }>;
  release(error?: Error | boolean): void;
};

export type MaintenancePostgresPool = {
  connect(): Promise<MaintenancePostgresClient>;
};

type MaintenanceTimeoutScheduler = (
  callback: () => void,
  delayMs: number,
) => unknown;

type MaintenanceTimeoutClearer = (handle: unknown) => void;

export type MaintenancePostgresReadOptions = {
  env?: MaintenanceEnvironmentVariables;
  pool?: MaintenancePostgresPool;
  readTimeoutMs?: number;
  scheduleTimeoutImpl?: MaintenanceTimeoutScheduler;
  clearTimeoutImpl?: MaintenanceTimeoutClearer;
};

let defaultPool: Pool | undefined;
let defaultPoolConnectionString: string | undefined;

export async function readMaintenanceSettingFromPostgres(
  environment: MaintenanceEnvironment,
  options: MaintenancePostgresReadOptions = {},
): Promise<MaintenanceStoreReadResult> {
  const env = options.env ?? process.env;
  const readTimeoutMs =
    options.readTimeoutMs ?? MAINTENANCE_POSTGRES_READ_TIMEOUT_MS;
  const scheduleTimeoutImpl =
    options.scheduleTimeoutImpl ??
    ((callback: () => void, delayMs: number) =>
      setTimeout(callback, delayMs));
  const clearTimeoutImpl =
    options.clearTimeoutImpl ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));

  if (
    !MAINTENANCE_ENVIRONMENTS.includes(environment) ||
    !Number.isSafeInteger(readTimeoutMs) ||
    readTimeoutMs <= 0
  ) {
    throw new MaintenanceStoreReadError();
  }

  let client: MaintenancePostgresClient | undefined;
  let released = false;
  let deadlineExpired = false;
  let timeoutHandle: unknown;
  let timeoutScheduled = false;
  let releaseError: Error | undefined;

  const releaseClient = (error?: Error) => {
    if (!client || released) return;

    released = true;
    try {
      client.release(error);
    } catch {
      // The request outcome is already fixed. Never surface a driver release
      // error that could include connection metadata.
    }
  };

  try {
    const pool = options.pool ?? getDefaultMaintenancePool(env);
    const executeRead = async (): Promise<MaintenanceStoreReadResult> => {
      const acquiredClient = await pool.connect();
      client = acquiredClient;

      if (deadlineExpired) {
        releaseError = new MaintenanceStoreReadError();
        releaseClient(releaseError);
        throw releaseError;
      }

      const result = await client.query({
        text: MAINTENANCE_POSTGRES_READ_QUERY,
        values: [toMaintenanceDatabaseEnvironment(environment)],
      });

      if (result.rows.length === 0) return { status: "MISSING" };
      if (result.rows.length !== 1) return { status: "INVALID" };

      const setting = parseMaintenanceStoreRow(result.rows[0]);
      if (setting === null || setting.environment !== environment) {
        return { status: "INVALID" };
      }

      return { status: "FOUND", setting };
    };

    return await new Promise<MaintenanceStoreReadResult>((resolve, reject) => {
      timeoutHandle = scheduleTimeoutImpl(() => {
        deadlineExpired = true;
        releaseError = new MaintenanceStoreReadError();
        releaseClient(releaseError);
        reject(releaseError);
      }, readTimeoutMs);
      timeoutScheduled = true;
      void executeRead().then(resolve, reject);
    });
  } catch {
    releaseError ??= new MaintenanceStoreReadError();
    throw new MaintenanceStoreReadError();
  } finally {
    if (timeoutScheduled) clearTimeoutImpl(timeoutHandle);
    releaseClient(releaseError);
  }
}

export function resolveMaintenancePostgresPoolConfig(
  env: MaintenanceEnvironmentVariables,
): PoolConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString && env.NODE_ENV === "production") {
    throw new MaintenanceStoreReadError();
  }

  return {
    connectionString: connectionString ?? LOCAL_DATABASE_URL,
    max: MAINTENANCE_POSTGRES_POOL_MAX,
    application_name: "zoom-gov-demo-maintenance-proxy",
    connectionTimeoutMillis: MAINTENANCE_POSTGRES_CONNECTION_TIMEOUT_MS,
    query_timeout: MAINTENANCE_POSTGRES_QUERY_TIMEOUT_MS,
    idleTimeoutMillis: MAINTENANCE_POSTGRES_IDLE_TIMEOUT_MS,
    allowExitOnIdle: true,
  };
}

function getDefaultMaintenancePool(
  env: MaintenanceEnvironmentVariables,
): MaintenancePostgresPool {
  const config = resolveMaintenancePostgresPoolConfig(env);
  const connectionString = String(config.connectionString);

  if (
    defaultPool &&
    defaultPoolConnectionString !== connectionString
  ) {
    throw new MaintenanceStoreReadError();
  }

  if (!defaultPool) {
    defaultPool = new Pool(config);
    defaultPoolConnectionString = connectionString;
    defaultPool.on("error", () => {
      console.error("Maintenance database pool reported an idle client error.");
    });
  }

  return defaultPool;
}
