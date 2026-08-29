import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { ADMIN_RESOURCE_CATALOG } from "../../../lib/admin-access/catalog";
import type { AdminAccessAction } from "../../../lib/admin-access/types";
import { Prisma } from "../../../lib/generated/prisma/client";
import {
  assertAdminAccessMutationFreeze,
  assertAdminAccessSessionLock,
  freezeAdminAccessMutations,
  inspectSettledAdminAccessMutationState,
  lockAdminAccessMutationTransaction,
  unfreezeAdminAccessMutations,
  type AdminAccessSessionLock,
  type AdminAccessMutationState,
} from "../../../lib/server/admin-access/mutation-lock";
import { createDatabaseContext } from "../../../lib/server/prisma";

const FULL_ACCESS_ROLE_ID = "system-full-access";
const SUPPORTED_PERMISSION_CELLS = new Set(
  ADMIN_RESOURCE_CATALOG.flatMap((resource) =>
    resource.supportedActions.map(
      (action) => `${resource.key}\0${action}`,
    ),
  ),
);

export type LegacyRollbackCustomDeny = {
  roleId: string;
  resourceKey: string;
  action: AdminAccessAction;
};

export type LegacyRollbackAdminSnapshot = {
  id: string;
  email: string;
  name: string;
  banned: boolean | null;
  mustChangePassword: boolean;
  hasCredential: boolean;
  adminAccessRoleRevision: number;
  accessRoleIds: string[];
  hasFullAccess: boolean;
  customDenyPermissions: LegacyRollbackCustomDeny[];
};

export type LegacyRollbackAdminPlan = {
  admins: LegacyRollbackAdminSnapshot[];
};

export type AdminSnapshot = {
  exists: boolean;
  id?: string;
  email: string;
  name?: string;
  role?: string | null;
  banned?: boolean | null;
  hasCredential?: boolean;
  adminAccessRoleRevision?: number;
  accessRoleIds?: string[];
};

export type AdminInput = {
  email: string;
  name: string;
  password: string;
};

export function validateAdminInput(input: AdminInput): AdminInput {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("The administrator email address is invalid.");
  }
  if (!name) {
    throw new Error("The administrator name must not be empty.");
  }
  if (input.password.length < 12 || input.password.length > 128) {
    throw new Error("The administrator password must be 12 to 128 characters.");
  }
  return { email, name, password: input.password };
}

export async function inspectAdmin(
  pooledUrl: string,
  emailValue: string,
): Promise<AdminSnapshot> {
  const email = emailValue.trim().toLowerCase();
  const database = createDatabaseContext({
    NODE_ENV: "production",
    DATABASE_URL: pooledUrl,
  });
  try {
    const user = await database.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        banned: true,
        adminAccessRoleRevision: true,
        accessRoleAssignments: {
          orderBy: { roleId: "asc" },
          select: { roleId: true },
        },
        accounts: {
          where: { providerId: "credential" },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user) {
      return { exists: false, email };
    }
    return {
      exists: true,
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      banned: user.banned,
      hasCredential: user.accounts.length > 0,
      adminAccessRoleRevision: user.adminAccessRoleRevision,
      accessRoleIds: user.accessRoleAssignments.map(({ roleId }) => roleId),
    };
  } finally {
    await database.close();
  }
}

export async function provisionAdmin(
  pooledUrl: string,
  rawInput: AdminInput,
  expected: AdminSnapshot,
): Promise<"created" | "updated"> {
  const input = validateAdminInput(rawInput);
  if (input.email !== expected.email) {
    throw new Error("Administrator target changed after review.");
  }
  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const database = createDatabaseContext({
    NODE_ENV: "production",
    DATABASE_URL: pooledUrl,
  });

  try {
    return await database.prisma.$transaction(async (transaction) => {
      await lockAdminAccessMutationTransaction(transaction);
      const fullAccessRole = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "admin_access_roles"
        WHERE "id" = ${FULL_ACCESS_ROLE_ID}
          AND "systemKey" = 'FULL_ACCESS'
        FOR UPDATE
      `);
      if (fullAccessRole.length !== 1) {
        throw new Error("FULL_ACCESS system role is missing; no changes were made.");
      }
      const current = await transaction.user.findUnique({
        where: { email: input.email },
        select: {
          id: true,
          name: true,
          role: true,
          banned: true,
          adminAccessRoleRevision: true,
          accessRoleAssignments: {
            orderBy: { roleId: "asc" },
            select: { roleId: true },
          },
          accounts: {
            where: { providerId: "credential" },
            select: { id: true },
            take: 1,
          },
        },
      });

      if (!expected.exists) {
        if (current) {
          throw new Error(
            "Administrator target appeared after review; no changes were made.",
          );
        }
        const userId = randomUUID();
        await transaction.user.create({
          data: {
            id: userId,
            email: input.email,
            name: input.name,
            emailVerified: false,
            createdAt: now,
            updatedAt: now,
            role: "admin",
            banned: false,
            banReason: null,
            banExpires: null,
            mustChangePassword: false,
            temporaryPasswordIssuedAt: null,
            passwordChangedAt: now,
            accounts: {
              create: {
                id: randomUUID(),
                accountId: userId,
                providerId: "credential",
                password: passwordHash,
                createdAt: now,
                updatedAt: now,
              },
            },
          },
        });
        const createdAccess = await transaction.adminAccessRoleAssignment.findMany({
          where: { userId },
          orderBy: { roleId: "asc" },
          select: { roleId: true },
        });
        if (
          createdAccess.length !== 1 ||
          createdAccess[0]?.roleId !== FULL_ACCESS_ROLE_ID
        ) {
          throw new Error(
            "The new administrator did not receive exactly FULL_ACCESS; no changes were made.",
          );
        }
        return "created";
      }

      if (
        !current ||
        current.id !== expected.id ||
        current.name !== expected.name ||
        current.role !== expected.role ||
        current.banned !== expected.banned ||
        current.adminAccessRoleRevision !== expected.adminAccessRoleRevision ||
        current.accessRoleAssignments.map(({ roleId }) => roleId).join("\0") !==
          (expected.accessRoleIds ?? []).join("\0") ||
        (current.accounts.length > 0) !== expected.hasCredential
      ) {
        throw new Error(
          "Administrator state changed after review; no changes were made.",
        );
      }

      await transaction.user.update({
        where: { id: current.id },
        data: {
          name: input.name,
          role: "admin",
          banned: false,
          banReason: null,
          banExpires: null,
          mustChangePassword: false,
          temporaryPasswordIssuedAt: null,
          passwordChangedAt: now,
          updatedAt: now,
        },
      });
      const currentRoleIds = current.accessRoleAssignments.map(({ roleId }) => roleId);
      const accessIsCurrent =
        currentRoleIds.length === 1 && currentRoleIds[0] === FULL_ACCESS_ROLE_ID;
      if (!accessIsCurrent) {
        await transaction.adminAccessRoleAssignment.deleteMany({
          where: {
            userId: current.id,
            roleId: { not: FULL_ACCESS_ROLE_ID },
          },
        });
        if (!currentRoleIds.includes(FULL_ACCESS_ROLE_ID)) {
          await transaction.adminAccessRoleAssignment.create({
            data: { userId: current.id, roleId: FULL_ACCESS_ROLE_ID },
          });
        }
        await transaction.user.update({
          where: { id: current.id },
          data: { adminAccessRoleRevision: { increment: 1 } },
        });
      }
      const updated = await transaction.account.updateMany({
        where: { userId: current.id, providerId: "credential" },
        data: { password: passwordHash, updatedAt: now },
      });
      if (updated.count === 0) {
        await transaction.account.create({
          data: {
            id: randomUUID(),
            accountId: current.id,
            providerId: "credential",
            userId: current.id,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      await transaction.session.deleteMany({ where: { userId: current.id } });
      return "updated";
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } finally {
    await database.close();
  }
}

export async function inspectLegacyRollbackAdmins(
  pooledUrl: string,
): Promise<LegacyRollbackAdminPlan> {
  const database = createDatabaseContext({
    NODE_ENV: "production",
    DATABASE_URL: pooledUrl,
  });
  try {
    return await readLegacyRollbackAdminPlan(database.prisma);
  } finally {
    await database.close();
  }
}

export async function prepareLegacyRollbackAdmins(
  pooledUrl: string,
  expected: LegacyRollbackAdminPlan,
  lock: AdminAccessSessionLock,
  freezeId: string,
): Promise<{ demotedCount: number; revokedSessionCount: number }> {
  assertAdminAccessSessionLock(lock);
  const database = createDatabaseContext({
    NODE_ENV: "production",
    DATABASE_URL: pooledUrl,
  });
  try {
    return await database.prisma.$transaction(async (transaction) => {
      await assertAdminAccessMutationFreeze(transaction, freezeId);
      const fullAccessRole = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "admin_access_roles"
        WHERE "id" = ${FULL_ACCESS_ROLE_ID}
          AND "systemKey" = 'FULL_ACCESS'
        FOR UPDATE
      `);
      if (fullAccessRole.length !== 1) {
        throw new Error(
          "FULL_ACCESS system role is missing; legacy rollback preparation was blocked.",
        );
      }

      const current = await readLegacyRollbackAdminPlan(transaction);
      if (JSON.stringify(current) !== JSON.stringify(expected)) {
        throw new Error(
          "Administrator state changed after rollback preview; no users were changed.",
        );
      }

      const retainedRecoveryAdmins = current.admins.filter(
        (admin) =>
          canRetainLegacyRollbackAdmin(admin) &&
          admin.hasCredential &&
          admin.banned !== true &&
          !admin.mustChangePassword,
      );
      if (retainedRecoveryAdmins.length === 0) {
        throw new Error(
          "Legacy rollback requires at least one password-ready, active FULL_ACCESS administrator without custom DENY permissions.",
        );
      }

      const targetIds = current.admins
        .filter((admin) => !canRetainLegacyRollbackAdmin(admin))
        .map((admin) => admin.id);
      if (targetIds.length === 0) {
        return { demotedCount: 0, revokedSessionCount: 0 };
      }

      const demoted = await transaction.user.updateMany({
        where: { id: { in: targetIds }, role: "admin" },
        data: { role: "user" },
      });
      if (demoted.count !== targetIds.length) {
        throw new Error(
          "The reviewed legacy rollback administrator set could not be demoted atomically.",
        );
      }
      const revoked = await transaction.session.deleteMany({
        where: { userId: { in: targetIds } },
      });
      return {
        demotedCount: demoted.count,
        revokedSessionCount: revoked.count,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } finally {
    await database.close();
  }
}

export async function freezeLegacyRollbackAdminMutations(
  pooledUrl: string,
  lock: AdminAccessSessionLock,
  reason: string,
): Promise<string> {
  assertAdminAccessSessionLock(lock);
  const database = createDatabaseContext({ NODE_ENV: "production", DATABASE_URL: pooledUrl });
  try {
    return await database.prisma.$transaction((transaction) =>
      freezeAdminAccessMutations(transaction, lock, reason),
    );
  } finally {
    await database.close();
  }
}

export async function unfreezeLegacyRollbackAdminMutations(
  pooledUrl: string,
  lock: AdminAccessSessionLock,
  freezeId: string,
): Promise<void> {
  const database = createDatabaseContext({ NODE_ENV: "production", DATABASE_URL: pooledUrl });
  try {
    await database.prisma.$transaction((transaction) =>
      unfreezeAdminAccessMutations(transaction, lock, freezeId),
    );
  } finally {
    await database.close();
  }
}

export async function inspectAdminAccessMutationFreeze(
  pooledUrl: string,
): Promise<AdminAccessMutationState> {
  const database = createDatabaseContext({ NODE_ENV: "production", DATABASE_URL: pooledUrl });
  try {
    try {
      return await database.prisma.$transaction(
        (transaction) => inspectSettledAdminAccessMutationState(transaction),
        { maxWait: 2_000, timeout: 5_000 },
      );
    } catch {
      throw new Error(
        "Administrative mutation freeze state could not be settled safely; recovery is blocked.",
      );
    }
  } finally {
    await database.close();
  }
}

export function assertLegacyRollbackAdminPlanSafe(
  plan: LegacyRollbackAdminPlan,
): void {
  if (plan.admins.some((admin) => !canRetainLegacyRollbackAdmin(admin))) {
    throw new Error(
      "Legacy rollback post-switch audit found an unsafe administrator.",
    );
  }
  if (
    !plan.admins.some(
      (admin) =>
        admin.hasCredential &&
        admin.banned !== true &&
        !admin.mustChangePassword,
    )
  ) {
    throw new Error(
      "Legacy rollback post-switch audit found no active password-ready recovery administrator.",
    );
  }
}

export function renderLegacyRollbackAdminPlan(
  plan: LegacyRollbackAdminPlan,
): string {
  const targets = plan.admins.filter(
    (admin) => !canRetainLegacyRollbackAdmin(admin),
  );
  const retained = plan.admins.filter(canRetainLegacyRollbackAdmin);
  const lines = [
    "Legacy rollback administrator preparation:",
    `Retain as admin (FULL_ACCESS without custom DENY): ${retained.length}`,
    `Demote to user and revoke sessions: ${targets.length}`,
  ];
  for (const admin of targets) {
    const customDenies = admin.customDenyPermissions
      .map(
        ({ roleId, resourceKey, action }) =>
          `${roleId}:${resourceKey}:${action}`,
      )
      .join(",");
    lines.push(
      `- ${admin.email} (${admin.id}); roles=${admin.accessRoleIds.join(",") || "none"}; custom-denies=${customDenies || "none"}`,
    );
  }
  return lines.join("\n");
}

export function canRetainLegacyRollbackAdmin(
  admin: LegacyRollbackAdminSnapshot,
): boolean {
  return admin.hasFullAccess && admin.customDenyPermissions.length === 0;
}

type LegacyRollbackPlanPrisma = Pick<Prisma.TransactionClient, "user">;

async function readLegacyRollbackAdminPlan(
  prisma: LegacyRollbackPlanPrisma,
): Promise<LegacyRollbackAdminPlan> {
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    orderBy: { id: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      banned: true,
      mustChangePassword: true,
      adminAccessRoleRevision: true,
      accounts: {
        where: { providerId: "credential" },
        select: { id: true },
        take: 1,
      },
      accessRoleAssignments: {
        orderBy: { roleId: "asc" },
        select: {
          roleId: true,
          role: {
            select: {
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
  return {
    admins: admins.map(({ accessRoleAssignments, accounts, ...admin }) => ({
      ...admin,
      hasCredential: accounts.length > 0,
      accessRoleIds: accessRoleAssignments.map(({ roleId }) => roleId),
      hasFullAccess: accessRoleAssignments.some(
        ({ role }) => role.systemKey === "FULL_ACCESS",
      ),
      customDenyPermissions: accessRoleAssignments.flatMap(({ roleId, role }) =>
        role.systemKey === null
          ? role.permissions
              .filter(
                ({ resourceKey, action, effect }) =>
                  effect === "DENY" &&
                  SUPPORTED_PERMISSION_CELLS.has(`${resourceKey}\0${action}`),
              )
              .map(({ resourceKey, action }) => ({
                roleId,
                resourceKey,
                action,
              }))
          : [],
      ),
    })),
  };
}

export function renderAdminChanges(
  snapshot: AdminSnapshot,
  name: string,
): string {
  if (!snapshot.exists) {
    return [
      `Create administrator: ${snapshot.email}`,
      `Name: ${name.trim()}`,
      "Role: admin",
      "Access roles: FULL_ACCESS",
      "Banned: false",
      "Password: set from hidden input",
    ].join("\n");
  }
  return [
    `Update existing user: ${snapshot.email}`,
    `Name: ${snapshot.name ?? ""} -> ${name.trim()}`,
    `Role: ${snapshot.role ?? "unset"} -> admin`,
    `Banned: ${snapshot.banned === true ? "true" : "false"} -> false`,
    `Access roles: ${(snapshot.accessRoleIds ?? []).join(", ") || "unset"} -> FULL_ACCESS`,
    `Credential password: ${snapshot.hasCredential ? "replace" : "create"}`,
    "Active sessions: revoke",
  ].join("\n");
}
