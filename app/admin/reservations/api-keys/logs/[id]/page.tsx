import { notFound } from "next/navigation";

import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getReservationApiRequestLog } from "@/lib/server/reservation-api-request-logs";
import { withPrisma } from "@/lib/server/prisma";
import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { AdminTenantChoice } from "@/app/admin/AdminTenantChoice";

import { ReservationApiRequestLogDetailView } from "./ReservationApiRequestLogDetailView";

export default async function ReservationApiRequestLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const selected = await getAdminPageTenant("reservations");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenant = selected.tenant;
  const { id } = await params;
  const callbackURL = `/admin/reservations/api-keys/logs/${encodeURIComponent(id)}`;
  await requireAdminAccess("reservations", "VIEW", callbackURL);
  const log = await withPrisma((prisma) =>
    getReservationApiRequestLog(prisma, tenant.key, id),
  );
  if (!log) notFound();

  return <ReservationApiRequestLogDetailView log={log} tenantKey={tenant.key} />;
}
