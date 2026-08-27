import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ADMIN_RESOURCE_CATALOG } from "../lib/admin-access/catalog";
import type {
  AdminAccessActor,
  AdminAccessPermission,
  AdminAccessRoleSource,
} from "../lib/admin-access/types";
import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  AdminAccessServiceError,
  assertAdminUserCreationAccessRolePermissions,
  assertAdminUserTargetWithinActorAuthority,
  createAdminRole,
  replaceAdminRolePermissions,
  runAuthorizedAdminUserCreation,
  runAuthorizedAdminUserOperation,
} from "../lib/server/admin-access/authority-service";

function accessRole(
  id: string,
  permissions: AdminAccessPermission[],
  systemKey: AdminAccessRoleSource["systemKey"] = null,
): AdminAccessRoleSource {
  return { id, name: id, systemKey, permissions };
}

function actor(
  id: string,
  roles: AdminAccessRoleSource[],
  overrides: Partial<AdminAccessActor> = {},
): AdminAccessActor {
  return {
    id,
    adminAttribute: "admin",
    banned: false,
    mustChangePassword: false,
    roles,
    ...overrides,
  };
}

const usersViewAndUpdate: AdminAccessPermission[] = [
  { resourceKey: "users", action: "VIEW", effect: "ALLOW" },
  { resourceKey: "users", action: "UPDATE", effect: "ALLOW" },
];

const allSupportedAllows: AdminAccessPermission[] =
  ADMIN_RESOURCE_CATALOG.flatMap((resource) =>
    resource.supportedActions.map((action) => ({
      resourceKey: resource.key,
      action,
      effect: "ALLOW" as const,
    })),
  );
const unfrozenMutationState = {
  frozen: false,
  freezeId: null,
  frozenAt: null,
  reason: null,
};

function assertEscalationRejected(operation: () => void) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof AdminAccessServiceError);
    assert.equal(error.code, "PERMISSION_ESCALATION_FORBIDDEN");
    assert.equal(error.status, 403);
    return true;
  });
}

function prismaWithAdminActors(actors: Map<string, AdminAccessActor>) {
  const reads: string[] = [];
  const transaction = {
    $queryRaw: async () => [unfrozenMutationState],
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        reads.push(where.id);
        const source = actors.get(where.id);
        if (!source) return null;
        return {
          id: source.id,
          role: source.adminAttribute,
          banned: source.banned,
          mustChangePassword: source.mustChangePassword,
          accessRoleAssignments: source.roles.map((role) => ({ role })),
        };
      },
    },
  };
  const prisma = {
    $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
      operation(transaction),
  } as unknown as PrismaClient;
  return { prisma, reads };
}

function prismaForAdminUserCreation() {
  const full = accessRole("system-full-access", [], "FULL_ACCESS");
  const noAccess = accessRole("system-no-access", [], "NO_ACCESS");
  const custom = accessRole("custom-viewer", [
    { resourceKey: "roles", action: "VIEW", effect: "ALLOW" },
  ]);
  const roles = new Map(
    [full, noAccess, custom].map((role) => [role.id, role]),
  );
  const users = new Map<
    string,
    { actor: AdminAccessActor; revision: number; roleIds: string[] }
  >([
    [
      "actor",
      {
        actor: actor("actor", [full]),
        revision: 1,
        roleIds: [full.id],
      },
    ],
  ]);
  const events: string[] = [];
  const transaction = {
    $queryRaw: async () => {
      events.push("lock");
      return [unfrozenMutationState];
    },
    adminAccessRole: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        events.push("resolve-roles");
        return where.id.in.flatMap((id) => {
          const role = roles.get(id);
          return role ? [role] : [];
        });
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        events.push(`read:${where.id}`);
        const record = users.get(where.id);
        if (!record) return null;
        return {
          id: record.actor.id,
          role: record.actor.adminAttribute,
          banned: record.actor.banned,
          mustChangePassword: record.actor.mustChangePassword,
          adminAccessRoleRevision: record.revision,
          accessRoleAssignments: record.roleIds.map((roleId) => ({
            roleId,
            role: roles.get(roleId)!,
          })),
        };
      },
      updateMany: async ({
        where,
      }: {
        where: { id: string; adminAccessRoleRevision: number };
      }) => {
        const record = users.get(where.id);
        if (!record || record.revision !== where.adminAccessRoleRevision) {
          return { count: 0 };
        }
        record.revision += 1;
        events.push("increment-revision");
        return { count: 1 };
      },
      findMany: async () =>
        [...users.values()]
          .filter(
            ({ actor: candidate }) =>
              candidate.adminAttribute === "admin" &&
              !candidate.banned &&
              candidate.roles.some((role) => role.systemKey === "FULL_ACCESS"),
          )
          .map(({ actor: candidate }) => ({
            accessRoleAssignments: candidate.roles.map((role) => ({ role })),
          })),
    },
    adminAccessRoleAssignment: {
      deleteMany: async ({
        where,
      }: {
        where: { userId: string; roleId: { in: string[] } };
      }) => {
        const record = users.get(where.userId)!;
        record.roleIds = record.roleIds.filter(
          (roleId) => !where.roleId.in.includes(roleId),
        );
        events.push("delete-assignments");
      },
      createMany: async ({
        data,
      }: {
        data: Array<{ userId: string; roleId: string }>;
      }) => {
        for (const assignment of data) {
          users.get(assignment.userId)!.roleIds.push(assignment.roleId);
        }
        events.push("create-assignments");
      },
    },
  };
  const prisma = {
    $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) => {
      const value = await operation(transaction);
      events.push("commit");
      return value;
    },
  } as unknown as PrismaClient;
  return { prisma, users, roles, events };
}

function prismaForRolePermissionReplacement({
  actorRoles,
  memberRoles,
  recoveryRoles = [accessRole("system-full-access", [], "FULL_ACCESS")],
}: {
  actorRoles: AdminAccessRoleSource[];
  memberRoles: AdminAccessRoleSource[];
  recoveryRoles?: AdminAccessRoleSource[];
}) {
  const events: string[] = [];
  const transaction = {
    $queryRaw: async () => [unfrozenMutationState],
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "actor"
          ? {
              id: "actor",
              role: "admin",
              banned: false,
              mustChangePassword: false,
              accessRoleAssignments: actorRoles.map((role) => ({ role })),
            }
          : null,
      findMany: async ({
        where,
      }: {
        where: {
          accessRoleAssignments: {
            some: { roleId?: string; role?: { systemKey: string } };
          };
        };
      }) => {
        if (where.accessRoleAssignments.some.roleId === "mutable-role") {
          return [
            {
              id: "member",
              role: "admin",
              banned: false,
              mustChangePassword: false,
              accessRoleAssignments: memberRoles.map((role) => ({ role })),
            },
          ];
        }
        return [
          {
            accessRoleAssignments: recoveryRoles.map((role) => ({ role })),
          },
        ];
      },
    },
    adminAccessRole: {
      findUnique: async () => ({
        id: "mutable-role",
        systemKey: null,
        revision: 1,
        _count: { assignments: 1 },
        assignments: [],
      }),
      updateMany: async () => {
        events.push("update-role");
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        id: "mutable-role",
        revision: 2,
        permissions: [],
      }),
    },
    adminAccessRolePermission: {
      deleteMany: async () => undefined,
      createMany: async () => undefined,
    },
  };
  const prisma = {
    $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) =>
      operation(transaction),
  } as unknown as PrismaClient;
  return { prisma, events };
}

test("activating the admin gate cannot give a target permissions outside the actor subset", () => {
  const limitedActor = actor("limited", [
    accessRole("user-editor", usersViewAndUpdate),
  ]);
  const gatedRole = accessRole("gated-delete", [
    { resourceKey: "users", action: "VIEW", effect: "ALLOW" },
    { resourceKey: "users", action: "DELETE", effect: "ALLOW" },
  ]);
  const currentTarget = actor("target", [gatedRole], {
    adminAttribute: "user",
  });
  const proposedTarget = { ...currentTarget, adminAttribute: "admin" as const };

  assertEscalationRejected(() =>
    assertAdminUserTargetWithinActorAuthority(
      limitedActor,
      currentTarget,
      proposedTarget,
    ),
  );
});

test("banned and password-change-pending targets are compared at their potential authority", () => {
  const limitedActor = actor("limited", [
    accessRole("user-editor", usersViewAndUpdate),
  ]);
  const blockedRecoveryAdmin = actor(
    "recovery",
    [accessRole("full", [], "FULL_ACCESS")],
    { banned: true, mustChangePassword: true },
  );

  assertEscalationRejected(() =>
    assertAdminUserTargetWithinActorAuthority(
      limitedActor,
      blockedRecoveryAdmin,
    ),
  );
});

test("sensitive FULL_ACCESS targets require an actor assigned the system role", () => {
  const equivalentCustomActor = actor("custom-full", [
    accessRole("all-current-cells", allSupportedAllows),
  ]);
  const recoveryTarget = actor("recovery", [
    accessRole("full", [], "FULL_ACCESS"),
  ]);

  assertEscalationRejected(() =>
    assertAdminUserTargetWithinActorAuthority(
      equivalentCustomActor,
      recoveryTarget,
      recoveryTarget,
      { requireSystemFullActorForFullAccessTarget: true },
    ),
  );

  const systemFullActor = actor("system-full", [
    accessRole("full", [], "FULL_ACCESS"),
  ]);
  assert.doesNotThrow(() =>
    assertAdminUserTargetWithinActorAuthority(
      systemFullActor,
      recoveryTarget,
      recoveryTarget,
      { requireSystemFullActorForFullAccessTarget: true },
    ),
  );
});

test("creating a user with access roles requires every cross-resource permission", () => {
  const requiredPermissions: AdminAccessPermission[] = [
    { resourceKey: "users", action: "VIEW", effect: "ALLOW" },
    { resourceKey: "users", action: "CREATE", effect: "ALLOW" },
    { resourceKey: "roles", action: "VIEW", effect: "ALLOW" },
    { resourceKey: "role-assignments", action: "VIEW", effect: "ALLOW" },
    { resourceKey: "role-assignments", action: "UPDATE", effect: "ALLOW" },
  ];

  for (const missing of requiredPermissions) {
    const permissions = requiredPermissions.filter(
      ({ resourceKey, action }) =>
        resourceKey !== missing.resourceKey || action !== missing.action,
    );
    assert.throws(
      () =>
        assertAdminUserCreationAccessRolePermissions(
          actor("actor", [accessRole("creator", permissions)]),
        ),
      (error: unknown) => {
        assert.ok(error instanceof AdminAccessServiceError);
        assert.equal(error.status, 403);
        return true;
      },
      `${missing.resourceKey}:${missing.action}`,
    );
  }

  assert.doesNotThrow(() =>
    assertAdminUserCreationAccessRolePermissions(
      actor("actor", [accessRole("creator", requiredPermissions)]),
    ),
  );
});

test("user creation finalizes the canonical role assignment before commit", async () => {
  const { prisma, users, roles, events } = prismaForAdminUserCreation();

  const result = await runAuthorizedAdminUserCreation(
    prisma,
    "actor",
    ["custom-viewer"],
    async () => {
      events.push("create-user");
      const initialRole = roles.get("system-full-access")!;
      users.set("new-user", {
        actor: actor("new-user", [initialRole], {
          mustChangePassword: true,
        }),
        revision: 1,
        roleIds: [initialRole.id],
      });
      return { userId: "new-user", value: { id: "new-user" } };
    },
  );

  assert.deepEqual(result, { id: "new-user" });
  assert.deepEqual(users.get("new-user")?.roleIds, ["custom-viewer"]);
  assert.equal(users.get("new-user")?.revision, 2);
  assert.ok(events.indexOf("create-user") < events.indexOf("delete-assignments"));
  assert.ok(events.indexOf("create-assignments") < events.indexOf("commit"));
});

test("empty or omitted role selections need no role-assignment authority", async () => {
  const roleSelections: Array<string[] | undefined> = [undefined, []];
  for (const requestedRoleIds of roleSelections) {
    const { prisma, users, roles } = prismaForAdminUserCreation();
    const creator = users.get("actor")!;
    creator.actor = actor("actor", [
      accessRole("user-creator", [
        { resourceKey: "users", action: "VIEW", effect: "ALLOW" },
        { resourceKey: "users", action: "CREATE", effect: "ALLOW" },
      ]),
    ]);
    creator.roleIds = ["user-creator"];
    roles.set("user-creator", creator.actor.roles[0]);
    const recoveryRole = roles.get("system-full-access")!;
    users.set("recovery", {
      actor: actor("recovery", [recoveryRole]),
      revision: 1,
      roleIds: [recoveryRole.id],
    });

    const result = await runAuthorizedAdminUserCreation(
      prisma,
      "actor",
      requestedRoleIds,
      async () => {
        const initialRole = roles.get("system-no-access")!;
        users.set("new-user", {
          actor: actor("new-user", [initialRole], {
            mustChangePassword: true,
          }),
          revision: 1,
          roleIds: [initialRole.id],
        });
        return { userId: "new-user", value: "created" };
      },
    );

    assert.equal(result, "created");
    assert.deepEqual(users.get("new-user")?.roleIds, ["system-no-access"]);
    assert.equal(users.get("new-user")?.revision, 1);
  }
});

test("invalid role selections fail before the user operation", async () => {
  const { prisma } = prismaForAdminUserCreation();
  let operationCalled = false;

  await assert.rejects(
    runAuthorizedAdminUserCreation(
      prisma,
      "actor",
      ["missing-role"],
      async () => {
        operationCalled = true;
        return { userId: "new-user", value: "created" };
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof AdminAccessServiceError);
      assert.equal(error.status, 400);
      return true;
    },
  );
  assert.equal(operationCalled, false);
});

test("role permission replacement rejects weakening a member above the actor ceiling", async () => {
  const mutableRole = accessRole("mutable-role", [
    { resourceKey: "users", action: "VIEW", effect: "ALLOW" },
    { resourceKey: "users", action: "DELETE", effect: "ALLOW" },
  ]);
  const { prisma, events } = prismaForRolePermissionReplacement({
    actorRoles: [
      accessRole("role-editor", [
        { resourceKey: "roles", action: "VIEW", effect: "ALLOW" },
        { resourceKey: "roles", action: "UPDATE", effect: "ALLOW" },
      ]),
    ],
    memberRoles: [mutableRole],
  });

  await assert.rejects(
    replaceAdminRolePermissions(prisma, "actor", mutableRole.id, 1, []),
    (error: unknown) => {
      assert.ok(error instanceof AdminAccessServiceError);
      assert.equal(error.code, "PERMISSION_ESCALATION_FORBIDDEN");
      assert.equal(error.status, 403);
      return true;
    },
  );
  assert.deepEqual(events, []);
});

test("FULL_ACCESS plus a custom users:CREATE deny is not a recovery administrator", async () => {
  const fullRole = accessRole("system-full-access", [], "FULL_ACCESS");
  const mutableRole = accessRole("mutable-role", []);
  const usersCreateDeny = {
    resourceKey: "users" as const,
    action: "CREATE" as const,
    effect: "DENY" as const,
  };
  const { prisma, events } = prismaForRolePermissionReplacement({
    actorRoles: [accessRole("custom-all", allSupportedAllows)],
    memberRoles: [fullRole, mutableRole],
    recoveryRoles: [
      fullRole,
      { ...mutableRole, permissions: [usersCreateDeny] },
    ],
  });

  await assert.rejects(
    replaceAdminRolePermissions(
      prisma,
      "actor",
      mutableRole.id,
      1,
      [usersCreateDeny],
    ),
    (error: unknown) => {
      assert.ok(error instanceof AdminAccessServiceError);
      assert.equal(error.code, "LAST_RECOVERY_ADMIN");
      assert.equal(error.status, 409);
      return true;
    },
  );
  assert.deepEqual(events, ["update-role"]);
});

test("user operations load actor and target inside the transaction before mutation", async () => {
  const { prisma, reads } = prismaWithAdminActors(
    new Map([
      ["actor", actor("actor", [accessRole("editor", usersViewAndUpdate)])],
      ["target", actor("target", [accessRole("viewer", [usersViewAndUpdate[0]])])],
    ]),
  );
  let operationReads: string[] = [];

  const result = await runAuthorizedAdminUserOperation(
    prisma,
    "actor",
    "target",
    { resourceKey: "users", action: "UPDATE" },
    {},
    async (transaction) => {
      assert.ok(transaction);
      operationReads = [...reads];
      return "updated";
    },
  );

  assert.equal(result, "updated");
  assert.deepEqual(operationReads, ["actor", "target"]);
});

test("user directory omits assignment data unless both read permissions allow it", async () => {
  const routeSource = await readFile(
    new URL("../app/api/[[...route]]/route.ts", import.meta.url),
    "utf8",
  );
  const start = routeSource.indexOf('app.get("/admin/users"');
  const end = routeSource.indexOf('app.post("/admin/users"', start);
  const source = routeSource.slice(start, end);
  const visibilityGuard = source.indexOf("if (!canViewAssignedRoles)");
  const assignmentQuery = source.indexOf("accessRoleAssignments:");

  assert.match(source, /canAdminAccess\(authorization\.actor, "roles", "VIEW"\)/);
  assert.match(
    source,
    /canAdminAccess\(authorization\.actor, "role-assignments", "VIEW"\)/,
  );
  assert.ok(visibilityGuard >= 0 && visibilityGuard < assignmentQuery);
  assert.doesNotMatch(source.slice(0, visibilityGuard), /accessRoleAssignments/);
  assert.doesNotMatch(source.slice(0, visibilityGuard), /assignedRoleIds/);
});

test("user details do not fetch or serialize access roles without both read permissions", async () => {
  const pageSource = await readFile(
    new URL("../app/admin/users/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const visibilityGuard = pageSource.indexOf("if (!canViewAccessRoles)");
  const assignmentQuery = pageSource.indexOf(
    "accessRoleAssignments:",
    visibilityGuard,
  );
  const roleDirectoryQuery = pageSource.indexOf(
    "prisma.adminAccessRole.findMany",
    visibilityGuard,
  );

  assert.match(pageSource, /canAdminAccess\(actor, "roles", "VIEW"\)/);
  assert.match(
    pageSource,
    /canAdminAccess\(actor, "role-assignments", "VIEW"\)/,
  );
  assert.match(
    pageSource,
    /canViewAccessRoles\s*&&\s*canAdminAccess\(actor, "role-assignments", "UPDATE"\)/,
  );
  assert.ok(
    visibilityGuard >= 0 &&
      visibilityGuard < assignmentQuery &&
      visibilityGuard < roleDirectoryQuery,
  );
  assert.doesNotMatch(
    pageSource.slice(0, visibilityGuard),
    /accessRoleAssignments:/,
  );
  assert.match(pageSource, /return \{ user, activeAdminCount, accessRoles: null \}/);

  const viewSource = await readFile(
    new URL(
      "../app/admin/users/[id]/UserDetailsView.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const managedUserType = viewSource.slice(
    viewSource.indexOf("type ManagedUser ="),
    viewSource.indexOf("type AccessRoleOption ="),
  );
  assert.doesNotMatch(managedUserType, /adminAccessRoleRevision/);
  assert.doesNotMatch(managedUserType, /accessRoleAssignments/);
  assert.match(viewSource, /\{accessRoles \? \(/);
  assert.match(viewSource, /accessRoles\.availableRoles\.map/);
  assert.match(viewSource, /systemRoleNames\[role\.systemKey\]/);
  assert.match(
    viewSource,
    /systemRoleDescriptions\[\s*role\.systemKey\s*\]/,
  );
});

test("role and assignment mutations enforce the potentially active authority ceiling", async () => {
  const authoritySource = await readFile(
    new URL(
      "../lib/server/admin-access/authority-service.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const rolePermissionStart = authoritySource.indexOf(
    "export async function replaceAdminRolePermissions",
  );
  const assignmentStart = authoritySource.indexOf(
    "export async function replaceUserAdminAccessRoles",
  );
  const nextAssignmentExport = authoritySource.indexOf(
    "export async function",
    assignmentStart + 1,
  );
  const rolePermissionSource = authoritySource.slice(
    rolePermissionStart,
    assignmentStart,
  );
  const assignmentSource = authoritySource.slice(
    assignmentStart,
    nextAssignmentExport,
  );

  assert.match(
    rolePermissionSource,
    /assertAdminUserTargetWithinActorAuthority\(\s*actor,\s*currentActor,\s*proposedActor,/,
  );
  assert.match(assignmentSource, /const currentTarget: AdminAccessActor/);
  assert.match(
    assignmentSource,
    /assertAdminUserTargetWithinActorAuthority\(\s*actor,\s*currentTarget,\s*proposedTarget,/,
  );
  assert.match(
    assignmentSource,
    /requireSystemFullActorForFullAccessTarget: true/,
  );
});

test("role creation is rejected while administrative mutations are frozen", async () => {
  let createCalled = false;
  let rawReads = 0;
  const prisma = {
    $transaction: async <T>(operation: (tx: unknown) => Promise<T>) =>
      operation({
        $queryRaw: async () => {
          rawReads += 1;
          return rawReads === 1
            ? []
            : [{
                frozen: true,
                freezeId: "freeze-create-role",
                frozenAt: new Date("2026-08-28T00:00:00Z"),
                reason: "rollback",
              }];
        },
        adminAccessRole: {
          create: async () => {
            createCalled = true;
            return {};
          },
        },
      }),
  } as unknown as PrismaClient;

  await assert.rejects(
    createAdminRole(prisma, "actor", {
      name: "Blocked role",
      nameKey: "blocked role",
      description: null,
    }),
    /mutations are frozen/,
  );
  assert.equal(createCalled, false);
});

test("user and password routes invoke the DB-fresh authority boundary", async () => {
  const routeSource = await readFile(
    new URL("../app/api/[[...route]]/route.ts", import.meta.url),
    "utf8",
  );
  const createBoundary = routeSource.indexOf(
    "runAuthorizedAdminUserCreation(",
  );
  const createUser = routeSource.indexOf(
    "createAuth(transaction).api.createUser({",
  );
  assert.ok(createBoundary >= 0 && createBoundary < createUser);
  assert.doesNotMatch(routeSource, /auth\.api\.removeUser/);
  assert.doesNotMatch(routeSource, /ensureNewUserNoAccess/);
  assert.equal(
    routeSource.match(/runAuthorizedAdminUserOperation\(/g)?.length,
    3,
  );
  assert.equal(
    routeSource.match(/createAuth\(transaction\)/g)?.length,
    4,
  );
  assert.match(routeSource, /transactionAuth\.api\.setUserPassword/);
  assert.match(routeSource, /transactionAuth\.api\.revokeUserSessions/);

  const authoritySource = await readFile(
    new URL(
      "../lib/server/admin-access/authority-service.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const creationStart = authoritySource.indexOf(
    "export async function runAuthorizedAdminUserCreation",
  );
  const operationStart = authoritySource.indexOf(
    "const result = await operation(tx)",
    creationStart,
  );
  const finalizationStart = authoritySource.indexOf(
    "await finalizeNewUserAdminAccessRoles(",
    creationStart,
  );
  assert.ok(
    creationStart >= 0 &&
      operationStart > creationStart &&
      finalizationStart > operationStart,
  );
  for (const functionName of [
    "updateProtectedAdminUserRole",
    "suspendProtectedAdminUser",
    "reactivateAdminUser",
    "deleteProtectedAdminUser",
  ]) {
    const start = authoritySource.indexOf(`export async function ${functionName}`);
    const nextExport = authoritySource.indexOf("export async function", start + 1);
    const source = authoritySource.slice(
      start,
      nextExport === -1 ? undefined : nextExport,
    );
    assert.match(source, /requireManageableAdminUserTarget\(/, functionName);
  }
});
