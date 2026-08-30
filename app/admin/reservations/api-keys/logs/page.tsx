import { redirect } from "next/navigation";

import { requireAdminAccess } from "@/lib/server/admin-access/server";
import {
  listReservationApiRequestLogs,
  parseReservationApiRequestLogListQuery,
} from "@/lib/server/reservation-api-request-logs";
import { withPrisma } from "@/lib/server/prisma";

import { ReservationApiRequestLogsView } from "./ReservationApiRequestLogsView";

const RESERVATION_API_LOGS_ROUTE = "/admin/reservations/api-keys/logs";

export default async function ReservationApiRequestLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminAccess(
    "reservations",
    "VIEW",
    RESERVATION_API_LOGS_ROUTE,
  );
  const parsed = parseReservationApiRequestLogListQuery(await searchParams);
  if (!parsed.ok) redirect(RESERVATION_API_LOGS_ROUTE);

  const result = await withPrisma((prisma) =>
    listReservationApiRequestLogs(prisma, parsed.value),
  );

  return (
    <ReservationApiRequestLogsView
      logs={result.logs}
      nextCursor={result.nextCursor}
      filters={{
        query: parsed.value.query ?? "",
        method: parsed.value.method ?? "",
        result: parsed.value.result ?? "",
      }}
    />
  );
}
