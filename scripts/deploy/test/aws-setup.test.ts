import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
  DEPLOY_CONFIG_PARAMETER,
  DEPLOY_KMS_ALIAS,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_PARAMETER_NAMES,
  DEPLOY_REGION,
  DEPLOY_VERCEL_TOKEN_PARAMETER,
  type StoredDeploymentConfig,
} from "../lib/aws-config";
import { runAwsSetup } from "../lib/aws-setup";
import type { Prompter } from "../lib/input";
import {
  SecretRegistry,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from "../lib/process";

const accountId = "123456789012";
const kmsKeyId = "12345678-1234-1234-1234-123456789012";
const kmsKeyArn = `arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/${kmsKeyId}`;
const vercelToken = "vercel-token-value-123456";
const neonApiKey = "neon-api-key-value-123456";
const adminPassword = "admin-password-value";

function createConfig(
  versions: StoredDeploymentConfig["secretVersions"] = {
    vercelToken: 1,
    neonApiKey: 1,
    adminPassword: 1,
  },
): StoredDeploymentConfig {
  return {
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
    secretVersions: versions,
  };
}

type StoredParameter = {
  Type: "String" | "SecureString";
  Value: string;
  Version: number;
  Tier?: "Standard" | "Advanced";
  KeyId?: string;
};

class AwsSetupRunner implements CommandRunner {
  readonly calls: Array<{
    command: string;
    arguments_: readonly string[];
    options?: CommandOptions;
  }> = [];
  readonly parameters = new Map<string, StoredParameter>();
  hasKms: boolean;
  aliasPresent: boolean;
  rotationEnabled: boolean;
  rotationPeriodInDays?: number;

  constructor(options: {
    parameters?: ReadonlyMap<string, StoredParameter>;
    hasKms?: boolean;
    aliasPresent?: boolean;
    rotationEnabled?: boolean;
    rotationPeriodInDays?: number;
    redactWith?: SecretRegistry;
  } = {}) {
    for (const [name, parameter] of options.parameters ?? []) {
      this.parameters.set(name, { ...parameter });
    }
    this.hasKms = options.hasKms ?? false;
    this.aliasPresent = options.aliasPresent ?? this.hasKms;
    this.rotationEnabled = options.rotationEnabled ?? this.hasKms;
    this.rotationPeriodInDays =
      options.rotationPeriodInDays ?? (this.rotationEnabled ? 365 : undefined);
    this.redactWith = options.redactWith;
  }

  private readonly redactWith: SecretRegistry | undefined;

  run(
    command: string,
    arguments_: readonly string[],
    options?: CommandOptions,
  ): CommandResult {
    this.calls.push({ command, arguments_, options });
    assert.equal(command, "aws");
    const service = arguments_[0];
    const operation = arguments_[1];
    if (service === "sts" && operation === "get-caller-identity") {
      return jsonSuccess({
        Account: accountId,
        Arn: `arn:aws:sts::${accountId}:assumed-role/setup/test`,
      });
    }
    if (service === "ssm" && operation === "get-parameters") {
      const response = jsonSuccess(this.parameterResponse());
      return {
        ...response,
        stdout: this.redactWith?.redact(response.stdout) ?? response.stdout,
      };
    }
    if (service === "ssm" && operation === "describe-parameters") {
      const filtersIndex = arguments_.indexOf("--parameter-filters");
      const filters = JSON.parse(arguments_[filtersIndex + 1]) as Array<{
        Values: string[];
      }>;
      const name = filters[0]?.Values[0];
      const parameter = name ? this.parameters.get(name) : undefined;
      return jsonSuccess({
        Parameters:
          name && parameter
            ? [
                {
                  Name: name,
                  Type: parameter.Type,
                  Tier: parameter.Tier ?? "Standard",
                  ...(parameter.Type === "SecureString"
                    ? { KeyId: parameter.KeyId ?? kmsKeyArn }
                    : {}),
                },
              ]
            : [],
      });
    }
    if (service === "ssm" && operation === "put-parameter") {
      assert.ok(options?.input);
      const input = JSON.parse(options.input) as {
        Name: string;
        Type: "String" | "SecureString";
        Value: string;
      };
      const previous = this.parameters.get(input.Name);
      const version = (previous?.Version ?? 0) + 1;
      this.parameters.set(input.Name, {
        Type: input.Type,
        Value: input.Value,
        Version: version,
        Tier: "Standard",
        ...(input.Type === "SecureString" ? { KeyId: kmsKeyArn } : {}),
      });
      return jsonSuccess({ Version: version, Tier: "Standard" });
    }
    if (service === "kms" && operation === "describe-key") {
      const keyIndex = arguments_.indexOf("--key-id");
      const key = arguments_[keyIndex + 1];
      if (
        !this.hasKms ||
        (key === DEPLOY_KMS_ALIAS && !this.aliasPresent)
      ) {
        return {
          status: 255,
          stdout: "",
          stderr: "NotFoundException",
        };
      }
      return jsonSuccess(kmsMetadata());
    }
    if (service === "kms" && operation === "list-resource-tags") {
      return jsonSuccess({
        Tags: [
          { TagKey: "Application", TagValue: "zoom-gov-contact-center-demo" },
          { TagKey: "Environment", TagValue: "production" },
          { TagKey: "ManagedBy", TagValue: "setup-deploy-aws.sh" },
        ],
      });
    }
    if (service === "kms" && operation === "get-key-rotation-status") {
      return jsonSuccess({
        KeyRotationEnabled: this.rotationEnabled,
        ...(this.rotationPeriodInDays === undefined
          ? {}
          : { RotationPeriodInDays: this.rotationPeriodInDays }),
      });
    }
    if (service === "kms" && operation === "create-key") {
      this.hasKms = true;
      return jsonSuccess(kmsMetadata());
    }
    if (service === "kms" && operation === "enable-key-rotation") {
      this.rotationEnabled = true;
      const periodIndex = arguments_.indexOf("--rotation-period-in-days");
      this.rotationPeriodInDays = Number(arguments_[periodIndex + 1]);
      return jsonSuccess({});
    }
    if (service === "kms" && operation === "create-alias") {
      this.aliasPresent = true;
      return jsonSuccess({});
    }
    throw new Error(`Unexpected AWS call: ${arguments_.join(" ")}`);
  }

  private parameterResponse() {
    return {
      Parameters: [...this.parameters].map(([Name, parameter]) => ({
        Name,
        ...parameter,
      })),
      InvalidParameters: DEPLOY_PARAMETER_NAMES.filter(
        (name) => !this.parameters.has(name),
      ),
    };
  }
}

class SetupPrompter implements Prompter {
  readonly messages: string[] = [];

  constructor(
    private readonly visibleAnswers: string[] = [],
    private readonly hiddenAnswers: string[] = [],
  ) {}

  async ask(message: string): Promise<string> {
    this.messages.push(message);
    if (message.includes(`setup ${accountId}`)) {
      return `setup ${accountId}`;
    }
    const answer = this.visibleAnswers.shift();
    if (answer === undefined) {
      throw new Error(`No visible answer for: ${message}`);
    }
    return answer;
  }

  async hidden(message: string): Promise<string> {
    this.messages.push(message);
    const answer = this.hiddenAnswers.shift();
    if (answer === undefined) {
      throw new Error(`No hidden answer for: ${message}`);
    }
    return answer;
  }
}

function jsonSuccess(value: unknown): CommandResult {
  return { status: 0, stdout: JSON.stringify(value), stderr: "" };
}

function kmsMetadata() {
  return {
    KeyMetadata: {
      Arn: kmsKeyArn,
      KeyId: kmsKeyId,
      Enabled: true,
      KeyState: "Enabled",
      KeyUsage: "ENCRYPT_DECRYPT",
      KeySpec: "SYMMETRIC_DEFAULT",
      Origin: "AWS_KMS",
      KeyManager: "CUSTOMER",
      MultiRegion: false,
    },
  };
}

function completeParameters(
  config = createConfig(),
): Map<string, StoredParameter> {
  return new Map([
    [
      DEPLOY_CONFIG_PARAMETER,
      { Type: "String", Value: JSON.stringify(config), Version: 1 },
    ],
    [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      { Type: "SecureString", Value: vercelToken, Version: config.secretVersions.vercelToken },
    ],
    [
      DEPLOY_NEON_API_KEY_PARAMETER,
      { Type: "SecureString", Value: neonApiKey, Version: config.secretVersions.neonApiKey },
    ],
    [
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
      { Type: "SecureString", Value: adminPassword, Version: config.secretVersions.adminPassword },
    ],
  ]);
}

const providerFetch: typeof globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  let value: unknown;
  if (url.hostname === "api.vercel.com") {
    if (url.pathname === "/v9/projects/prj_abc123") {
      value = {
        id: "prj_abc123",
        name: "zoom-gov-contact-center-demo",
        accountId: "team_abc123",
      };
    } else if (url.pathname === "/v2/teams/team_abc123") {
      value = { id: "team_abc123", billing: { plan: "hobby" } };
    } else if (
      url.pathname === "/v9/projects/prj_abc123/domains/example.com"
    ) {
      value = {
        name: "example.com",
        projectId: "prj_abc123",
        verified: true,
        redirect: null,
        gitBranch: null,
        customEnvironmentId: null,
      };
    }
  } else if (url.hostname === "console.neon.tech") {
    if (url.pathname === "/api/v2/projects/quiet-rain-12345678") {
      value = {
        project: {
          id: "quiet-rain-12345678",
          name: "zoom-gov-contact-center-demo",
          region_id: "aws-ap-southeast-1",
          org_id: "org-test",
        },
      };
    } else if (url.pathname === "/api/v2/organizations/org-test") {
      value = { organization: { id: "org-test", plan: "free" } };
    } else if (
      url.pathname ===
      "/api/v2/projects/quiet-rain-12345678/branches/br-muddy-rain-12345678"
    ) {
      value = {
        branch: {
          id: "br-muddy-rain-12345678",
          project_id: "quiet-rain-12345678",
        },
      };
    } else if (url.pathname.endsWith("/databases/neondb")) {
      value = {
        database: {
          name: "neondb",
          owner_name: "neondb_owner",
          branch_id: "br-muddy-rain-12345678",
        },
      };
    } else if (url.pathname.endsWith("/roles/neondb_owner")) {
      value = {
        role: {
          name: "neondb_owner",
          branch_id: "br-muddy-rain-12345678",
        },
      };
    }
  }
  if (value === undefined) {
    return new Response("not found", { status: 404 });
  }
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

function strictProviderFetch(
  expectedVercelToken: string,
  expectedNeonApiKey: string,
): typeof globalThis.fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.vercel.com") {
      assert.deepEqual([...url.searchParams], [["teamId", "team_abc123"]]);
    }
    const expectedToken =
      url.hostname === "api.vercel.com"
        ? expectedVercelToken
        : expectedNeonApiKey;
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Bearer ${expectedToken}`,
    );
    return providerFetch(input, init);
  };
}

test("orphan SecureString stops before KMS or SSM writes", async () => {
  const parameters = new Map<string, StoredParameter>([
    [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      { Type: "SecureString", Value: vercelToken, Version: 1 },
    ],
  ]);
  const runner = new AwsSetupRunner({ parameters });
  await assert.rejects(
    runAwsSetup(
      runner,
      new SetupPrompter(),
      new SecretRegistry(),
      { profile: "splai-prd", reconfigure: false },
      providerFetch,
    ),
    /exist without a managed KMS alias or config/,
  );
  assert.ok(
    !runner.calls.some(
      ({ arguments_ }) =>
        arguments_[1] === "create-key" || arguments_[1] === "put-parameter",
    ),
  );
});

test("initial setup writes three secrets through stdin before config", async () => {
  const registry = new SecretRegistry();
  const runner = new AwsSetupRunner({ redactWith: registry });
  const prompter = new SetupPrompter(
    [
      "team_abc123",
      "prj_abc123",
      "zoom-gov-contact-center-demo",
      "https://example.com",
      "quiet-rain-12345678",
      "zoom-gov-contact-center-demo",
      "br-muddy-rain-12345678",
      "neondb",
      "neondb_owner",
      "admin@example.com",
    ],
    [
      vercelToken,
      vercelToken,
      neonApiKey,
      neonApiKey,
      adminPassword,
      adminPassword,
    ],
  );
  await runAwsSetup(
    runner,
    prompter,
    registry,
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, neonApiKey),
  );
  assert.equal(prompter.messages[0], "Vercel team ID: ");
  assert.ok(!prompter.messages.some((message) => message.includes("org ID")));
  assert.ok(prompter.messages.includes("Vercel access token (again): "));
  assert.ok(prompter.messages.includes("Neon API key (again): "));

  const puts = runner.calls.filter(
    ({ arguments_ }) => arguments_[0] === "ssm" && arguments_[1] === "put-parameter",
  );
  assert.deepEqual(
    puts.map(({ options }) =>
      (JSON.parse(options?.input ?? "{}") as { Name?: string }).Name
    ),
    [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      DEPLOY_NEON_API_KEY_PARAMETER,
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
    ],
  );
  for (const call of puts.slice(0, 3)) {
    const serializedArguments = JSON.stringify(call.arguments_);
    assert.ok(!serializedArguments.includes(vercelToken));
    assert.ok(!serializedArguments.includes(neonApiKey));
    assert.ok(!serializedArguments.includes(adminPassword));
    assert.ok(call.options?.input?.includes('"Value"'));
  }
});

test("complete setup with no flags validates without writes", async () => {
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
  });
  await runAwsSetup(
    runner,
    new SetupPrompter(),
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    providerFetch,
  );
  assert.ok(
    !runner.calls.some(
      ({ arguments_ }) =>
        arguments_[1] === "put-parameter" ||
        arguments_[1] === "create-key" ||
        arguments_[1] === "create-alias",
    ),
  );
});

test("existing parameters must retain exact Standard tier and encryption metadata", async () => {
  const advancedConfig = completeParameters();
  const configParameter = advancedConfig.get(DEPLOY_CONFIG_PARAMETER);
  assert.ok(configParameter);
  advancedConfig.set(DEPLOY_CONFIG_PARAMETER, {
    ...configParameter,
    Tier: "Advanced",
  });
  const advancedRunner = new AwsSetupRunner({
    parameters: advancedConfig,
    hasKms: true,
  });
  await assert.rejects(
    runAwsSetup(
      advancedRunner,
      new SetupPrompter(),
      new SecretRegistry(),
      { profile: "splai-prd", reconfigure: false },
      providerFetch,
    ),
    /must use the SSM Standard tier/,
  );
  assert.ok(
    !advancedRunner.calls.some(
      ({ arguments_ }) => arguments_[1] === "put-parameter",
    ),
  );

  const wrongSecretKey = completeParameters();
  const tokenParameter = wrongSecretKey.get(DEPLOY_VERCEL_TOKEN_PARAMETER);
  assert.ok(tokenParameter);
  wrongSecretKey.set(DEPLOY_VERCEL_TOKEN_PARAMETER, {
    ...tokenParameter,
    KeyId: `arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
  });
  const wrongKeyRunner = new AwsSetupRunner({
    parameters: wrongSecretKey,
    hasKms: true,
  });
  await assert.rejects(
    runAwsSetup(
      wrongKeyRunner,
      new SetupPrompter(),
      new SecretRegistry(),
      { profile: "splai-prd", reconfigure: false },
      providerFetch,
    ),
    /is not encrypted by the managed KMS key/,
  );
  assert.ok(
    !wrongKeyRunner.calls.some(
      ({ arguments_ }) => arguments_[1] === "put-parameter",
    ),
  );
});

test("setup does not re-read decrypted values through the redacting runner", async () => {
  const registry = new SecretRegistry();
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
    redactWith: registry,
  });
  await runAwsSetup(
    runner,
    new SetupPrompter(),
    registry,
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, neonApiKey),
  );
  assert.equal(registry.redact(vercelToken), "[REDACTED]");
  assert.equal(registry.redact(neonApiKey), "[REDACTED]");
  assert.equal(registry.redact(adminPassword), "[REDACTED]");
  assert.equal(
    runner.calls.filter(
      ({ arguments_ }) =>
        arguments_[0] === "ssm" && arguments_[1] === "get-parameters",
    ).length,
    1,
  );
});

test("complete setup rejects a secret version that differs from config", async () => {
  const parameters = completeParameters();
  const token = parameters.get(DEPLOY_VERCEL_TOKEN_PARAMETER);
  assert.ok(token);
  parameters.set(DEPLOY_VERCEL_TOKEN_PARAMETER, { ...token, Version: 99 });
  const runner = new AwsSetupRunner({ parameters, hasKms: true });
  await assert.rejects(
    runAwsSetup(
      runner,
      new SetupPrompter(),
      new SecretRegistry(),
      { profile: "splai-prd", reconfigure: false },
      providerFetch,
    ),
    /version does not match the deployment config/,
  );
  assert.ok(
    !runner.calls.some(
      ({ arguments_ }) => arguments_[1] === "put-parameter",
    ),
  );
});

test("complete setup rejects a KMS rotation period other than 365 days", async () => {
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
    rotationPeriodInDays: 730,
  });
  await assert.rejects(
    runAwsSetup(
      runner,
      new SetupPrompter(),
      new SecretRegistry(),
      { profile: "splai-prd", reconfigure: false },
      providerFetch,
    ),
    /managed KMS configuration is incomplete/,
  );
  assert.ok(
    !runner.calls.some(
      ({ arguments_ }) => arguments_[1] === "enable-key-rotation",
    ),
  );
});

test("reconfigure corrects and revalidates the KMS rotation period", async () => {
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
    rotationPeriodInDays: 730,
  });
  await runAwsSetup(
    runner,
    new SetupPrompter(Array.from({ length: 10 }, () => "")),
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: true },
    providerFetch,
  );
  assert.equal(runner.rotationEnabled, true);
  assert.equal(runner.rotationPeriodInDays, 365);
  const rotationCalls = runner.calls.filter(
    ({ arguments_ }) =>
      arguments_[0] === "kms" &&
      arguments_[1] === "get-key-rotation-status",
  );
  assert.equal(rotationCalls.length, 2);
  const enableCall = runner.calls.find(
    ({ arguments_ }) => arguments_[1] === "enable-key-rotation",
  );
  assert.ok(enableCall?.arguments_.includes("365"));
});

test("rotating one secret updates only its version and config", async () => {
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
  });
  const rotatedNeonKey = "rotated-neon-api-key-123456";
  await runAwsSetup(
    runner,
    new SetupPrompter([], [rotatedNeonKey, rotatedNeonKey]),
    new SecretRegistry(),
    {
      profile: "splai-prd",
      reconfigure: false,
      rotate: "neon-api-key",
    },
    providerFetch,
  );
  const putNames = runner.calls
    .filter(
      ({ arguments_ }) =>
        arguments_[0] === "ssm" && arguments_[1] === "put-parameter",
    )
    .map(
      ({ options }) =>
        (JSON.parse(options?.input ?? "{}") as { Name?: string }).Name,
    );
  assert.deepEqual(putNames, [
    DEPLOY_NEON_API_KEY_PARAMETER,
    DEPLOY_CONFIG_PARAMETER,
  ]);
  const storedConfig = JSON.parse(
    runner.parameters.get(DEPLOY_CONFIG_PARAMETER)?.Value ?? "{}",
  ) as StoredDeploymentConfig;
  assert.deepEqual(storedConfig.secretVersions, {
    vercelToken: 1,
    neonApiKey: 2,
    adminPassword: 1,
  });
  assert.equal(
    runner.parameters.get(DEPLOY_NEON_API_KEY_PARAMETER)?.Value,
    rotatedNeonKey,
  );
});

test("provider secret confirmation mismatch stops before AWS writes", async () => {
  const runner = new AwsSetupRunner();
  let providerCalls = 0;
  const unexpectedProviderFetch: typeof globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("Provider API must not run before secret confirmation.");
  };
  const prompter = new SetupPrompter(
    [
      "team_abc123",
      "prj_abc123",
      "zoom-gov-contact-center-demo",
      "https://example.com",
      "quiet-rain-12345678",
      "zoom-gov-contact-center-demo",
      "br-muddy-rain-12345678",
      "neondb",
      "neondb_owner",
      "admin@example.com",
    ],
    [vercelToken, `${vercelToken}-mismatch`],
  );
  await assert.rejects(
    runAwsSetup(
      runner,
      prompter,
      new SecretRegistry(),
      { profile: "splai-prd", reconfigure: false },
      unexpectedProviderFetch,
    ),
    /Vercel access token confirmation did not match/,
  );
  assert.equal(providerCalls, 0);
  const awsWriteOperations = new Set([
    "create-key",
    "enable-key-rotation",
    "create-alias",
    "put-parameter",
  ]);
  assert.ok(
    !runner.calls.some(({ arguments_ }) =>
      awsWriteOperations.has(arguments_[1] ?? ""),
    ),
  );
});

test("reconfigure preserves all secret versions", async () => {
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
  });
  await runAwsSetup(
    runner,
    new SetupPrompter(Array.from({ length: 10 }, () => "")),
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: true },
    providerFetch,
  );
  const secretPuts = runner.calls.filter(({ arguments_ }) => {
    if (arguments_[0] !== "ssm" || arguments_[1] !== "put-parameter") {
      return false;
    }
    const call = runner.calls.find(
      (candidate) => candidate.arguments_ === arguments_,
    );
    const name = JSON.parse(call?.options?.input ?? "{}") as { Name?: string };
    return name.Name !== DEPLOY_CONFIG_PARAMETER;
  });
  assert.equal(secretPuts.length, 0);
  const storedConfig = JSON.parse(
    runner.parameters.get(DEPLOY_CONFIG_PARAMETER)?.Value ?? "{}",
  ) as StoredDeploymentConfig;
  assert.deepEqual(storedConfig.secretVersions, {
    vercelToken: 1,
    neonApiKey: 1,
    adminPassword: 1,
  });
});
