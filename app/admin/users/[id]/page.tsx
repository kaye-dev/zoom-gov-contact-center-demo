import { notFound } from "next/navigation";

import { getSessionUser } from "@/lib/server/auth/helpers";
import { requireAdminSession } from "@/lib/server/auth/server";
import { withPrisma } from "@/lib/server/prisma";

import { UserDetailsView } from "./UserDetailsView";

export default async function UserDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminSession(`/admin/users/${encodeURIComponent(id)}`);
  const [user, activeAdminCount] = await withPrisma((prisma) =>
    prisma.$transaction([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          banned: true,
          mustChangePassword: true,
        },
      }),
      prisma.user.count({
        where: {
          role: "admin",
          NOT: { banned: true },
        },
      }),
    ]),
  );

  if (!user) {
    notFound();
  }

  return (
    <UserDetailsView
      initialUser={user}
      currentUserId={getSessionUser(session)!.id}
      initialActiveAdminCount={activeAdminCount}
    />
  );
}
