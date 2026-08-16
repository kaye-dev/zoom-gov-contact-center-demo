import {
  MAINTENANCE_SETTINGS_CONFLICT_CODE,
  getMaintenanceConfigKey,
  parseMaintenanceUpdateInput,
  resolveMaintenanceEnvironment,
  validMaintenanceReadResult,
  type MaintenanceConfig,
  type MaintenanceEnvironment,
  type MaintenanceUpdateValidationResult,
} from "@/lib/maintenance-config";

import {
  writeMaintenanceSettingWithPrisma,
  type MaintenancePrismaClient,
} from "./maintenance-prisma-writer";
import {
  createMaintenanceSettingsSnapshot,
  type MaintenanceSettingsSnapshot,
} from "./maintenance-settings-read";
import {
  type MaintenanceEnvironmentVariables,
  type MaintenanceSettingWriter,
  type MaintenanceStoreUpdate,
} from "./maintenance-store";

type SaveMaintenanceSettingsBaseOptions = {
  requestHostname: string | null | undefined;
  env?: MaintenanceEnvironmentVariables;
  now?: Date;
};

export type SaveMaintenanceSettingsOptions =
  SaveMaintenanceSettingsBaseOptions &
    (
      | {
          prisma: MaintenancePrismaClient;
          writeSetting?: never;
        }
      | {
          prisma?: never;
          writeSetting: MaintenanceSettingWriter;
        }
    );

export type SaveMaintenanceSettingsResult =
  | Extract<MaintenanceUpdateValidationResult, { ok: false }>
  | { ok: false; code: typeof MAINTENANCE_SETTINGS_CONFLICT_CODE }
  | { ok: true; snapshot: MaintenanceSettingsSnapshot };

export class MaintenanceSettingsSaveError extends Error {
  constructor() {
    super("Maintenance settings could not be saved.");
    this.name = "MaintenanceSettingsSaveError";
  }
}

/**
 * Applies one environment-scoped optimistic update. Manual modes omit the
 * schedule columns so the database preserves the current pair atomically.
 */
export async function saveMaintenanceSettings(
  input: unknown,
  options: SaveMaintenanceSettingsOptions,
): Promise<SaveMaintenanceSettingsResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const parsed = parseMaintenanceUpdateInput(input, now);
  if (!parsed.ok) return parsed;

  const environment = resolveMaintenanceEnvironment({
    nodeEnv: env.NODE_ENV,
    requestHostname: options.requestHostname,
    appCanonicalOrigin: env.APP_CANONICAL_ORIGIN,
  });
  const configKey = getMaintenanceConfigKey(environment);
  const update = createStoreUpdate(
    environment,
    parsed.value.config,
    parsed.value.expectedRevision,
  );
  const writeSetting =
    options.writeSetting ??
    ((value: MaintenanceStoreUpdate) =>
      writeMaintenanceSettingWithPrisma(options.prisma, value));

  try {
    const result = await writeSetting(update);
    if (result.status === "CONFLICT") {
      return { ok: false, code: MAINTENANCE_SETTINGS_CONFLICT_CODE };
    }
    if (result.setting.environment !== environment) {
      throw new MaintenanceSettingsSaveError();
    }

    return {
      ok: true,
      snapshot: createMaintenanceSettingsSnapshot({
        environment,
        configKey,
        readResult: validMaintenanceReadResult(result.setting.config),
        revision: result.setting.revision,
        now,
      }),
    };
  } catch (error) {
    if (error instanceof MaintenanceSettingsSaveError) throw error;
    throw new MaintenanceSettingsSaveError();
  }
}

function createStoreUpdate(
  environment: MaintenanceEnvironment,
  config: MaintenanceConfig,
  expectedRevision: number,
): MaintenanceStoreUpdate {
  const base = {
    environment,
    expectedRevision,
    updatedAt: config.updatedAt,
  };

  if (config.mode === "SCHEDULED") {
    return {
      ...base,
      mode: config.mode,
      scheduledStartAt: config.scheduledStartAt!,
      scheduledEndAt: config.scheduledEndAt!,
    };
  }

  return { ...base, mode: config.mode };
}
