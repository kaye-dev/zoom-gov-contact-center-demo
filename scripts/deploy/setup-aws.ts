import { resolve } from "node:path";

import { TtyPrompter } from "./lib/input";
import { parseAwsSetupArguments, runAwsSetup } from "./lib/aws-setup";
import { createDeploymentParameterWriter } from "./lib/aws-parameter-writer";
import { SecretRegistry, SystemCommandRunner } from "./lib/process";

async function main(): Promise<void> {
  const secrets = new SecretRegistry();
  const runner = new SystemCommandRunner(secrets, resolve("."));
  let parameterWriter: ReturnType<typeof createDeploymentParameterWriter> | undefined;
  try {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error(
        "setup-deploy-aws.sh must be run directly from an interactive terminal.",
      );
    }
    const options = parseAwsSetupArguments(process.argv.slice(2));
    parameterWriter = createDeploymentParameterWriter(options.profile);
    await runAwsSetup(
      runner,
      new TtyPrompter(),
      secrets,
      options,
      globalThis.fetch,
      parameterWriter,
    );
  } catch (error) {
    console.error(
      secrets.redact(
        error instanceof Error ? error.message : "AWS deployment setup failed.",
      ),
    );
    process.exitCode = 1;
  } finally {
    parameterWriter?.destroy();
  }
}

void main();
