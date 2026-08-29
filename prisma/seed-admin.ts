import { createAuth } from "../lib/auth";
import { Prisma } from "../lib/generated/prisma/client";
import { lockAdminAccessMutationTransaction } from "../lib/server/admin-access/mutation-lock";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
} from "../lib/server/prisma";

const FULL_ACCESS_ROLE_ID = "system-full-access";

const requiredEnv = [
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
  "SEED_ADMIN_NAME",
] as const;

async function main() {
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing seed admin env: ${missing.join(", ")}`);
  }

  const email = process.env.SEED_ADMIN_EMAIL!.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD!;
  const name = process.env.SEED_ADMIN_NAME!.trim();
  const passwordChangedAt = new Date();
  const database = createDatabaseContext();

  try {
    await connectDatabaseWithRetry(database.prisma);
    const result = await database.prisma.$transaction(async (transaction) => {
      await lockAdminAccessMutationTransaction(transaction);
      await lockSeedFullAccessRole(transaction);
      const existingUser = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        const current = await transaction.user.findUniqueOrThrow({
          where: { id: existingUser.id },
          select: {
            accessRoleAssignments: {
              orderBy: { roleId: "asc" },
              select: { roleId: true },
            },
          },
        });
        await transaction.user.update({
          where: { id: existingUser.id },
          data: {
            name,
            role: "admin",
            banned: false,
            banReason: null,
            banExpires: null,
            mustChangePassword: false,
            temporaryPasswordIssuedAt: null,
            passwordChangedAt,
          },
        });

        const roleIds = current.accessRoleAssignments.map(({ roleId }) => roleId);
        if (roleIds.length !== 1 || roleIds[0] !== FULL_ACCESS_ROLE_ID) {
          await transaction.adminAccessRoleAssignment.deleteMany({
            where: {
              userId: existingUser.id,
              roleId: { not: FULL_ACCESS_ROLE_ID },
            },
          });
          if (!roleIds.includes(FULL_ACCESS_ROLE_ID)) {
            await transaction.adminAccessRoleAssignment.create({
              data: { userId: existingUser.id, roleId: FULL_ACCESS_ROLE_ID },
            });
          }
          await transaction.user.update({
            where: { id: existingUser.id },
            data: { adminAccessRoleRevision: { increment: 1 } },
          });
        }
        return "exists" as const;
      }

      const created = await createAuth(transaction, {
        baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      }).api.createUser({
        body: {
          name,
          email,
          password,
          role: "admin",
          data: {
            mustChangePassword: false,
            passwordChangedAt,
          },
        },
      });
      await assertSeedAdminFullAccess(transaction, created.user.id);
      return "created" as const;
    });

    console.log(`Seed admin ${result}: ${email}`);
  } finally {
    await database.close();
  }
}

type SeedAdminPrisma = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "user"
>;

async function lockSeedFullAccessRole(prisma: SeedAdminPrisma) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "admin_access_roles"
    WHERE "id" = ${FULL_ACCESS_ROLE_ID}
      AND "systemKey" = 'FULL_ACCESS'
    FOR UPDATE
  `);
  if (rows.length !== 1) {
    throw new Error("FULL_ACCESS system role is missing; seed was not applied.");
  }
}

async function assertSeedAdminFullAccess(
  prisma: Pick<Prisma.TransactionClient, "user">,
  userId: string,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      accessRoleAssignments: {
        orderBy: { roleId: "asc" },
        select: { roleId: true, role: { select: { systemKey: true } } },
      },
    },
  });
  if (
    user.accessRoleAssignments.length !== 1 ||
    user.accessRoleAssignments[0]?.roleId !== FULL_ACCESS_ROLE_ID ||
    user.accessRoleAssignments[0]?.role.systemKey !== "FULL_ACCESS"
  ) {
    throw new Error("The seeded administrator did not receive exactly FULL_ACCESS.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
