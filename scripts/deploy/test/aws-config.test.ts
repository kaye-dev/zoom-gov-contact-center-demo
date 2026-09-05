import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AwsDeploymentAccessError,
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
  DEPLOY_DEVELOPER_API_KEY_PARAMETER,
  DEPLOY_CONFIG_PARAMETER,
  DEPLOY_CONTEXT_COMPLETION_MARKER,
  DEPLOY_KEY_METADATA_MARKER,
  assertEncryptionKeyMetadata,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_PARAMETER_NAMES,
  DEPLOY_REGION,
  DEPLOY_VERCEL_TOKEN_PARAMETER,
  getProfileFromEnvironment,
  InvalidDeploymentConfigurationError,
  loadDeploymentContext,
  loadDeploymentContextFromStdin,
  MissingDeploymentParametersError,
  parseDeploymentSetupField,
  parseStoredDeploymentConfig,
  parseStoredDeploymentSetupState,
  type DeploymentSetupField,
  type StoredDeploymentConfig,
  type StoredDeploymentSetupDraft,
} from "../lib/aws-config";
import { parseAwsSetupArguments } from "../lib/aws-setup";
import type {
  CommandOptions,
  CommandResult,
  CommandRunner,
} from "../lib/process";

const accountId = "123456789012";
const kmsKeyArn = `arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/12345678-1234-1234-1234-123456789012`;

const validConfig: StoredDeploymentConfig = {
  schemaVersion: 3,
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
    developerApiSettingsEncryptionKey: 1,
  },
};

const validDraft: StoredDeploymentSetupDraft = {
  schemaVersion: 4,
  policyVersion: "demo-v1",
  setupState: "incomplete",
  aws: { accountId, region: DEPLOY_REGION },
  kmsKeyArn,
  values: {
    "vercel.orgId": "team_abc123",
    "vercel.projectId": "prj_abc123",
    "vercel.canonicalOrigin": "https://example.com",
    "neon.projectId": "quiet-rain-12345678",
  },
  secretVersions: { vercelToken: 4 },
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
    {
      Name: DEPLOY_DEVELOPER_API_KEY_PARAMETER,
      Type: "SecureString",
      Value: Buffer.alloc(32, 7).toString("base64"),
      Version: 1,
    },
  ].filter((parameter) => !invalid.includes(parameter.Name)),
  InvalidParameters: [...invalid],
});

const keyMetadata = () => ({
  Parameters: [
    {
      Name: DEPLOY_DEVELOPER_API_KEY_PARAMETER,
      Type: "SecureString",
      Tier: "Standard",
      KeyId: kmsKeyArn,
      Version: 1,
    },
  ],
});
const markedContext = (
  response = parameterResponse(),
  metadata: unknown = keyMetadata(),
) =>
  `${JSON.stringify(response)}\n${DEPLOY_KEY_METADATA_MARKER}\n${JSON.stringify(metadata)}\n${DEPLOY_CONTEXT_COMPLETION_MARKER}\n`;

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
      return success({
        Account: accountId,
        Arn: "arn:aws:iam::123456789012:user/test",
      });
    }
    if (arguments_[0] === "ssm" && arguments_[1] === "get-parameters") {
      return success(parameterResponse());
    }
    if (arguments_[1] === "describe-parameters") return success(keyMetadata());
    throw new Error(`Unexpected AWS call: ${arguments_.join(" ")}`);
  });
}

test("loadDeploymentContext reads exact parameters and encryption key metadata", () => {
  const runner = createSuccessfulRunner();
  const context = loadDeploymentContext(runner, "splai-prd");

  assert.equal(context.profile, "splai-prd");
  assert.equal(context.accountId, accountId);
  assert.deepEqual(context.config, validConfig);
  assert.deepEqual(context.secrets, {
    vercelToken: "vercel-secret-value",
    neonApiKey: "neon-secret-value",
    adminPassword: "admin-secret-value",
    developerApiSettingsEncryptionKey: Buffer.alloc(32, 7).toString("base64"),
  });
  assert.equal(runner.calls.length, 3);
  assert.deepEqual(
    runner.calls.map(({ arguments_ }) => arguments_.slice(0, 2)),
    [
      ["sts", "get-caller-identity"],
      ["ssm", "get-parameters"],
      ["ssm", "describe-parameters"],
    ],
  );
  const getParameters = runner.calls[1].arguments_;
  const namesIndex = getParameters.indexOf("--names");
  assert.deepEqual(
    getParameters.slice(
      namesIndex + 1,
      namesIndex + 1 + DEPLOY_PARAMETER_NAMES.length,
    ),
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
  const payload = markedContext();
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
    /Vercel team ID is invalid/,
  );
});

test("setup field parser validates all fields and normalizes one trailing origin slash", () => {
  const cases: readonly (readonly [DeploymentSetupField, string, string])[] = [
    ["vercel.orgId", "team_abc123", "team_abc123"],
    ["vercel.projectId", "prj_abc123", "prj_abc123"],
    [
      "vercel.projectName",
      "zoom-gov-contact-center-demo",
      "zoom-gov-contact-center-demo",
    ],
    ["vercel.canonicalOrigin", "https://example.com/", "https://example.com"],
    ["neon.projectId", "quiet-rain-12345678", "quiet-rain-12345678"],
    [
      "neon.projectName",
      "zoom-gov-contact-center-demo",
      "zoom-gov-contact-center-demo",
    ],
    ["neon.branchId", "br-muddy-rain-12345678", "br-muddy-rain-12345678"],
    ["neon.databaseName", "neondb", "neondb"],
    ["neon.roleName", "neondb_owner", "neondb_owner"],
    ["admin.email", "admin@example.com", "admin@example.com"],
  ];
  for (const [field, raw, expected] of cases) {
    assert.equal(parseDeploymentSetupField(field, raw), expected);
  }

  assert.throws(
    () =>
      parseDeploymentSetupField("vercel.canonicalOrigin", "http://example.com"),
    /exact HTTPS origin/,
  );
  assert.throws(
    () => parseDeploymentSetupField("neon.branchId", "main"),
    /Neon branch ID is invalid/,
  );
  assert.throws(
    () => parseDeploymentSetupField("admin.email", "not-an-email"),
    /administrator email is invalid/,
  );
});

test("stored final config keeps requiring a canonical origin without a slash", () => {
  assert.throws(
    () =>
      parseStoredDeploymentConfig(
        JSON.stringify({
          ...validConfig,
          vercel: {
            ...validConfig.vercel,
            canonicalOrigin: "https://example.com/",
          },
        }),
      ),
    /exact HTTPS origin/,
  );
});

test("stored setup state strictly parses complete and sparse incomplete documents", () => {
  assert.deepEqual(
    parseStoredDeploymentSetupState(JSON.stringify(validConfig)),
    {
      state: "complete",
      config: validConfig,
    },
  );
  assert.deepEqual(
    parseStoredDeploymentSetupState(JSON.stringify(validDraft)),
    {
      state: "incomplete",
      draft: validDraft,
    },
  );

  const normalizedDraft = {
    ...validDraft,
    values: {
      ...validDraft.values,
      "vercel.canonicalOrigin": "https://example.com/",
    },
  };
  const parsed = parseStoredDeploymentSetupState(
    JSON.stringify(normalizedDraft),
  );
  assert.equal(parsed.state, "incomplete");
  if (parsed.state === "incomplete") {
    assert.equal(
      parsed.draft.values["vercel.canonicalOrigin"],
      "https://example.com",
    );
  }
});

test("stored setup draft rejects unknown fields, secret values, and invalid versions", () => {
  assert.throws(
    () =>
      parseStoredDeploymentSetupState(
        JSON.stringify({ ...validDraft, unexpected: true }),
      ),
    /missing or unsupported fields/,
  );
  assert.throws(
    () =>
      parseStoredDeploymentSetupState(
        JSON.stringify({
          ...validDraft,
          values: { ...validDraft.values, vercelToken: "must-not-be-stored" },
        }),
      ),
    /values contains unsupported fields/,
  );
  assert.throws(
    () =>
      parseStoredDeploymentSetupState(
        JSON.stringify({
          ...validDraft,
          secretVersions: { ...validDraft.secretVersions, unknown: 1 },
        }),
      ),
    /secretVersions contains unsupported fields/,
  );
  assert.throws(
    () =>
      parseStoredDeploymentSetupState(
        JSON.stringify({
          ...validDraft,
          secretVersions: { vercelToken: 0 },
        }),
      ),
    /vercelToken version is invalid/,
  );
  assert.throws(
    () =>
      parseStoredDeploymentSetupState(
        JSON.stringify({
          ...validDraft,
          values: { "vercel.orgId": "user_abc123" },
        }),
      ),
    /Vercel team ID is invalid/,
  );
});

test("deployment context treats a valid setup draft as incomplete", () => {
  const response = parameterResponse();
  const configParameter = response.Parameters.find(
    ({ Name }) => Name === DEPLOY_CONFIG_PARAMETER,
  );
  assert.ok(configParameter);
  configParameter.Value = JSON.stringify(validDraft);
  const runner = new RecordingRunner((_command, arguments_) =>
    arguments_[0] === "sts"
      ? success({ Account: accountId })
      : success(response),
  );

  assert.throws(
    () => loadDeploymentContext(runner, "splai-prd"),
    (error: unknown) => {
      assert.ok(error instanceof MissingDeploymentParametersError);
      assert.equal(error.exitCode, 78);
      assert.deepEqual(error.missingParameterNames, [DEPLOY_CONFIG_PARAMETER]);
      return true;
    },
  );
});

test("deployment context does not classify a cross-account setup draft as missing", () => {
  const otherAccountId = "210987654321";
  const response = parameterResponse();
  const configParameter = response.Parameters.find(
    ({ Name }) => Name === DEPLOY_CONFIG_PARAMETER,
  );
  assert.ok(configParameter);
  configParameter.Value = JSON.stringify({
    ...validDraft,
    aws: { accountId: otherAccountId, region: DEPLOY_REGION },
    kmsKeyArn: `arn:aws:kms:${DEPLOY_REGION}:${otherAccountId}:key/12345678-1234-1234-1234-123456789012`,
  });
  const runner = new RecordingRunner((_command, arguments_) =>
    arguments_[0] === "sts"
      ? success({ Account: accountId })
      : success(response),
  );

  let thrown: unknown;
  try {
    loadDeploymentContext(runner, "splai-prd");
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof InvalidDeploymentConfigurationError);
  assert.ok(!(thrown instanceof MissingDeploymentParametersError));
  assert.match(thrown.message, /does not match the deployment setup draft/);
});

test("DEPLOY_AWS_PROFILE is the only profile environment input", () => {
  assert.equal(
    getProfileFromEnvironment({
      DEPLOY_AWS_PROFILE: "splai-prd",
      AWS_PROFILE: "wrong-profile",
    }),
    "splai-prd",
  );
  assert.equal(
    getProfileFromEnvironment({ AWS_PROFILE: "ignored" }),
    undefined,
  );
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

test("Developer API key validation and metadata fail closed without exposing values", () => {
  for (const value of [
    "",
    "invalid",
    Buffer.alloc(31).toString("base64"),
    `${Buffer.alloc(32).toString("base64")}\n`,
  ]) {
    const response = parameterResponse();
    response.Parameters.find(
      (p) => p.Name === DEPLOY_DEVELOPER_API_KEY_PARAMETER,
    )!.Value = value;
    assert.throws(
      () => loadDeploymentContextFromStdin(markedContext(response), accountId),
      InvalidDeploymentConfigurationError,
    );
  }
  for (const patch of [
    { Type: "String" },
    { Tier: "Advanced" },
    { KeyId: "wrong-key" },
    { Version: 2 },
    { Name: DEPLOY_ADMIN_PASSWORD_PARAMETER },
  ]) {
    const metadata = keyMetadata();
    Object.assign(metadata.Parameters[0], patch);
    assert.throws(
      () =>
        loadDeploymentContextFromStdin(
          markedContext(parameterResponse(), metadata),
          accountId,
        ),
      /does not match/,
    );
  }
  assert.throws(
    () =>
      assertEncryptionKeyMetadata(
        JSON.stringify({ Parameters: [] }),
        validConfig,
      ),
    /exactly once/,
  );
  assert.throws(
    () =>
      assertEncryptionKeyMetadata(
        JSON.stringify({ ...keyMetadata(), NextToken: "more" }),
        validConfig,
      ),
    /exactly once/,
  );
  const response = parameterResponse();
  response.Parameters.find(
    (p) => p.Name === DEPLOY_DEVELOPER_API_KEY_PARAMETER,
  )!.Version = 2;
  assert.throws(
    () => loadDeploymentContextFromStdin(markedContext(response), accountId),
    /version does not match/,
  );
  assert.throws(
    () =>
      loadDeploymentContextFromStdin(
        markedContext(parameterResponse([DEPLOY_DEVELOPER_API_KEY_PARAMETER])),
        accountId,
      ),
    MissingDeploymentParametersError,
  );
});

test("legacy configs and drafts are accepted only for setup migration", () => {
  const legacyVersions = { vercelToken: 4, neonApiKey: 5, adminPassword: 6 };
  const legacy = {
    ...validConfig,
    schemaVersion: 1,
    secretVersions: legacyVersions,
  };
  assert.throws(
    () => parseStoredDeploymentConfig(JSON.stringify(legacy)),
    /unsupported/,
  );
  const migrated = parseStoredDeploymentSetupState(JSON.stringify(legacy));
  assert.equal(migrated.state, "incomplete");
  if (migrated.state !== "incomplete")
    throw new Error("expected migration draft");
  assert.equal(migrated.draft.schemaVersion, 4);
  assert.deepEqual(migrated.draft.secretVersions, legacyVersions);
  assert.equal(
    migrated.draft.values["vercel.canonicalOrigin"],
    validConfig.vercel.canonicalOrigin,
  );
  const response = parameterResponse();
  response.Parameters[0].Value = JSON.stringify(legacy);
  assert.throws(
    () => loadDeploymentContextFromStdin(markedContext(response), accountId),
    MissingDeploymentParametersError,
  );
  const oldDraft = { ...validDraft, schemaVersion: 2 };
  assert.deepEqual(parseStoredDeploymentSetupState(JSON.stringify(oldDraft)), {
    state: "incomplete",
    draft: validDraft,
  });
});

test("KMS metadata access denial stops with no secret-bearing AWS output", () => {
  const runner = new RecordingRunner((_command, args) => {
    if (args[0] === "sts") return success({ Account: accountId });
    if (args[1] === "get-parameters") return success(parameterResponse());
    return {
      status: 255,
      stdout: "synthetic-secret",
      stderr: "synthetic-secret",
    };
  });
  assert.throws(
    () => loadDeploymentContext(runner),
    (error: unknown) => {
      assert.ok(error instanceof AwsDeploymentAccessError);
      assert.ok(!error.message.includes("synthetic-secret"));
      return true;
    },
  );
  assert.equal(runner.calls.length, 3);
});
