import assert from "node:assert/strict";
import test from "node:test";

import type {
  MaintenanceConfig,
  MaintenanceConfigKey,
} from "../lib/maintenance-config";
import {
  MAINTENANCE_EDGE_CONFIG_CLIENT_OPTIONS,
  MaintenanceEdgeConfigReadError,
  MaintenanceEdgeConfigWriteError,
  readMaintenanceEdgeConfigItem,
  writeMaintenanceEdgeConfigItem,
} from "../lib/server/maintenance-edge-config";
import {
  MaintenanceSettingsSaveError,
  MaintenanceSettingsUnavailableError,
  getMaintenanceSettingsSnapshot,
  saveMaintenanceSettings,
} from "../lib/server/maintenance-settings";

const EDGE_CONFIG_ID = "ecfg_abc123";
const TEAM_ID = "team_demo123";
const READ_TOKEN = "read-token-must-not-leak";
const WRITE_TOKEN = "write-token-must-not-leak";
const CONNECTION_STRING =
  `https://edge-config.vercel.com/${EDGE_CONFIG_ID}?token=${READ_TOKEN}`;
const PRODUCTION_KEY = "site_maintenance_production";

const currentConfig: MaintenanceConfig = {
  version: 1,
  mode: "DISABLED",
  scheduledStartAt: "2026-09-01T00:00:00.000Z",
  scheduledEndAt: "2026-09-01T01:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

const productionEnv = {
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://city.example.jp",
  VERCEL_PROJECT_PRODUCTION_URL: "city.vercel.app",
  EDGE_CONFIG: CONNECTION_STRING,
  MAINTENANCE_EDGE_CONFIG_ID: EDGE_CONFIG_ID,
  MAINTENANCE_EDGE_CONFIG_TEAM_ID: TEAM_ID,
  MAINTENANCE_EDGE_CONFIG_WRITE_TOKEN: WRITE_TOKEN,
} satisfies NodeJS.ProcessEnv;

test("SDK reads disable stale and development caches without mutating values", async () => {
  const raw = structuredClone(currentConfig);
  let receivedConnectionString: string | undefined;
  let receivedOptions: unknown;
  let receivedKey: string | undefined;

  const result = await readMaintenanceEdgeConfigItem(PRODUCTION_KEY, {
    env: { EDGE_CONFIG: `  ${CONNECTION_STRING}  ` },
    createClientImpl(connectionString, options) {
      receivedConnectionString = connectionString;
      receivedOptions = options;
      return {
        async get(key) {
          receivedKey = key;
          return raw;
        },
      };
    },
  });

  assert.equal(receivedConnectionString, CONNECTION_STRING);
  assert.deepEqual(receivedOptions, {
    staleIfError: false,
    disableDevelopmentCache: true,
    cache: "no-store",
  });
  assert.deepEqual(receivedOptions, MAINTENANCE_EDGE_CONFIG_CLIENT_OPTIONS);
  assert.equal(receivedKey, PRODUCTION_KEY);
  assert.equal(result, raw);
  assert.deepEqual(raw, currentConfig);
});

test("SDK read setup and upstream failures are sanitized", async () => {
  await assert.rejects(
    readMaintenanceEdgeConfigItem(PRODUCTION_KEY, { env: {} }),
    (error: unknown) => sanitizedError(error, MaintenanceEdgeConfigReadError),
  );
  await assert.rejects(
    readMaintenanceEdgeConfigItem(PRODUCTION_KEY, {
      env: { EDGE_CONFIG: CONNECTION_STRING },
      createClientImpl() {
        throw new Error(`failed with ${READ_TOKEN}`);
      },
    }),
    (error: unknown) => sanitizedError(error, MaintenanceEdgeConfigReadError),
  );
  await assert.rejects(
    readMaintenanceEdgeConfigItem(PRODUCTION_KEY, {
      env: { EDGE_CONFIG: CONNECTION_STRING },
      createClientImpl() {
        return {
          async get() {
            throw new Error(`upstream included ${CONNECTION_STRING}`);
          },
        };
      },
    }),
    (error: unknown) => sanitizedError(error, MaintenanceEdgeConfigReadError),
  );
});

test("REST write performs exactly one scoped upsert with token only in header", async () => {
  let requestUrl: string | URL | Request | undefined;
  let requestInit: RequestInit | undefined;
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requestUrl = input;
    requestInit = init;
    return Response.json({ status: "ok" });
  }) as typeof fetch;

  await writeMaintenanceEdgeConfigItem(PRODUCTION_KEY, currentConfig, {
    env: productionEnv,
    fetchImpl,
  });

  assert.equal(
    requestUrl,
    `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items?teamId=${TEAM_ID}`,
  );
  assert.equal(requestInit?.method, "PATCH");
  assert.equal(requestInit?.cache, "no-store");
  assert.deepEqual(requestInit?.headers, {
    Authorization: `Bearer ${WRITE_TOKEN}`,
    "Content-Type": "application/json",
  });

  const body = JSON.parse(String(requestInit?.body)) as {
    items: unknown[];
  };
  assert.deepEqual(body, {
    items: [
      {
        operation: "upsert",
        key: PRODUCTION_KEY,
        value: currentConfig,
      },
    ],
  });
  assert.equal(body.items.length, 1);
  assert.equal(String(requestUrl).includes(WRITE_TOKEN), false);
  assert.equal(String(requestInit?.body).includes(WRITE_TOKEN), false);
});

test("REST write rejects unsafe scope or config before fetch", async () => {
  let fetchCount = 0;
  const fetchImpl = (async () => {
    fetchCount += 1;
    return Response.json({ status: "ok" });
  }) as typeof fetch;

  await assert.rejects(
    writeMaintenanceEdgeConfigItem(PRODUCTION_KEY, currentConfig, {
      env: {
        ...productionEnv,
        MAINTENANCE_EDGE_CONFIG_ID: "ecfg_other",
      },
      fetchImpl,
    }),
    (error: unknown) => sanitizedError(error, MaintenanceEdgeConfigWriteError),
  );
  await assert.rejects(
    writeMaintenanceEdgeConfigItem(PRODUCTION_KEY, currentConfig, {
      env: {
        ...productionEnv,
        MAINTENANCE_EDGE_CONFIG_ID: "../invalid",
      },
      fetchImpl,
    }),
    (error: unknown) => sanitizedError(error, MaintenanceEdgeConfigWriteError),
  );
  await assert.rejects(
    writeMaintenanceEdgeConfigItem(PRODUCTION_KEY, currentConfig, {
      env: {
        ...productionEnv,
        MAINTENANCE_EDGE_CONFIG_TEAM_ID: "invalid-team-id",
      },
      fetchImpl,
    }),
    (error: unknown) => sanitizedError(error, MaintenanceEdgeConfigWriteError),
  );
  await assert.rejects(
    writeMaintenanceEdgeConfigItem(PRODUCTION_KEY, currentConfig, {
      env: {
        ...productionEnv,
        MAINTENANCE_EDGE_CONFIG_TEAM_ID: undefined,
      },
      fetchImpl,
    }),
    (error: unknown) => sanitizedError(error, MaintenanceEdgeConfigWriteError),
  );
  await assert.rejects(
    writeMaintenanceEdgeConfigItem(
      PRODUCTION_KEY,
      { ...currentConfig, version: 2 } as unknown as MaintenanceConfig,
      { env: productionEnv, fetchImpl },
    ),
    (error: unknown) => sanitizedError(error, MaintenanceEdgeConfigWriteError),
  );
  assert.equal(fetchCount, 0);
});

test("REST non-success responses and fetch exceptions expose no token", async () => {
  for (const fetchImpl of [
    (async () =>
      Response.json(
        { error: { message: WRITE_TOKEN } },
        { status: 403 },
      )) as typeof fetch,
    (async () => Response.json({ status: "unexpected" })) as typeof fetch,
    (async () => {
      throw new Error(`request headers contained ${WRITE_TOKEN}`);
    }) as typeof fetch,
  ]) {
    await assert.rejects(
      writeMaintenanceEdgeConfigItem(PRODUCTION_KEY, currentConfig, {
        env: productionEnv,
        fetchImpl,
      }),
      (error: unknown) =>
        sanitizedError(error, MaintenanceEdgeConfigWriteError),
    );
  }
});

test("settings snapshot derives the environment key and fails closed", async () => {
  const now = new Date("2026-08-11T00:00:00.000Z");
  const valid = await getMaintenanceSettingsSnapshot({
    requestHostname: "city.example.jp:443",
    env: productionEnv,
    now,
    async readItem(key) {
      assert.equal(key, PRODUCTION_KEY);
      return currentConfig;
    },
  });

  assert.deepEqual(valid, {
    environment: "production",
    configKey: PRODUCTION_KEY,
    config: currentConfig,
    readStatus: "VALID",
    effective: {
      active: false,
      reason: "DISABLED",
      retryAfter: null,
    },
  });

  const unavailableCases = [
    {
      expectedStatus: "MISSING",
      readItem: async () => undefined,
    },
    {
      expectedStatus: "INVALID",
      readItem: async () => ({ ...currentConfig, version: 2 }),
    },
    {
      expectedStatus: "ERROR",
      readItem: async () => {
        throw new Error(READ_TOKEN);
      },
    },
  ] as const;

  for (const { expectedStatus, readItem } of unavailableCases) {
    const snapshot = await getMaintenanceSettingsSnapshot({
      requestHostname: "preview.vercel.app",
      env: productionEnv,
      now,
      readItem,
    });
    assert.equal(snapshot.environment, "preview");
    assert.equal(snapshot.configKey, "site_maintenance_preview");
    assert.equal(snapshot.config, null);
    assert.equal(snapshot.readStatus, expectedStatus);
    assert.deepEqual(snapshot.effective, {
      active: true,
      reason: "FAIL_CLOSED",
      retryAfter: null,
    });
  }
});

test("manual save requires a valid read and preserves the current UTC pair", async () => {
  const now = new Date("2026-08-11T00:00:00.000Z");
  let written:
    | { key: MaintenanceConfigKey; config: MaintenanceConfig }
    | undefined;

  const result = await saveMaintenanceSettings(
    {
      mode: "ENABLED",
      scheduledStartAtJst: "2027-01-01T09:00",
      scheduledEndAtJst: "2027-01-01T10:00",
    },
    {
      requestHostname: "city.example.jp",
      env: productionEnv,
      now,
      readItem: async () => currentConfig,
      writeItem: async (key, config) => {
        written = { key, config };
      },
    },
  );

  const expectedConfig: MaintenanceConfig = {
    ...currentConfig,
    mode: "ENABLED",
    updatedAt: now.toISOString(),
  };
  assert.deepEqual(written, {
    key: PRODUCTION_KEY,
    config: expectedConfig,
  });
  assert.deepEqual(result, {
    ok: true,
    snapshot: {
      environment: "production",
      configKey: PRODUCTION_KEY,
      config: expectedConfig,
      readStatus: "VALID",
      effective: {
        active: true,
        reason: "ENABLED",
        retryAfter: null,
      },
    },
  });
});

test("scheduled save writes the validated JST pair converted to UTC", async () => {
  const now = new Date("2026-08-11T00:00:00.000Z");
  let writtenConfig: MaintenanceConfig | undefined;

  const result = await saveMaintenanceSettings(
    {
      mode: "SCHEDULED",
      scheduledStartAtJst: "2026-08-11T10:00",
      scheduledEndAtJst: "2026-08-11T11:00",
    },
    {
      requestHostname: "city.example.jp",
      env: productionEnv,
      now,
      readItem: async () => currentConfig,
      writeItem: async (_key, config) => {
        writtenConfig = config;
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(writtenConfig, {
    version: 1,
    mode: "SCHEDULED",
    scheduledStartAt: "2026-08-11T01:00:00.000Z",
    scheduledEndAt: "2026-08-11T02:00:00.000Z",
    updatedAt: now.toISOString(),
  });
});

test("save never writes when validation or the required current read fails", async () => {
  let readCount = 0;
  let writeCount = 0;
  const invalidResult = await saveMaintenanceSettings(
    {
      mode: "SCHEDULED",
      scheduledStartAtJst: null,
      scheduledEndAtJst: null,
    },
    {
      requestHostname: "city.example.jp",
      env: productionEnv,
      readItem: async () => {
        readCount += 1;
        return currentConfig;
      },
      writeItem: async () => {
        writeCount += 1;
      },
    },
  );
  assert.equal(invalidResult.ok, false);
  assert.equal(readCount, 0);
  assert.equal(writeCount, 0);

  await assert.rejects(
    saveMaintenanceSettings(
      {
        mode: "DISABLED",
        scheduledStartAtJst: null,
        scheduledEndAtJst: null,
      },
      {
        requestHostname: "city.example.jp",
        env: productionEnv,
        readItem: async () => undefined,
        writeItem: async () => {
          writeCount += 1;
        },
      },
    ),
    MaintenanceSettingsUnavailableError,
  );
  assert.equal(writeCount, 0);
});

test("high-level write failures are sanitized", async () => {
  await assert.rejects(
    saveMaintenanceSettings(
      {
        mode: "DISABLED",
        scheduledStartAtJst: null,
        scheduledEndAtJst: null,
      },
      {
        requestHostname: "city.example.jp",
        env: productionEnv,
        readItem: async () => currentConfig,
        writeItem: async () => {
          throw new Error(`${WRITE_TOKEN} ${CONNECTION_STRING}`);
        },
      },
    ),
    (error: unknown) => sanitizedError(error, MaintenanceSettingsSaveError),
  );
});

function sanitizedError(
  error: unknown,
  constructor:
    | typeof MaintenanceEdgeConfigReadError
    | typeof MaintenanceEdgeConfigWriteError
    | typeof MaintenanceSettingsSaveError,
): boolean {
  assert.ok(error instanceof constructor);
  const rendered = String(error);
  assert.equal(rendered.includes(READ_TOKEN), false);
  assert.equal(rendered.includes(WRITE_TOKEN), false);
  assert.equal(rendered.includes(CONNECTION_STRING), false);
  return true;
}
