import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { listReservationApiKeys } from "@/lib/server/reservation-api-keys";
import { getReservationApiUsageSnapshot } from "@/lib/server/reservation-api-usage";
import { withPrisma } from "@/lib/server/prisma";
import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { AdminTenantChoice } from "@/app/admin/AdminTenantChoice";

import { ReservationApiKeysView } from "./ReservationApiKeysView";

export default async function ReservationApiKeysPage() {
  const selected = await getAdminPageTenant("reservations");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenant = selected.tenant;
  const { actor } = await requireAdminAccess(
    "reservations",
    "VIEW",
    "/admin/reservations/api-keys",
  );
  const initial = await withPrisma(async (prisma) => {
    const [apiKeys, usageLimit] = await Promise.all([
      listReservationApiKeys(prisma, tenant.key),
      getReservationApiUsageSnapshot(prisma, tenant.key),
    ]);
    return { apiKeys, usageLimit };
  });

  return (
    <ReservationApiKeysView
      tenantKey={tenant.key}
      initialApiKeys={initial.apiKeys}
      initialUsageLimit={initial.usageLimit}
      canEdit={canAdminAccess(actor, "reservations", "UPDATE")}
    />
  );
}
