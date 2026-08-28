import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { withPrisma } from "@/lib/server/prisma";

import { NewUserForm } from "./NewUserForm";

export default async function NewUserPage() {
  const { actor } = await requireAdminAccess(
    "users",
    "CREATE",
    "/admin/users/new",
  );
  const canAssignRoles =
    canAdminAccess(actor, "roles", "VIEW") &&
    canAdminAccess(actor, "role-assignments", "VIEW") &&
    canAdminAccess(actor, "role-assignments", "UPDATE");
  const roles = canAssignRoles
    ? await withPrisma((prisma) =>
        prisma.adminAccessRole.findMany({
          orderBy: [{ systemKey: "asc" }, { name: "asc" }, { id: "asc" }],
          select: { id: true, name: true, description: true, systemKey: true },
        }),
      )
    : [];

  return <NewUserForm availableRoles={roles} canAssignRoles={canAssignRoles} />;
}
