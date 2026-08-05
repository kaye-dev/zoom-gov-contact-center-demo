import { getAwsIdentity } from "./lib/aws";
import { verifySeedAdminAuthentication } from "./lib/auth-smoke";
import {
  isAffirmativeConfirmation,
  readConfirmationFromTty,
} from "./lib/confirmation";
import { resolveAwsRuntimeConfig } from "./lib/config";
import { applicationUrl } from "./lib/http";
import { invokeOperationsLambda } from "./lib/operations";
import {
  parseSeedAdminArguments,
  readHiddenPassword,
} from "./lib/seed-input";

async function main(): Promise<void> {
  const input = parseSeedAdminArguments(process.argv.slice(2));
  const config = resolveAwsRuntimeConfig();
  const identity = getAwsIdentity(config);

  console.log(`AWS account: ${identity.account}`);
  console.log(`AWS principal: ${identity.arn}`);
  console.log(`AWS region: ${config.region}`);
  if (config.profile) {
    console.log(`AWS profile: ${config.profile}`);
  }

  const confirmation = readConfirmationFromTty(
    `Create or update admin '${input.email}' in the AWS account shown above? [y/N] `,
  );
  if (!isAffirmativeConfirmation(confirmation)) {
    throw new Error("Admin seed cancelled before password input or Lambda invoke.");
  }

  const password = readHiddenPassword("Seed admin password: ");

  if (password.length < 12 || password.length > 128) {
    throw new Error("Seed admin password must be between 12 and 128 characters.");
  }

  const passwordConfirmation = readHiddenPassword("Confirm password: ");
  if (password !== passwordConfirmation) {
    throw new Error("Seed admin passwords did not match.");
  }

  const result = invokeOperationsLambda(config, {
    action: "seed-admin",
    email: input.email,
    name: input.name,
    password,
  });

  console.log(result.message?.trim() || `Seed admin is ready: ${input.email}`);
  await verifySeedAdminAuthentication(
    applicationUrl(config),
    input.email,
    password,
  );
  console.log(
    "Seed admin authentication, admin API/page, and temporary user create/delete verification passed.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Admin seed failed.");
  process.exitCode = 1;
});
