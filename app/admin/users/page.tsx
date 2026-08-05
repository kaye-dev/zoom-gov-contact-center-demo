import { requireAdminSession } from "@/lib/server/auth/server";
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
  await requireAdminSession("/admin/users");

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

  const [users, total] = await withPrisma((prisma) =>
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
          mustChangePassword: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]),
  );

  return (
    <UsersView
      users={users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }))}
      search={search}
      page={page}
      totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
    />
  );
}

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
