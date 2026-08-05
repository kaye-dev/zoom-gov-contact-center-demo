import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
  resolveDatabasePoolConfig,
  runWithDatabaseContext,
  type DatabaseContext,
} from "../lib/server/prisma";

test("local database config uses the development fallback and bounded pool", () => {
  const config = resolveDatabasePoolConfig({ NODE_ENV: "development" });

  assert.equal(
    config.connectionString,
    "postgresql://postgres:postgres@localhost:5432/zoom_demo",
  );
  assert.equal(config.max, 2);
  assert.equal(config.application_name, "zoom-gov-demo-app");
  assert.equal(config.connectionTimeoutMillis, 45_000);
  assert.equal(config.ssl, undefined);
});

test("structured AWS database config enables verified RDS TLS", () => {
  const config = resolveDatabasePoolConfig({
    NODE_ENV: "production",
    DB_HOST: "database.cluster-example.ap-northeast-1.rds.amazonaws.com",
    DB_PORT: "5432",
    DB_NAME: "zoom_demo",
    DB_USER: "app_user",
    DB_PASSWORD: "secret",
  });

  assert.equal(config.host, "database.cluster-example.ap-northeast-1.rds.amazonaws.com");
  assert.equal(config.port, 5432);
  assert.equal(config.database, "zoom_demo");
  assert.equal(config.user, "app_user");
  assert.equal(config.password, "secret");
  assert.equal(config.max, 2);
  assert.equal(config.application_name, "zoom-gov-demo-app");
  assert.equal(config.connectionTimeoutMillis, 45_000);
  assert.ok(config.ssl && typeof config.ssl === "object");
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.ok(Array.isArray(config.ssl.ca));
  assert.ok(config.ssl.ca.length > 0);
});

test("production rejects missing, partial, and invalid database config", () => {
  assert.throws(
    () => resolveDatabasePoolConfig({ NODE_ENV: "production" }),
    /Database configuration is required in production/,
  );
  assert.throws(
    () =>
      resolveDatabasePoolConfig({
        NODE_ENV: "production",
        DB_HOST: "database.example",
      }),
    /must be set together/,
  );
  assert.throws(
    () =>
      resolveDatabasePoolConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://example",
        DB_SSL: "sometimes",
      }),
    /DB_SSL must be true or false/,
  );
});

test("Aurora connection preflight retries at most three times", async () => {
  let attempts = 0;
  const waits: number[] = [];
  const prisma = {
    async $queryRawUnsafe() {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("Aurora is resuming");
      }
      return [{ value: 1 }];
    },
  } as unknown as Pick<PrismaClient, "$queryRawUnsafe">;

  await connectDatabaseWithRetry(prisma, async (milliseconds) => {
    waits.push(milliseconds);
  });

  assert.equal(attempts, 3);
  assert.deepEqual(waits, [500, 1_000]);
});

test("database context closes once after success and failure", async () => {
  const outcomes = ["success", "failure"] as const;

  for (const outcome of outcomes) {
    let closeCount = 0;
    const prisma = {
      async $queryRawUnsafe() {
        return [{ value: 1 }];
      },
    } as unknown as PrismaClient;
    const database: DatabaseContext = {
      prisma,
      async close() {
        closeCount += 1;
      },
    };

    if (outcome === "success") {
      assert.equal(
        await runWithDatabaseContext(database, async () => "done"),
        "done",
      );
    } else {
      await assert.rejects(
        runWithDatabaseContext(database, async () => {
          throw new Error("operation failed");
        }),
        /operation failed/,
      );
    }

    assert.equal(closeCount, 1);
  }
});

test("database context close is idempotent", async () => {
  const database = createDatabaseContext({ NODE_ENV: "development" });
  let disconnectCount = 0;
  database.prisma.$disconnect = async () => {
    disconnectCount += 1;
  };

  await database.close();
  await database.close();

  assert.equal(disconnectCount, 1);
});
