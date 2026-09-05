import { redirect } from "next/navigation";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getSessionUser } from "@/lib/server/auth/helpers";
import { withPrisma } from "@/lib/server/prisma";

import { UsersView } from "./UsersView";

type UsersPageProps = {
  searchParams: Promise<{
    page?: string | string[];
    search?: string | string[];
  }>;
};

const PAGE_SIZE = 20;

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const { session, actor } = await requireAdminAccess("users", "VIEW", "/admin/users");

  const params = await searchParams;
  const search = readSearchParam(params.search).trim();
  const page = Math.max(1, Number.parseInt(readSearchParam(params.page), 10) || 1);
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total, activeAdminCount] = await withPrisma((prisma) =>
    prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          banned: true,
          mustChangePassword: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count({
        where: {
          role: "admin",
          OR: [{ banned: false }, { banned: null }],
        },
      }),
    ]),
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (page > totalPages) {
    redirect(getCanonicalUsersHref(search, totalPages));
  }

  return (
    <UsersView
      users={users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }))}
      search={search}
      page={page}
      total={total}
      totalPages={totalPages}
      currentUserId={getSessionUser(session)!.id}
      activeAdminCount={activeAdminCount}
      canCreate={canAdminAccess(actor, "users", "CREATE")}
      canUpdate={canAdminAccess(actor, "users", "UPDATE")}
      canDelete={canAdminAccess(actor, "users", "DELETE")}
    />
  );
}

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getCanonicalUsersHref(search: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}
