import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { Prisma } from "@/lib/generated/prisma/client";

const ADMIN_ACCESS_LOCK_NAMESPACE = 1_515_344_707;
const ADMIN_ACCESS_LOCK_KEY = 1;
const ADMIN_ACCESS_LOCK_TIMEOUT_MS = 10_000;
const sessionLockBrand = Symbol("admin-access-session-lock");
const sessionLockClients = new WeakMap<object, { client: Client; lost?: Error }>();

type AdvisoryTransaction = Pick<Prisma.TransactionClient, "$queryRaw">;

export type AdminAccessSessionLock = {
  readonly [sessionLockBrand]: true;
};

export type AdminAccessMutationState = {
  frozen: boolean;
  freezeId: string | null;
  frozenAt: Date | null;
  reason: string | null;
};

export async function lockAdminAccessMutationTransaction(
  prisma: AdvisoryTransaction,
): Promise<void> {
  await prisma.$queryRaw(Prisma.sql`
    SELECT 1 AS "locked"
    FROM (
      SELECT pg_advisory_xact_lock(
        ${ADMIN_ACCESS_LOCK_NAMESPACE},
        ${ADMIN_ACCESS_LOCK_KEY}
      )
    ) AS "adminAccessLock"
  `);
  const state = await readMutationState(prisma);
  assertValidMutationState(state);
  if (state.frozen) {
    throw new Error("Administrative authority mutations are frozen for recovery.");
  }
}

export async function withAdminAccessSessionLock<T>(
  directUrl: string,
  operation: (lock: AdminAccessSessionLock) => Promise<T>,
  clientOverride?: Client,
): Promise<T> {
  assertDirectDatabaseUrl(directUrl);
  const client = clientOverride ?? new Client({
    connectionString: directUrl,
    application_name: "zoom-gov-demo-legacy-rollback-lock",
    connectionTimeoutMillis: ADMIN_ACCESS_LOCK_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: 1_000,
  });
  const lock = { [sessionLockBrand]: true } as AdminAccessSessionLock;
  const lockState: { client: Client; lost?: Error } = { client };
  const onClientError = (error: Error) => {
    lockState.lost ??= new Error(
      "The admin access session lock connection was lost.",
      { cause: error },
    );
  };
  // Cover connect, acquisition, the protected operation, unlock, and end. A
  // pg Client can emit `error` outside a query promise, so registering after
  // connect would leave both startup and cleanup with an uncaught-event gap.
  client.on("error", onClientError);
  let connected = false;
  let locked = false;
  let operationError: unknown;
  try {
    await client.connect();
    connected = true;
    await client.query(`SET lock_timeout = '${ADMIN_ACCESS_LOCK_TIMEOUT_MS}ms'`);
    await client.query(
      "SELECT pg_advisory_lock($1, $2)",
      [ADMIN_ACCESS_LOCK_NAMESPACE, ADMIN_ACCESS_LOCK_KEY],
    );
    locked = true;
    sessionLockClients.set(lock, lockState);
    const value = await operation(lock);
    await assertAdminAccessSessionLockHeld(lock);
    return value;
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    // The capability expires with the protected operation. Keep only the
    // client error listener alive while unlock/end complete.
    sessionLockClients.delete(lock);
    let releaseError: unknown;
    if (connected && locked) {
      try {
        const released = await client.query<{ unlocked: boolean }>(
          "SELECT pg_advisory_unlock($1, $2) AS unlocked",
          [ADMIN_ACCESS_LOCK_NAMESPACE, ADMIN_ACCESS_LOCK_KEY],
        );
        if (released.rows[0]?.unlocked !== true) {
          throw new Error("The admin access session lock was not owned at release.");
        }
      } catch (error) {
        releaseError = error;
      }
    }
    if (connected) {
      await client.end().catch((error) => {
        releaseError ??= error;
      });
    }
    client.off("error", onClientError);
    releaseError ??= lockState.lost;
    if (releaseError && operationError === undefined) {
      throw releaseError;
    }
  }
}

export async function assertAdminAccessSessionLockHeld(
  lock: AdminAccessSessionLock,
): Promise<void> {
  assertAdminAccessSessionLock(lock);
  const state = sessionLockClients.get(lock);
  if (!state) throw new Error("The admin access session lock is no longer active.");
  if (state.lost) throw state.lost;
  const ownership = await state.client.query<{ held: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_locks
       WHERE locktype = 'advisory'
         AND pid = pg_backend_pid()
         AND classid = $1::oid
         AND objid = $2::oid
         AND objsubid = 2
         AND granted = true
     ) AS held`,
    [ADMIN_ACCESS_LOCK_NAMESPACE, ADMIN_ACCESS_LOCK_KEY],
  );
  if (ownership.rows[0]?.held !== true) {
    throw new Error("The admin access session lock ownership was lost.");
  }
}

export async function freezeAdminAccessMutations(
  prisma: Prisma.TransactionClient,
  lock: AdminAccessSessionLock,
  reason: string,
): Promise<string> {
  await assertAdminAccessSessionLockHeld(lock);
  const current = await readMutationStateForUpdate(prisma);
  assertValidMutationState(current);
  if (current.frozen) throw new Error("Administrative authority mutations are already frozen.");
  const freezeId = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "admin_access_mutation_state"
    SET "frozen" = true,
        "freezeId" = ${freezeId},
        "frozenAt" = CURRENT_TIMESTAMP,
        "reason" = ${reason},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'global'
  `);
  return freezeId;
}

export async function unfreezeAdminAccessMutations(
  prisma: Prisma.TransactionClient,
  lock: AdminAccessSessionLock,
  expectedFreezeId: string,
): Promise<void> {
  await assertAdminAccessSessionLockHeld(lock);
  const current = await readMutationStateForUpdate(prisma);
  assertValidMutationState(current);
  if (!current.frozen || current.freezeId !== expectedFreezeId) {
    throw new Error("The administrative mutation freeze changed after review.");
  }
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "admin_access_mutation_state"
    SET "frozen" = false,
        "freezeId" = NULL,
        "frozenAt" = NULL,
        "reason" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'global' AND "freezeId" = ${expectedFreezeId}
  `);
}

export async function assertAdminAccessMutationFreeze(
  prisma: Prisma.TransactionClient,
  expectedFreezeId: string,
): Promise<void> {
  const current = await readMutationStateForUpdate(prisma);
  assertValidMutationState(current);
  if (!current.frozen || current.freezeId !== expectedFreezeId) {
    throw new Error("The administrative mutation freeze changed after review.");
  }
}

export async function inspectAdminAccessMutationState(
  prisma: Pick<Prisma.TransactionClient, "$queryRaw">,
): Promise<AdminAccessMutationState> {
  const state = await readMutationState(prisma);
  assertValidMutationState(state);
  return state;
}

export async function inspectSettledAdminAccessMutationState(
  prisma: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
): Promise<AdminAccessMutationState> {
  await prisma.$executeRaw(Prisma.sql`SET LOCAL lock_timeout = '3000ms'`);
  const state = await readMutationStateForUpdate(prisma);
  assertValidMutationState(state);
  return state;
}

export function assertAdminAccessSessionLock(
  lock: AdminAccessSessionLock,
): void {
  if (lock?.[sessionLockBrand] !== true) {
    throw new Error("A verified admin access session lock is required.");
  }
}

function assertDirectDatabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The admin access lock requires a valid direct database URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    /(?:^|\.)[^.]*-pooler(?:\.|$)/iu.test(url.hostname)
  ) {
    throw new Error(
      "The admin access lock requires an unpooled PostgreSQL connection.",
    );
  }
}

async function readMutationState(
  prisma: Pick<Prisma.TransactionClient, "$queryRaw">,
): Promise<AdminAccessMutationState> {
  const rows = await prisma.$queryRaw<AdminAccessMutationState[]>(Prisma.sql`
    SELECT "frozen", "freezeId", "frozenAt", "reason"
    FROM "admin_access_mutation_state"
    WHERE "id" = 'global'
  `);
  if (rows.length !== 1) {
    throw new Error("The administrative mutation freeze state is missing or duplicated.");
  }
  return rows[0]!;
}

async function readMutationStateForUpdate(
  prisma: Pick<Prisma.TransactionClient, "$queryRaw">,
): Promise<AdminAccessMutationState> {
  const rows = await prisma.$queryRaw<AdminAccessMutationState[]>(Prisma.sql`
    SELECT "frozen", "freezeId", "frozenAt", "reason"
    FROM "admin_access_mutation_state"
    WHERE "id" = 'global'
    FOR UPDATE
  `);
  if (rows.length !== 1) {
    throw new Error("The administrative mutation freeze state is missing or duplicated.");
  }
  return rows[0]!;
}

function assertValidMutationState(state: AdminAccessMutationState): void {
  const coherent = state.frozen
    ? Boolean(state.freezeId && state.frozenAt && state.reason)
    : state.freezeId === null && state.frozenAt === null && state.reason === null;
  if (!coherent) throw new Error("The administrative mutation freeze state is invalid.");
}
