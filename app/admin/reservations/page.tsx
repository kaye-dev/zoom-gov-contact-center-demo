import { canAdminAccess } from "@/lib/admin-access/authorization";
import {
  RESERVATION_SERVICE_KEYS,
  getReservationMonthRange,
  isReservationDate,
  isReservationMonthInRange,
  isReservationServiceKey,
  type ReservationServiceKey,
} from "@/lib/reservations";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { withPrisma } from "@/lib/server/prisma";
import { getReservationCalendarSnapshot } from "@/lib/server/reservations";

import { ReservationSystemView } from "./ReservationSystemView";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { actor } = await requireAdminAccess(
    "reservations",
    "VIEW",
    "/admin/reservations",
  );
  const query = await searchParams;
  const now = new Date();
  const range = getReservationMonthRange(now);
  const service = resolveService(query.service);
  const month = resolveMonth(query.month, now, range.minimum);
  const calendar = await withPrisma((prisma) =>
    getReservationCalendarSnapshot(prisma, { service, month, now }),
  );
  const requestedDate = typeof query.date === "string" ? query.date : null;
  const selectedDate = requestedDate &&
    isReservationDate(requestedDate) &&
    requestedDate.startsWith(`${month}-`) &&
    calendar.days.some((day) => day.date === requestedDate && day.bookable)
    ? requestedDate
    : calendar.days.find((day) => day.bookable)?.date ?? `${month}-01`;

  return (
    <ReservationSystemView
      initialCalendar={calendar}
      initialSelectedDate={selectedDate}
      minimumMonth={range.minimum}
      maximumMonth={range.maximum}
      canEdit={canAdminAccess(actor, "reservations", "UPDATE")}
    />
  );
}

function resolveService(value: string | string[] | undefined): ReservationServiceKey {
  return typeof value === "string" && isReservationServiceKey(value)
    ? value
    : RESERVATION_SERVICE_KEYS[0];
}

function resolveMonth(
  value: string | string[] | undefined,
  now: Date,
  fallback: string,
) {
  return typeof value === "string" && isReservationMonthInRange(value, now)
    ? value
    : fallback;
}
