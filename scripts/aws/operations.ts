import { resolveAwsRuntimeConfig } from "./lib/config";
import {
  invokeOperationsLambda,
  validateMigrationStatus,
} from "./lib/operations";

export const PENDING_MIGRATION_EXIT_CODE = 10;

function printOperationMessage(message: string | undefined): void {
  if (message?.trim()) {
    console.log(message.trim());
  }
}

function main(): void {
  const [command, ...extraArguments] = process.argv.slice(2);
  if (extraArguments.length > 0) {
    throw new Error(`Unexpected operations arguments: ${extraArguments.join(" ")}`);
  }

  const config = resolveAwsRuntimeConfig();

  if (command === "migration-status") {
    const result = invokeOperationsLambda(config, {
      action: "migration-status",
    });
    const status = validateMigrationStatus(result);
    printOperationMessage(result.message);

    if (status === "pending") {
      console.error("Pending Prisma migrations were detected:");
      for (const migration of result.pendingMigrations ?? []) {
        console.error(`- ${migration}`);
      }
      process.exitCode = PENDING_MIGRATION_EXIT_CODE;
      return;
    }

    console.log("Prisma migrations are up to date.");
    return;
  }

  if (command === "migration-deploy") {
    const result = invokeOperationsLambda(config, {
      action: "migration-deploy",
    });
    printOperationMessage(result.message);
    console.log("Pending Prisma migrations were deployed.");
    return;
  }

  throw new Error(
    "Usage: operations.ts migration-status | migration-deploy",
  );
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Operations Lambda command failed.",
  );
  process.exitCode = 1;
}
