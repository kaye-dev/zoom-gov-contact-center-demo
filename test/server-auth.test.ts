import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import { createAuth } from "../lib/auth";

const fakePrisma = {} as PrismaClient;
const productionSecret = "kShZ6X3N1bW9qP4vR8tY2uI5oA7sD0fG";

test("production auth rejects local secret and URL fallbacks", () => {
  assert.throws(
    () => createAuth(fakePrisma, { env: { NODE_ENV: "production" } }),
    /BETTER_AUTH_SECRET is required in production/,
  );
  assert.throws(
    () =>
      createAuth(fakePrisma, {
        env: {
          NODE_ENV: "production",
          BETTER_AUTH_SECRET: productionSecret,
        },
      }),
    /BETTER_AUTH_ALLOWED_HOSTS is required in production/,
  );
});

test("production auth trusts only HTTPS CloudFront proxy hosts by default", () => {
  const auth = createAuth(fakePrisma, {
    env: {
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: productionSecret,
      BETTER_AUTH_ALLOWED_HOSTS: "*.cloudfront.net",
    },
  });

  assert.deepEqual(auth.options.baseURL, {
    allowedHosts: ["*.cloudfront.net"],
    protocol: "https",
  });
  assert.deepEqual(auth.options.trustedOrigins, ["https://*.cloudfront.net"]);
  assert.equal(auth.options.advanced?.trustedProxyHeaders, true);
});
