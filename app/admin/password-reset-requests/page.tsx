import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { withPrisma } from "@/lib/server/prisma";

import { PasswordResetRequestsView } from "./PasswordResetRequestsView";

export default async function PasswordResetRequestsPage() {
  const { actor } = await requireAdminAccess(
    "password-reset-requests",
    "VIEW",
    "/admin/password-reset-requests",
  );

  const requests = await withPrisma((prisma) =>
    prisma.passwordResetRequest.findMany({
      orderBy: { requestedAt: "desc" },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  );

  return (
    <PasswordResetRequestsView
      canUpdate={canAdminAccess(actor, "password-reset-requests", "UPDATE")}
      requests={requests.map((request) => ({
        id: request.id,
        email: request.email,
        status: request.status,
        requestedAt: request.requestedAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        user: request.user
          ? {
              id: request.user.id,
              name: request.user.name,
              email: request.user.email,
            }
          : null,
      }))}
    />
  );
}
import { canAdminAccess } from "@/lib/admin-access/authorization";
