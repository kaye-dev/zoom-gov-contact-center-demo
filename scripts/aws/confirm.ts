import {
  isAffirmativeConfirmation,
  readConfirmationFromTty,
} from "./lib/confirmation";

function main(): void {
  const [confirmation, ...extraArguments] = process.argv.slice(2);
  if (extraArguments.length > 0) {
    throw new Error("Usage: confirm.ts deployment|changes|migration");
  }

  const prompt =
    confirmation === "deployment"
      ? "Deploy to the AWS account and region shown above? [y/N] "
      : confirmation === "changes"
        ? "Review the CDK diff above. Apply these changes, including any replacement or deletion? [y/N] "
      : confirmation === "migration"
        ? "Pending Prisma migrations detected. Deploy them now? [y/N] "
        : undefined;

  if (!prompt) {
    throw new Error("Usage: confirm.ts deployment|changes|migration");
  }

  const answer = readConfirmationFromTty(prompt);
  if (!isAffirmativeConfirmation(answer)) {
    throw new Error(
      confirmation === "migration"
        ? "Migration deploy declined. Web stack deployment was not started."
        : confirmation === "changes"
          ? "CDK changes were declined. No stack changes were started."
          : "AWS deployment cancelled before any stack changes.",
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Confirmation failed.");
  process.exitCode = 1;
}
