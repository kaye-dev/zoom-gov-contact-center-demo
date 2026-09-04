import { redirect } from "next/navigation";

import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { withPrisma } from "@/lib/server/prisma";
import {
  listReservationBookings,
  parseReservationBookingListQuery,
} from "@/lib/server/reservation-bookings";

import { ReservationBookingsView } from "./ReservationBookingsView";

const RESERVATION_BOOKINGS_ROUTE = "/admin/reservations/bookings";

export default async function ReservationBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminAccess(
    "reservations",
    "VIEW",
    RESERVATION_BOOKINGS_ROUTE,
  );
  const parsed = parseReservationBookingListQuery(await searchParams);
  if (!parsed.ok) redirect(RESERVATION_BOOKINGS_ROUTE);

  const result = await withPrisma((prisma) =>
    listReservationBookings(prisma, parsed.value),
  );

  return (
    <ReservationBookingsView
      bookings={result.bookings}
      nextCursor={result.nextCursor}
      filters={{
        service: parsed.value.service ?? "",
        source: parsed.value.source ?? "",
      }}
    />
  );
}
