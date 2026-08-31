import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { Prisma, PrismaClient } from "../lib/generated/prisma/client";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../lib/password-policy";
import { lockAdminAccessMutationTransaction } from "../lib/server/admin-access/mutation-lock";

export const FULL_ACCESS_ROLE_ID = "system-full-access";

const LOCAL_DATABASE_HOSTS = new Set([
  "db",
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

export type SeedAdminCheck = {
  email: string;
  status: "MISSING" | "PRESENT_STANDARD" | "PRESENT_NONSTANDARD";
  credentialPresent: boolean;
  role: string | null;
  banned: boolean;
  mustChangePassword: boolean;
  accessRoleIds: string[];
};

export class SeedAdminOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedAdminOperationError";
  }
}

export function normalizeSeedAdminEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function inspectSeedAdmin(
  prisma: Pick<Prisma.TransactionClient, "user">,
  emailValue: string,
): Promise<SeedAdminCheck> {
  const email = normalizeSeedAdminEmail(emailValue);
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      role: true,
      banned: true,
      mustChangePassword: true,
      accounts: {
        where: { providerId: "credential" },
        select: { id: true },
        take: 1,
      },
      accessRoleAssignments: {
        orderBy: { roleId: "asc" },
        select: { roleId: true },
      },
    },
  });

  if (!user) {
    return {
      email,
      status: "MISSING",
      credentialPresent: false,
      role: null,
      banned: false,
      mustChangePassword: false,
      accessRoleIds: [],
    };
  }

  const credentialPresent = user.accounts.length > 0;
  const accessRoleIds = user.accessRoleAssignments.map(({ roleId }) => roleId);
  const standard =
    credentialPresent &&
    user.role === "admin" &&
    user.banned !== true &&
    user.mustChangePassword === false &&
    accessRoleIds.length === 1 &&
    accessRoleIds[0] === FULL_ACCESS_ROLE_ID;

  return {
    email,
    status: standard ? "PRESENT_STANDARD" : "PRESENT_NONSTANDARD",
    credentialPresent,
    role: user.role,
    banned: user.banned === true,
    mustChangePassword: user.mustChangePassword,
    accessRoleIds,
  };
}

type SeedAdminRolePrisma = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "user"
>;

export async function lockSeedFullAccessRole(prisma: SeedAdminRolePrisma) {
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

export async function assertSeedAdminFullAccess(
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

export type LocalSeedAdminPasswordResetInput = {
  email: string;
  password: string;
};

export function validateLocalSeedAdminPasswordResetEnvironment(
  environment: NodeJS.ProcessEnv,
): LocalSeedAdminPasswordResetInput {
  if (environment.NODE_ENV !== "development") {
    throw new SeedAdminOperationError(
      "Seed admin password reset requires NODE_ENV=development.",
    );
  }
  if (environment.CONFIRM_LOCAL_SEED_ADMIN_PASSWORD_RESET !== "1") {
    throw new SeedAdminOperationError(
      "Seed admin password reset requires CONFIRM_LOCAL_SEED_ADMIN_PASSWORD_RESET=1.",
    );
  }

  const email = normalizeSeedAdminEmail(environment.SEED_ADMIN_EMAIL ?? "");
  const password = environment.SEED_ADMIN_PASSWORD ?? "";
  if (!email) {
    throw new SeedAdminOperationError("SEED_ADMIN_EMAIL is required.");
  }
  if (!password) {
    throw new SeedAdminOperationError("SEED_ADMIN_PASSWORD is required.");
  }
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new SeedAdminOperationError(
      `SEED_ADMIN_PASSWORD must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(environment.DATABASE_URL ?? "");
  } catch {
    throw new SeedAdminOperationError("DATABASE_URL must be a valid local PostgreSQL URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname)
  ) {
    throw new SeedAdminOperationError(
      "Seed admin password reset is restricted to the local development database.",
    );
  }

  return { email, password };
}

export async function resetSeedAdminPassword(
  prisma: Pick<PrismaClient, "$transaction">,
  input: LocalSeedAdminPasswordResetInput,
) {
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  await prisma.$transaction(
    async (transaction) => {
      await lockAdminAccessMutationTransaction(transaction);
      const user = await transaction.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (!user) {
        throw new SeedAdminOperationError(
          "Seed administrator does not exist; no password was changed.",
        );
      }

      const credentials = await transaction.account.findMany({
        where: { userId: user.id, providerId: "credential" },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      if (credentials.length === 0) {
        await transaction.account.create({
          data: {
            id: randomUUID(),
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        await transaction.account.updateMany({
          where: { id: { in: credentials.map(({ id }) => id) } },
          data: { password: passwordHash, updatedAt: now },
        });
      }

      await transaction.user.update({
        where: { id: user.id },
        data: {
          mustChangePassword: false,
          temporaryPasswordIssuedAt: null,
          passwordChangedAt: now,
        },
      });
      await transaction.session.deleteMany({ where: { userId: user.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return { email: input.email };
}
