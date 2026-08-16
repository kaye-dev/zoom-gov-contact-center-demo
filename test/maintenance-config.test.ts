import assert from "node:assert/strict";
import test from "node:test";

import {
  MAINTENANCE_CONFIG_KEYS,
  MAINTENANCE_SETTINGS_CONFLICT_CODE,
  MAINTENANCE_UPDATE_ERROR_CODES,
  MaintenanceEnvironmentResolutionError,
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

test("maintenance config parser normalizes a valid copy without mutating stored data", () => {
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
      expectedRevision: 7,
    },
    now,
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      config: {
        version: 1,
        mode: "SCHEDULED",
        scheduledStartAt: "2026-08-11T01:00:00.000Z",
        scheduledEndAt: "2026-08-11T02:00:00.000Z",
        updatedAt: now.toISOString(),
      },
      expectedRevision: 7,
    },
  });

  assert.deepEqual(
    parseMaintenanceUpdateInput(
      {
        mode: "DISABLED",
        scheduledStartAtJst: null,
        scheduledEndAtJst: null,
        expectedRevision: 7,
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
        expectedRevision: 1,
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
        expectedRevision: 1,
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
        expectedRevision: 1,
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
        expectedRevision: 9,
      },
      now,
    ),
    {
      ok: true,
      value: {
        config: {
          version: 1,
          mode: "ENABLED",
          scheduledStartAt: "2025-01-01T00:00:00.000Z",
          scheduledEndAt: "2025-01-01T01:00:00.000Z",
          updatedAt: now.toISOString(),
        },
        expectedRevision: 9,
      },
    },
  );

  for (const expectedRevision of [
    undefined,
    null,
    0,
    -1,
    1.5,
    2_147_483_648,
  ]) {
    assert.deepEqual(
      parseMaintenanceUpdateInput(
        {
          mode: "DISABLED",
          scheduledStartAtJst: null,
          scheduledEndAtJst: null,
          expectedRevision,
        },
        now,
      ),
      {
        ok: false,
        code: MAINTENANCE_UPDATE_ERROR_CODES.invalidRequest,
      },
    );
  }

  assert.equal(
    parseMaintenanceUpdateInput(
      {
        mode: "DISABLED",
        scheduledStartAtJst: null,
        scheduledEndAtJst: null,
        expectedRevision: 2_147_483_647,
      },
      now,
    ).ok,
    true,
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

test("environment resolution uses only the exact APP_CANONICAL_ORIGIN host", () => {
  assert.equal(
    resolveMaintenanceEnvironment({
      nodeEnv: "development",
      requestHostname: "city.example.jp",
      appCanonicalOrigin: undefined,
    }),
    "development",
  );
  assert.equal(
    resolveMaintenanceEnvironment({
      nodeEnv: "production",
      requestHostname: "CITY.EXAMPLE.JP:443",
      appCanonicalOrigin: "https://city.example.jp",
    }),
    "production",
  );
  for (const requestHostname of [
    "city.vercel.app",
    "city-git-sha.vercel.app",
    "city.example.jp.attacker.test",
  ]) {
    assert.equal(
      resolveMaintenanceEnvironment({
        nodeEnv: "production",
        requestHostname,
        appCanonicalOrigin: "https://city.example.jp",
      }),
      "preview",
    );
  }

  for (const requestHostname of [
    undefined,
    "",
    ".example",
    "example..com",
    "-bad.example",
    "bad-.example",
    "exa\tmple.example",
    "%65xample.com",
    "city.example.jp, proxy.internal",
    "https://city.example.jp",
    "https://city.example.jp/path",
    "city.example.jp/",
  ]) {
    assert.throws(
      () =>
        resolveMaintenanceEnvironment({
          nodeEnv: "production",
          requestHostname,
          appCanonicalOrigin: "https://city.example.jp",
        }),
      MaintenanceEnvironmentResolutionError,
    );
  }

  for (const appCanonicalOrigin of [
    undefined,
    "city.example.jp",
    "http://city.example.jp",
    "https://.example",
    "https://example..com",
    "https://-bad.example",
    "https://exa%09mple.example",
    "https://city.example.jp:8443",
    "https://city.example.jp/path",
    "https://user@city.example.jp",
  ]) {
    assert.throws(
      () =>
        resolveMaintenanceEnvironment({
          nodeEnv: "production",
          requestHostname: "city.example.jp",
          appCanonicalOrigin,
        }),
      MaintenanceEnvironmentResolutionError,
    );
  }
});

test("environment keys are exact and exhaustive", () => {
  assert.equal(
    MAINTENANCE_SETTINGS_CONFLICT_CODE,
    "MAINTENANCE_SETTINGS_CONFLICT",
  );
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
