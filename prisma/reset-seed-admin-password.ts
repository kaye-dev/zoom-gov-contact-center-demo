import {
  SeedAdminOperationError,
  resetSeedAdminPassword,
  validateLocalSeedAdminPasswordResetEnvironment,
} from "./seed-admin-state";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
} from "../lib/server/prisma";

async function main() {
  const input = validateLocalSeedAdminPasswordResetEnvironment(process.env);
  const database = createDatabaseContext();
  try {
    await connectDatabaseWithRetry(database.prisma);
    const result = await resetSeedAdminPassword(database.prisma, input);
    console.log(`Seed admin password reset: ${result.email}`);
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof SeedAdminOperationError
      ? error.message
      : "Seed admin password reset failed.",
  );
  process.exitCode = 1;
});
