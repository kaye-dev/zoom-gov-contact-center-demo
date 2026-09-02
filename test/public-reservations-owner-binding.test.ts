import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import { parseReservationCallerPhone } from "../lib/reservation-api";
import {
  digestReservationCallerAni,
  generateReservationApiKey,
} from "../lib/server/reservation-api-keys";
import {
  ReservationApiOperationError,
  createPublicReservation,
  deletePublicReservation,
  getPublicReservation,
  updatePublicReservation,
} from "../lib/server/public-reservations";

const now = new Date("2026-09-01T00:00:00.000Z");
const callerPhone = parseReservationCallerPhone("+12025550123")!;
const otherCallerPhone = parseReservationCallerPhone("+12025550124")!;
const rawKey = generateReservationApiKey().rawKey;
const callerAniDigest = digestReservationCallerAni(rawKey, callerPhone);
const otherCallerAniDigest = digestReservationCallerAni(rawKey, otherCallerPhone);
const reservation = {
  serviceKey: "bulky-waste" as const,
  reservationDate: "2026-09-01",
  startMinute: 0,
  externalReferenceId: "owner_binding_ref_0001",
};

test("reservation creation stores only caller digest and binds idempotency replay", async () => {
  let existingIdempotencyRecord: Record<string, unknown> | null = null;
  const captured: { createdBookingData?: Record<string, unknown> } = {};
  const transaction = {
    async $queryRaw() {
      return [];
    },
    reservationApiIdempotencyRecord: {
      async findUnique() {
        return existingIdempotencyRecord;
      },
      async delete() {
        existingIdempotencyRecord = null;
        return {};
      },
      async create({ data }: { data: Record<string, unknown> }) {
        existingIdempotencyRecord = data;
        return data;
      },
    },
    reservationBooking: {
      async findFirst() {
        return null;
      },
      async count() {
        return 0;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        captured.createdBookingData = data;
        return {
          id: "booking_owner_binding_1",
          serviceKey: data.serviceKey,
          reservationDate: new Date("2026-09-01T00:00:00.000Z"),
          startMinute: data.startMinute,
          isDemo: data.isDemo,
          apiKeyId: data.apiKeyId,
          externalReferenceId: data.externalReferenceId,
          callerAniDigest: data.callerAniDigest,
          revision: data.revision,
          createdAt: now,
          updatedAt: now,
        };
      },
    },
  };
  const prisma = {
    reservationApiIdempotencyRecord: {
      async deleteMany() {
        return { count: 0 };
      },
    },
    async $transaction(operation: (client: typeof transaction) => unknown) {
      return operation(transaction);
    },
  } as unknown as PrismaClient;
  const input = {
    apiKeyId: "api_key_owner_binding",
    callerAniDigest,
    idempotencyKey: "owner_binding_idempotency_0001",
    reservation,
    requestId: "request_owner_binding_1",
    now,
  };

  const created = await createPublicReservation(prisma, input);
  assert.equal(created.outcome, "NEW");
  assert.equal(captured.createdBookingData?.callerAniDigest, callerAniDigest);
  assert.equal("callerPhone" in (captured.createdBookingData ?? {}), false);
  assert.equal(JSON.stringify(created.body).includes(callerAniDigest), false);
  assert.equal(JSON.stringify(created.body).includes(callerPhone), false);

  const replayed = await createPublicReservation(prisma, {
    ...input,
    requestId: "request_owner_binding_2",
  });
  assert.equal(replayed.outcome, "REPLAY");
  assert.equal(replayed.body.requestId, "request_owner_binding_2");

  await assert.rejects(
    createPublicReservation(prisma, {
      ...input,
      callerAniDigest: otherCallerAniDigest,
      requestId: "request_owner_binding_3",
    }),
    (error) => error instanceof ReservationApiOperationError &&
      error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});

test("reservation read filters by API key, ID, and caller digest without exposing it", async () => {
  let where: Record<string, unknown> | undefined;
  const prisma = {
    reservationBooking: {
      async findFirst(input: { where: Record<string, unknown> }) {
        where = input.where;
        return {
          id: "booking_owner_binding_1",
          serviceKey: "bulky-waste",
          reservationDate: new Date("2026-09-01T00:00:00.000Z"),
          startMinute: 0,
          isDemo: false,
          apiKeyId: "api_key_owner_binding",
          externalReferenceId: "owner_binding_ref_0001",
          callerAniDigest,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
      },
    },
  } as unknown as PrismaClient;

  const result = await getPublicReservation(
    prisma,
    "api_key_owner_binding",
    "booking_owner_binding_1",
    callerAniDigest,
  );
  assert.deepEqual(where, {
    id: "booking_owner_binding_1",
    apiKeyId: "api_key_owner_binding",
    callerAniDigest,
    isDemo: false,
  });
  assert.equal(result?.id, "booking_owner_binding_1");
  assert.equal("callerAniDigest" in (result ?? {}), false);
});

test("reservation update and delete fail closed when owner-bound row is absent", async () => {
  const updateQueries: SqlSnapshot[] = [];
  const updatePrisma = transactionPrisma(async (query) => {
    updateQueries.push(snapshotSql(query));
    return [];
  });
  await assert.rejects(
    updatePublicReservation(updatePrisma, {
      apiKeyId: "api_key_owner_binding",
      callerAniDigest,
      id: "booking_owner_binding_1",
      patch: { reservationDate: "2026-09-02" },
      expectedRevision: 1,
      now,
    }),
    (error) => error instanceof ReservationApiOperationError && error.code === "NOT_FOUND",
  );
  assert.match(updateQueries[0]!.text, /"callerAniDigest" =/u);
  assert.deepEqual(updateQueries[0]!.values, [
    "booking_owner_binding_1",
    "api_key_owner_binding",
    callerAniDigest,
  ]);

  const deleteQueries: SqlSnapshot[] = [];
  const deletePrisma = transactionPrisma(async (query) => {
    deleteQueries.push(snapshotSql(query));
    return [];
  });
  assert.equal(await deletePublicReservation(deletePrisma, {
    apiKeyId: "api_key_owner_binding",
    callerAniDigest,
    id: "booking_owner_binding_1",
    expectedRevision: 1,
  }), false);
  assert.match(deleteQueries[0]!.text, /"callerAniDigest" =/u);
  assert.deepEqual(deleteQueries[0]!.values, [
    "booking_owner_binding_1",
    "api_key_owner_binding",
    callerAniDigest,
  ]);
});

type SqlSnapshot = { text: string; values: unknown[] };

function snapshotSql(value: unknown): SqlSnapshot {
  const query = value as { strings: string[]; values: unknown[] };
  return { text: query.strings.join("?"), values: [...query.values] };
}

function transactionPrisma(
  queryRaw: (query: unknown) => Promise<unknown[]>,
): PrismaClient {
  const transaction = { $queryRaw: queryRaw };
  return {
    async $transaction(operation: (client: typeof transaction) => unknown) {
      return operation(transaction);
    },
  } as unknown as PrismaClient;
}
