import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { createDatabaseContext } from "../../../lib/server/prisma";

export type AdminSnapshot = {
  exists: boolean;
  id?: string;
  email: string;
  name?: string;
  role?: string | null;
  banned?: boolean | null;
  hasCredential?: boolean;
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
      const current = await transaction.user.findUnique({
        where: { email: input.email },
        select: {
          id: true,
          name: true,
          role: true,
          banned: true,
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
        return "created";
      }

      if (
        !current ||
        current.id !== expected.id ||
        current.name !== expected.name ||
        current.role !== expected.role ||
        current.banned !== expected.banned ||
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
    });
  } finally {
    await database.close();
  }
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
      "Banned: false",
      "Password: set from hidden input",
    ].join("\n");
  }
  return [
    `Update existing user: ${snapshot.email}`,
    `Name: ${snapshot.name ?? ""} -> ${name.trim()}`,
    `Role: ${snapshot.role ?? "unset"} -> admin`,
    `Banned: ${snapshot.banned === true ? "true" : "false"} -> false`,
    `Credential password: ${snapshot.hasCredential ? "replace" : "create"}`,
    "Active sessions: revoke",
  ].join("\n");
}
