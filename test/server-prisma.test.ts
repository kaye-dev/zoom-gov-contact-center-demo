import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
  hasDatabaseConfiguration,
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

test("production database config uses only the pooled DATABASE_URL", () => {
  const config = resolveDatabasePoolConfig({
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://app:secret@ep-example-pooler.ap-southeast-1.aws.neon.tech/zoom_demo?sslmode=require",
    DATABASE_URL_UNPOOLED:
      "postgresql://app:secret@ep-example.ap-southeast-1.aws.neon.tech/zoom_demo?sslmode=require",
  });

  assert.equal(
    config.connectionString,
    "postgresql://app:secret@ep-example-pooler.ap-southeast-1.aws.neon.tech/zoom_demo?sslmode=require",
  );
  assert.equal(config.max, 2);
  assert.equal(config.application_name, "zoom-gov-demo-app");
  assert.equal(config.connectionTimeoutMillis, 45_000);
  assert.equal(config.ssl, undefined);
});

test("production rejects a missing pooled DATABASE_URL", () => {
  assert.throws(
    () => resolveDatabasePoolConfig({ NODE_ENV: "production" }),
    /DATABASE_URL is required in production/,
  );
  assert.throws(
    () =>
      resolveDatabasePoolConfig({
        NODE_ENV: "production",
        DATABASE_URL_UNPOOLED: "postgresql://direct.example/zoom_demo",
      }),
    /DATABASE_URL is required in production/,
  );
});

test("runtime configuration never treats the unpooled URL as DATABASE_URL", () => {
  assert.equal(
    hasDatabaseConfiguration({
      DATABASE_URL_UNPOOLED: "postgresql://direct.example/zoom_demo",
    }),
    false,
  );
  assert.equal(
    hasDatabaseConfiguration({
      DATABASE_URL: "postgresql://pooled.example/zoom_demo",
    }),
    true,
  );
});

test("database connection preflight retries at most three times", async () => {
  let attempts = 0;
  const waits: number[] = [];
  const prisma = {
    async $queryRawUnsafe() {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("Neon is resuming");
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
