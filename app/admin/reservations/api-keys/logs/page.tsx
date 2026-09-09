import { redirect } from "next/navigation";

import { requireAdminAccess } from "@/lib/server/admin-access/server";
import {
  listReservationApiRequestLogs,
  parseReservationApiRequestLogListQuery,
} from "@/lib/server/reservation-api-request-logs";
import { withPrisma } from "@/lib/server/prisma";
import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { AdminTenantChoice } from "@/app/admin/AdminTenantChoice";

import { ReservationApiRequestLogsView } from "./ReservationApiRequestLogsView";

const RESERVATION_API_LOGS_ROUTE = "/admin/reservations/api-keys/logs";

export default async function ReservationApiRequestLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const selected = await getAdminPageTenant("reservations");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenant = selected.tenant;
  await requireAdminAccess(
    "reservations",
    "VIEW",
    RESERVATION_API_LOGS_ROUTE,
  );
  const filters = { ...await searchParams };
  delete filters.tenant;
  const parsed = parseReservationApiRequestLogListQuery(filters);
  if (!parsed.ok) redirect(`${RESERVATION_API_LOGS_ROUTE}?tenant=${tenant.key}`);

  const result = await withPrisma((prisma) =>
    listReservationApiRequestLogs(prisma, tenant.key, parsed.value),
  );

  return (
    <ReservationApiRequestLogsView
      tenantKey={tenant.key}
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
