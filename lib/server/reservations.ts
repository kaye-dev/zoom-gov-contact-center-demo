import { randomInt, randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  RESERVATION_SERVICE_CATALOG,
  RESERVATION_SERVICE_KEYS,
  calendarDateToUtc,
  getReservationAvailabilityStatus,
  getReservationMonthBounds,
  getReservationService,
  getReservationSlotsForDate,
  isReservationMonthInRange,
  listCalendarDates,
  utcDateToCalendarDate,
  type ReservationCalendarSnapshot,
  type ReservationDaySummary,
  type ReservationServiceKey,
} from "@/lib/reservations";

export type RandomIndex = (maxExclusive: number) => number;

type BookingCount = {
  serviceKey: string;
  reservationDate: Date;
  startMinute: number;
};

export async function getReservationCalendarSnapshot(
  prisma: PrismaClient,
  input: { service: ReservationServiceKey; month: string; now: Date },
): Promise<ReservationCalendarSnapshot> {
  if (!isReservationMonthInRange(input.month, input.now)) {
    throw new Error("Reservation month is outside the supported range.");
  }

  const bounds = getReservationMonthBounds(input.month);
  const bookings = await prisma.reservationBooking.findMany({
    where: {
      serviceKey: input.service,
      reservationDate: { gte: bounds.start, lt: bounds.end },
    },
    select: {
      serviceKey: true,
      reservationDate: true,
      startMinute: true,
    },
  });

  return buildReservationCalendarSnapshot(input, bookings);
}

export function buildReservationCalendarSnapshot(
  input: { service: ReservationServiceKey; month: string; now: Date },
  bookings: readonly BookingCount[],
): ReservationCalendarSnapshot {
  const service = getReservationService(input.service);
  const bookingCounts = new Map<string, number>();
  for (const booking of bookings) {
    const date = utcDateToCalendarDate(booking.reservationDate);
    const key = `${date}:${booking.startMinute}`;
    bookingCounts.set(key, (bookingCounts.get(key) ?? 0) + 1);
  }

  const days = listCalendarDates(input.month).map<ReservationDaySummary>((date) => {
    const slotDefinitions = getReservationSlotsForDate(service, date, input.now);
    if (slotDefinitions.length === 0) {
      return {
        date,
        bookable: false,
        capacity: 0,
        booked: 0,
        remaining: 0,
        status: "UNAVAILABLE",
        slots: [],
      };
    }

    const slots = slotDefinitions.map((slot) => {
      const booked = bookingCounts.get(`${date}:${slot.startMinute}`) ?? 0;
      if (booked > slot.capacity) {
        console.warn("Reservation capacity exceeded.", {
          service: input.service,
          date,
          startMinute: slot.startMinute,
        });
      }
      const remaining = Math.max(0, slot.capacity - booked);
      return {
        ...slot,
        booked,
        remaining,
        status: getReservationAvailabilityStatus(slot.capacity, remaining),
      };
    });
    const capacity = slots.reduce((total, slot) => total + slot.capacity, 0);
    const booked = slots.reduce((total, slot) => total + slot.booked, 0);
    const remaining = Math.max(0, capacity - booked);
    return {
      date,
      bookable: true,
      capacity,
      booked,
      remaining,
      status: getReservationAvailabilityStatus(capacity, remaining),
      slots,
    };
  });

  return {
    service: { key: service.key, method: service.method },
    month: input.month,
    days,
  };
}

export async function regenerateDemoReservations(
  prisma: PrismaClient,
  input: { month: string; now: Date },
  randomIndex: RandomIndex = randomInt,
): Promise<{
  month: string;
  generatedCount: number;
  calendars: Record<ReservationServiceKey, ReservationCalendarSnapshot>;
}> {
  if (!isReservationMonthInRange(input.month, input.now)) {
    throw new Error("Reservation month is outside the supported range.");
  }
  const bounds = getReservationMonthBounds(input.month);

  const generatedCount = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`
      SELECT 1 AS "locked"
      FROM (
        SELECT pg_advisory_xact_lock(
          hashtext(${`reservation-demo-fill:${input.month}`})
        )
      ) AS "reservationDemoFillLock"
    `);

    const nonDemoBookings = await transaction.reservationBooking.findMany({
      where: {
        serviceKey: { in: [...RESERVATION_SERVICE_KEYS] },
        reservationDate: { gte: bounds.start, lt: bounds.end },
        isDemo: false,
      },
      select: {
        serviceKey: true,
        reservationDate: true,
        startMinute: true,
      },
    });
    await transaction.reservationBooking.deleteMany({
      where: {
        serviceKey: { in: [...RESERVATION_SERVICE_KEYS] },
        reservationDate: { gte: bounds.start, lt: bounds.end },
        isDemo: true,
      },
    });

    const nonDemoCounts = new Map<string, number>();
    for (const booking of nonDemoBookings) {
      const key = `${booking.serviceKey}:${utcDateToCalendarDate(booking.reservationDate)}:${booking.startMinute}`;
      nonDemoCounts.set(key, (nonDemoCounts.get(key) ?? 0) + 1);
    }

    const rows: Array<{
      id: string;
      serviceKey: ReservationServiceKey;
      reservationDate: Date;
      startMinute: number;
      isDemo: true;
    }> = [];

    for (const service of RESERVATION_SERVICE_CATALOG) {
      const candidates = listCalendarDates(input.month).flatMap((date) =>
        getReservationSlotsForDate(service, date, input.now).map((slot) => ({
          date,
          slot,
        })),
      );
      shuffleInPlace(candidates, randomIndex);

      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const capacity = candidate.slot.capacity;
        const categories = capacity === 1
          ? [1, 0]
          : [Math.ceil(capacity / 2), capacity - 1, capacity, 0];
        const target = categories[index % categories.length];
        const countKey = `${service.key}:${candidate.date}:${candidate.slot.startMinute}`;
        const nonDemoCount = nonDemoCounts.get(countKey) ?? 0;
        const demoCount = Math.max(
          0,
          Math.min(target, capacity - nonDemoCount),
        );
        for (let count = 0; count < demoCount; count += 1) {
          rows.push({
            id: randomUUID(),
            serviceKey: service.key,
            reservationDate: calendarDateToUtc(candidate.date),
            startMinute: candidate.slot.startMinute,
            isDemo: true,
          });
        }
      }
    }

    if (rows.length > 0) {
      await transaction.reservationBooking.createMany({ data: rows });
    }
    return rows.length;
  });

  const snapshots = await Promise.all(
    RESERVATION_SERVICE_KEYS.map(async (service) => [
      service,
      await getReservationCalendarSnapshot(prisma, {
        service,
        month: input.month,
        now: input.now,
      }),
    ] as const),
  );

  return {
    month: input.month,
    generatedCount,
    calendars: Object.fromEntries(snapshots) as Record<
      ReservationServiceKey,
      ReservationCalendarSnapshot
    >,
  };
}

function shuffleInPlace<T>(values: T[], randomIndex: RandomIndex): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    if (!Number.isInteger(target) || target < 0 || target > index) {
      throw new Error("Random index is outside the shuffle range.");
    }
    [values[index], values[target]] = [values[target], values[index]];
  }
}
