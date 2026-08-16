import {
  getMaintenanceConfigKey,
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
} from "@/lib/maintenance-config";

import { readMaintenanceSettingFromPostgres } from "./maintenance-postgres-reader";
import {
  type MaintenanceEnvironmentVariables,
  type MaintenanceSettingReader,
  type MaintenanceStoreReadResult,
} from "./maintenance-store";

export type MaintenanceSettingsSnapshot = {
  environment: MaintenanceEnvironment;
  configKey: MaintenanceConfigKey;
  config: MaintenanceConfig | null;
  revision: number | null;
  readStatus: MaintenanceConfigReadStatus;
  effective: MaintenanceEffectiveState;
};

export type MaintenanceSettingsOptions = {
  requestHostname: string | null | undefined;
  env?: MaintenanceEnvironmentVariables;
  now?: Date;
  readSetting?: MaintenanceSettingReader;
};

/**
 * Returns a request-scoped snapshot. Missing, malformed, and failed reads are
 * represented rather than thrown so the public request gate reliably fails
 * closed. Scope-resolution errors are thrown because an invalid canonical
 * origin must never be silently treated as Preview.
 */
export async function getMaintenanceSettingsSnapshot(
  options: MaintenanceSettingsOptions,
): Promise<MaintenanceSettingsSnapshot> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const environment = resolveMaintenanceEnvironment({
    nodeEnv: env.NODE_ENV,
    requestHostname: options.requestHostname,
    appCanonicalOrigin: env.APP_CANONICAL_ORIGIN,
  });
  const configKey = getMaintenanceConfigKey(environment);
  const readSetting =
    options.readSetting ??
    ((scope: MaintenanceEnvironment) =>
      readMaintenanceSettingFromPostgres(scope, { env }));

  let storeResult: MaintenanceStoreReadResult;
  try {
    storeResult = await readSetting(environment);
  } catch {
    return createMaintenanceSettingsSnapshot({
      environment,
      configKey,
      readResult: unavailableMaintenanceReadResult("ERROR"),
      revision: null,
      now,
    });
  }

  if (storeResult.status === "MISSING") {
    return createMaintenanceSettingsSnapshot({
      environment,
      configKey,
      readResult: unavailableMaintenanceReadResult("MISSING"),
      revision: null,
      now,
    });
  }

  if (
    storeResult.status === "INVALID" ||
    storeResult.setting.environment !== environment
  ) {
    return createMaintenanceSettingsSnapshot({
      environment,
      configKey,
      readResult: unavailableMaintenanceReadResult("INVALID"),
      revision: null,
      now,
    });
  }

  return createMaintenanceSettingsSnapshot({
    environment,
    configKey,
    readResult: validMaintenanceReadResult(storeResult.setting.config),
    revision: storeResult.setting.revision,
    now,
  });
}

export function createMaintenanceSettingsSnapshot({
  environment,
  configKey,
  readResult,
  revision,
  now,
}: {
  environment: MaintenanceEnvironment;
  configKey: MaintenanceConfigKey;
  readResult: MaintenanceConfigReadResult;
  revision: number | null;
  now: Date;
}): MaintenanceSettingsSnapshot {
  return {
    environment,
    configKey,
    config: readResult.config,
    revision: readResult.status === "VALID" ? revision : null,
    readStatus: readResult.status,
    effective: resolveMaintenanceEffectiveState(readResult, now),
  };
}
