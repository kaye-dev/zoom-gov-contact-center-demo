import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AwsDeploymentAccessError,
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
  DEPLOY_CONFIG_PARAMETER,
  DEPLOY_CONTEXT_COMPLETION_MARKER,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_PARAMETER_NAMES,
  DEPLOY_REGION,
  DEPLOY_VERCEL_TOKEN_PARAMETER,
  getProfileFromEnvironment,
  InvalidDeploymentConfigurationError,
  loadDeploymentContext,
  loadDeploymentContextFromStdin,
  MissingDeploymentParametersError,
  parseStoredDeploymentConfig,
  type StoredDeploymentConfig,
} from "../lib/aws-config";
import { parseAwsSetupArguments } from "../lib/aws-setup";
import type {
  CommandOptions,
  CommandResult,
  CommandRunner,
} from "../lib/process";

const accountId = "123456789012";
const kmsKeyArn =
  `arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/12345678-1234-1234-1234-123456789012`;

const validConfig: StoredDeploymentConfig = {
  schemaVersion: 1,
  policyVersion: "demo-v1",
  aws: { accountId, region: DEPLOY_REGION },
  vercel: {
    orgId: "team_abc123",
    projectId: "prj_abc123",
    projectName: "zoom-gov-contact-center-demo",
    canonicalOrigin: "https://example.com",
    expectedPlan: "hobby",
  },
  neon: {
    projectId: "quiet-rain-12345678",
    projectName: "zoom-gov-contact-center-demo",
    branchId: "br-muddy-rain-12345678",
    databaseName: "neondb",
    roleName: "neondb_owner",
    regionId: "aws-ap-southeast-1",
    expectedPlan: "free",
  },
  admin: { email: "admin@example.com" },
  kmsKeyArn,
  secretVersions: {
    vercelToken: 4,
    neonApiKey: 5,
    adminPassword: 6,
  },
};

const parameterResponse = (invalid: readonly string[] = []) => ({
  Parameters: [
    {
      Name: DEPLOY_CONFIG_PARAMETER,
      Type: "String",
      Value: JSON.stringify(validConfig),
      Version: 3,
    },
    {
      Name: DEPLOY_VERCEL_TOKEN_PARAMETER,
      Type: "SecureString",
      Value: "vercel-secret-value",
      Version: 4,
    },
    {
      Name: DEPLOY_NEON_API_KEY_PARAMETER,
      Type: "SecureString",
      Value: "neon-secret-value",
      Version: 5,
    },
    {
      Name: DEPLOY_ADMIN_PASSWORD_PARAMETER,
      Type: "SecureString",
      Value: "admin-secret-value",
      Version: 6,
    },
  ].filter(
    (parameter) => !invalid.includes(parameter.Name),
  ),
  InvalidParameters: [...invalid],
});

class RecordingRunner implements CommandRunner {
  readonly calls: Array<{
    command: string;
    arguments_: readonly string[];
    options?: CommandOptions;
  }> = [];

  constructor(
    private readonly implementation: (
      command: string,
      arguments_: readonly string[],
      options?: CommandOptions,
    ) => CommandResult,
  ) {}

  run(
    command: string,
    arguments_: readonly string[],
    options?: CommandOptions,
  ): CommandResult {
    this.calls.push({ command, arguments_, options });
    return this.implementation(command, arguments_, options);
  }
}

const success = (value: unknown): CommandResult => ({
  status: 0,
  stdout: JSON.stringify(value),
  stderr: "",
});

function createSuccessfulRunner(): RecordingRunner {
  return new RecordingRunner((_command, arguments_) => {
    if (arguments_[0] === "sts") {
      return success({ Account: accountId, Arn: "arn:aws:iam::123456789012:user/test" });
    }
    if (arguments_[0] === "ssm" && arguments_[1] === "get-parameters") {
      return success(parameterResponse());
    }
    throw new Error(`Unexpected AWS call: ${arguments_.join(" ")}`);
  });
}

test("loadDeploymentContext performs STS then one exact GetParameters call", () => {
  const runner = createSuccessfulRunner();
  const context = loadDeploymentContext(runner, "splai-prd");

  assert.equal(context.profile, "splai-prd");
  assert.equal(context.accountId, accountId);
  assert.deepEqual(context.config, validConfig);
  assert.deepEqual(context.secrets, {
    vercelToken: "vercel-secret-value",
    neonApiKey: "neon-secret-value",
    adminPassword: "admin-secret-value",
  });
  assert.equal(runner.calls.length, 2);
  assert.deepEqual(
    runner.calls.map(({ arguments_ }) => arguments_.slice(0, 2)),
    [
      ["sts", "get-caller-identity"],
      ["ssm", "get-parameters"],
    ],
  );
  const getParameters = runner.calls[1].arguments_;
  const namesIndex = getParameters.indexOf("--names");
  assert.deepEqual(
    getParameters.slice(namesIndex + 1, namesIndex + 1 + DEPLOY_PARAMETER_NAMES.length),
    DEPLOY_PARAMETER_NAMES,
  );
  assert.ok(getParameters.includes("--with-decryption"));
  assert.ok(!getParameters.includes("get-parameters-by-path"));
  assert.deepEqual(getParameters.slice(-4), [
    "--region",
    DEPLOY_REGION,
    "--profile",
    "splai-prd",
  ]);
});

test("loadDeploymentContext reports exact missing names with exit code 78", () => {
  const missing = [
    DEPLOY_NEON_API_KEY_PARAMETER,
    DEPLOY_ADMIN_PASSWORD_PARAMETER,
  ];
  const runner = new RecordingRunner((_command, arguments_) => {
    if (arguments_[0] === "sts") {
      return success({ Account: accountId });
    }
    return success(parameterResponse(missing));
  });

  assert.throws(
    () => loadDeploymentContext(runner, "splai-prd"),
    (error: unknown) => {
      assert.ok(error instanceof MissingDeploymentParametersError);
      assert.equal(error.exitCode, 78);
      assert.deepEqual(error.missingParameterNames, missing);
      assert.equal(error.profile, "splai-prd");
      return true;
    },
  );
});

test("AWS access failures are never classified as missing configuration", () => {
  const syntheticSecret = "synthetic-decrypted-secret";
  const runner = new RecordingRunner((_command, arguments_) =>
    arguments_[0] === "sts"
      ? success({ Account: accountId })
      : {
          status: 255,
          stdout: `partial=${syntheticSecret}`,
          stderr: `ExpiredToken: ${syntheticSecret}`,
        },
  );
  let thrown: unknown;
  try {
    loadDeploymentContext(runner, "splai-prd");
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof AwsDeploymentAccessError);
  assert.ok(!(thrown instanceof MissingDeploymentParametersError));
  assert.ok(!thrown.message.includes(syntheticSecret));
});

test("loadDeploymentContext rejects secret version mismatch", () => {
  const changed = parameterResponse();
  const parameter = changed.Parameters.find(
    ({ Name }) => Name === DEPLOY_VERCEL_TOKEN_PARAMETER,
  );
  assert.ok(parameter);
  parameter.Version = 99;
  const runner = new RecordingRunner((_command, arguments_) =>
    arguments_[0] === "sts"
      ? success({ Account: accountId })
      : success(changed),
  );
  assert.throws(
    () => loadDeploymentContext(runner, "splai-prd"),
    /version does not match/,
  );
});

test("stdin deployment context needs no AWS runner or credential files", () => {
  const payload = `${JSON.stringify(parameterResponse())}\n${DEPLOY_CONTEXT_COMPLETION_MARKER}\n`;
  const context = loadDeploymentContextFromStdin(
    payload,
    accountId,
    "splai-prd",
  );
  assert.equal(context.profile, "splai-prd");
  assert.equal(context.accountId, accountId);
  assert.equal(context.secrets.neonApiKey, "neon-secret-value");
});

test("stdin deployment context preserves missing-parameter exit semantics", () => {
  const payload = `${JSON.stringify(parameterResponse([DEPLOY_CONFIG_PARAMETER]))}\n${DEPLOY_CONTEXT_COMPLETION_MARKER}\n`;
  assert.throws(
    () => loadDeploymentContextFromStdin(payload, accountId, "splai-prd"),
    (error: unknown) =>
      error instanceof MissingDeploymentParametersError &&
      error.exitCode === 78 &&
      error.missingParameterNames[0] === DEPLOY_CONFIG_PARAMETER,
  );
});

test("stdin deployment context rejects missing or non-terminal completion markers", () => {
  const response = JSON.stringify(parameterResponse());
  assert.throws(
    () => loadDeploymentContextFromStdin(response, accountId, "splai-prd"),
    /did not complete successfully/,
  );
  assert.throws(
    () =>
      loadDeploymentContextFromStdin(
        `${response}\n${DEPLOY_CONTEXT_COMPLETION_MARKER}\ntrailing`,
        accountId,
        "splai-prd",
      ),
    /did not complete successfully/,
  );
  assert.throws(
    () =>
      loadDeploymentContextFromStdin(
        `${response}${DEPLOY_CONTEXT_COMPLETION_MARKER}\n${DEPLOY_CONTEXT_COMPLETION_MARKER}\n`,
        accountId,
        "splai-prd",
      ),
    /completion marker is invalid/,
  );
});

test("stored config parser rejects extra fields and non-origin URLs", () => {
  assert.throws(
    () =>
      parseStoredDeploymentConfig(
        JSON.stringify({ ...validConfig, approvalText: "not part of schema" }),
      ),
    /missing or unsupported fields/,
  );
  assert.throws(
    () =>
      parseStoredDeploymentConfig(
        JSON.stringify({
          ...validConfig,
          vercel: {
            ...validConfig.vercel,
            canonicalOrigin: "https://example.com/path",
          },
        }),
      ),
    /exact HTTPS origin/,
  );
  assert.throws(
    () =>
      parseStoredDeploymentConfig(
        JSON.stringify({
          ...validConfig,
          vercel: { ...validConfig.vercel, orgId: "user_abc123" },
        }),
      ),
    /Vercel org ID is invalid/,
  );
});

test("DEPLOY_AWS_PROFILE is the only profile environment input", () => {
  assert.equal(
    getProfileFromEnvironment({
      DEPLOY_AWS_PROFILE: "splai-prd",
      AWS_PROFILE: "wrong-profile",
    }),
    "splai-prd",
  );
  assert.equal(getProfileFromEnvironment({ AWS_PROFILE: "ignored" }), undefined);
  assert.throws(
    () => getProfileFromEnvironment({ DEPLOY_AWS_PROFILE: "$(id)" }),
    InvalidDeploymentConfigurationError,
  );
});

test("setup argument parser accepts only the public interface", () => {
  assert.deepEqual(
    parseAwsSetupArguments([
      "--profile",
      "splai-prd",
      "--reconfigure",
      "--rotate",
      "neon-api-key",
    ]),
    {
      profile: "splai-prd",
      reconfigure: true,
      rotate: "neon-api-key",
    },
  );
  assert.throws(
    () => parseAwsSetupArguments(["--profile", "splai-prd", "--rotate", "all"]),
    /--rotate must be/,
  );
  assert.throws(
    () => parseAwsSetupArguments(["--profile", "splai-prd", "--force"]),
    /Unsupported setup argument/,
  );
});
