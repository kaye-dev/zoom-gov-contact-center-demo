import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  encodeReservationCursor,
  reservationEtag,
  type ReservationCallerAniDigest,
  type ReservationAvailabilityDto,
  type ReservationDto,
  type ReservationListInput,
  type ReservationPatchInput,
  type ReservationServiceDto,
  type ReservationWriteInput,
} from "@/lib/reservation-api";
import {
  RESERVATION_SERVICE_CATALOG,
  calendarDateToUtc,
  getReservationAvailabilityStatus,
  getReservationService,
  getReservationSlotsForDate,
  isReservationMonthInRange,
  utcDateToCalendarDate,
  type ReservationServiceKey,
} from "@/lib/reservations";

export const RESERVATION_API_IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1_000;

type BookingRow = {
  id: string;
  serviceKey: string;
  reservationDate: Date;
  startMinute: number;
  externalReferenceId: string | null;
  callerAniDigest: string | null;
  revision: number | null;
  createdAt: Date;
  updatedAt: Date | null;
};

export class ReservationApiOperationError extends Error {
  constructor(
    public readonly code:
      | "INVALID"
      | "NOT_FOUND"
      | "SLOT_FULL"
      | "PRECONDITION_FAILED"
      | "IDEMPOTENCY_KEY_REUSED"
      | "EXTERNAL_REFERENCE_CONFLICT",
  ) {
    super(code);
  }
}

export function listPublicReservationServices(): ReservationServiceDto[] {
  return RESERVATION_SERVICE_CATALOG.map((service) => ({
    serviceKey: service.key,
    reservationMethod: service.method,
    weekdays: [...service.weekdays],
    slots: service.slots.map((slot) => ({
      startMinute: slot.startMinute,
      slotDurationMinutes: slot.endMinute - slot.startMinute,
      capacity: slot.capacity,
    })),
  }));
}

export async function getPublicReservationAvailability(
  prisma: PrismaClient,
  input: {
    serviceKey: ReservationServiceKey;
    dateFrom: string;
    dateTo: string;
    now?: Date;
  },
): Promise<ReservationAvailabilityDto> {
  const now = input.now ?? new Date();
  if (!isReservationMonthInRange(input.dateFrom.slice(0, 7), now) ||
      !isReservationMonthInRange(input.dateTo.slice(0, 7), now)) {
    throw new ReservationApiOperationError("INVALID");
  }
  const bookings = await prisma.reservationBooking.findMany({
    where: {
      serviceKey: input.serviceKey,
      reservationDate: {
        gte: calendarDateToUtc(input.dateFrom),
        lte: calendarDateToUtc(input.dateTo),
      },
    },
    select: { reservationDate: true, startMinute: true },
  });
  const bookingCounts = new Map<string, number>();
  for (const booking of bookings) {
    const key = `${utcDateToCalendarDate(booking.reservationDate)}:${booking.startMinute}`;
    bookingCounts.set(key, (bookingCounts.get(key) ?? 0) + 1);
  }
  const service = getReservationService(input.serviceKey);
  const days = listDates(input.dateFrom, input.dateTo).map((date) => {
    const definitions = getReservationSlotsForDate(service, date, now);
    const slots = definitions.map((slot) => {
      const booked = bookingCounts.get(`${date}:${slot.startMinute}`) ?? 0;
      const remaining = Math.max(0, slot.capacity - booked);
      const status = getReservationAvailabilityStatus(slot.capacity, remaining);
      return {
        startMinute: slot.startMinute,
        capacity: slot.capacity,
        booked,
        remaining,
        status: status === "UNAVAILABLE" ? "FULL" as const : status,
      };
    });
    if (slots.length === 0) return { date, status: "CLOSED" as const, slots };
    const capacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
    const remaining = slots.reduce((sum, slot) => sum + slot.remaining, 0);
    const status = getReservationAvailabilityStatus(capacity, remaining);
    return {
      date,
      status: status === "UNAVAILABLE" ? "CLOSED" as const : status,
      slots,
    };
  });
  return {
    serviceKey: input.serviceKey,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    days,
  };
}

export async function listPublicReservations(
  prisma: PrismaClient,
  apiKeyId: string,
  input: ReservationListInput,
) {
  const rows = await prisma.reservationBooking.findMany({
    where: {
      apiKeyId,
      isDemo: false,
      ...(input.serviceKey ? { serviceKey: input.serviceKey } : {}),
      ...((input.dateFrom || input.dateTo) ? {
        reservationDate: {
          ...(input.dateFrom ? { gte: calendarDateToUtc(input.dateFrom) } : {}),
          ...(input.dateTo ? { lte: calendarDateToUtc(input.dateTo) } : {}),
        },
      } : {}),
      ...(input.cursor ? {
        OR: [
          { createdAt: { lt: input.cursor.createdAt } },
          { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
        ],
      } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map(toReservationDto),
    nextCursor: rows.length > input.limit && last
      ? encodeReservationCursor({ createdAt: last.createdAt, id: last.id })
      : null,
  };
}

export async function getPublicReservation(
  prisma: PrismaClient,
  apiKeyId: string,
  id: string,
  callerAniDigest: ReservationCallerAniDigest,
) {
  const booking = await prisma.reservationBooking.findFirst({
    where: { id, apiKeyId, callerAniDigest, isDemo: false },
  });
  return booking ? toReservationDto(booking) : null;
}

export async function createPublicReservation(
  prisma: PrismaClient,
  input: {
    apiKeyId: string;
    callerAniDigest: ReservationCallerAniDigest;
    idempotencyKey: string;
    reservation: ReservationWriteInput;
    requestId: string;
    now?: Date;
  },
): Promise<{
  outcome: "NEW" | "REPLAY";
  body: Prisma.JsonObject;
  location: string;
  etag: string;
}> {
  const now = input.now ?? new Date();
  const slot = validateReservationInput(input.reservation, now);
  if (!slot) throw new ReservationApiOperationError("INVALID");
  const keyDigest = sha256(input.idempotencyKey);
  const requestDigest = sha256(JSON.stringify({
    callerAniDigest: input.callerAniDigest,
    reservation: input.reservation,
  }));

  await prisma.reservationApiIdempotencyRecord.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  try {
    return await prisma.$transaction(async (transaction) => {
      await lockIdempotencyKey(transaction, input.apiKeyId, keyDigest);
      const existing = await transaction.reservationApiIdempotencyRecord.findUnique({
        where: { apiKeyId_keyDigest: { apiKeyId: input.apiKeyId, keyDigest } },
      });
      if (existing && existing.expiresAt >= now) {
        if (existing.requestDigest !== requestDigest) {
          throw new ReservationApiOperationError("IDEMPOTENCY_KEY_REUSED");
        }
        return {
          outcome: "REPLAY" as const,
          body: replaceRequestId(existing.responseBody, input.requestId),
          location: existing.responseLocation,
          etag: existing.responseEtag,
        };
      }
      if (existing) {
        await transaction.reservationApiIdempotencyRecord.delete({ where: { id: existing.id } });
      }

      await lockExternalReference(
        transaction,
        input.apiKeyId,
        input.reservation.externalReferenceId,
      );
      await assertExternalReferenceAvailable(
        transaction,
        input.apiKeyId,
        input.reservation.externalReferenceId,
      );
      await lockReservationTarget(transaction, input.reservation);
      await assertCapacity(transaction, input.reservation, slot.capacity);
      const booking = await transaction.reservationBooking.create({
        data: {
          serviceKey: input.reservation.serviceKey,
          reservationDate: calendarDateToUtc(input.reservation.reservationDate),
          startMinute: input.reservation.startMinute,
          externalReferenceId: input.reservation.externalReferenceId,
          apiKeyId: input.apiKeyId,
          callerAniDigest: input.callerAniDigest,
          revision: 1,
          isDemo: false,
        },
      });
      const reservation = toReservationDto(booking);
      const location = `/api/public/v1/reservations/${reservation.id}`;
      const etag = reservationEtag(reservation);
      const body = reservationResponseBody(
        reservation,
        "RESERVATION_CREATED",
        input.requestId,
      );
      await transaction.reservationApiIdempotencyRecord.create({
        data: {
          apiKeyId: input.apiKeyId,
          keyDigest,
          requestDigest,
          reservationId: reservation.id,
          statusCode: 201,
          responseBody: body,
          responseLocation: location,
          responseEtag: etag,
          createdAt: now,
          expiresAt: new Date(now.getTime() + RESERVATION_API_IDEMPOTENCY_RETENTION_MS),
        },
      });
      return { outcome: "NEW" as const, body, location, etag };
    });
  } catch (error) {
    if (error instanceof ReservationApiOperationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ReservationApiOperationError("EXTERNAL_REFERENCE_CONFLICT");
    }
    throw error;
  }
}

export async function updatePublicReservation(
  prisma: PrismaClient,
  input: {
    apiKeyId: string;
    callerAniDigest: ReservationCallerAniDigest;
    id: string;
    patch: ReservationPatchInput;
    expectedRevision: number;
    now?: Date;
  },
): Promise<ReservationDto> {
  const now = input.now ?? new Date();
  try {
    const booking = await prisma.$transaction(async (transaction) => {
      const [existing] = await transaction.$queryRaw<BookingRow[]>(Prisma.sql`
        SELECT "id", "serviceKey", "reservationDate", "startMinute",
               "externalReferenceId", "callerAniDigest", "revision", "createdAt", "updatedAt"
        FROM "reservation_bookings"
        WHERE "id" = ${input.id}
          AND "isDemo" = false
          AND "apiKeyId" = ${input.apiKeyId}
          AND "callerAniDigest" = ${input.callerAniDigest}
        FOR UPDATE
      `);
      if (!existing) throw new ReservationApiOperationError("NOT_FOUND");
      const currentRevision = existing.revision ?? 1;
      if (currentRevision !== input.expectedRevision) {
        throw new ReservationApiOperationError("PRECONDITION_FAILED");
      }
      const merged: ReservationWriteInput = {
        serviceKey: (input.patch.serviceKey ?? existing.serviceKey) as ReservationServiceKey,
        reservationDate: input.patch.reservationDate ?? utcDateToCalendarDate(existing.reservationDate),
        startMinute: input.patch.startMinute ?? existing.startMinute,
        externalReferenceId: input.patch.externalReferenceId ?? existing.externalReferenceId ?? "",
      };
      const slot = validateReservationInput(merged, now);
      if (!slot || !merged.externalReferenceId) {
        throw new ReservationApiOperationError("INVALID");
      }
      await lockExternalReference(
        transaction,
        input.apiKeyId,
        merged.externalReferenceId,
      );
      await assertExternalReferenceAvailable(
        transaction,
        input.apiKeyId,
        merged.externalReferenceId,
        input.id,
      );
      await lockReservationTarget(transaction, merged);
      await assertCapacity(transaction, merged, slot.capacity, input.id);
      return transaction.reservationBooking.update({
        where: { id: input.id },
        data: {
          serviceKey: merged.serviceKey,
          reservationDate: calendarDateToUtc(merged.reservationDate),
          startMinute: merged.startMinute,
          externalReferenceId: merged.externalReferenceId,
          revision: currentRevision + 1,
        },
      });
    });
    return toReservationDto(booking);
  } catch (error) {
    if (error instanceof ReservationApiOperationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ReservationApiOperationError("EXTERNAL_REFERENCE_CONFLICT");
    }
    throw error;
  }
}

export async function deletePublicReservation(
  prisma: PrismaClient,
  input: {
    apiKeyId: string;
    callerAniDigest: ReservationCallerAniDigest;
    id: string;
    expectedRevision: number;
  },
) {
  return prisma.$transaction(async (transaction) => {
    const [existing] = await transaction.$queryRaw<Array<{ revision: number | null }>>(Prisma.sql`
      SELECT "revision"
      FROM "reservation_bookings"
      WHERE "id" = ${input.id}
        AND "isDemo" = false
        AND "apiKeyId" = ${input.apiKeyId}
        AND "callerAniDigest" = ${input.callerAniDigest}
      FOR UPDATE
    `);
    if (!existing) return false;
    if ((existing.revision ?? 1) !== input.expectedRevision) {
      throw new ReservationApiOperationError("PRECONDITION_FAILED");
    }
    await transaction.reservationBooking.delete({ where: { id: input.id } });
    return true;
  });
}

export function toReservationDto(booking: BookingRow): ReservationDto {
  return {
    id: booking.id,
    serviceKey: booking.serviceKey as ReservationServiceKey,
    reservationDate: utcDateToCalendarDate(booking.reservationDate),
    startMinute: booking.startMinute,
    externalReferenceId: booking.externalReferenceId,
    version: booking.revision ?? 1,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: (booking.updatedAt ?? booking.createdAt).toISOString(),
  };
}

function validateReservationInput(input: ReservationWriteInput, now: Date) {
  if (!isReservationMonthInRange(input.reservationDate.slice(0, 7), now)) return null;
  const service = getReservationService(input.serviceKey);
  return getReservationSlotsForDate(service, input.reservationDate, now)
    .find(({ startMinute }) => startMinute === input.startMinute) ?? null;
}

async function lockIdempotencyKey(
  transaction: Prisma.TransactionClient,
  apiKeyId: string,
  keyDigest: string,
) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT 1 AS "locked"
    FROM (
      SELECT pg_advisory_xact_lock(
        hashtext(${`reservation-idempotency:${apiKeyId}:${keyDigest}`})
      )
    ) AS "reservationIdempotencyLock"
  `);
}

async function lockReservationTarget(
  transaction: Prisma.TransactionClient,
  input: ReservationWriteInput,
) {
  const month = input.reservationDate.slice(0, 7);
  await transaction.$queryRaw(Prisma.sql`
    SELECT 1 AS "locked"
    FROM (
      SELECT pg_advisory_xact_lock(hashtext(${`reservation-demo-fill:${month}`}))
    ) AS "reservationMonthLock"
  `);
  await transaction.$queryRaw(Prisma.sql`
    SELECT 1 AS "locked"
    FROM (
      SELECT pg_advisory_xact_lock(
        hashtext(${`reservation-slot:${input.serviceKey}:${input.reservationDate}:${input.startMinute}`})
      )
    ) AS "reservationSlotLock"
  `);
}

async function lockExternalReference(
  transaction: Prisma.TransactionClient,
  apiKeyId: string,
  externalReferenceId: string,
) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT 1 AS "locked"
    FROM (
      SELECT pg_advisory_xact_lock(
        hashtext(${`reservation-external-reference:${apiKeyId}:${externalReferenceId}`})
      )
    ) AS "reservationExternalReferenceLock"
  `);
}

async function assertExternalReferenceAvailable(
  transaction: Prisma.TransactionClient,
  apiKeyId: string,
  externalReferenceId: string,
  excludeId?: string,
) {
  const existing = await transaction.reservationBooking.findFirst({
    where: {
      apiKeyId,
      externalReferenceId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new ReservationApiOperationError("EXTERNAL_REFERENCE_CONFLICT");
  }
}

async function assertCapacity(
  transaction: Prisma.TransactionClient,
  input: ReservationWriteInput,
  capacity: number,
  excludeId?: string,
) {
  const count = await transaction.reservationBooking.count({
    where: {
      serviceKey: input.serviceKey,
      reservationDate: calendarDateToUtc(input.reservationDate),
      startMinute: input.startMinute,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (count >= capacity) throw new ReservationApiOperationError("SLOT_FULL");
}

function reservationResponseBody(
  reservation: ReservationDto,
  resultCode: string,
  requestId: string,
): Prisma.JsonObject {
  return {
    resultCode,
    requestId,
    reservationId: reservation.id,
    version: reservation.version,
    reservation: reservationJson(reservation),
  };
}

function reservationJson(reservation: ReservationDto): Prisma.JsonObject {
  return {
    id: reservation.id,
    serviceKey: reservation.serviceKey,
    reservationDate: reservation.reservationDate,
    startMinute: reservation.startMinute,
    externalReferenceId: reservation.externalReferenceId,
    version: reservation.version,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
  };
}

function replaceRequestId(value: Prisma.JsonValue, requestId: string): Prisma.JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored idempotency response is invalid.");
  }
  return { ...value, requestId } as Prisma.JsonObject;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function listDates(dateFrom: string, dateTo: string): string[] {
  const result: string[] = [];
  const cursor = calendarDateToUtc(dateFrom);
  const end = calendarDateToUtc(dateTo);
  while (cursor <= end) {
    result.push(utcDateToCalendarDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
