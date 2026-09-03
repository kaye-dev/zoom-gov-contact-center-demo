import assert from "node:assert/strict";
import test from "node:test";

import { resolveMigrationDatabaseUrl } from "../prisma.config";

test("DBTLS-11: migration configはverify-fullの一時unpooled URLを優先する", () => {
  assert.equal(
    resolveMigrationDatabaseUrl({
      DATABASE_URL:
        "postgresql://pooled.example/database?sslmode=verify-full",
      DATABASE_URL_UNPOOLED:
        "postgresql://direct.example/database?sslmode=verify-full",
    }),
    "postgresql://direct.example/database?sslmode=verify-full",
  );
});

test("migration config falls back to the pooled and local URLs", () => {
  assert.equal(
    resolveMigrationDatabaseUrl({
      DATABASE_URL:
        "postgresql://pooled.example/database?sslmode=verify-full",
    }),
    "postgresql://pooled.example/database?sslmode=verify-full",
  );
  assert.equal(
    resolveMigrationDatabaseUrl({}),
    "postgresql://postgres:postgres@localhost:5432/zoom_demo",
  );
});
