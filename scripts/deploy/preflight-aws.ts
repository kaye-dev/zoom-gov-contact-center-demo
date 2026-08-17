import {
  getProfileFromEnvironment,
  loadDeploymentContextFromStdin,
  MissingDeploymentParametersError,
} from "./lib/aws-config";
import { SecretRegistry } from "./lib/process";

const MAX_CONTEXT_BYTES = 1024 * 1024;

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_CONTEXT_BYTES) {
      throw new Error("The SSM deployment context exceeds the size limit.");
    }
    chunks.push(buffer);
  }
  if (length === 0) {
    throw new Error("The SSM deployment context was not provided on stdin.");
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const secrets = new SecretRegistry();
  const profile = getProfileFromEnvironment();
  const accountId = process.env.DEPLOY_AWS_ACCOUNT_ID;
  try {
    if (!accountId) {
      throw new Error("DEPLOY_AWS_ACCOUNT_ID is required for local preflight.");
    }
    const context = loadDeploymentContextFromStdin(
      await readStandardInput(),
      accountId,
      profile,
    );
    secrets.add(
      context.secrets.vercelToken,
      context.secrets.neonApiKey,
      context.secrets.adminPassword,
    );
    console.log(
      `AWS deployment settings verified for profile '${profile ?? "OIDC"}'.`,
    );
  } catch (error) {
    if (error instanceof MissingDeploymentParametersError) {
      const profileName = error.profile ?? profile ?? "OIDC";
      console.error(
        `AWS profile '${profileName}' のデプロイ設定が不足しています。`,
      );
      console.error("不足している SSM parameter:");
      for (const name of error.missingParameterNames) {
        console.error(`  ${name}`);
      }
      console.error("");
      console.error("次を実行して初期設定してください:");
      console.error(`  ./setup-deploy-aws.sh --profile ${profileName}`);
      console.error("");
      console.error(
        "Production環境変数更新、DB migration、Production deployは開始されていません。",
      );
      process.exitCode = error.exitCode;
      return;
    }
    console.error(
      secrets.redact(
        error instanceof Error ? error.message : "AWS deployment preflight failed.",
      ),
    );
    process.exitCode = 1;
  }
}

void main();
