import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { defaultLocale, dictionaries } from "@/app/i18n/dictionaries";
import { canAdminAccess } from "@/lib/admin-access/authorization";
import { getSessionUser } from "@/lib/server/auth/helpers";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { withPrisma } from "@/lib/server/prisma";

import { UserDetailsView } from "./UserDetailsView";

export const metadata: Metadata = {
  title: dictionaries[defaultLocale].admin.userManagement.detailsPageTitle,
};

export default async function UserDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, actor } = await requireAdminAccess(
    "users",
    "VIEW",
    `/admin/users/${encodeURIComponent(id)}`,
  );
  const canViewAccessRoles =
    canAdminAccess(actor, "roles", "VIEW") &&
    canAdminAccess(actor, "role-assignments", "VIEW");
  const canManageAccessRoles =
    canViewAccessRoles &&
    canAdminAccess(actor, "role-assignments", "UPDATE");
  const basicUserSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    banned: true,
    mustChangePassword: true,
  } as const;
  const { user, activeAdminCount, accessRoles } = await withPrisma(
    async (prisma) => {
      const activeAdminCountQuery = prisma.user.count({
        where: {
          role: "admin",
          OR: [{ banned: false }, { banned: null }],
        },
      });

      if (!canViewAccessRoles) {
        const [user, activeAdminCount] = await prisma.$transaction([
          prisma.user.findUnique({
            where: { id },
            select: basicUserSelect,
          }),
          activeAdminCountQuery,
        ]);
        return { user, activeAdminCount, accessRoles: null };
      }

      const [record, activeAdminCount, availableRoles] =
        await prisma.$transaction([
          prisma.user.findUnique({
            where: { id },
            select: {
              ...basicUserSelect,
              adminAccessRoleRevision: true,
              accessRoleAssignments: {
                orderBy: { roleId: "asc" },
                select: { role: { select: { id: true } } },
              },
            },
          }),
          activeAdminCountQuery,
          prisma.adminAccessRole.findMany({
            orderBy: [
              { systemKey: "asc" },
              { name: "asc" },
              { id: "asc" },
            ],
            select: { id: true, name: true, systemKey: true },
          }),
        ]);
      if (!record) {
        return { user: null, activeAdminCount, accessRoles: null };
      }
      if (record.accessRoleAssignments.length !== 1) {
        throw new Error(
          "Every admin user must have exactly one access role assignment.",
        );
      }
      const {
        adminAccessRoleRevision,
        accessRoleAssignments,
        ...user
      } = record;
      return {
        user,
        activeAdminCount,
        accessRoles: {
          assignmentRevision: adminAccessRoleRevision,
          assignedRoleIds: accessRoleAssignments.map(({ role }) => role.id),
          availableRoles,
          canManageAccessRoles,
        },
      };
    },
  );

  if (!user) {
    notFound();
  }

  return (
    <UserDetailsView
      initialUser={user}
      currentUserId={getSessionUser(session)!.id}
      initialActiveAdminCount={activeAdminCount}
      accessRoles={accessRoles}
      canUpdateUser={canAdminAccess(actor, "users", "UPDATE")}
    />
  );
}
