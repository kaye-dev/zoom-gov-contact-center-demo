import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { listReservationApiKeys } from "@/lib/server/reservation-api-keys";
import { getReservationApiUsageSnapshot } from "@/lib/server/reservation-api-usage";
import { withPrisma } from "@/lib/server/prisma";

import { ReservationApiKeysView } from "./ReservationApiKeysView";

export default async function ReservationApiKeysPage() {
  const { actor } = await requireAdminAccess(
    "reservations",
    "VIEW",
    "/admin/reservations/api-keys",
  );
  const initial = await withPrisma(async (prisma) => {
    const [apiKeys, usageLimit] = await Promise.all([
      listReservationApiKeys(prisma),
      getReservationApiUsageSnapshot(prisma),
    ]);
    return { apiKeys, usageLimit };
  });

  return (
    <ReservationApiKeysView
      initialApiKeys={initial.apiKeys}
      initialUsageLimit={initial.usageLimit}
      canEdit={canAdminAccess(actor, "reservations", "UPDATE")}
    />
  );
}
