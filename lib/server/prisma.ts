import awsRdsSslProfile from "aws-ssl-profiles";
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
  // Passing PoolConfig to PrismaPg lets the adapter own the pool. Prisma's
  // $disconnect() then calls pool.end(), which is essential for Aurora 0 ACU
  // auto-pause after a Lambda invocation finishes.
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
  env: NodeJS.ProcessEnv = process.env,
) {
  return Boolean(
    env.DATABASE_URL?.trim() ||
      (env.DB_HOST?.trim() &&
        env.DB_NAME?.trim() &&
        env.DB_USER?.trim() &&
        env.DB_PASSWORD),
  );
}

export function resolveDatabasePoolConfig(
  env: NodeJS.ProcessEnv,
): PoolConfig {
  const connectionString = env.DATABASE_URL?.trim();
  const structuredConfig = readStructuredDatabaseConfig(env);
  const isProduction = env.NODE_ENV === "production";

  if (!connectionString && !structuredConfig && isProduction) {
    throw new Error(
      "Database configuration is required in production. Set DATABASE_URL or DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD.",
    );
  }

  const sslEnabled = readBoolean(env.DB_SSL, Boolean(structuredConfig));
  const maxConnections = readPositiveInteger(
    env.DB_POOL_MAX,
    DEFAULT_POOL_MAX,
    "DB_POOL_MAX",
  );
  const connectionTimeoutMillis = readPositiveInteger(
    env.DB_CONNECTION_TIMEOUT_MS,
    DEFAULT_CONNECTION_TIMEOUT_MS,
    "DB_CONNECTION_TIMEOUT_MS",
  );

  return {
    ...(structuredConfig ?? {
      connectionString: connectionString ?? LOCAL_DATABASE_URL,
    }),
    max: maxConnections,
    application_name:
      env.DB_APPLICATION_NAME?.trim() || DEFAULT_APPLICATION_NAME,
    connectionTimeoutMillis,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
    ...(sslEnabled
      ? {
          ssl: {
            ...awsRdsSslProfile,
            rejectUnauthorized: true,
          },
        }
      : {}),
  };
}

function readStructuredDatabaseConfig(
  env: NodeJS.ProcessEnv,
): PoolConfig | undefined {
  const values = {
    host: env.DB_HOST?.trim(),
    database: env.DB_NAME?.trim(),
    user: env.DB_USER?.trim(),
    password: env.DB_PASSWORD,
  };
  const provided = Object.values(values).filter(Boolean).length;

  if (provided === 0) {
    return undefined;
  }

  if (provided !== Object.keys(values).length) {
    throw new Error(
      "DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD must be set together.",
    );
  }

  return {
    host: values.host,
    port: readPort(env.DB_PORT),
    database: values.database,
    user: values.user,
    password: values.password,
  };
}

function readPort(value: string | undefined) {
  const port = readPositiveInteger(value, 5432, "DB_PORT");

  if (port > 65_535) {
    throw new Error("DB_PORT must be between 1 and 65535.");
  }

  return port;
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("DB_SSL must be true or false.");
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
