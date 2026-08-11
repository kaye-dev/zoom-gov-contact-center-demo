import { createAuth } from "../lib/auth";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
} from "../lib/server/prisma";

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
    const auth = createAuth(database.prisma, {
      baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    });
    const existingUser = await database.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      await database.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name,
          role: "admin",
          banned: false,
          banReason: null,
          banExpires: null,
          mustChangePassword: false,
          passwordChangedAt,
        },
      });
      console.log(`Seed admin exists: ${email}`);
      return;
    }

    await auth.api.createUser({
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

    console.log(`Seed admin created: ${email}`);
  } finally {
    await database.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
