import {
  PutParameterCommand,
  SSMClient,
  type PutParameterCommandInput,
  type PutParameterCommandOutput,
} from "@aws-sdk/client-ssm";
import { fromIni } from "@aws-sdk/credential-providers";

import { DEPLOY_REGION, validateAwsProfileName } from "./aws-config";

export type DeploymentParameterInput = PutParameterCommandInput & {
  Name: string;
  Type: "String" | "SecureString";
  Value: string;
  Tier: "Standard";
  Overwrite: boolean;
};

export interface DeploymentParameterWriter {
  put(
    input: DeploymentParameterInput,
    description: string,
  ): Promise<number>;
  destroy(): void;
}

type SsmClientLike = {
  send(command: PutParameterCommand): Promise<PutParameterCommandOutput>;
  destroy(): void;
};

type SsmClientFactory = (profile: string) => SsmClientLike;

const createSsmClient: SsmClientFactory = (profile) =>
  new SSMClient({
    region: DEPLOY_REGION,
    credentials: fromIni({ profile }),
  });

export function createDeploymentParameterWriter(
  profile: string,
  clientFactory: SsmClientFactory = createSsmClient,
): DeploymentParameterWriter {
  const validatedProfile = validateAwsProfileName(profile);
  const client = clientFactory(validatedProfile);
  return {
    async put(input, description) {
      let response: PutParameterCommandOutput;
      try {
        response = await client.send(new PutParameterCommand(input));
      } catch (error) {
        const code = readSafeAwsErrorCode(error);
        throw new Error(
          `${description} failed (${code}). Verify the selected AWS identity, session, region, IAM permissions, and KMS key policy.`,
        );
      }
      if (!Number.isSafeInteger(response.Version) || (response.Version ?? 0) < 1) {
        throw new Error("SSM PutParameter did not return a valid version.");
      }
      return response.Version as number;
    },
    destroy() {
      client.destroy();
    },
  };
}

function readSafeAwsErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string" &&
    /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(error.name)
  ) {
    return error.name;
  }
  return "UnknownAwsError";
}
