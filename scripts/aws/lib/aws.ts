import {
  awsGlobalArguments,
  type AwsRuntimeConfig,
} from "./config";
import { parseJson, runCommand } from "./process";

export type AwsIdentity = {
  account: string;
  arn: string;
  userId: string;
};

type CloudFormationOutput = {
  OutputKey?: unknown;
  OutputValue?: unknown;
};

type CloudFormationStack = {
  Outputs?: unknown;
};

function assertRecord(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${description} had an unexpected shape.`);
  }

  return value as Record<string, unknown>;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  description: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${description} did not contain a valid ${key}.`);
  }

  return value;
}

export function getAwsIdentity(config: AwsRuntimeConfig): AwsIdentity {
  const result = runCommand("aws", [
    "sts",
    "get-caller-identity",
    ...awsGlobalArguments(config),
    "--output",
    "json",
  ]);

  if (result.status !== 0) {
    throw new Error(
      `AWS identity check failed for region '${config.region}'.\n${result.stderr.trim()}`,
    );
  }

  const identity = assertRecord(
    parseJson(result.stdout, "AWS identity response"),
    "AWS identity response",
  );
  const parsed = {
    account: requiredString(identity, "Account", "AWS identity response"),
    arn: requiredString(identity, "Arn", "AWS identity response"),
    userId: requiredString(identity, "UserId", "AWS identity response"),
  };

  if (
    config.expectedAccountId &&
    parsed.account !== config.expectedAccountId
  ) {
    throw new Error(
      `AWS account mismatch: expected '${config.expectedAccountId}', got '${parsed.account}'.`,
    );
  }

  return parsed;
}

export function findStackOutput(
  response: unknown,
  outputKey: string,
): string | undefined {
  const root = assertRecord(response, "CloudFormation response");
  const stacks = root.Stacks;

  if (!Array.isArray(stacks) || stacks.length !== 1) {
    throw new Error("CloudFormation response did not contain exactly one stack.");
  }

  const stack = assertRecord(stacks[0], "CloudFormation stack") as CloudFormationStack;
  if (!Array.isArray(stack.Outputs)) {
    return undefined;
  }

  const output = stack.Outputs.find((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return false;
    }

    return (candidate as CloudFormationOutput).OutputKey === outputKey;
  }) as CloudFormationOutput | undefined;

  return typeof output?.OutputValue === "string" && output.OutputValue.trim()
    ? output.OutputValue
    : undefined;
}

export function getStackOutput(
  config: AwsRuntimeConfig,
  stackName: string,
  outputKey: string,
): string {
  const result = runCommand("aws", [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
    ...awsGlobalArguments(config),
    "--output",
    "json",
  ]);

  if (result.status !== 0) {
    throw new Error(
      `Could not read CloudFormation stack '${stackName}'.\n${result.stderr.trim()}`,
    );
  }

  const response = parseJson(result.stdout, "CloudFormation response");
  const value = findStackOutput(response, outputKey);

  if (!value) {
    throw new Error(
      `CloudFormation output '${outputKey}' was not found on stack '${stackName}'.`,
    );
  }

  return value;
}
