import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
} from "@/lib/server/prisma";
import { TENANTS, listTenantProductionOrigins } from "@/lib/tenants";

const LOCAL_BASE_URL = "http://localhost:3000";
const LOCAL_SECRET = "local-development-secret-change-me";
const EXAMPLE_SECRET = "replace-with-a-long-random-secret";
const defaultTrustedOrigins = [3000, 3001, 3002, 3003].map(port => `http://localhost:${port}`);

type CreateAuthOptions = {
  baseURL?: string;
  env?: NodeJS.ProcessEnv;
};

export function createAuth(
  prisma: PrismaClient | Prisma.TransactionClient,
  options: CreateAuthOptions = {},
) {
  const env = options.env ?? process.env;
  const production = env.NODE_ENV === "production";
  const configuredSecret = env.BETTER_AUTH_SECRET?.trim();

  if (
    production &&
    (!configuredSecret ||
      configuredSecret.length < 32 ||
      configuredSecret === LOCAL_SECRET ||
      configuredSecret === EXAMPLE_SECRET)
  ) {
    throw new Error(
      "BETTER_AUTH_SECRET must be a non-placeholder value of at least 32 characters in production.",
    );
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
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
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
      // Vercel forwards the public host through trusted proxy headers.
      // The dynamic base URL below still restricts it to exact known hosts.
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
  if (override) {
    return override;
  }

  if (env.NODE_ENV !== "production") {
    const configured = env.BETTER_AUTH_URL?.trim() || LOCAL_BASE_URL;
    const url = new URL(configured);
    if (["lg.localhost", "univ.localhost"].includes(url.hostname)) return LOCAL_BASE_URL;
    return configured;
  }

  const canonicalOrigin = readRequiredProductionOrigin(
    env.BETTER_AUTH_URL,
    "BETTER_AUTH_URL",
  );
  // One deployment serves every industry demo domain, so each registered
  // tenant hostname must be an accepted base URL host.
  const allowedHosts = unique([
    new URL(canonicalOrigin).host,
    ...TENANTS.map((tenant) => tenant.productionHost),
    ...readVercelHosts(env),
  ]);

  return {
    allowedHosts,
    protocol: "https" as const,
  };
}

function getTrustedOrigins(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== "production") {
    const configuredOrigins = readCommaSeparated(
      env.BETTER_AUTH_TRUSTED_ORIGINS,
    );
    return unique([...defaultTrustedOrigins, ...configuredOrigins]);
  }

  const canonicalOrigin = readRequiredProductionOrigin(
    env.BETTER_AUTH_URL,
    "BETTER_AUTH_URL",
  );
  const configuredOrigins = readCommaSeparated(
    env.BETTER_AUTH_TRUSTED_ORIGINS,
  ).map((origin) =>
    readRequiredProductionOrigin(origin, "BETTER_AUTH_TRUSTED_ORIGINS"),
  );

  // One deployment serves every industry demo domain, so the trusted origins
  // must be exactly BETTER_AUTH_URL plus every registered tenant origin: no
  // fewer (a tenant domain could not authenticate) and no more (an unexpected
  // origin would be trusted).
  const expectedOrigins = unique([
    canonicalOrigin,
    ...listTenantProductionOrigins(),
  ]);

  if (
    configuredOrigins.length !== expectedOrigins.length ||
    new Set(configuredOrigins).size !== configuredOrigins.length ||
    !expectedOrigins.every((origin) => configuredOrigins.includes(origin))
  ) {
    throw new Error(
      "BETTER_AUTH_TRUSTED_ORIGINS must contain exactly BETTER_AUTH_URL and the registered tenant origins in production.",
    );
  }

  return unique([
    ...expectedOrigins,
    ...readVercelHosts(env).map((host) => `https://${host}`),
  ]);
}

function readCommaSeparated(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readRequiredProductionOrigin(
  value: string | undefined,
  name: string,
) {
  const configuredValue = value?.trim();
  if (!configuredValue) {
    throw new Error(`${name} is required in production.`);
  }

  let url: URL;
  try {
    url = new URL(configuredValue);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    configuredValue.includes("*") ||
    configuredValue.includes("?")
  ) {
    throw new Error(
      `${name} must be an exact HTTPS origin without a wildcard, path, query, or fragment.`,
    );
  }

  return url.origin;
}

function readVercelHosts(env: NodeJS.ProcessEnv) {
  return unique(
    [
      ["VERCEL_URL", env.VERCEL_URL],
      ["VERCEL_PROJECT_PRODUCTION_URL", env.VERCEL_PROJECT_PRODUCTION_URL],
    ].flatMap(([name, value]) => {
      const configuredValue = value?.trim();
      if (!configuredValue) {
        return [];
      }

      if (configuredValue.includes("*") || configuredValue.includes("?")) {
        throw new Error(`${name} must be an exact Vercel host.`);
      }

      let url: URL;
      try {
        url = new URL(
          configuredValue.includes("://")
            ? configuredValue
            : `https://${configuredValue}`,
        );
      } catch {
        throw new Error(`${name} must be an exact Vercel host.`);
      }

      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new Error(`${name} must be an exact HTTPS Vercel host.`);
      }

      return [url.host.toLowerCase()];
    }),
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
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
