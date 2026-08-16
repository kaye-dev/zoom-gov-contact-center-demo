import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAINTENANCE_SETTINGS_CONFLICT_CODE,
  MaintenanceEnvironmentResolutionError,
  type MaintenanceConfig,
} from "../lib/maintenance-config";
import {
  MAINTENANCE_POSTGRES_CONNECTION_TIMEOUT_MS,
  MAINTENANCE_POSTGRES_POOL_MAX,
  MAINTENANCE_POSTGRES_QUERY_TIMEOUT_MS,
  MAINTENANCE_POSTGRES_READ_QUERY,
  MAINTENANCE_POSTGRES_READ_TIMEOUT_MS,
  readMaintenanceSettingFromPostgres,
  resolveMaintenancePostgresPoolConfig,
  type MaintenancePostgresPool,
} from "../lib/server/maintenance-postgres-reader";
import {
  writeMaintenanceSettingWithPrisma,
  type MaintenancePrismaClient,
} from "../lib/server/maintenance-prisma-writer";
import { getMaintenanceSettingsSnapshot } from "../lib/server/maintenance-settings-read";
import {
  MaintenanceSettingsSaveError,
  saveMaintenanceSettings,
} from "../lib/server/maintenance-settings-write";
import {
  MaintenanceStoreReadError,
  MaintenanceStoreWriteError,
  parseMaintenanceStoreRow,
  toMaintenanceDatabaseEnvironment,
  type MaintenanceSettingWriter,
  type MaintenanceStoreUpdate,
} from "../lib/server/maintenance-store";

const SECRET_DATABASE_URL =
  "postgresql://secret-user:secret-password@db.example.test/demo";
const PRODUCTION_ENV = {
  NODE_ENV: "production",
  APP_CANONICAL_ORIGIN: "https://city.example.jp",
  DATABASE_URL: SECRET_DATABASE_URL,
} as const;
const NOW = new Date("2026-08-11T00:00:00.000Z");
const CURRENT_CONFIG: MaintenanceConfig = {
  version: 1,
  mode: "DISABLED",
  scheduledStartAt: "2026-09-01T00:00:00.000Z",
  scheduledEndAt: "2026-09-01T01:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

test("maintenance pool uses one bounded no-retry profile", () => {
  assert.deepEqual(resolveMaintenancePostgresPoolConfig(PRODUCTION_ENV), {
    connectionString: SECRET_DATABASE_URL,
    max: MAINTENANCE_POSTGRES_POOL_MAX,
    application_name: "zoom-gov-demo-maintenance-proxy",
    connectionTimeoutMillis: MAINTENANCE_POSTGRES_CONNECTION_TIMEOUT_MS,
    query_timeout: MAINTENANCE_POSTGRES_QUERY_TIMEOUT_MS,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  assert.equal(MAINTENANCE_POSTGRES_POOL_MAX, 2);
  assert.equal(MAINTENANCE_POSTGRES_CONNECTION_TIMEOUT_MS, 1_000);
  assert.equal(MAINTENANCE_POSTGRES_QUERY_TIMEOUT_MS, 750);
  assert.equal(MAINTENANCE_POSTGRES_READ_TIMEOUT_MS, 2_000);
  assert.throws(
    () =>
      resolveMaintenancePostgresPoolConfig({ NODE_ENV: "production" }),
    (error: unknown) => sanitizedReadError(error),
  );
});

test("Postgres reader executes one scoped query and releases the client", async () => {
  const row = databaseRow();
  const queryInputs: unknown[] = [];
  const releaseInputs: Array<Error | boolean | undefined> = [];
  let connectCount = 0;
  let clearedTimeouts = 0;
  let scheduledTimeoutMs: number | undefined;
  const timeoutHandle = {};
  const pool: MaintenancePostgresPool = {
    async connect() {
      connectCount += 1;
      return {
        async query(input) {
          queryInputs.push(input);
          return { rows: [row] };
        },
        release(error) {
          releaseInputs.push(error);
        },
      };
    },
  };

  const first = await readMaintenanceSettingFromPostgres("production", {
    env: PRODUCTION_ENV,
    pool,
    scheduleTimeoutImpl(_callback, delayMs) {
      scheduledTimeoutMs = delayMs;
      return timeoutHandle;
    },
    clearTimeoutImpl(handle) {
      assert.equal(handle, timeoutHandle);
      clearedTimeouts += 1;
    },
  });
  const second = await readMaintenanceSettingFromPostgres("production", {
    env: PRODUCTION_ENV,
    pool,
    scheduleTimeoutImpl() {
      return timeoutHandle;
    },
    clearTimeoutImpl() {
      clearedTimeouts += 1;
    },
  });

  assert.deepEqual(first, {
    status: "FOUND",
    setting: {
      environment: "production",
      config: CURRENT_CONFIG,
      revision: 4,
    },
  });
  assert.deepEqual(second, first);
  assert.equal(connectCount, 2, "successful values are not cached");
  assert.equal(scheduledTimeoutMs, MAINTENANCE_POSTGRES_READ_TIMEOUT_MS);
  assert.equal(clearedTimeouts, 2);
  assert.deepEqual(releaseInputs, [undefined, undefined]);
  assert.deepEqual(queryInputs, [
    {
      text: MAINTENANCE_POSTGRES_READ_QUERY,
      values: ["PRODUCTION"],
    },
    {
      text: MAINTENANCE_POSTGRES_READ_QUERY,
      values: ["PRODUCTION"],
    },
  ]);
});

test("Postgres reader distinguishes missing and malformed rows", async () => {
  for (const [rows, expectedStatus] of [
    [[], "MISSING"],
    [[{ ...databaseRow(), revision: 0 }], "INVALID"],
    [[{ ...databaseRow(), revision: 2_147_483_648 }], "INVALID"],
    [[{ ...databaseRow(), environment: "PREVIEW" }], "INVALID"],
  ] as const) {
    const result = await readMaintenanceSettingFromPostgres("production", {
      pool: singleResultPool([...rows]),
      scheduleTimeoutImpl() {
        return {};
      },
      clearTimeoutImpl() {},
    });
    assert.equal(result.status, expectedStatus);
  }
});

test("Postgres reader timeout destroys an active client and sanitizes the error", async () => {
  const timeoutHandle = {};
  const releaseInputs: Array<Error | boolean | undefined> = [];
  let scheduledTimeouts = 0;
  let clearedTimeouts = 0;
  const pool: MaintenancePostgresPool = {
    async connect() {
      return {
        query: () => new Promise<never>(() => undefined),
        release(error) {
          releaseInputs.push(error);
        },
      };
    },
  };

  await assert.rejects(
    readMaintenanceSettingFromPostgres("production", {
      env: PRODUCTION_ENV,
      pool,
      readTimeoutMs: 25,
      scheduleTimeoutImpl(callback, delayMs) {
        assert.equal(delayMs, 25);
        scheduledTimeouts += 1;
        queueMicrotask(callback);
        return timeoutHandle;
      },
      clearTimeoutImpl(handle) {
        assert.equal(handle, timeoutHandle);
        clearedTimeouts += 1;
      },
    }),
    (error: unknown) => sanitizedReadError(error),
  );

  assert.equal(scheduledTimeouts, 1);
  assert.equal(clearedTimeouts, 1);
  assert.equal(releaseInputs.length, 1);
  assert.ok(releaseInputs[0] instanceof MaintenanceStoreReadError);
});

test("Postgres reader deadline covers stalled and late connection acquisition", async () => {
  let resolveConnection:
    | ((client: Awaited<ReturnType<MaintenancePostgresPool["connect"]>>) => void)
    | undefined;
  let expire: (() => void) | undefined;
  let queryCount = 0;
  const releaseInputs: Array<Error | boolean | undefined> = [];
  const pool: MaintenancePostgresPool = {
    connect() {
      return new Promise((resolve) => {
        resolveConnection = resolve;
      });
    },
  };

  const read = readMaintenanceSettingFromPostgres("production", {
    env: PRODUCTION_ENV,
    pool,
    readTimeoutMs: 25,
    scheduleTimeoutImpl(callback) {
      expire = callback;
      return {};
    },
    clearTimeoutImpl() {},
  });

  assert.ok(expire);
  expire();
  await assert.rejects(read, (error: unknown) => sanitizedReadError(error));

  assert.ok(resolveConnection);
  resolveConnection({
    async query() {
      queryCount += 1;
      return { rows: [] };
    },
    release(error) {
      releaseInputs.push(error);
    },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(queryCount, 0);
  assert.equal(releaseInputs.length, 1);
  assert.ok(releaseInputs[0] instanceof MaintenanceStoreReadError);
});

test("Postgres reader performs no retry and destroys a failed client", async () => {
  let connectCount = 0;
  let queryCount = 0;
  const releaseInputs: Array<Error | boolean | undefined> = [];
  const pool: MaintenancePostgresPool = {
    async connect() {
      connectCount += 1;
      return {
        async query() {
          queryCount += 1;
          throw new Error(`driver exposed ${SECRET_DATABASE_URL}`);
        },
        release(error) {
          releaseInputs.push(error);
        },
      };
    },
  };

  await assert.rejects(
    readMaintenanceSettingFromPostgres("production", {
      env: PRODUCTION_ENV,
      pool,
    }),
    (error: unknown) => sanitizedReadError(error),
  );
  assert.equal(connectCount, 1);
  assert.equal(queryCount, 1);
  assert.equal(releaseInputs.length, 1);
  assert.ok(releaseInputs[0] instanceof MaintenanceStoreReadError);
});

test("store row parser maps database enums and timestamptz values", () => {
  assert.deepEqual(parseMaintenanceStoreRow(databaseRow()), {
    environment: "production",
    config: CURRENT_CONFIG,
    revision: 4,
  });
  assert.equal(toMaintenanceDatabaseEnvironment("preview"), "PREVIEW");
  assert.equal(
    parseMaintenanceStoreRow({ ...databaseRow(), unexpected: true }),
    null,
  );
  assert.equal(
    parseMaintenanceStoreRow({ ...databaseRow(), version: 2 }),
    null,
  );
  assert.equal(
    parseMaintenanceStoreRow({
      ...databaseRow(),
      revision: 2_147_483_647,
    })?.revision,
    2_147_483_647,
  );
});

test("snapshot retains logical keys and fails closed for unavailable stores", async () => {
  const valid = await getMaintenanceSettingsSnapshot({
    requestHostname: "city.example.jp:443",
    env: PRODUCTION_ENV,
    now: NOW,
    readSetting: async (environment) => ({
      status: "FOUND",
      setting: { environment, config: CURRENT_CONFIG, revision: 4 },
    }),
  });
  assert.deepEqual(valid, {
    environment: "production",
    configKey: "site_maintenance_production",
    config: CURRENT_CONFIG,
    revision: 4,
    readStatus: "VALID",
    effective: {
      active: false,
      reason: "DISABLED",
      retryAfter: null,
    },
  });

  for (const [readSetting, expectedStatus] of [
    [async () => ({ status: "MISSING" as const }), "MISSING"],
    [async () => ({ status: "INVALID" as const }), "INVALID"],
    [async () => Promise.reject(new Error(SECRET_DATABASE_URL)), "ERROR"],
  ] as const) {
    const snapshot = await getMaintenanceSettingsSnapshot({
      requestHostname: "candidate.vercel.app",
      env: PRODUCTION_ENV,
      now: NOW,
      readSetting,
    });
    assert.equal(snapshot.environment, "preview");
    assert.equal(snapshot.configKey, "site_maintenance_preview");
    assert.equal(snapshot.config, null);
    assert.equal(snapshot.revision, null);
    assert.equal(snapshot.readStatus, expectedStatus);
    assert.deepEqual(snapshot.effective, {
      active: true,
      reason: "FAIL_CLOSED",
      retryAfter: null,
    });
  }

  await assert.rejects(
    getMaintenanceSettingsSnapshot({
      requestHostname: "city.example.jp",
      env: { NODE_ENV: "production", APP_CANONICAL_ORIGIN: undefined },
      readSetting: async () => ({ status: "MISSING" }),
    }),
    MaintenanceEnvironmentResolutionError,
  );
});

test("Prisma writer applies a partial manual update and increments revision", async () => {
  let updateArgs: unknown;
  let findCount = 0;
  const prisma = prismaClient({
    async updateManyAndReturn(args) {
      updateArgs = args;
      return [prismaRow({ mode: "ENABLED", revision: 5 })];
    },
    async findUnique() {
      findCount += 1;
      return { environment: "PRODUCTION" };
    },
  });

  const result = await writeMaintenanceSettingWithPrisma(prisma, {
    environment: "production",
    mode: "ENABLED",
    expectedRevision: 4,
    updatedAt: NOW.toISOString(),
  });

  assert.equal(result.status, "UPDATED");
  assert.equal(findCount, 0);
  const args = updateArgs as {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
    select: Record<string, unknown>;
  };
  assert.deepEqual(args.where, {
    environment: "PRODUCTION",
    revision: 4,
    schemaVersion: 1,
  });
  assert.equal(args.data.mode, "ENABLED");
  assert.deepEqual(args.data.revision, { increment: 1 });
  assert.equal(Object.hasOwn(args.data, "scheduledStartAt"), false);
  assert.equal(Object.hasOwn(args.data, "scheduledEndAt"), false);
  assert.equal(args.select.schemaVersion, true);
});

test("Prisma writer converts scheduled instants and classifies OCC conflicts", async () => {
  let updateArgs: unknown;
  let existing: { environment: "PRODUCTION" } | null = {
    environment: "PRODUCTION",
  };
  const prisma = prismaClient({
    async updateManyAndReturn(args) {
      updateArgs = args;
      return [];
    },
    async findUnique() {
      return existing;
    },
  });
  const update: MaintenanceStoreUpdate = {
    environment: "production",
    mode: "SCHEDULED",
    scheduledStartAt: "2026-08-11T01:00:00.000Z",
    scheduledEndAt: "2026-08-11T02:00:00.000Z",
    expectedRevision: 4,
    updatedAt: NOW.toISOString(),
  };

  assert.deepEqual(
    await writeMaintenanceSettingWithPrisma(prisma, update),
    { status: "CONFLICT" },
  );
  const data = (updateArgs as { data: Record<string, unknown> }).data;
  assert.deepEqual(
    data.scheduledStartAt,
    new Date("2026-08-11T01:00:00.000Z"),
  );
  assert.deepEqual(
    data.scheduledEndAt,
    new Date("2026-08-11T02:00:00.000Z"),
  );

  existing = null;
  await assert.rejects(
    writeMaintenanceSettingWithPrisma(prisma, update),
    (error: unknown) => sanitizedWriteError(error),
  );
});

test("save service returns revisioned snapshots and typed conflicts", async () => {
  let receivedUpdate: MaintenanceStoreUpdate | undefined;
  const writeSetting: MaintenanceSettingWriter = async (update) => {
    receivedUpdate = update;
    return {
      status: "UPDATED",
      setting: {
        environment: update.environment,
        revision: update.expectedRevision + 1,
        config: {
          ...CURRENT_CONFIG,
          mode: update.mode,
          updatedAt: update.updatedAt,
        },
      },
    };
  };
  const input = {
    mode: "ENABLED",
    scheduledStartAtJst: "2027-01-01T09:00",
    scheduledEndAtJst: "2027-01-01T10:00",
    expectedRevision: 4,
  };

  const result = await saveMaintenanceSettings(input, {
    requestHostname: "city.example.jp",
    env: PRODUCTION_ENV,
    now: NOW,
    writeSetting,
  });
  assert.deepEqual(receivedUpdate, {
    environment: "production",
    mode: "ENABLED",
    expectedRevision: 4,
    updatedAt: NOW.toISOString(),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.snapshot.revision, 5);
    assert.equal(result.snapshot.configKey, "site_maintenance_production");
    assert.equal(result.snapshot.config?.scheduledStartAt, CURRENT_CONFIG.scheduledStartAt);
  }

  assert.deepEqual(
    await saveMaintenanceSettings(input, {
      requestHostname: "city.example.jp",
      env: PRODUCTION_ENV,
      now: NOW,
      writeSetting: async () => ({ status: "CONFLICT" }),
    }),
    { ok: false, code: MAINTENANCE_SETTINGS_CONFLICT_CODE },
  );
});

test("save service validates before writing and sanitizes provider errors", async () => {
  let writeCount = 0;
  const invalid = await saveMaintenanceSettings(
    {
      mode: "DISABLED",
      scheduledStartAtJst: null,
      scheduledEndAtJst: null,
      expectedRevision: 0,
    },
    {
      requestHostname: "city.example.jp",
      env: PRODUCTION_ENV,
      writeSetting: async () => {
        writeCount += 1;
        return { status: "CONFLICT" };
      },
    },
  );
  assert.equal(invalid.ok, false);
  assert.equal(writeCount, 0);

  await assert.rejects(
    saveMaintenanceSettings(
      {
        mode: "DISABLED",
        scheduledStartAtJst: null,
        scheduledEndAtJst: null,
        expectedRevision: 1,
      },
      {
        requestHostname: "city.example.jp",
        env: PRODUCTION_ENV,
        writeSetting: async () => {
          throw new Error(SECRET_DATABASE_URL);
        },
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof MaintenanceSettingsSaveError);
      assert.equal(String(error).includes(SECRET_DATABASE_URL), false);
      return true;
    },
  );
});

test("maintenance migration is additive and seeds all three environments", () => {
  const sql = readFileSync(
    new URL(
      "../prisma/migrations/20260816090000_add_site_maintenance_settings/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const constraint of [
    "site_maintenance_settings_version_check",
    "site_maintenance_settings_revision_check",
    "site_maintenance_settings_schedule_pair_check",
    "site_maintenance_settings_schedule_order_check",
    "site_maintenance_settings_scheduled_mode_check",
  ]) {
    assert.match(sql, new RegExp(`CONSTRAINT "${constraint}"`));
  }
  assert.match(sql, /"scheduledStartAt" TIMESTAMPTZ\(3\)/);
  assert.match(sql, /"scheduledEndAt" TIMESTAMPTZ\(3\)/);
  assert.match(sql, /'PRODUCTION', 1, 'DISABLED', NULL, NULL, 1/);
  assert.match(sql, /'PREVIEW', 1, 'DISABLED', NULL, NULL, 1/);
  assert.match(sql, /'DEVELOPMENT', 1, 'DISABLED', NULL, NULL, 1/);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});

function databaseRow(overrides: Record<string, unknown> = {}) {
  return {
    environment: "PRODUCTION",
    version: 1,
    mode: "DISABLED",
    scheduledStartAt: new Date(CURRENT_CONFIG.scheduledStartAt!),
    scheduledEndAt: new Date(CURRENT_CONFIG.scheduledEndAt!),
    revision: 4,
    updatedAt: new Date(CURRENT_CONFIG.updatedAt),
    ...overrides,
  };
}

function prismaRow(overrides: Record<string, unknown> = {}) {
  const { version, ...row } = databaseRow(overrides);
  return { ...row, schemaVersion: version };
}

function singleResultPool(rows: unknown[]): MaintenancePostgresPool {
  return {
    async connect() {
      return {
        async query() {
          return { rows };
        },
        release() {},
      };
    },
  };
}

function prismaClient(delegate: {
  updateManyAndReturn(args: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown>;
}): MaintenancePrismaClient {
  return {
    siteMaintenanceSetting: delegate,
  } as unknown as MaintenancePrismaClient;
}

function sanitizedReadError(error: unknown): boolean {
  assert.ok(error instanceof MaintenanceStoreReadError);
  assert.equal(String(error).includes(SECRET_DATABASE_URL), false);
  return true;
}

function sanitizedWriteError(error: unknown): boolean {
  assert.ok(error instanceof MaintenanceStoreWriteError);
  assert.equal(String(error).includes(SECRET_DATABASE_URL), false);
  return true;
}
