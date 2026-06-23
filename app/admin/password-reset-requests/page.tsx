import { prisma } from "@/lib/server/prisma";
import { requireAdminSession } from "@/lib/server/auth/server";

import { PasswordResetRequestsView } from "./PasswordResetRequestsView";

export default async function PasswordResetRequestsPage() {
  await requireAdminSession("/admin/password-reset-requests");

  const requests = await prisma.passwordResetRequest.findMany({
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
  });

  return (
    <PasswordResetRequestsView
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
