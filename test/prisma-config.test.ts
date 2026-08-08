import assert from "node:assert/strict";
import test from "node:test";

import { resolveMigrationDatabaseUrl } from "../prisma.config";

test("migration config prefers the transient unpooled URL", () => {
  assert.equal(
    resolveMigrationDatabaseUrl({
      DATABASE_URL: "postgresql://pooled.example/database",
      DATABASE_URL_UNPOOLED: "postgresql://direct.example/database",
    }),
    "postgresql://direct.example/database",
  );
});

test("migration config falls back to the pooled and local URLs", () => {
  assert.equal(
    resolveMigrationDatabaseUrl({
      DATABASE_URL: "postgresql://pooled.example/database",
    }),
    "postgresql://pooled.example/database",
  );
  assert.equal(
    resolveMigrationDatabaseUrl({}),
    "postgresql://postgres:postgres@localhost:5432/zoom_demo",
  );
});
