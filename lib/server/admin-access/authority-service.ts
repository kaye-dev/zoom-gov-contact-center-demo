import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";

import {
  canAdminAccess,
  getAllowedAdminPermissionSet,
} from "@/lib/admin-access/authorization";
import type {
  AdminAccessAction,
  AdminAccessActor,
  AdminAccessRoleSource,
  AdminResourceKey,
} from "@/lib/admin-access/types";
import {
  ADMIN_ROLE_ERROR_CODES,
  type ParsedRoleMetadata,
  type PermissionInput,
} from "@/lib/admin-access/validation";
import { ADMIN_USER_ERROR_CODES } from "@/lib/admin-users";

import {
  FULL_ACCESS_ROLE_ID,
  NO_ACCESS_ROLE_ID,
  getAdminAccessActor,
} from "./queries";
import { lockAdminAccessMutationTransaction } from "./mutation-lock";

const CRITICAL_RECOVERY_CELLS: ReadonlyArray<
  readonly [AdminResourceKey, AdminAccessAction]
> = [
  ["users", "VIEW"],
  ["users", "CREATE"],
  ["users", "UPDATE"],
  ["users", "DELETE"],
  ["roles", "VIEW"],
  ["roles", "UPDATE"],
  ["role-assignments", "VIEW"],
  ["role-assignments", "UPDATE"],
];

export class AdminAccessServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(code);
    this.name = "AdminAccessServiceError";
  }
}

type AdminAccessTransaction = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

type AdminUserOperationPermission = {
  resourceKey: AdminResourceKey;
  action: AdminAccessAction;
};

type AdminUserTargetAuthorityOptions = {
  requireSystemFullActorForFullAccessTarget?: boolean;
};

type AdminUserCreationOperationResult<T> = {
  userId: string;
  value: T;
};

type ResolvedCanonicalAdminAccessRoles = {
  canonicalRoleIds: string[];
  roles: AdminAccessRoleSource[];
};

const AUTHORIZED_USER_OPERATION_TRANSACTION_TIMEOUT_MS = 10_000;

export function assertAdminUserTargetWithinActorAuthority(
  actor: AdminAccessActor,
  currentTarget: AdminAccessActor,
  proposedTarget: AdminAccessActor = currentTarget,
  options: AdminUserTargetAuthorityOptions = {},
) {
  if (
    options.requireSystemFullActorForFullAccessTarget &&
    (hasSystemFullAccessRole(currentTarget) ||
      hasSystemFullAccessRole(proposedTarget)) &&
    !hasSystemFullAccessRole(actor)
  ) {
    throw new AdminAccessServiceError(
      ADMIN_ROLE_ERROR_CODES.permissionEscalation,
      403,
    );
  }

  assertActorPermissionSubset(actor, asPotentiallyActiveActor(currentTarget));
  assertActorPermissionSubset(actor, asPotentiallyActiveActor(proposedTarget));
}

export async function runAuthorizedAdminUserOperation<T>(
  prisma: PrismaClient,
  actorUserId: string,
  targetUserId: string,
  requiredPermission: AdminUserOperationPermission,
  options: AdminUserTargetAuthorityOptions,
  operation: (transaction: AdminAccessTransaction) => Promise<T>,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockRecoveryAdminMutex(tx);
      await requireManageableAdminUserTarget(
        tx,
        actorUserId,
        targetUserId,
        requiredPermission,
        undefined,
        options,
      );

      // Better Auth is rebound to this transaction by the caller. Its write
      // therefore commits or rolls back with the DB-fresh hierarchy check,
      // while the mutex prevents authority changes between them.
      return operation(tx);
    },
    { timeout: AUTHORIZED_USER_OPERATION_TRANSACTION_TIMEOUT_MS },
  );
}

export async function runAuthorizedAdminUserCreation<T>(
  prisma: PrismaClient,
  actorUserId: string,
  requestedRoleIds: string[] | undefined,
  operation: (
    transaction: AdminAccessTransaction,
  ) => Promise<AdminUserCreationOperationResult<T>>,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockRecoveryAdminMutex(tx);
      const actor = await requireActorPermission(
        tx,
        actorUserId,
        "users",
        "CREATE",
      );
      if (requestedRoleIds && requestedRoleIds.length > 0) {
        assertAdminUserCreationAccessRolePermissions(actor);
      }
      const resolvedRoles = await resolveCanonicalAdminAccessRoles(
        tx,
        requestedRoleIds ?? [],
      );
      const result = await operation(tx);
      await finalizeNewUserAdminAccessRoles(
        tx,
        actor,
        actorUserId,
        result.userId,
        resolvedRoles,
      );
      return result.value;
    },
    { timeout: AUTHORIZED_USER_OPERATION_TRANSACTION_TIMEOUT_MS },
  );
}

export async function createAdminRole(
  prisma: PrismaClient,
  actorUserId: string,
  metadata: ParsedRoleMetadata,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Role creation does not need the FULL_ACCESS recovery row, but it is
      // still an authority mutation and must respect rollback freezes.
      await lockAdminAccessMutationTransaction(tx);
      const actor = await requireActorPermission(tx, actorUserId, "roles", "CREATE");
      assertAllowedSubset(actor, []);

      return tx.adminAccessRole.create({
        data: metadata,
        select: {
          id: true,
          name: true,
          description: true,
          systemKey: true,
          revision: true,
        },
      });
    });
  } catch (error) {
    rethrowKnownPrismaError(error);
  }
}

export async function updateAdminRoleMetadata(
  prisma: PrismaClient,
  actorUserId: string,
  roleId: string,
  expectedRevision: number,
  metadata: ParsedRoleMetadata,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockRecoveryAdminMutex(tx);
      await requireActorPermission(tx, actorUserId, "roles", "UPDATE");
      await requireMutableRole(tx, actorUserId, roleId, expectedRevision);

      const updated = await tx.adminAccessRole.updateMany({
        where: { id: roleId, revision: expectedRevision, systemKey: null },
        data: { ...metadata, revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw conflict(ADMIN_ROLE_ERROR_CODES.roleConflict);

      return tx.adminAccessRole.findUniqueOrThrow({
        where: { id: roleId },
        select: {
          id: true,
          name: true,
          description: true,
          systemKey: true,
          revision: true,
        },
      });
    });
  } catch (error) {
    rethrowKnownPrismaError(error);
  }
}

export async function replaceAdminRolePermissions(
  prisma: PrismaClient,
  actorUserId: string,
  roleId: string,
  expectedRevision: number,
  permissions: PermissionInput[],
) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockRecoveryAdminMutex(tx);
      const actor = await requireActorPermission(tx, actorUserId, "roles", "UPDATE");
      await requireMutableRole(tx, actorUserId, roleId, expectedRevision);

      assertAllowedSubset(
        actor,
        permissions
          .filter((permission) => permission.effect === "ALLOW")
          .map((permission) => `${permission.resourceKey}:${permission.action}`),
      );

      const members = await tx.user.findMany({
        where: { accessRoleAssignments: { some: { roleId } } },
        select: {
          id: true,
          role: true,
          banned: true,
          mustChangePassword: true,
          accessRoleAssignments: {
            select: {
              role: {
                select: {
                  id: true,
                  name: true,
                  systemKey: true,
                  permissions: {
                    select: { resourceKey: true, action: true, effect: true },
                  },
                },
              },
            },
          },
        },
      });

      for (const member of members) {
        const currentActor = actorFromUserRecord(member);
        const proposedActor = actorFromUserRecord(member, {
          roleId,
          permissions: permissions.filter(
            (permission): permission is PermissionInput & { effect: "ALLOW" | "DENY" } =>
              permission.effect !== null,
            ),
        });
        assertAdminUserTargetWithinActorAuthority(
          actor,
          currentActor,
          proposedActor,
        );
      }

      const updated = await tx.adminAccessRole.updateMany({
        where: { id: roleId, revision: expectedRevision, systemKey: null },
        data: { revision: { increment: 1 } },
      });
      if (updated.count !== 1) throw conflict(ADMIN_ROLE_ERROR_CODES.roleConflict);

      await tx.adminAccessRolePermission.deleteMany({ where: { roleId } });
      const saved = permissions.filter(
        (permission): permission is PermissionInput & { effect: "ALLOW" | "DENY" } =>
          permission.effect !== null,
      );
      if (saved.length > 0) {
        await tx.adminAccessRolePermission.createMany({
          data: saved.map((permission) => ({ roleId, ...permission })),
        });
      }

      await assertRecoveryAdminExists(tx);

      return tx.adminAccessRole.findUniqueOrThrow({
        where: { id: roleId },
        select: {
          id: true,
          revision: true,
          permissions: {
            orderBy: [{ resourceKey: "asc" }, { action: "asc" }],
            select: { resourceKey: true, action: true, effect: true },
          },
        },
      });
    });
  } catch (error) {
    rethrowKnownPrismaError(error);
  }
}

export async function deleteAdminRole(
  prisma: PrismaClient,
  actorUserId: string,
  roleId: string,
  expectedRevision: number,
) {
  return prisma.$transaction(async (tx) => {
    await lockRecoveryAdminMutex(tx);
    await requireActorPermission(tx, actorUserId, "roles", "DELETE");
    const role = await requireMutableRole(tx, actorUserId, roleId, expectedRevision);

    if (role._count.assignments > 0) {
      throw conflict(ADMIN_ROLE_ERROR_CODES.roleInUse);
    }

    const deleted = await tx.adminAccessRole.deleteMany({
      where: { id: roleId, revision: expectedRevision, systemKey: null },
    });
    if (deleted.count !== 1) throw conflict(ADMIN_ROLE_ERROR_CODES.roleConflict);
  });
}

export async function replaceUserAdminAccessRoles(
  prisma: PrismaClient,
  actorUserId: string,
  targetUserId: string,
  roleIds: string[],
  expectedAssignmentRevision: number,
) {
  if (actorUserId === targetUserId) {
    throw new AdminAccessServiceError(
      ADMIN_ROLE_ERROR_CODES.selfAssignmentForbidden,
      403,
    );
  }
  if (roleIds.length > 1) {
    throw new AdminAccessServiceError(ADMIN_ROLE_ERROR_CODES.invalidRequest, 400);
  }

  return prisma.$transaction(async (tx) => {
    await lockRecoveryAdminMutex(tx);
    const actor = await requireActorPermission(
      tx,
      actorUserId,
      "role-assignments",
      "UPDATE",
    );
    assertActorCanViewRoleAssignments(actor);

    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
        banned: true,
        mustChangePassword: true,
        adminAccessRoleRevision: true,
        accessRoleAssignments: {
          orderBy: { roleId: "asc" },
          select: {
            roleId: true,
            role: {
              select: {
                id: true,
                name: true,
                systemKey: true,
                permissions: {
                  select: { resourceKey: true, action: true, effect: true },
                },
              },
            },
          },
        },
      },
    });
    if (!target) throw new AdminAccessServiceError("USER_NOT_FOUND", 404);
    if (target.adminAccessRoleRevision !== expectedAssignmentRevision) {
      throw conflict(ADMIN_ROLE_ERROR_CODES.assignmentConflict);
    }

    const { canonicalRoleIds, roles } =
      await resolveCanonicalAdminAccessRoles(tx, roleIds);

    const proposedTarget: AdminAccessActor = {
      id: target.id,
      adminAttribute: target.role === "admin" ? "admin" : "user",
      banned: Boolean(target.banned),
      mustChangePassword: target.mustChangePassword,
      roles,
    };
    const currentTarget: AdminAccessActor = {
      ...proposedTarget,
      roles: target.accessRoleAssignments.map(({ role }) => role),
    };
    assertAdminUserTargetWithinActorAuthority(
      actor,
      currentTarget,
      proposedTarget,
      { requireSystemFullActorForFullAccessTarget: true },
    );

    const oldRoleIds = target.accessRoleAssignments.map(({ roleId }) => roleId);
    const removedRoleIds = oldRoleIds.filter(
      (roleId) => !canonicalRoleIds.includes(roleId),
    );
    const addedRoleIds = canonicalRoleIds.filter(
      (roleId) => !oldRoleIds.includes(roleId),
    );
    if (removedRoleIds.length > 0 || addedRoleIds.length > 0) {
      const updated = await tx.user.updateMany({
        where: {
          id: targetUserId,
          adminAccessRoleRevision: expectedAssignmentRevision,
        },
        data: { adminAccessRoleRevision: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw conflict(ADMIN_ROLE_ERROR_CODES.assignmentConflict);
      }
      if (removedRoleIds.length > 0) {
        await tx.adminAccessRoleAssignment.deleteMany({
          where: { userId: targetUserId, roleId: { in: removedRoleIds } },
        });
      }
      if (addedRoleIds.length > 0) {
        await tx.adminAccessRoleAssignment.createMany({
          data: addedRoleIds.map((roleId) => ({
            userId: targetUserId,
            roleId,
            assignedByUserId: actorUserId,
          })),
        });
      }
    }

    await assertRecoveryAdminExists(tx);

    const result = await tx.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: {
        adminAccessRoleRevision: true,
        accessRoleAssignments: {
          orderBy: { roleId: "asc" },
          select: { roleId: true },
        },
      },
    });
    return {
      assignmentRevision: result.adminAccessRoleRevision,
      roleIds: result.accessRoleAssignments.map(({ roleId }) => roleId),
    };
  });
}

export async function convergeRecoveryAdminAccess(
  prisma: PrismaClient,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockRecoveryAdminMutex(tx);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        adminAccessRoleRevision: true,
        accessRoleAssignments: { select: { roleId: true } },
      },
    });
    if (!user) throw new Error("Recovery administrator user was not found.");
    const systemRole = await tx.adminAccessRole.findUnique({
      where: { id: FULL_ACCESS_ROLE_ID },
      select: { id: true, systemKey: true },
    });
    if (systemRole?.systemKey !== "FULL_ACCESS") {
      throw new Error("FULL_ACCESS system role is missing.");
    }

    const current = user.accessRoleAssignments.map(({ roleId }) => roleId);
    if (current.length === 1 && current[0] === FULL_ACCESS_ROLE_ID) return false;

    await tx.adminAccessRoleAssignment.deleteMany({
      where: { userId, roleId: { not: FULL_ACCESS_ROLE_ID } },
    });
    if (!current.includes(FULL_ACCESS_ROLE_ID)) {
      await tx.adminAccessRoleAssignment.create({
        data: { userId, roleId: FULL_ACCESS_ROLE_ID },
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: { adminAccessRoleRevision: { increment: 1 } },
    });
    return true;
  });
}

export async function updateProtectedAdminUserRole(
  prisma: PrismaClient,
  actorUserId: string,
  targetUserId: string,
  role: "admin" | "user",
) {
  return prisma.$transaction(async (tx) => {
    await lockRecoveryAdminMutex(tx);
    if (actorUserId === targetUserId && role !== "admin") {
      throw new AdminAccessServiceError(ADMIN_USER_ERROR_CODES.selfProtected, 409);
    }
    await requireManageableAdminUserTarget(
      tx,
      actorUserId,
      targetUserId,
      { resourceKey: "users", action: "UPDATE" },
      (target) => ({ ...target, adminAttribute: role }),
    );
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        mustChangePassword: true,
      },
    });
    await assertRecoveryAdminExists(tx, ADMIN_USER_ERROR_CODES.lastActiveAdmin);
    return user;
  });
}

export async function suspendProtectedAdminUser(
  prisma: PrismaClient,
  actorUserId: string,
  targetUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockRecoveryAdminMutex(tx);
    if (actorUserId === targetUserId) {
      throw new AdminAccessServiceError(ADMIN_USER_ERROR_CODES.selfProtected, 409);
    }
    await requireManageableAdminUserTarget(
      tx,
      actorUserId,
      targetUserId,
      { resourceKey: "users", action: "UPDATE" },
      (target) => ({ ...target, banned: true }),
    );
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: {
        banned: true,
        banReason: "Suspended by an administrator.",
        banExpires: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        mustChangePassword: true,
      },
    });
    await tx.session.deleteMany({ where: { userId: targetUserId } });
    await assertRecoveryAdminExists(tx, ADMIN_USER_ERROR_CODES.lastActiveAdmin);
    return user;
  });
}

export async function reactivateAdminUser(
  prisma: PrismaClient,
  actorUserId: string,
  targetUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockRecoveryAdminMutex(tx);
    await requireManageableAdminUserTarget(
      tx,
      actorUserId,
      targetUserId,
      { resourceKey: "users", action: "UPDATE" },
      (target) => ({ ...target, banned: false }),
    );
    return tx.user.update({
      where: { id: targetUserId },
      data: { banned: false, banReason: null, banExpires: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        banned: true,
        mustChangePassword: true,
      },
    });
  });
}

export async function deleteProtectedAdminUser(
  prisma: PrismaClient,
  actorUserId: string,
  targetUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockRecoveryAdminMutex(tx);
    if (actorUserId === targetUserId) {
      throw new AdminAccessServiceError(ADMIN_USER_ERROR_CODES.selfProtected, 409);
    }
    await requireManageableAdminUserTarget(
      tx,
      actorUserId,
      targetUserId,
      { resourceKey: "users", action: "DELETE" },
    );
    await tx.user.delete({ where: { id: targetUserId } });
    await assertRecoveryAdminExists(tx, ADMIN_USER_ERROR_CODES.lastActiveAdmin);
  });
}

async function requireActorPermission(
  prisma: AdminAccessTransaction,
  actorUserId: string,
  resourceKey: AdminResourceKey,
  action: AdminAccessAction,
) {
  const actor = await getAdminAccessActor(prisma, actorUserId);
  if (!actor || !canAdminAccess(actor, resourceKey, action)) {
    throw new AdminAccessServiceError("ADMIN_ACCESS_DENIED", 403);
  }
  return actor;
}

export function assertAdminUserCreationAccessRolePermissions(
  actor: AdminAccessActor,
) {
  const requirements: Array<readonly [AdminResourceKey, AdminAccessAction]> = [
    ["users", "VIEW"],
    ["users", "CREATE"],
    ["roles", "VIEW"],
    ["role-assignments", "VIEW"],
    ["role-assignments", "UPDATE"],
  ];
  if (
    requirements.some(
      ([resourceKey, action]) =>
        !canAdminAccess(actor, resourceKey, action),
    )
  ) {
    throw new AdminAccessServiceError("ADMIN_ACCESS_DENIED", 403);
  }
}

async function resolveCanonicalAdminAccessRoles(
  prisma: AdminAccessTransaction,
  roleIds: string[],
): Promise<ResolvedCanonicalAdminAccessRoles> {
  const canonicalRoleIds =
    roleIds.length === 0 ? [NO_ACCESS_ROLE_ID] : roleIds;
  if (canonicalRoleIds.length !== 1) {
    throw new AdminAccessServiceError(ADMIN_ROLE_ERROR_CODES.invalidRequest, 400);
  }

  const roles = await prisma.adminAccessRole.findMany({
    where: { id: { in: canonicalRoleIds } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      systemKey: true,
      permissions: {
        select: { resourceKey: true, action: true, effect: true },
      },
    },
  });
  if (roles.length !== canonicalRoleIds.length) {
    throw new AdminAccessServiceError(ADMIN_ROLE_ERROR_CODES.invalidRequest, 400);
  }
  return { canonicalRoleIds, roles };
}

async function finalizeNewUserAdminAccessRoles(
  prisma: AdminAccessTransaction,
  actor: AdminAccessActor,
  actorUserId: string,
  targetUserId: string,
  resolved: ResolvedCanonicalAdminAccessRoles,
) {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      role: true,
      banned: true,
      mustChangePassword: true,
      adminAccessRoleRevision: true,
      accessRoleAssignments: {
        orderBy: { roleId: "asc" },
        select: { roleId: true },
      },
    },
  });
  if (!target) {
    throw new AdminAccessServiceError(ADMIN_USER_ERROR_CODES.userNotFound, 404);
  }
  if (target.adminAccessRoleRevision !== 1) {
    throw conflict(ADMIN_ROLE_ERROR_CODES.assignmentConflict);
  }

  const proposedTarget: AdminAccessActor = {
    id: target.id,
    adminAttribute: target.role === "admin" ? "admin" : "user",
    banned: Boolean(target.banned),
    mustChangePassword: target.mustChangePassword,
    roles: resolved.roles,
  };
  assertAdminUserTargetWithinActorAuthority(
    actor,
    proposedTarget,
    proposedTarget,
    { requireSystemFullActorForFullAccessTarget: true },
  );

  const oldRoleIds = target.accessRoleAssignments.map(({ roleId }) => roleId);
  const removedRoleIds = oldRoleIds.filter(
    (roleId) => !resolved.canonicalRoleIds.includes(roleId),
  );
  const addedRoleIds = resolved.canonicalRoleIds.filter(
    (roleId) => !oldRoleIds.includes(roleId),
  );
  if (removedRoleIds.length > 0 || addedRoleIds.length > 0) {
    const updated = await prisma.user.updateMany({
      where: { id: targetUserId, adminAccessRoleRevision: 1 },
      data: { adminAccessRoleRevision: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw conflict(ADMIN_ROLE_ERROR_CODES.assignmentConflict);
    }
    if (removedRoleIds.length > 0) {
      await prisma.adminAccessRoleAssignment.deleteMany({
        where: { userId: targetUserId, roleId: { in: removedRoleIds } },
      });
    }
    if (addedRoleIds.length > 0) {
      await prisma.adminAccessRoleAssignment.createMany({
        data: addedRoleIds.map((roleId) => ({
          userId: targetUserId,
          roleId,
          assignedByUserId: actorUserId,
        })),
      });
    }
  }
  await assertRecoveryAdminExists(prisma);
}

async function requireManageableAdminUserTarget(
  prisma: AdminAccessTransaction,
  actorUserId: string,
  targetUserId: string,
  requiredPermission: AdminUserOperationPermission,
  proposeTarget?: (target: AdminAccessActor) => AdminAccessActor,
  options: AdminUserTargetAuthorityOptions = {},
) {
  const actor = await requireActorPermission(
    prisma,
    actorUserId,
    requiredPermission.resourceKey,
    requiredPermission.action,
  );
  const target = await getAdminAccessActor(prisma, targetUserId);
  if (!target) {
    throw new AdminAccessServiceError(
      ADMIN_USER_ERROR_CODES.userNotFound,
      404,
    );
  }
  const proposedTarget = proposeTarget?.(target) ?? target;
  assertAdminUserTargetWithinActorAuthority(
    actor,
    target,
    proposedTarget,
    options,
  );
  return { actor, target, proposedTarget };
}

async function requireMutableRole(
  prisma: AdminAccessTransaction,
  actorUserId: string,
  roleId: string,
  expectedRevision: number,
) {
  const role = await prisma.adminAccessRole.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      systemKey: true,
      revision: true,
      _count: { select: { assignments: true } },
      assignments: {
        where: { userId: actorUserId },
        select: { userId: true },
      },
    },
  });
  if (!role) throw new AdminAccessServiceError(ADMIN_ROLE_ERROR_CODES.roleNotFound, 404);
  if (role.systemKey) {
    throw new AdminAccessServiceError(
      ADMIN_ROLE_ERROR_CODES.systemRoleImmutable,
      403,
    );
  }
  if (role.assignments.length > 0) {
    throw new AdminAccessServiceError(
      ADMIN_ROLE_ERROR_CODES.permissionEscalation,
      403,
    );
  }
  if (role.revision !== expectedRevision) {
    throw conflict(ADMIN_ROLE_ERROR_CODES.roleConflict);
  }
  return role;
}

function assertActorCanViewRoleAssignments(actor: AdminAccessActor) {
  const requirements: Array<readonly [AdminResourceKey, AdminAccessAction]> = [
    ["users", "VIEW"],
    ["roles", "VIEW"],
    ["role-assignments", "VIEW"],
  ];
  if (requirements.some(([resource, action]) => !canAdminAccess(actor, resource, action))) {
    throw new AdminAccessServiceError("ADMIN_ACCESS_DENIED", 403);
  }
}

function assertAllowedSubset(actor: AdminAccessActor, cells: string[]) {
  const actorAllowed = getAllowedAdminPermissionSet(actor);
  if (cells.some((cell) => !actorAllowed.has(cell))) {
    throw new AdminAccessServiceError(
      ADMIN_ROLE_ERROR_CODES.permissionEscalation,
      403,
    );
  }
}

function assertActorPermissionSubset(
  actor: AdminAccessActor,
  proposedActor: AdminAccessActor,
) {
  assertAllowedSubset(actor, [...getAllowedAdminPermissionSet(proposedActor)]);
}

function asPotentiallyActiveActor(actor: AdminAccessActor): AdminAccessActor {
  return {
    ...actor,
    banned: false,
    mustChangePassword: false,
  };
}

function hasSystemFullAccessRole(actor: AdminAccessActor) {
  return actor.roles.some((role) => role.systemKey === "FULL_ACCESS");
}

function actorFromUserRecord(
  user: {
    id: string;
    role: string | null;
    banned: boolean | null;
    mustChangePassword: boolean;
    accessRoleAssignments: Array<{ role: AdminAccessRoleSource }>;
  },
  replacement?: {
    roleId: string;
    permissions: AdminAccessRoleSource["permissions"];
  },
): AdminAccessActor {
  return {
    id: user.id,
    adminAttribute: user.role === "admin" ? "admin" : "user",
    banned: Boolean(user.banned),
    mustChangePassword: user.mustChangePassword,
    roles: user.accessRoleAssignments.map(({ role }) =>
      replacement && role.id === replacement.roleId
        ? { ...role, permissions: replacement.permissions }
        : role,
    ),
  };
}

async function lockRecoveryAdminMutex(
  prisma: AdminAccessTransaction,
) {
  // Global advisory lock always precedes the recovery-role row lock. Deploy
  // rollback uses the same advisory key across the complete traffic switch.
  await lockAdminAccessMutationTransaction(prisma);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "admin_access_roles"
    WHERE "id" = ${FULL_ACCESS_ROLE_ID}
    FOR UPDATE
  `);
  if (rows.length !== 1) throw new Error("FULL_ACCESS system role is missing.");
}

async function assertRecoveryAdminExists(
  prisma: AdminAccessTransaction,
  errorCode: string = ADMIN_ROLE_ERROR_CODES.lastRecoveryAdmin,
) {
  const candidates = await prisma.user.findMany({
    where: {
      role: "admin",
      OR: [{ banned: false }, { banned: null }],
      accessRoleAssignments: {
        some: { role: { systemKey: "FULL_ACCESS" } },
      },
    },
    select: {
      accessRoleAssignments: {
        select: {
          role: {
            select: {
              systemKey: true,
              permissions: {
                where: { effect: "DENY" },
                select: { resourceKey: true, action: true },
              },
            },
          },
        },
      },
    },
  });

  const hasRecoveryAdmin = candidates.some((candidate) =>
    candidate.accessRoleAssignments.every(({ role }) =>
      role.systemKey === "FULL_ACCESS"
        ? true
        : role.permissions.every(
            (permission) =>
              !CRITICAL_RECOVERY_CELLS.some(
                ([resourceKey, action]) =>
                  resourceKey === permission.resourceKey &&
                  action === permission.action,
              ),
          ),
    ),
  );
  if (!hasRecoveryAdmin) throw conflict(errorCode);
}

function conflict(code: string) {
  return new AdminAccessServiceError(code, 409);
}

function rethrowKnownPrismaError(error: unknown): never {
  if (error instanceof AdminAccessServiceError) throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw conflict(ADMIN_ROLE_ERROR_CODES.nameConflict);
  }
  throw error;
}
