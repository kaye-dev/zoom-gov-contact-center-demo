import { notFound } from "next/navigation";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getAdminRoleDetail } from "@/lib/server/admin-access/queries";
import { withPrisma } from "@/lib/server/prisma";

import { RoleDetailsView } from "./RoleDetailsView";

export default async function RoleDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const callbackURL = `/admin/roles/${encodeURIComponent(id)}`;
  const { actor } = await requireAdminAccess("roles", "VIEW", callbackURL);
  const role = await withPrisma((prisma) => getAdminRoleDetail(prisma, id));
  if (!role) notFound();
  const canViewMembers =
    canAdminAccess(actor, "users", "VIEW") &&
    canAdminAccess(actor, "role-assignments", "VIEW");

  return (
    <RoleDetailsView
      initialRole={role}
      currentUserId={actor.id}
      canUpdate={
        canAdminAccess(actor, "roles", "UPDATE") &&
        !actor.roles.some((assignedRole) => assignedRole.id === role.id)
      }
      canViewMembers={canViewMembers}
      canManageMembers={
        canViewMembers &&
        canAdminAccess(actor, "role-assignments", "UPDATE") &&
        role.systemKey !== "NO_ACCESS"
      }
    />
  );
}
