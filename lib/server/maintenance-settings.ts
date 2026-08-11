import {
  getMaintenanceConfigKey,
  parseMaintenanceConfig,
  parseMaintenanceUpdateInput,
  resolveMaintenanceEffectiveState,
  resolveMaintenanceEnvironment,
  unavailableMaintenanceReadResult,
  validMaintenanceReadResult,
  type MaintenanceConfig,
  type MaintenanceConfigKey,
  type MaintenanceConfigReadResult,
  type MaintenanceConfigReadStatus,
  type MaintenanceEffectiveState,
  type MaintenanceEnvironment,
  type MaintenanceUpdateValidationResult,
} from "@/lib/maintenance-config";

import {
  readMaintenanceEdgeConfigItem,
  writeMaintenanceEdgeConfigItem,
  type MaintenanceEnvironmentVariables,
} from "./maintenance-edge-config";

export type MaintenanceSettingsSnapshot = {
  environment: MaintenanceEnvironment;
  configKey: MaintenanceConfigKey;
  config: MaintenanceConfig | null;
  readStatus: MaintenanceConfigReadStatus;
  effective: MaintenanceEffectiveState;
};

type MaintenanceSettingsRead = (
  key: MaintenanceConfigKey,
) => Promise<unknown>;

type MaintenanceSettingsWrite = (
  key: MaintenanceConfigKey,
  config: MaintenanceConfig,
) => Promise<void>;

export type MaintenanceSettingsOptions = {
  requestHostname: string | null | undefined;
  env?: MaintenanceEnvironmentVariables;
  now?: Date;
  readItem?: MaintenanceSettingsRead;
};

export type SaveMaintenanceSettingsOptions = MaintenanceSettingsOptions & {
  writeItem?: MaintenanceSettingsWrite;
};

export type SaveMaintenanceSettingsResult =
  | Extract<MaintenanceUpdateValidationResult, { ok: false }>
  | { ok: true; snapshot: MaintenanceSettingsSnapshot };

export class MaintenanceSettingsUnavailableError extends Error {
  constructor() {
    super("Maintenance settings are unavailable.");
    this.name = "MaintenanceSettingsUnavailableError";
  }
}

export class MaintenanceSettingsSaveError extends Error {
  constructor() {
    super("Maintenance settings could not be saved.");
    this.name = "MaintenanceSettingsSaveError";
  }
}

/**
 * Returns a request-scoped snapshot. Missing, malformed, and failed reads are
 * represented rather than thrown so the request gate can reliably fail closed.
 */
export async function getMaintenanceSettingsSnapshot(
  options: MaintenanceSettingsOptions,
): Promise<MaintenanceSettingsSnapshot> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const { environment, configKey } = resolveScope(
    options.requestHostname,
    env,
  );
  const readItem =
    options.readItem ??
    ((key: MaintenanceConfigKey) =>
      readMaintenanceEdgeConfigItem(key, { env }));

  try {
    const rawConfig = await readItem(configKey);
    if (rawConfig === undefined) {
      return createSnapshot(
        environment,
        configKey,
        unavailableMaintenanceReadResult("MISSING"),
        now,
      );
    }

    const config = parseMaintenanceConfig(rawConfig);
    if (config === null) {
      return createSnapshot(
        environment,
        configKey,
        unavailableMaintenanceReadResult("INVALID"),
        now,
      );
    }

    return createSnapshot(
      environment,
      configKey,
      validMaintenanceReadResult(config),
      now,
    );
  } catch {
    return createSnapshot(
      environment,
      configKey,
      unavailableMaintenanceReadResult("ERROR"),
      now,
    );
  }
}

/**
 * Validates an admin update, requires a fresh valid read, and performs one
 * scoped upsert. Manual modes preserve the currently stored UTC schedule pair.
 */
export async function saveMaintenanceSettings(
  input: unknown,
  options: SaveMaintenanceSettingsOptions,
): Promise<SaveMaintenanceSettingsResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const parsed = parseMaintenanceUpdateInput(input, now);
  if (!parsed.ok) return parsed;

  const current = await getMaintenanceSettingsSnapshot({
    requestHostname: options.requestHostname,
    env,
    now,
    readItem: options.readItem,
  });

  if (current.readStatus !== "VALID" || current.config === null) {
    throw new MaintenanceSettingsUnavailableError();
  }

  const config: MaintenanceConfig =
    parsed.value.mode === "SCHEDULED"
      ? parsed.value
      : {
          ...parsed.value,
          scheduledStartAt: current.config.scheduledStartAt,
          scheduledEndAt: current.config.scheduledEndAt,
        };
  const writeItem =
    options.writeItem ??
    ((key: MaintenanceConfigKey, value: MaintenanceConfig) =>
      writeMaintenanceEdgeConfigItem(key, value, { env }));

  try {
    await writeItem(current.configKey, config);
  } catch {
    throw new MaintenanceSettingsSaveError();
  }

  return {
    ok: true,
    snapshot: createSnapshot(
      current.environment,
      current.configKey,
      validMaintenanceReadResult(config),
      now,
    ),
  };
}

function resolveScope(
  requestHostname: string | null | undefined,
  env: MaintenanceEnvironmentVariables,
) {
  const environment = resolveMaintenanceEnvironment({
    nodeEnv: env.NODE_ENV,
    requestHostname,
    betterAuthUrl: env.BETTER_AUTH_URL,
    vercelProjectProductionUrl: env.VERCEL_PROJECT_PRODUCTION_URL,
  });

  return {
    environment,
    configKey: getMaintenanceConfigKey(environment),
  };
}

function createSnapshot(
  environment: MaintenanceEnvironment,
  configKey: MaintenanceConfigKey,
  readResult: MaintenanceConfigReadResult,
  now: Date,
): MaintenanceSettingsSnapshot {
  return {
    environment,
    configKey,
    config: readResult.config,
    readStatus: readResult.status,
    effective: resolveMaintenanceEffectiveState(readResult, now),
  };
}
