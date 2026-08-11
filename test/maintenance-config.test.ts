import assert from "node:assert/strict";
import test from "node:test";

import {
  MAINTENANCE_CONFIG_KEYS,
  MAINTENANCE_UPDATE_ERROR_CODES,
  getMaintenanceConfigKey,
  jstDateTimeLocalToUtcIso,
  parseMaintenanceConfig,
  parseMaintenanceUpdateInput,
  resolveMaintenanceEffectiveState,
  resolveMaintenanceEnvironment,
  resolveMaintenanceRetryAfter,
  unavailableMaintenanceReadResult,
  utcIsoToJstDateTimeLocal,
  validMaintenanceReadResult,
  type MaintenanceConfig,
} from "../lib/maintenance-config";

const scheduledConfig: MaintenanceConfig = {
  version: 1,
  mode: "SCHEDULED",
  scheduledStartAt: "2026-08-11T01:00:00.000Z",
  scheduledEndAt: "2026-08-11T02:00:00.000Z",
  updatedAt: "2026-08-10T12:34:56.789Z",
};

test("maintenance config parser normalizes a valid copy without mutating SDK data", () => {
  const raw = {
    ...scheduledConfig,
    scheduledStartAt: "2026-08-11T01:00:00Z",
  };
  const before = structuredClone(raw);

  assert.deepEqual(parseMaintenanceConfig(raw), scheduledConfig);
  assert.deepEqual(raw, before);

  assert.deepEqual(
    parseMaintenanceConfig({
      ...scheduledConfig,
      mode: "ENABLED",
    }),
    { ...scheduledConfig, mode: "ENABLED" },
  );
});

test("maintenance config parser rejects schema drift and invalid schedule pairs", () => {
  for (const value of [
    undefined,
    null,
    { ...scheduledConfig, version: 2 },
    { ...scheduledConfig, mode: "UNKNOWN" },
    { ...scheduledConfig, extra: true },
    { ...scheduledConfig, updatedAt: "2026-02-30T00:00:00Z" },
    { ...scheduledConfig, scheduledStartAt: null },
    {
      ...scheduledConfig,
      scheduledStartAt: scheduledConfig.scheduledEndAt,
    },
    {
      ...scheduledConfig,
      mode: "SCHEDULED",
      scheduledStartAt: null,
      scheduledEndAt: null,
    },
  ]) {
    assert.equal(parseMaintenanceConfig(value), null);
  }
});

test("an ended scheduled config remains valid for inactive evaluation", () => {
  const ended = {
    ...scheduledConfig,
    scheduledStartAt: "2025-01-01T00:00:00.000Z",
    scheduledEndAt: "2025-01-01T01:00:00.000Z",
  };

  assert.deepEqual(parseMaintenanceConfig(ended), ended);
});

test("JST datetime-local conversion is fixed UTC+9 without DST", () => {
  assert.equal(
    jstDateTimeLocalToUtcIso("2026-01-15T09:30"),
    "2026-01-15T00:30:00.000Z",
  );
  assert.equal(
    jstDateTimeLocalToUtcIso("2026-07-15T09:30"),
    "2026-07-15T00:30:00.000Z",
  );
  assert.equal(
    jstDateTimeLocalToUtcIso("2026-01-01T00:00:01.250"),
    "2025-12-31T15:00:01.250Z",
  );
  assert.equal(
    utcIsoToJstDateTimeLocal("2026-07-15T00:30:00.000Z"),
    "2026-07-15T09:30",
  );
  assert.equal(
    utcIsoToJstDateTimeLocal("2025-12-31T15:00:01.250Z"),
    "2026-01-01T00:00:01.250",
  );

  for (const invalid of [
    "2026-02-29T10:00",
    "2026-13-01T10:00",
    "2026-01-01T24:00",
    "2026-01-01 10:00",
  ]) {
    assert.equal(jstDateTimeLocalToUtcIso(invalid), null);
  }
});

test("admin update validation creates UTC config and rejects client-owned fields", () => {
  const now = new Date("2026-08-11T00:00:00.000Z");
  const result = parseMaintenanceUpdateInput(
    {
      mode: "SCHEDULED",
      scheduledStartAtJst: "2026-08-11T10:00",
      scheduledEndAtJst: "2026-08-11T11:00",
    },
    now,
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      version: 1,
      mode: "SCHEDULED",
      scheduledStartAt: "2026-08-11T01:00:00.000Z",
      scheduledEndAt: "2026-08-11T02:00:00.000Z",
      updatedAt: now.toISOString(),
    },
  });

  assert.deepEqual(
    parseMaintenanceUpdateInput(
      {
        mode: "DISABLED",
        scheduledStartAtJst: null,
        scheduledEndAtJst: null,
        updatedAt: now.toISOString(),
      },
      now,
    ),
    {
      ok: false,
      code: MAINTENANCE_UPDATE_ERROR_CODES.invalidRequest,
    },
  );
});

test("schedule validation requires a valid pair and a future scheduled end", () => {
  const now = new Date("2026-08-11T00:00:00.000Z");

  assert.deepEqual(
    parseMaintenanceUpdateInput(
      {
        mode: "SCHEDULED",
        scheduledStartAtJst: null,
        scheduledEndAtJst: null,
      },
      now,
    ),
    {
      ok: false,
      code: MAINTENANCE_UPDATE_ERROR_CODES.scheduleRequired,
    },
  );
  assert.deepEqual(
    parseMaintenanceUpdateInput(
      {
        mode: "SCHEDULED",
        scheduledStartAtJst: "2026-08-11T10:00",
        scheduledEndAtJst: null,
      },
      now,
    ),
    {
      ok: false,
      code: MAINTENANCE_UPDATE_ERROR_CODES.invalidSchedule,
    },
  );
  assert.deepEqual(
    parseMaintenanceUpdateInput(
      {
        mode: "SCHEDULED",
        scheduledStartAtJst: "2026-08-11T08:00",
        scheduledEndAtJst: "2026-08-11T09:00",
      },
      now,
    ),
    {
      ok: false,
      code: MAINTENANCE_UPDATE_ERROR_CODES.scheduleMustEndInFuture,
    },
  );
  assert.deepEqual(
    parseMaintenanceUpdateInput(
      {
        mode: "ENABLED",
        scheduledStartAtJst: "2025-01-01T09:00",
        scheduledEndAtJst: "2025-01-01T10:00",
      },
      now,
    ),
    {
      ok: true,
      value: {
        version: 1,
        mode: "ENABLED",
        scheduledStartAt: "2025-01-01T00:00:00.000Z",
        scheduledEndAt: "2025-01-01T01:00:00.000Z",
        updatedAt: now.toISOString(),
      },
    },
  );
});

test("effective maintenance state uses inclusive start and exclusive end", () => {
  const readResult = validMaintenanceReadResult(scheduledConfig);

  assert.deepEqual(
    resolveMaintenanceEffectiveState(
      readResult,
      new Date("2026-08-11T00:59:59.999Z"),
    ),
    {
      active: false,
      reason: "SCHEDULED_PENDING",
      retryAfter: null,
    },
  );
  assert.deepEqual(
    resolveMaintenanceEffectiveState(
      readResult,
      new Date(scheduledConfig.scheduledStartAt!),
    ),
    {
      active: true,
      reason: "SCHEDULED_ACTIVE",
      retryAfter: "Tue, 11 Aug 2026 02:00:00 GMT",
    },
  );
  assert.deepEqual(
    resolveMaintenanceEffectiveState(
      readResult,
      new Date(scheduledConfig.scheduledEndAt!),
    ),
    {
      active: false,
      reason: "SCHEDULED_ENDED",
      retryAfter: null,
    },
  );
});

test("manual modes and unavailable reads follow fail-closed rules", () => {
  assert.equal(
    resolveMaintenanceEffectiveState(
      validMaintenanceReadResult({ ...scheduledConfig, mode: "DISABLED" }),
    ).active,
    false,
  );
  assert.deepEqual(
    resolveMaintenanceEffectiveState(
      validMaintenanceReadResult({ ...scheduledConfig, mode: "ENABLED" }),
    ),
    { active: true, reason: "ENABLED", retryAfter: null },
  );

  for (const status of ["MISSING", "INVALID", "ERROR"] as const) {
    assert.deepEqual(
      resolveMaintenanceEffectiveState(
        unavailableMaintenanceReadResult(status),
      ),
      { active: true, reason: "FAIL_CLOSED", retryAfter: null },
    );
  }
});

test("Retry-After is emitted only during an active valid schedule", () => {
  assert.equal(
    resolveMaintenanceRetryAfter(
      scheduledConfig,
      new Date("2026-08-11T01:30:00.000Z"),
    ),
    "Tue, 11 Aug 2026 02:00:00 GMT",
  );
  assert.equal(
    resolveMaintenanceRetryAfter(
      scheduledConfig,
      new Date("2026-08-11T00:30:00.000Z"),
    ),
    null,
  );
  assert.equal(
    resolveMaintenanceRetryAfter(
      { ...scheduledConfig, mode: "ENABLED" },
      new Date("2026-08-11T01:30:00.000Z"),
    ),
    null,
  );
  assert.equal(resolveMaintenanceRetryAfter(null), null);
});

test("environment resolution uses exact normalized production hosts", () => {
  assert.equal(
    resolveMaintenanceEnvironment({
      nodeEnv: "development",
      requestHostname: "city.example.jp",
      betterAuthUrl: "https://city.example.jp",
      vercelProjectProductionUrl: "city.vercel.app",
    }),
    "development",
  );
  assert.equal(
    resolveMaintenanceEnvironment({
      nodeEnv: "production",
      requestHostname: "CITY.EXAMPLE.JP:443, proxy.internal",
      betterAuthUrl: "https://city.example.jp",
      vercelProjectProductionUrl: "city.vercel.app",
    }),
    "production",
  );
  assert.equal(
    resolveMaintenanceEnvironment({
      nodeEnv: "production",
      requestHostname: "city.vercel.app",
      betterAuthUrl: "https://city.example.jp",
      vercelProjectProductionUrl: "https://city.vercel.app",
    }),
    "production",
  );

  for (const requestHostname of [
    "city-git-sha.vercel.app",
    "city.example.jp.attacker.test",
    undefined,
  ]) {
    assert.equal(
      resolveMaintenanceEnvironment({
        nodeEnv: "production",
        requestHostname,
        betterAuthUrl: "https://city.example.jp",
        vercelProjectProductionUrl: "city.vercel.app",
      }),
      "preview",
    );
  }
});

test("environment keys are exact and exhaustive", () => {
  assert.deepEqual(MAINTENANCE_CONFIG_KEYS, {
    production: "site_maintenance_production",
    preview: "site_maintenance_preview",
    development: "site_maintenance_development",
  });
  assert.equal(
    getMaintenanceConfigKey("production"),
    "site_maintenance_production",
  );
  assert.equal(
    getMaintenanceConfigKey("preview"),
    "site_maintenance_preview",
  );
  assert.equal(
    getMaintenanceConfigKey("development"),
    "site_maintenance_development",
  );
});
