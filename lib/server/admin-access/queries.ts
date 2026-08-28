import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

import { ADMIN_RESOURCE_CATALOG } from "@/lib/admin-access/catalog";
import {
  ADMIN_ACCESS_ACTIONS,
  type AdminAccessActor,
  type AdminAccessRoleSource,
} from "@/lib/admin-access/types";
import { evaluateAdminAccess } from "@/lib/admin-access/authorization";

export const FULL_ACCESS_ROLE_ID = "system-full-access";
export const NO_ACCESS_ROLE_ID = "system-no-access";

export type AdminAccessPrisma = PrismaClient | Prisma.TransactionClient;

export const ADMIN_ROLE_DIRECTORY_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_ROLE_DIRECTORY_MAX_PAGE_SIZE = 50;
export const ADMIN_ROLE_DIRECTORY_MAX_QUERY_LENGTH = 100;
export const ADMIN_ROLE_DIRECTORY_MAX_OFFSET = 10_000;

export type AdminRoleDirectoryInput = {
  query: string;
  page: number;
  pageSize: number;
};

export function parseAdminRoleDirectoryInput(input: {
  query?: string;
  page?: string;
  pageSize?: string;
}):
  | { ok: true; value: AdminRoleDirectoryInput }
  | { ok: false; error: "INVALID_DIRECTORY_QUERY" } {
  const query = (input.query ?? "").trim().normalize("NFKC");
  if (query.length > ADMIN_ROLE_DIRECTORY_MAX_QUERY_LENGTH) {
    return { ok: false, error: "INVALID_DIRECTORY_QUERY" };
  }

  const page = parsePositiveDirectoryInteger(input.page, 1);
  const pageSize = parsePositiveDirectoryInteger(
    input.pageSize,
    ADMIN_ROLE_DIRECTORY_DEFAULT_PAGE_SIZE,
  );
  if (
    page === null ||
    pageSize === null ||
    pageSize > ADMIN_ROLE_DIRECTORY_MAX_PAGE_SIZE ||
    (page - 1) * pageSize > ADMIN_ROLE_DIRECTORY_MAX_OFFSET
  ) {
    return { ok: false, error: "INVALID_DIRECTORY_QUERY" };
  }

  return { ok: true, value: { query, page, pageSize } };
}

function parsePositiveDirectoryInteger(value: string | undefined, fallback: number) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function getAdminAccessActor(
  prisma: AdminAccessPrisma,
  userId: string,
): Promise<AdminAccessActor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      banned: true,
      mustChangePassword: true,
      accessRoleAssignments: {
        orderBy: [{ role: { name: "asc" } }, { roleId: "asc" }],
        select: {
          role: {
            select: {
              id: true,
              name: true,
              systemKey: true,
              permissions: {
                orderBy: [{ resourceKey: "asc" }, { action: "asc" }],
                select: {
                  resourceKey: true,
                  action: true,
                  effect: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    adminAttribute: user.role === "admin" ? "admin" : "user",
    banned: Boolean(user.banned),
    mustChangePassword: user.mustChangePassword,
    roles: user.accessRoleAssignments.map(
      ({ role }): AdminAccessRoleSource => ({
        id: role.id,
        name: role.name,
        systemKey: role.systemKey,
        permissions: role.permissions,
      }),
    ),
  };
}

export async function getAdminNavigationPermissions(
  prisma: AdminAccessPrisma,
  userId: string,
) {
  const actor = await getAdminAccessActor(prisma, userId);
  if (!actor) return [];

  return ADMIN_RESOURCE_CATALOG.filter((resource) =>
    evaluateAdminAccess(actor, resource.key, "VIEW").allowed,
  ).map((resource) => resource.key);
}

export async function listAdminRoles(
  prisma: AdminAccessPrisma,
  input: AdminRoleDirectoryInput,
) {
  const where = input.query
    ? {
        OR: [
          { name: { contains: input.query, mode: "insensitive" as const } },
          { id: { contains: input.query, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const [roles, total] = await Promise.all([
    prisma.adminAccessRole.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        name: true,
        description: true,
        systemKey: true,
        revision: true,
        _count: { select: { assignments: true } },
      },
    }),
    prisma.adminAccessRole.count({ where }),
  ]);

  return {
    roles,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function getAdminRoleDetail(
  prisma: AdminAccessPrisma,
  roleId: string,
) {
  const role = await prisma.adminAccessRole.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      name: true,
      description: true,
      systemKey: true,
      revision: true,
      permissions: {
        orderBy: [{ resourceKey: "asc" }, { action: "asc" }],
        select: { resourceKey: true, action: true, effect: true },
      },
      _count: { select: { assignments: true } },
    },
  });

  if (!role) return null;

  const permissionByCell = new Map(
    role.permissions.map((permission) => [
      `${permission.resourceKey}:${permission.action}`,
      permission.effect,
    ]),
  );

  return {
    id: role.id,
    name: role.name,
    description: role.description,
    systemKey: role.systemKey,
    revision: role.revision,
    memberCount: role._count.assignments,
    matrix: ADMIN_RESOURCE_CATALOG.map((resource) => ({
      resourceKey: resource.key,
      displayPaths: [...resource.displayPaths],
      actions: ADMIN_ACCESS_ACTIONS.map((action) => ({
        action,
        supported: resource.supportedActions.includes(action as never),
        effect:
          role.systemKey === "FULL_ACCESS" &&
          resource.supportedActions.includes(action as never)
            ? "ALLOW"
            : permissionByCell.get(`${resource.key}:${action}`) ?? null,
      })),
    })),
  };
}

export async function listAdminRoleMembers(
  prisma: AdminAccessPrisma,
  roleId: string,
  input: AdminRoleDirectoryInput,
) {
  const userWhere = input.query
    ? {
        OR: [
          { id: { contains: input.query, mode: "insensitive" as const } },
          { name: { contains: input.query, mode: "insensitive" as const } },
          { email: { contains: input.query, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const where = { roleId, user: userWhere };
  const [role, assignments, total] = await Promise.all([
    prisma.adminAccessRole.findUnique({ where: { id: roleId }, select: { id: true } }),
    prisma.adminAccessRoleAssignment.findMany({
      where,
      orderBy: [
        { user: { name: "asc" } },
        { user: { email: "asc" } },
        { userId: "asc" },
      ],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        assignedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            banned: true,
            adminAccessRoleRevision: true,
            accessRoleAssignments: {
              orderBy: { roleId: "asc" },
              select: { roleId: true },
            },
          },
        },
      },
    }),
    prisma.adminAccessRoleAssignment.count({ where }),
  ]);
  if (!role) return null;

  return {
    members: assignments.map(({ assignedAt, user }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      adminAttribute: user.role === "admin" ? "admin" : "user",
      banned: Boolean(user.banned),
      assignedAt: assignedAt.toISOString(),
      assignmentRevision: user.adminAccessRoleRevision,
      assignedRoleIds: user.accessRoleAssignments.map(({ roleId: id }) => id),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function listAdminRoleMemberCandidates(
  prisma: AdminAccessPrisma,
  roleId: string,
  input: AdminRoleDirectoryInput,
  excludeUserId?: string,
) {
  const where = {
    ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    accessRoleAssignments: { none: { roleId } },
    ...(input.query
      ? {
          OR: [
            { id: { contains: input.query, mode: "insensitive" as const } },
            { name: { contains: input.query, mode: "insensitive" as const } },
            { email: { contains: input.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [role, users, total] = await Promise.all([
    prisma.adminAccessRole.findUnique({ where: { id: roleId }, select: { id: true } }),
    prisma.user.findMany({
      where,
      orderBy: [{ name: "asc" }, { email: "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        adminAccessRoleRevision: true,
        accessRoleAssignments: {
          orderBy: { roleId: "asc" },
          select: { roleId: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);
  if (!role) return null;

  return {
    candidates: users.map(({ accessRoleAssignments, role, banned, ...user }) => ({
      ...user,
      adminAttribute: role === "admin" ? "admin" : "user",
      banned: Boolean(banned),
      assignmentRevision: user.adminAccessRoleRevision,
      assignedRoleIds: accessRoleAssignments.map(({ roleId: id }) => id),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function getUserAccessSummary(
  prisma: AdminAccessPrisma,
  userId: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      mustChangePassword: true,
      adminAccessRoleRevision: true,
      accessRoleAssignments: {
        orderBy: [{ role: { name: "asc" } }, { roleId: "asc" }],
        select: {
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              systemKey: true,
              revision: true,
              permissions: {
                orderBy: [{ resourceKey: "asc" }, { action: "asc" }],
                select: { resourceKey: true, action: true, effect: true },
              },
              _count: { select: { assignments: true } },
            },
          },
        },
      },
    },
  });

  if (!user) return null;
  if (user.accessRoleAssignments.length !== 1) {
    throw new Error(
      "Every admin user must have exactly one access role assignment.",
    );
  }

  const actor: AdminAccessActor = {
    id: user.id,
    adminAttribute: user.role === "admin" ? "admin" : "user",
    banned: Boolean(user.banned),
    mustChangePassword: user.mustChangePassword,
    roles: user.accessRoleAssignments.map(({ role }) => ({
      id: role.id,
      name: role.name,
      systemKey: role.systemKey,
      permissions: role.permissions,
    })),
  };

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      adminAttribute: actor.adminAttribute,
      banned: actor.banned,
      assignmentRevision: user.adminAccessRoleRevision,
    },
    assignedRoles: user.accessRoleAssignments.map(({ role }) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      systemKey: role.systemKey,
      revision: role.revision,
      memberCount: role._count.assignments,
    })),
    resources: ADMIN_RESOURCE_CATALOG.map((resource) => ({
      resourceKey: resource.key,
      displayPaths: [...resource.displayPaths],
      actions: ADMIN_ACCESS_ACTIONS.map((action) =>
        evaluateAdminAccess(actor, resource.key, action),
      ),
    })),
  };
}
