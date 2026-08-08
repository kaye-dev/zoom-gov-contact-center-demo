import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import { createAuth } from "../lib/auth";

const fakePrisma = {} as PrismaClient;
const productionSecret = "kShZ6X3N1bW9qP4vR8tY2uI5oA7sD0fG";

test("production auth rejects local secret and URL fallbacks", () => {
  assert.throws(
    () => createAuth(fakePrisma, { env: { NODE_ENV: "production" } }),
    /BETTER_AUTH_SECRET must be a non-placeholder value of at least 32 characters in production/,
  );
  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: {
          NODE_ENV: "production",
          BETTER_AUTH_SECRET: "x".repeat(31),
        },
      }),
    /BETTER_AUTH_SECRET must be a non-placeholder value of at least 32 characters in production/,
  );
  for (const secret of [
    "local-development-secret-change-me",
    "replace-with-a-long-random-secret",
  ]) {
    assert.throws(
      () =>
        createAuth(fakePrisma, {
          env: {
            NODE_ENV: "production",
            BETTER_AUTH_SECRET: secret,
          },
        }),
      /BETTER_AUTH_SECRET must be a non-placeholder value/,
    );
  }
  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: {
          NODE_ENV: "production",
          BETTER_AUTH_SECRET: productionSecret,
        },
      }),
    /BETTER_AUTH_URL is required in production/,
  );
  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: {
          NODE_ENV: "production",
          BETTER_AUTH_SECRET: productionSecret,
        },
      }),
    /BETTER_AUTH_URL is required in production/,
  );
});

test("production auth trusts only exact canonical and Vercel hosts", () => {
  const auth = createAuth(fakePrisma, {
    env: {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: productionSecret,
      BETTER_AUTH_URL: "https://city.example.jp",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://city.example.jp",
      BETTER_AUTH_TRUST_PROXY_HEADERS: "true",
      VERCEL_URL: "zoom-gov-demo-git-sha.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "zoom-gov-demo.vercel.app",
    },
  });

  assert.deepEqual(auth.options.baseURL, {
    allowedHosts: [
      "city.example.jp",
      "zoom-gov-demo-git-sha.vercel.app",
      "zoom-gov-demo.vercel.app",
    ],
    protocol: "https",
  });
  assert.deepEqual(auth.options.trustedOrigins, [
    "https://city.example.jp",
    "https://zoom-gov-demo-git-sha.vercel.app",
    "https://zoom-gov-demo.vercel.app",
  ]);
  assert.equal(auth.options.advanced?.trustedProxyHeaders, true);
});

test("production auth rejects wildcard and non-origin configuration", () => {
  const baseEnvironment = {
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: productionSecret,
    BETTER_AUTH_URL: "https://city.example.jp",
  } satisfies NodeJS.ProcessEnv;

  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: { ...baseEnvironment, VERCEL_URL: "*.vercel.app" },
      }),
    /VERCEL_URL must be an exact Vercel host/,
  );
  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: {
          ...baseEnvironment,
          BETTER_AUTH_TRUSTED_ORIGINS: "https://city.example.jp/path",
        },
      }),
    /BETTER_AUTH_TRUSTED_ORIGINS must be an exact HTTPS origin/,
  );
  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: {
          ...baseEnvironment,
          BETTER_AUTH_TRUSTED_ORIGINS:
            "https://city.example.jp,https://other.example.jp",
        },
      }),
    /must contain only BETTER_AUTH_URL/,
  );
  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: {
          ...baseEnvironment,
          BETTER_AUTH_URL: "https://city.example.jp:8443",
          BETTER_AUTH_TRUSTED_ORIGINS: "https://city.example.jp:8443",
        },
      }),
    /BETTER_AUTH_URL must be an exact HTTPS origin/,
  );
  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: {
          ...baseEnvironment,
          BETTER_AUTH_TRUSTED_ORIGINS: "https://city.example.jp",
          VERCEL_URL: "preview.vercel.app:8443",
        },
      }),
    /VERCEL_URL must be an exact HTTPS Vercel host/,
  );
});
