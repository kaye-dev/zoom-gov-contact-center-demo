import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { AdminTenantChoice } from "@/app/admin/AdminTenantChoice";
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
  const selected = await getAdminPageTenant("reservations");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenantKey = selected.tenant.key;
  await requireAdminAccess(
    "reservations",
    "VIEW",
    RESERVATION_BOOKINGS_ROUTE,
  );
  const query = { ...await searchParams };
  delete query.tenant;
  const parsed = parseReservationBookingListQuery(query);
  if (!parsed.ok) redirect(`${RESERVATION_BOOKINGS_ROUTE}?tenant=${tenantKey}`);

  const result = await withPrisma((prisma) =>
    listReservationBookings(prisma, tenantKey, parsed.value),
  );

  return (
    <ReservationBookingsView
      tenantKey={tenantKey}
      bookings={result.bookings}
      nextCursor={result.nextCursor}
      filters={{
        service: parsed.value.service ?? "",
        source: parsed.value.source ?? "",
      }}
    />
  );
}
