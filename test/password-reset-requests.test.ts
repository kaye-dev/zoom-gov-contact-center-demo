import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  createBoundedPasswordResetRequest,
  PASSWORD_RESET_GLOBAL_WINDOW_LIMIT,
  PASSWORD_RESET_TOTAL_LIMIT,
} from "../lib/server/password-reset-requests";

type FakeOptions = {
  duplicate?: boolean;
  recentGlobalCount?: number;
  totalCount?: number;
  userId?: string;
};

function createFakePrisma(options: FakeOptions = {}) {
  const calls = {
    created: [] as Array<{ email: string; userId?: string }>,
    deletedBefore: undefined as Date | undefined,
    userLookups: 0,
  };
  let countCall = 0;
  const prisma = {
    passwordResetRequest: {
      async deleteMany(input: { where: { requestedAt: { lt: Date } } }) {
        calls.deletedBefore = input.where.requestedAt.lt;
        return { count: 0 };
      },
      async findFirst() {
        return options.duplicate ? { id: "existing" } : null;
      },
      async count() {
        countCall += 1;
        return countCall === 1
          ? (options.recentGlobalCount ?? 0)
          : (options.totalCount ?? 0);
      },
      async create(input: { data: { email: string; userId?: string } }) {
        calls.created.push(input.data);
        return { id: "created" };
      },
    },
    user: {
      async findUnique() {
        calls.userLookups += 1;
        return options.userId ? { id: options.userId } : null;
      },
    },
  } as unknown as PrismaClient;

  return { calls, prisma };
}

test("password reset request is retained for only 30 days and links a known user", async () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  const { calls, prisma } = createFakePrisma({ userId: "user-1" });

  assert.equal(
    await createBoundedPasswordResetRequest(prisma, "admin@example.com", now),
    "created",
  );
  assert.equal(
    calls.deletedBefore?.toISOString(),
    "2026-07-06T12:00:00.000Z",
  );
  assert.deepEqual(calls.created, [
    { email: "admin@example.com", userId: "user-1" },
  ]);
});

test("duplicate reset requests do not create another row or enumerate users", async () => {
  const { calls, prisma } = createFakePrisma({ duplicate: true });

  assert.equal(
    await createBoundedPasswordResetRequest(prisma, "admin@example.com"),
    "deduplicated",
  );
  assert.equal(calls.userLookups, 0);
  assert.deepEqual(calls.created, []);
});

test("global request-window and total-row caps stop public writes", async () => {
  for (const options of [
    { recentGlobalCount: PASSWORD_RESET_GLOBAL_WINDOW_LIMIT },
    { totalCount: PASSWORD_RESET_TOTAL_LIMIT },
  ]) {
    const { calls, prisma } = createFakePrisma(options);

    assert.equal(
      await createBoundedPasswordResetRequest(prisma, "new@example.com"),
      "rate-limited",
    );
    assert.equal(calls.userLookups, 0);
    assert.deepEqual(calls.created, []);
  }
});
