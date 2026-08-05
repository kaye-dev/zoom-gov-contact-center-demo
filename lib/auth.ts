import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
} from "@/lib/server/prisma";

const LOCAL_BASE_URL = "http://localhost:3000";
const LOCAL_SECRET = "local-development-secret-change-me";
const defaultTrustedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
];

type CreateAuthOptions = {
  baseURL?: string;
  env?: NodeJS.ProcessEnv;
};

export function createAuth(
  prisma: PrismaClient,
  options: CreateAuthOptions = {},
) {
  const env = options.env ?? process.env;
  const production = env.NODE_ENV === "production";
  const configuredSecret = env.BETTER_AUTH_SECRET?.trim();

  if (production && !configuredSecret) {
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  }

  return betterAuth({
    secret: configuredSecret ?? LOCAL_SECRET,
    baseURL: resolveBaseURL(env, options.baseURL),
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        mustChangePassword: {
          type: "boolean",
          required: false,
          input: false,
          defaultValue: false,
        },
        temporaryPasswordIssuedAt: {
          type: "date",
          required: false,
          input: false,
        },
        passwordChangedAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
    },
    trustedOrigins: getTrustedOrigins(env),
    advanced: {
      // The Lambda Function URL is reachable only through the signed
      // CloudFront origin. CloudFront preserves the viewer host in
      // x-forwarded-host, so Better Auth can safely construct HTTPS URLs.
      trustedProxyHeaders: readBoolean(
        env.BETTER_AUTH_TRUST_PROXY_HEADERS,
        production,
      ),
    },
    plugins: [
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
      nextCookies(),
    ],
  });
}

export type AppAuth = ReturnType<typeof createAuth>;

export async function withAuth<T>(
  operation: (auth: AppAuth, prisma: PrismaClient) => Promise<T>,
) {
  const database = createDatabaseContext();

  try {
    await connectDatabaseWithRetry(database.prisma);
    return await operation(createAuth(database.prisma), database.prisma);
  } finally {
    await database.close();
  }
}

function resolveBaseURL(
  env: NodeJS.ProcessEnv,
  override: string | undefined,
) {
  const staticBaseURL = override ?? env.BETTER_AUTH_URL?.trim();

  if (staticBaseURL) {
    return staticBaseURL;
  }

  if (env.NODE_ENV !== "production") {
    return LOCAL_BASE_URL;
  }

  const allowedHosts = readCommaSeparated(env.BETTER_AUTH_ALLOWED_HOSTS);
  if (allowedHosts.length === 0) {
    throw new Error("BETTER_AUTH_ALLOWED_HOSTS is required in production.");
  }

  return {
    allowedHosts,
    protocol: "https" as const,
    ...(env.BETTER_AUTH_FALLBACK_URL?.trim()
      ? { fallback: env.BETTER_AUTH_FALLBACK_URL.trim() }
      : {}),
  };
}

function getTrustedOrigins(env: NodeJS.ProcessEnv) {
  const configuredOrigins = readCommaSeparated(
    env.BETTER_AUTH_TRUSTED_ORIGINS,
  );

  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  if (env.NODE_ENV === "production") {
    return readCommaSeparated(env.BETTER_AUTH_ALLOWED_HOSTS).map(
      (host) => `https://${host}`,
    );
  }

  return defaultTrustedOrigins;
}

function readCommaSeparated(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

  throw new Error("BETTER_AUTH_TRUST_PROXY_HEADERS must be true or false.");
}
