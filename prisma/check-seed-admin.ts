import {
  SeedAdminOperationError,
  inspectSeedAdmin,
  normalizeSeedAdminEmail,
} from "./seed-admin-state";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
} from "../lib/server/prisma";

async function main() {
  const email = normalizeSeedAdminEmail(process.env.SEED_ADMIN_EMAIL ?? "");
  if (!email) {
    throw new SeedAdminOperationError("SEED_ADMIN_EMAIL is required.");
  }

  const database = createDatabaseContext();
  try {
    await connectDatabaseWithRetry(database.prisma);
    console.log(JSON.stringify(await inspectSeedAdmin(database.prisma, email)));
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof SeedAdminOperationError
      ? error.message
      : "Seed admin check failed.",
  );
  process.exitCode = 1;
});
