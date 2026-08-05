import { getAwsIdentity, getStackOutput } from "./lib/aws";
import { resolveAwsRuntimeConfig } from "./lib/config";

function usage(): never {
  throw new Error(
    "Usage: aws-context.ts identity | stack-output <stack-name> <output-key>",
  );
}

function main(): void {
  const [command, ...arguments_] = process.argv.slice(2);
  const config = resolveAwsRuntimeConfig();

  if (command === "identity" && arguments_.length === 0) {
    const identity = getAwsIdentity(config);
    console.log(`AWS account: ${identity.account}`);
    console.log(`AWS principal: ${identity.arn}`);
    console.log(`AWS region: ${config.region}`);
    if (config.profile) {
      console.log(`AWS profile: ${config.profile}`);
    }
    return;
  }

  if (command === "stack-output" && arguments_.length === 2) {
    console.log(getStackOutput(config, arguments_[0], arguments_[1]));
    return;
  }

  usage();
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "AWS command failed.");
  process.exitCode = 1;
}
