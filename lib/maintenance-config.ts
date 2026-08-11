export const MAINTENANCE_CONFIG_VERSION = 1 as const;

export const MAINTENANCE_MODES = [
  "DISABLED",
  "ENABLED",
  "SCHEDULED",
] as const;

export type MaintenanceMode = (typeof MAINTENANCE_MODES)[number];

export const MAINTENANCE_ENVIRONMENTS = [
  "production",
  "preview",
  "development",
] as const;

export type MaintenanceEnvironment =
  (typeof MAINTENANCE_ENVIRONMENTS)[number];

export const MAINTENANCE_CONFIG_KEYS = {
  production: "site_maintenance_production",
  preview: "site_maintenance_preview",
  development: "site_maintenance_development",
} as const satisfies Record<MaintenanceEnvironment, string>;

export type MaintenanceConfigKey =
  (typeof MAINTENANCE_CONFIG_KEYS)[MaintenanceEnvironment];

export type MaintenanceConfig = {
  version: typeof MAINTENANCE_CONFIG_VERSION;
  mode: MaintenanceMode;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  updatedAt: string;
};

export type MaintenanceUpdateInput = {
  mode: MaintenanceMode;
  scheduledStartAtJst: string | null;
  scheduledEndAtJst: string | null;
};

export const MAINTENANCE_UPDATE_ERROR_CODES = {
  invalidRequest: "INVALID_REQUEST",
  invalidSchedule: "INVALID_MAINTENANCE_SCHEDULE",
  scheduleRequired: "MAINTENANCE_SCHEDULE_REQUIRED",
  scheduleMustEndInFuture:
    "MAINTENANCE_SCHEDULE_MUST_END_IN_FUTURE",
} as const;

export type MaintenanceUpdateErrorCode =
  (typeof MAINTENANCE_UPDATE_ERROR_CODES)[keyof typeof MAINTENANCE_UPDATE_ERROR_CODES];

export type MaintenanceUpdateValidationResult =
  | { ok: true; value: MaintenanceConfig }
  | { ok: false; code: MaintenanceUpdateErrorCode };

export const MAINTENANCE_CONFIG_READ_STATUSES = [
  "VALID",
  "MISSING",
  "INVALID",
  "ERROR",
] as const;

export type MaintenanceConfigReadStatus =
  (typeof MAINTENANCE_CONFIG_READ_STATUSES)[number];

export type MaintenanceConfigReadResult =
  | { status: "VALID"; config: MaintenanceConfig }
  | {
      status: Exclude<MaintenanceConfigReadStatus, "VALID">;
      config: null;
    };

export const MAINTENANCE_EFFECTIVE_REASONS = [
  "DISABLED",
  "ENABLED",
  "SCHEDULED_PENDING",
  "SCHEDULED_ACTIVE",
  "SCHEDULED_ENDED",
  "FAIL_CLOSED",
] as const;

export type MaintenanceEffectiveReason =
  (typeof MAINTENANCE_EFFECTIVE_REASONS)[number];

export type MaintenanceEffectiveState = {
  active: boolean;
  reason: MaintenanceEffectiveReason;
  retryAfter: string | null;
};

export type MaintenanceEnvironmentInput = {
  nodeEnv: string | undefined;
  requestHostname: string | null | undefined;
  betterAuthUrl: string | undefined;
  vercelProjectProductionUrl: string | undefined;
};

const CONFIG_KEYS = [
  "version",
  "mode",
  "scheduledStartAt",
  "scheduledEndAt",
  "updatedAt",
] as const;
const UPDATE_INPUT_KEYS = [
  "mode",
  "scheduledStartAtJst",
  "scheduledEndAtJst",
] as const;
const UTC_ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
const JST_DATE_TIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const JST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;

/**
 * Parses the versioned Edge Config value. The returned value is always a new,
 * normalized object; the SDK-owned value is never mutated.
 */
export function parseMaintenanceConfig(
  input: unknown,
): MaintenanceConfig | null {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, CONFIG_KEYS) ||
    input.version !== MAINTENANCE_CONFIG_VERSION ||
    typeof input.mode !== "string" ||
    !isMaintenanceMode(input.mode) ||
    !isNullableString(input.scheduledStartAt) ||
    !isNullableString(input.scheduledEndAt) ||
    typeof input.updatedAt !== "string"
  ) {
    return null;
  }

  const scheduledStartAt = normalizeNullableUtcIso(
    input.scheduledStartAt,
  );
  const scheduledEndAt = normalizeNullableUtcIso(input.scheduledEndAt);
  const updatedAt = normalizeUtcIso(input.updatedAt);

  if (
    scheduledStartAt === undefined ||
    scheduledEndAt === undefined ||
    updatedAt === null ||
    (scheduledStartAt === null) !== (scheduledEndAt === null)
  ) {
    return null;
  }

  if (
    scheduledStartAt !== null &&
    scheduledEndAt !== null &&
    Date.parse(scheduledStartAt) >= Date.parse(scheduledEndAt)
  ) {
    return null;
  }

  if (
    input.mode === "SCHEDULED" &&
    (scheduledStartAt === null || scheduledEndAt === null)
  ) {
    return null;
  }

  return {
    version: MAINTENANCE_CONFIG_VERSION,
    mode: input.mode,
    scheduledStartAt,
    scheduledEndAt,
    updatedAt,
  };
}

/**
 * Validates the admin payload and converts its explicit JST wall-clock values
 * to UTC ISO timestamps. The client cannot provide version, key, scope, or
 * updatedAt because extra keys are rejected.
 */
export function parseMaintenanceUpdateInput(
  input: unknown,
  now: Date = new Date(),
): MaintenanceUpdateValidationResult {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, UPDATE_INPUT_KEYS) ||
    typeof input.mode !== "string" ||
    !isMaintenanceMode(input.mode) ||
    !isNullableString(input.scheduledStartAtJst) ||
    !isNullableString(input.scheduledEndAtJst) ||
    !isValidDate(now)
  ) {
    return invalidUpdate(MAINTENANCE_UPDATE_ERROR_CODES.invalidRequest);
  }

  const hasStart = input.scheduledStartAtJst !== null;
  const hasEnd = input.scheduledEndAtJst !== null;

  if (hasStart !== hasEnd) {
    return invalidUpdate(MAINTENANCE_UPDATE_ERROR_CODES.invalidSchedule);
  }

  if (input.mode === "SCHEDULED" && !hasStart) {
    return invalidUpdate(MAINTENANCE_UPDATE_ERROR_CODES.scheduleRequired);
  }

  const scheduledStartAt = hasStart
    ? jstDateTimeLocalToUtcIso(input.scheduledStartAtJst!)
    : null;
  const scheduledEndAt = hasEnd
    ? jstDateTimeLocalToUtcIso(input.scheduledEndAtJst!)
    : null;

  if (
    (hasStart && scheduledStartAt === null) ||
    (hasEnd && scheduledEndAt === null) ||
    (scheduledStartAt !== null &&
      scheduledEndAt !== null &&
      Date.parse(scheduledStartAt) >= Date.parse(scheduledEndAt))
  ) {
    return invalidUpdate(MAINTENANCE_UPDATE_ERROR_CODES.invalidSchedule);
  }

  if (
    input.mode === "SCHEDULED" &&
    scheduledEndAt !== null &&
    Date.parse(scheduledEndAt) <= now.getTime()
  ) {
    return invalidUpdate(
      MAINTENANCE_UPDATE_ERROR_CODES.scheduleMustEndInFuture,
    );
  }

  return {
    ok: true,
    value: {
      version: MAINTENANCE_CONFIG_VERSION,
      mode: input.mode,
      scheduledStartAt,
      scheduledEndAt,
      updatedAt: now.toISOString(),
    },
  };
}

/** Converts an HTML datetime-local value interpreted as fixed UTC+09:00. */
export function jstDateTimeLocalToUtcIso(value: string): string | null {
  const match = JST_DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const secondText = match[6] ?? "0";
  const millisecondText = (match[7] ?? "0").padEnd(3, "0");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const localAsUtc = createUtcTimestamp({
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
  });

  return new Date(localAsUtc - JST_OFFSET_MILLISECONDS).toISOString();
}

/** Converts a UTC ISO timestamp to a lossless JST datetime-local value. */
export function utcIsoToJstDateTimeLocal(value: string): string | null {
  const normalized = normalizeUtcIso(value);
  if (normalized === null) return null;

  const utcDate = new Date(normalized);
  const jstDate = new Date(utcDate.getTime() + JST_OFFSET_MILLISECONDS);
  const dateTime = [
    pad(jstDate.getUTCFullYear(), 4),
    "-",
    pad(jstDate.getUTCMonth() + 1),
    "-",
    pad(jstDate.getUTCDate()),
    "T",
    pad(jstDate.getUTCHours()),
    ":",
    pad(jstDate.getUTCMinutes()),
  ].join("");
  const seconds = jstDate.getUTCSeconds();
  const milliseconds = jstDate.getUTCMilliseconds();

  if (seconds === 0 && milliseconds === 0) return dateTime;
  if (milliseconds === 0) return `${dateTime}:${pad(seconds)}`;

  return `${dateTime}:${pad(seconds)}.${pad(milliseconds, 3)}`;
}

export function resolveMaintenanceEnvironment(
  input: MaintenanceEnvironmentInput,
): MaintenanceEnvironment {
  if (input.nodeEnv !== "production") return "development";

  const requestHostname = normalizeHost(input.requestHostname);
  const canonicalHostnames = [
    normalizeHost(input.betterAuthUrl),
    normalizeHost(input.vercelProjectProductionUrl),
  ].filter((hostname): hostname is string => hostname !== null);

  if (
    requestHostname !== null &&
    canonicalHostnames.includes(requestHostname)
  ) {
    return "production";
  }

  return "preview";
}

export function getMaintenanceConfigKey(
  environment: MaintenanceEnvironment,
): MaintenanceConfigKey {
  return MAINTENANCE_CONFIG_KEYS[environment];
}

export function resolveMaintenanceEffectiveState(
  readResult: MaintenanceConfigReadResult,
  now: Date = new Date(),
): MaintenanceEffectiveState {
  if (readResult.status !== "VALID") {
    return {
      active: true,
      reason: "FAIL_CLOSED",
      retryAfter: null,
    };
  }

  const { config } = readResult;

  if (config.mode === "DISABLED") {
    return { active: false, reason: "DISABLED", retryAfter: null };
  }

  if (config.mode === "ENABLED") {
    return { active: true, reason: "ENABLED", retryAfter: null };
  }

  if (!isValidDate(now)) {
    return {
      active: true,
      reason: "FAIL_CLOSED",
      retryAfter: null,
    };
  }

  const start = Date.parse(config.scheduledStartAt!);
  const end = Date.parse(config.scheduledEndAt!);
  const timestamp = now.getTime();

  if (timestamp < start) {
    return {
      active: false,
      reason: "SCHEDULED_PENDING",
      retryAfter: null,
    };
  }

  if (timestamp >= end) {
    return {
      active: false,
      reason: "SCHEDULED_ENDED",
      retryAfter: null,
    };
  }

  return {
    active: true,
    reason: "SCHEDULED_ACTIVE",
    retryAfter: resolveMaintenanceRetryAfter(config, now),
  };
}

export function resolveMaintenanceRetryAfter(
  config: MaintenanceConfig | null,
  now: Date = new Date(),
): string | null {
  if (
    config?.mode !== "SCHEDULED" ||
    config.scheduledStartAt === null ||
    config.scheduledEndAt === null ||
    !isValidDate(now)
  ) {
    return null;
  }

  const timestamp = now.getTime();
  const start = Date.parse(config.scheduledStartAt);
  const end = Date.parse(config.scheduledEndAt);

  if (timestamp < start || timestamp >= end) return null;

  return new Date(end).toUTCString();
}

export function validMaintenanceReadResult(
  config: MaintenanceConfig,
): MaintenanceConfigReadResult {
  return { status: "VALID", config };
}

export function unavailableMaintenanceReadResult(
  status: Exclude<MaintenanceConfigReadStatus, "VALID">,
): MaintenanceConfigReadResult {
  return { status, config: null };
}

function isMaintenanceMode(value: string): value is MaintenanceMode {
  return (MAINTENANCE_MODES as readonly string[]).includes(value);
}

function invalidUpdate(
  code: MaintenanceUpdateErrorCode,
): MaintenanceUpdateValidationResult {
  return { ok: false, code };
}

function normalizeNullableUtcIso(
  value: string | null,
): string | null | undefined {
  if (value === null) return null;

  return normalizeUtcIso(value) ?? undefined;
}

function normalizeUtcIso(value: string): string | null {
  const match = UTC_ISO_PATTERN.exec(value);
  if (!match) return null;

  const milliseconds = (match[7] ?? "0").padEnd(3, "0");
  const canonical = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${milliseconds}Z`;
  const date = new Date(canonical);

  if (!isValidDate(date) || date.toISOString() !== canonical) return null;

  return canonical;
}

function normalizeHost(value: string | null | undefined): string | null {
  const candidate = value?.split(",", 1)[0]?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(
      candidate.includes("://") ? candidate : `https://${candidate}`,
    );
    return url.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
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

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function daysInMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCDate();
}

function createUtcTimestamp({
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond,
}: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime();
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}
