import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  isReservationServiceKey,
  utcDateToCalendarDate,
  type ReservationServiceKey,
} from "@/lib/reservations";

export const RESERVATION_BOOKING_LIST_PAGE_SIZE = 50;

export type ReservationBookingListSource = "ZVA" | "DEMO";

export type ReservationBookingListInput = {
  service?: ReservationServiceKey;
  source?: ReservationBookingListSource;
  cursor?: { createdAt: Date; id: string };
};

export type ReservationBookingListSummary = {
  id: string;
  serviceKey: ReservationServiceKey;
  reservationDate: string;
  startMinute: number;
  createdAt: string;
  source: ReservationBookingListSource;
};

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function parseReservationBookingListQuery(
  searchParams: SearchParamsRecord,
): { ok: true; value: ReservationBookingListInput } | { ok: false } {
  const allowedKeys = new Set(["service", "source", "cursor", "theme"]);
  if (Object.keys(searchParams).some((key) => !allowedKeys.has(key))) {
    return { ok: false };
  }
  if (Object.values(searchParams).some(Array.isArray)) {
    return { ok: false };
  }

  const service = stringValue(searchParams.service);
  if (service && !isReservationServiceKey(service)) return { ok: false };

  const source = stringValue(searchParams.source);
  if (source && source !== "ZVA" && source !== "DEMO") return { ok: false };

  const theme = stringValue(searchParams.theme);
  if (searchParams.theme !== undefined && theme !== "light" && theme !== "dark") {
    return { ok: false };
  }

  const cursorValue = stringValue(searchParams.cursor);
  if (searchParams.cursor !== undefined && !cursorValue) return { ok: false };
  const cursor = cursorValue
    ? decodeReservationBookingListCursor(cursorValue)
    : undefined;
  if (cursorValue && !cursor) return { ok: false };

  return {
    ok: true,
    value: {
      ...(service ? { service: service as ReservationServiceKey } : {}),
      ...(source ? { source: source as ReservationBookingListSource } : {}),
      ...(cursor ? { cursor } : {}),
    },
  };
}

export function encodeReservationBookingListCursor(input: {
  createdAt: Date;
  id: string;
}): string {
  if (!isReservationBookingId(input.id) || !Number.isFinite(input.createdAt.getTime())) {
    throw new Error("Invalid reservation booking cursor.");
  }
  return Buffer.from(JSON.stringify({
    v: 1,
    createdAt: input.createdAt.toISOString(),
    id: input.id,
  }), "utf8").toString("base64url");
}

export function decodeReservationBookingListCursor(
  value: string,
): { createdAt: Date; id: string } | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!isExactRecord(parsed, ["v", "createdAt", "id"]) || parsed.v !== 1) {
      return null;
    }
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    if (!isReservationBookingId(parsed.id)) return null;
    const createdAt = new Date(parsed.createdAt);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== parsed.createdAt
    ) {
      return null;
    }
    if (encodeReservationBookingListCursor({ createdAt, id: parsed.id }) !== value) {
      return null;
    }
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function listReservationBookings(
  prisma: PrismaClient,
  input: ReservationBookingListInput,
): Promise<{
  bookings: ReservationBookingListSummary[];
  nextCursor: string | null;
}> {
  const conditions: Prisma.ReservationBookingWhereInput[] = [];
  if (input.cursor) {
    conditions.push({
      OR: [
        { createdAt: { lt: input.cursor.createdAt } },
        {
          createdAt: input.cursor.createdAt,
          id: { lt: input.cursor.id },
        },
      ],
    });
  }

  const rows = await prisma.reservationBooking.findMany({
    where: {
      ...(conditions.length > 0 ? { AND: conditions } : {}),
      ...(input.service ? { serviceKey: input.service } : {}),
      ...(input.source ? { isDemo: input.source === "DEMO" } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RESERVATION_BOOKING_LIST_PAGE_SIZE + 1,
    select: {
      id: true,
      serviceKey: true,
      reservationDate: true,
      startMinute: true,
      isDemo: true,
      createdAt: true,
    },
  });
  const page = rows.slice(0, RESERVATION_BOOKING_LIST_PAGE_SIZE);
  const last = page.at(-1);

  return {
    bookings: page.map(toReservationBookingListSummary),
    nextCursor:
      rows.length > RESERVATION_BOOKING_LIST_PAGE_SIZE && last
        ? encodeReservationBookingListCursor({
            createdAt: last.createdAt,
            id: last.id,
          })
        : null,
  };
}

function toReservationBookingListSummary(row: {
  id: string;
  serviceKey: string;
  reservationDate: Date;
  startMinute: number;
  isDemo: boolean;
  createdAt: Date;
}): ReservationBookingListSummary {
  if (!isReservationServiceKey(row.serviceKey)) {
    throw new Error("Reservation booking contains an unknown service key.");
  }
  return {
    id: row.id,
    serviceKey: row.serviceKey,
    reservationDate: utcDateToCalendarDate(row.reservationDate),
    startMinute: row.startMinute,
    createdAt: row.createdAt.toISOString(),
    source: row.isDemo ? "DEMO" : "ZVA",
  };
}

function stringValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function isReservationBookingId(value: string) {
  return /^[A-Za-z0-9_-]{1,191}$/u.test(value);
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
