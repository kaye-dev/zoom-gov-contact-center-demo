import "dotenv/config";
import { defineConfig } from "prisma/config";

const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/zoom_demo";

export function resolveMigrationDatabaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    env.DATABASE_URL_UNPOOLED?.trim() ||
    env.DATABASE_URL?.trim() ||
    LOCAL_DATABASE_URL
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed-admin.ts",
  },
  datasource: {
    url: resolveMigrationDatabaseUrl(),
  },
});
