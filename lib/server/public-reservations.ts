import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  encodeReservationCursor,
  type ReservationDto,
  type ReservationListInput,
  type ReservationPatchInput,
  type ReservationWriteInput,
} from "@/lib/reservation-api";
import {
  calendarDateToUtc,
  getReservationService,
  getReservationSlotsForDate,
  isReservationMonthInRange,
  utcDateToCalendarDate,
  type ReservationServiceKey,
} from "@/lib/reservations";

type BookingRow = {
  id: string;
  serviceKey: string;
  reservationDate: Date;
  startMinute: number;
  createdAt: Date;
  updatedAt: Date | null;
};

export class ReservationApiOperationError extends Error {
  constructor(public readonly code: "INVALID" | "NOT_FOUND" | "SLOT_FULL") {
    super(code);
  }
}

export async function listPublicReservations(
  prisma: PrismaClient,
  input: ReservationListInput,
) {
  const rows = await prisma.reservationBooking.findMany({
    where: {
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

export async function getPublicReservation(prisma: PrismaClient, id: string) {
  const booking = await prisma.reservationBooking.findFirst({
    where: { id, isDemo: false },
  });
  return booking ? toReservationDto(booking) : null;
}

export async function createPublicReservation(
  prisma: PrismaClient,
  input: ReservationWriteInput,
  now = new Date(),
): Promise<ReservationDto> {
  const slot = validateReservationInput(input, now);
  if (!slot) throw new ReservationApiOperationError("INVALID");
  const booking = await prisma.$transaction(async (transaction) => {
    await lockReservationTarget(transaction, input);
    await assertCapacity(transaction, input, slot.capacity);
    return transaction.reservationBooking.create({
      data: {
        serviceKey: input.serviceKey,
        reservationDate: calendarDateToUtc(input.reservationDate),
        startMinute: input.startMinute,
        isDemo: false,
      },
    });
  });
  return toReservationDto(booking);
}

export async function updatePublicReservation(
  prisma: PrismaClient,
  id: string,
  patch: ReservationPatchInput,
  now = new Date(),
): Promise<ReservationDto> {
  const booking = await prisma.$transaction(async (transaction) => {
    const [existing] = await transaction.$queryRaw<BookingRow[]>(Prisma.sql`
      SELECT "id", "serviceKey", "reservationDate", "startMinute", "createdAt", "updatedAt"
      FROM "reservation_bookings"
      WHERE "id" = ${id} AND "isDemo" = false
      FOR UPDATE
    `);
    if (!existing) throw new ReservationApiOperationError("NOT_FOUND");
    const merged: ReservationWriteInput = {
      serviceKey: (patch.serviceKey ?? existing.serviceKey) as ReservationServiceKey,
      reservationDate: patch.reservationDate ?? utcDateToCalendarDate(existing.reservationDate),
      startMinute: patch.startMinute ?? existing.startMinute,
    };
    const slot = validateReservationInput(merged, now);
    if (!slot) throw new ReservationApiOperationError("INVALID");
    await lockReservationTarget(transaction, merged);
    await assertCapacity(transaction, merged, slot.capacity, id);
    return transaction.reservationBooking.update({
      where: { id },
      data: {
        serviceKey: merged.serviceKey,
        reservationDate: calendarDateToUtc(merged.reservationDate),
        startMinute: merged.startMinute,
      },
    });
  });
  return toReservationDto(booking);
}

export async function deletePublicReservation(prisma: PrismaClient, id: string) {
  const deleted = await prisma.reservationBooking.deleteMany({
    where: { id, isDemo: false },
  });
  return deleted.count === 1;
}

export function toReservationDto(booking: BookingRow): ReservationDto {
  return {
    id: booking.id,
    serviceKey: booking.serviceKey as ReservationServiceKey,
    reservationDate: utcDateToCalendarDate(booking.reservationDate),
    startMinute: booking.startMinute,
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
