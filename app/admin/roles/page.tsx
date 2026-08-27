import { redirect } from "next/navigation";

import { requireAdminAccess } from "@/lib/server/admin-access/server";
import {
  listAdminRoles,
  parseAdminRoleDirectoryInput,
} from "@/lib/server/admin-access/queries";
import { canAdminAccess } from "@/lib/admin-access/authorization";
import { withPrisma } from "@/lib/server/prisma";

import { RolesView } from "./RolesView";

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}) {
  const { actor } = await requireAdminAccess("roles", "VIEW", "/admin/roles");
  const params = await searchParams;
  const parsed = parseAdminRoleDirectoryInput({
    query: readParam(params.query),
    page: readParam(params.page),
    pageSize: readParam(params.pageSize),
  });
  if (!parsed.ok) redirect("/admin/roles");
  const result = await withPrisma((prisma) =>
    listAdminRoles(prisma, parsed.value),
  );

  return (
    <RolesView
      roles={result.roles.map(({ _count, ...role }) => ({
        ...role,
        memberCount: _count.assignments,
      }))}
      total={result.total}
      page={result.page}
      totalPages={result.totalPages}
      pageSize={result.pageSize}
      search={parsed.value.query}
      canCreate={canAdminAccess(actor, "roles", "CREATE")}
      canUpdate={canAdminAccess(actor, "roles", "UPDATE")}
      canDelete={canAdminAccess(actor, "roles", "DELETE")}
      canViewMembers={
        canAdminAccess(actor, "users", "VIEW") &&
        canAdminAccess(actor, "role-assignments", "VIEW")
      }
    />
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
