import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/zoom_demo";
const DEFAULT_CONNECTION_TIMEOUT_MS = 45_000;
const DEFAULT_POOL_MAX = 2;
const DEFAULT_APPLICATION_NAME = "zoom-gov-demo-app";
const DATABASE_CONNECT_RETRY_DELAYS_MS = [500, 1_000] as const;

export type DatabaseContext = {
  prisma: PrismaClient;
  close: () => Promise<void>;
};

export function createDatabaseContext(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseContext {
  // Passing PoolConfig to PrismaPg lets the adapter own the pool so
  // Prisma's $disconnect() can close it after each serverless invocation.
  const adapter = new PrismaPg(resolveDatabasePoolConfig(env));
  const prisma = new PrismaClient({ adapter });
  let closed = false;

  return {
    prisma,
    async close() {
      if (closed) {
        return;
      }

      closed = true;
      await prisma.$disconnect();
    },
  };
}

export async function withPrisma<T>(
  operation: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  return runWithDatabaseContext(createDatabaseContext(), operation);
}

export async function runWithDatabaseContext<T>(
  database: DatabaseContext,
  operation: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  try {
    await connectDatabaseWithRetry(database.prisma);
    return await operation(database.prisma);
  } finally {
    await database.close();
  }
}

export async function connectDatabaseWithRetry(
  prisma: Pick<PrismaClient, "$queryRawUnsafe">,
  wait: (milliseconds: number) => Promise<void> = delay,
) {
  const attempts = DATABASE_CONNECT_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      return;
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }

      await wait(DATABASE_CONNECT_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function hasDatabaseConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return Boolean(env.DATABASE_URL?.trim());
}

export function resolveDatabasePoolConfig(
  env: NodeJS.ProcessEnv,
): PoolConfig {
  const connectionString = env.DATABASE_URL?.trim();
  const isProduction = env.NODE_ENV === "production";

  if (!connectionString && isProduction) {
    throw new Error(
      "DATABASE_URL is required in production.",
    );
  }

  return {
    connectionString: connectionString ?? LOCAL_DATABASE_URL,
    max: DEFAULT_POOL_MAX,
    application_name: DEFAULT_APPLICATION_NAME,
    connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
