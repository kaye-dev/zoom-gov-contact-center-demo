import {
  createClient,
  parseConnectionString,
} from "@vercel/edge-config";

import {
  MAINTENANCE_CONFIG_KEYS,
  parseMaintenanceConfig,
  type MaintenanceConfig,
  type MaintenanceConfigKey,
} from "@/lib/maintenance-config";

export const MAINTENANCE_EDGE_CONFIG_CLIENT_OPTIONS = {
  staleIfError: false,
  disableDevelopmentCache: true,
  cache: "no-store",
} as const;

export const MAINTENANCE_EDGE_CONFIG_READ_TIMEOUT_MS = 2_000;

const VERCEL_EDGE_CONFIG_API_ROOT =
  "https://api.vercel.com/v1/edge-config";
const EDGE_CONFIG_ID_PATTERN = /^ecfg_[A-Za-z0-9_-]+$/;
const TEAM_ID_PATTERN = /^team_[A-Za-z0-9_-]+$/;

export type MaintenanceEnvironmentVariables = Readonly<
  Record<string, string | undefined>
>;

type MaintenanceEdgeConfigClient = {
  get(key: string): Promise<unknown>;
};

type EdgeConfigClientFactory = (
  connectionString: string | undefined,
  options: typeof MAINTENANCE_EDGE_CONFIG_CLIENT_OPTIONS,
) => MaintenanceEdgeConfigClient;

type MaintenanceTimeoutScheduler = (
  callback: () => void,
  delayMs: number,
) => unknown;

type MaintenanceTimeoutClearer = (handle: unknown) => void;

type MaintenanceEdgeConfigReadOptions = {
  env?: MaintenanceEnvironmentVariables;
  createClientImpl?: EdgeConfigClientFactory;
  readTimeoutMs?: number;
  scheduleTimeoutImpl?: MaintenanceTimeoutScheduler;
  clearTimeoutImpl?: MaintenanceTimeoutClearer;
};

type MaintenanceEdgeConfigWriteOptions = {
  env?: MaintenanceEnvironmentVariables;
  fetchImpl?: typeof fetch;
};

export class MaintenanceEdgeConfigReadError extends Error {
  constructor() {
    super("Maintenance configuration could not be read.");
    this.name = "MaintenanceEdgeConfigReadError";
  }
}

export class MaintenanceEdgeConfigWriteError extends Error {
  constructor() {
    super("Maintenance configuration could not be saved.");
    this.name = "MaintenanceEdgeConfigWriteError";
  }
}

/**
 * Reads one environment-scoped item through the Edge Config SDK. Stale values
 * are explicitly disabled because a stale DISABLED value must never bypass the
 * fail-closed maintenance gate during an upstream error.
 */
export async function readMaintenanceEdgeConfigItem(
  key: MaintenanceConfigKey,
  options: MaintenanceEdgeConfigReadOptions = {},
): Promise<unknown> {
  const env = options.env ?? process.env;
  const connectionString = env.EDGE_CONFIG?.trim();
  const createClientImpl = options.createClientImpl ?? createClient;
  const readTimeoutMs =
    options.readTimeoutMs ?? MAINTENANCE_EDGE_CONFIG_READ_TIMEOUT_MS;
  const scheduleTimeoutImpl =
    options.scheduleTimeoutImpl ??
    ((callback: () => void, delayMs: number) =>
      setTimeout(callback, delayMs));
  const clearTimeoutImpl =
    options.clearTimeoutImpl ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));

  if (
    !connectionString ||
    !isMaintenanceConfigKey(key) ||
    !Number.isSafeInteger(readTimeoutMs) ||
    readTimeoutMs <= 0
  ) {
    throw new MaintenanceEdgeConfigReadError();
  }

  let timeoutHandle: unknown;
  let timeoutScheduled = false;

  try {
    const client = createClientImpl(
      connectionString,
      MAINTENANCE_EDGE_CONFIG_CLIENT_OPTIONS,
    );
    return await new Promise<unknown>((resolve, reject) => {
      timeoutHandle = scheduleTimeoutImpl(
        () => reject(new MaintenanceEdgeConfigReadError()),
        readTimeoutMs,
      );
      timeoutScheduled = true;
      Promise.resolve()
        .then(() => client.get(key))
        .then(resolve, reject);
    });
  } catch {
    // SDK errors can contain connection details. Replace them rather than
    // attaching a cause or logging the original error.
    throw new MaintenanceEdgeConfigReadError();
  } finally {
    if (timeoutScheduled) {
      clearTimeoutImpl(timeoutHandle);
    }
  }
}

/**
 * Upserts exactly one environment-scoped item using Vercel's management REST
 * API. The write token is sent only in the Authorization header.
 */
export async function writeMaintenanceEdgeConfigItem(
  key: MaintenanceConfigKey,
  config: MaintenanceConfig,
  options: MaintenanceEdgeConfigWriteOptions = {},
): Promise<void> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const connectionString = env.EDGE_CONFIG?.trim();
  const edgeConfigId = env.MAINTENANCE_EDGE_CONFIG_ID?.trim();
  const teamId = env.MAINTENANCE_EDGE_CONFIG_TEAM_ID?.trim();
  const writeToken = env.MAINTENANCE_EDGE_CONFIG_WRITE_TOKEN?.trim();
  const normalizedConfig = parseMaintenanceConfig(config);

  if (
    !connectionString ||
    !edgeConfigId ||
    !teamId ||
    !writeToken ||
    !EDGE_CONFIG_ID_PATTERN.test(edgeConfigId) ||
    !TEAM_ID_PATTERN.test(teamId) ||
    !isMaintenanceConfigKey(key) ||
    normalizedConfig === null
  ) {
    throw new MaintenanceEdgeConfigWriteError();
  }

  const connection = parseConnectionString(connectionString);
  if (!connection || connection.id !== edgeConfigId) {
    throw new MaintenanceEdgeConfigWriteError();
  }

  const endpoint = new URL(
    `${VERCEL_EDGE_CONFIG_API_ROOT}/${encodeURIComponent(edgeConfigId)}/items`,
  );
  endpoint.searchParams.set("teamId", teamId);

  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${writeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            operation: "upsert",
            key,
            value: normalizedConfig,
          },
        ],
      }),
      cache: "no-store",
    });
    const responseBody = (await response.json().catch(() => null)) as
      | { status?: unknown }
      | null;

    if (!response.ok || responseBody?.status !== "ok") {
      throw new MaintenanceEdgeConfigWriteError();
    }
  } catch {
    // Never surface a fetch error that could embed request headers or tokens.
    throw new MaintenanceEdgeConfigWriteError();
  }
}

function isMaintenanceConfigKey(value: string): value is MaintenanceConfigKey {
  return (Object.values(MAINTENANCE_CONFIG_KEYS) as string[]).includes(value);
}
