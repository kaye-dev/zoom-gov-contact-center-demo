import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
  DEPLOY_DEVELOPER_API_KEY_PARAMETER,
  DEPLOY_CONFIG_PARAMETER,
  DEPLOY_KMS_ALIAS,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_PARAMETER_NAMES,
  DEPLOY_REGION,
  DEPLOY_VERCEL_TOKEN_PARAMETER,
  type StoredDeploymentConfig,
  type StoredDeploymentSetupDraft,
} from "../lib/aws-config";
import {
  runAwsSetup as runAwsSetupImplementation,
  type AwsSetupOptions,
} from "../lib/aws-setup";
import type {
  DeploymentParameterInput,
  DeploymentParameterWriter,
} from "../lib/aws-parameter-writer";
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

const initialVisibleAnswers = [
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
] as const;

const completeDraftValues: StoredDeploymentSetupDraft["values"] = {
  "vercel.orgId": "team_abc123",
  "vercel.projectId": "prj_abc123",
  "vercel.projectName": "zoom-gov-contact-center-demo",
  "vercel.canonicalOrigin": "https://example.com",
  "neon.projectId": "quiet-rain-12345678",
  "neon.projectName": "zoom-gov-contact-center-demo",
  "neon.branchId": "br-muddy-rain-12345678",
  "neon.databaseName": "neondb",
  "neon.roleName": "neondb_owner",
  "admin.email": "admin@example.com",
};

function createConfig(
  versions: StoredDeploymentConfig["secretVersions"] = {
    vercelToken: 1,
    neonApiKey: 1,
    adminPassword: 1,
    developerApiSettingsEncryptionKey: 1,
  },
): StoredDeploymentConfig {
  return {
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
    secretVersions: versions,
  };
}

function createDraft(
  secretVersions: StoredDeploymentSetupDraft["secretVersions"] = {},
  values: StoredDeploymentSetupDraft["values"] = completeDraftValues,
): StoredDeploymentSetupDraft {
  return {
    schemaVersion: 4,
    policyVersion: "demo-v1",
    setupState: "incomplete",
    aws: { accountId, region: DEPLOY_REGION },
    kmsKeyArn,
    values: { ...values },
    secretVersions: { ...secretVersions },
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
  readonly callerIdentityFailure: CommandResult | undefined;

  constructor(
    options: {
      parameters?: ReadonlyMap<string, StoredParameter>;
      hasKms?: boolean;
      aliasPresent?: boolean;
      rotationEnabled?: boolean;
      rotationPeriodInDays?: number;
      redactWith?: SecretRegistry;
      callerIdentityFailure?: CommandResult;
    } = {},
  ) {
    for (const [name, parameter] of options.parameters ?? []) {
      this.parameters.set(name, { ...parameter });
    }
    this.hasKms = options.hasKms ?? false;
    this.aliasPresent = options.aliasPresent ?? this.hasKms;
    this.rotationEnabled = options.rotationEnabled ?? this.hasKms;
    this.rotationPeriodInDays =
      options.rotationPeriodInDays ?? (this.rotationEnabled ? 365 : undefined);
    this.redactWith = options.redactWith;
    this.callerIdentityFailure = options.callerIdentityFailure;
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
      if (this.callerIdentityFailure !== undefined) {
        return this.callerIdentityFailure;
      }
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
      if (!this.hasKms || (key === DEPLOY_KMS_ALIAS && !this.aliasPresent)) {
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
  readonly notices: string[] = [];
  readonly invalidMessages: string[] = [];

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

  notice(message: string): void {
    this.notices.push(message);
  }

  invalid(message: string): void {
    this.invalidMessages.push(message);
  }
}

function runAwsSetup(
  runner: AwsSetupRunner,
  prompter: SetupPrompter,
  secrets: SecretRegistry,
  options: AwsSetupOptions,
  fetchImplementation: typeof globalThis.fetch,
): Promise<void> {
  return runAwsSetupImplementation(
    runner,
    prompter,
    secrets,
    options,
    fetchImplementation,
    createTestParameterWriter(runner),
  );
}

function createTestParameterWriter(
  runner: AwsSetupRunner,
): DeploymentParameterWriter {
  return {
    async put(input: DeploymentParameterInput): Promise<number> {
      const result = runner.run("aws", ["ssm", "put-parameter"], {
        input: JSON.stringify(input),
      });
      assert.equal(result.status, 0);
      const response = JSON.parse(result.stdout) as { Version?: unknown };
      assert.ok(Number.isSafeInteger(response.Version));
      return response.Version as number;
    },
    destroy() {},
  };
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
      {
        Type: "SecureString",
        Value: vercelToken,
        Version: config.secretVersions.vercelToken,
      },
    ],
    [
      DEPLOY_NEON_API_KEY_PARAMETER,
      {
        Type: "SecureString",
        Value: neonApiKey,
        Version: config.secretVersions.neonApiKey,
      },
    ],
    [
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
      {
        Type: "SecureString",
        Value: adminPassword,
        Version: config.secretVersions.adminPassword,
      },
    ],
    [
      DEPLOY_DEVELOPER_API_KEY_PARAMETER,
      {
        Type: "SecureString",
        Value: Buffer.alloc(32, 7).toString("base64"),
        Version: config.secretVersions.developerApiSettingsEncryptionKey,
      },
    ],
  ]);
}

function parameterPutInputs(
  runner: AwsSetupRunner,
): DeploymentParameterInput[] {
  return runner.calls
    .filter(
      ({ arguments_ }) =>
        arguments_[0] === "ssm" && arguments_[1] === "put-parameter",
    )
    .map(({ options }) => {
      assert.ok(options?.input);
      return JSON.parse(options.input) as DeploymentParameterInput;
    });
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
    } else if (url.pathname === "/v9/projects/prj_abc123/domains/example.com") {
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

test("caller identity failure identifies the selected profile without exposing AWS stderr", async () => {
  const syntheticAwsError = "synthetic-container-aws-auth-error-secret";
  const runner = new AwsSetupRunner({
    callerIdentityFailure: {
      status: 255,
      stdout: "",
      stderr: `UnauthorizedSSOTokenError: ${syntheticAwsError}`,
    },
  });

  await assert.rejects(
    runAwsSetup(
      runner,
      new SetupPrompter(),
      new SecretRegistry(),
      { profile: "demo-keien-01", reconfigure: false },
      providerFetch,
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /profile 'demo-keien-01'/);
      assert.match(error.message, /aws sso login --profile demo-keien-01/);
      assert.ok(!error.message.includes(syntheticAwsError));
      return true;
    },
  );
  assert.equal(runner.calls.length, 1);
});

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
    /exist without a setup draft or final config/,
  );
  assert.ok(
    !runner.calls.some(
      ({ arguments_ }) =>
        arguments_[1] === "create-key" || arguments_[1] === "put-parameter",
    ),
  );
});

test("initial setup checkpoints every field and prepares each secret version", async () => {
  const registry = new SecretRegistry();
  const runner = new AwsSetupRunner({ redactWith: registry });
  const prompter = new SetupPrompter(
    [...initialVisibleAnswers],
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
  assert.deepEqual(prompter.notices, [
    "デプロイ設定がありません。初期設定を開始します。",
  ]);
  assert.match(prompter.messages[0] ?? "", /setup 123456789012/);
  assert.equal(prompter.messages[1], "Vercel team ID: ");
  assert.ok(
    prompter.messages.includes(
      "Canonical Production origin (ex. https://demo.example.com): ",
    ),
  );
  assert.ok(!prompter.messages.some((message) => message.includes("org ID")));
  assert.ok(prompter.messages.includes("Vercel access token (again): "));
  assert.ok(prompter.messages.includes("Neon API key (again): "));

  const puts = parameterPutInputs(runner);
  assert.deepEqual(
    puts.map(({ Name }) => Name),
    [
      ...Array.from({ length: 12 }, () => DEPLOY_CONFIG_PARAMETER),
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_NEON_API_KEY_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_DEVELOPER_API_KEY_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
    ],
  );

  const fieldCheckpoints = puts.slice(0, 11).map(({ Value }) => {
    const draft = JSON.parse(Value) as StoredDeploymentSetupDraft;
    assert.equal(draft.schemaVersion, 4);
    assert.equal(draft.setupState, "incomplete");
    return Object.keys(draft.values).length;
  });
  assert.deepEqual(
    fieldCheckpoints,
    Array.from({ length: 11 }, (_value, index) => index),
  );

  const vercelPrepared = JSON.parse(
    puts[11]?.Value ?? "{}",
  ) as StoredDeploymentSetupDraft;
  assert.deepEqual(vercelPrepared.secretVersions, { vercelToken: 1 });
  const neonPrepared = JSON.parse(
    puts[13]?.Value ?? "{}",
  ) as StoredDeploymentSetupDraft;
  assert.deepEqual(neonPrepared.secretVersions, {
    vercelToken: 1,
    neonApiKey: 1,
  });
  const adminPrepared = JSON.parse(
    puts[15]?.Value ?? "{}",
  ) as StoredDeploymentSetupDraft;
  assert.deepEqual(adminPrepared.secretVersions, {
    vercelToken: 1,
    neonApiKey: 1,
    adminPassword: 1,
  });
  assert.equal(JSON.parse(puts.at(-1)?.Value ?? "{}").schemaVersion, 3);

  for (const input of puts) {
    if (input.Name === DEPLOY_CONFIG_PARAMETER) {
      assert.ok(!input.Value.includes(vercelToken));
      assert.ok(!input.Value.includes(neonApiKey));
      assert.ok(!input.Value.includes(adminPassword));
      continue;
    }
    const call = runner.calls.find(
      ({ options }) => options?.input === JSON.stringify(input),
    );
    assert.ok(call);
    const serializedArguments = JSON.stringify(call.arguments_);
    assert.ok(!serializedArguments.includes(input.Value));
  }
});

test("visible input retries in place and canonical origin is normalized", async () => {
  const runner = new AwsSetupRunner();
  const prompter = new SetupPrompter(
    [
      "",
      "org_abc123",
      "team_abc123",
      "prj_abc123",
      "zoom-gov-contact-center-demo",
      "http://example.com",
      "https://example.com/",
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
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, neonApiKey),
  );

  assert.equal(
    prompter.messages.filter((message) => message === "Vercel team ID: ")
      .length,
    3,
  );
  assert.equal(
    prompter.messages.filter((message) => message === "Vercel project ID: ")
      .length,
    1,
  );
  assert.equal(
    prompter.messages.filter(
      (message) =>
        message ===
        "Canonical Production origin (ex. https://demo.example.com): ",
    ).length,
    2,
  );
  assert.deepEqual(prompter.invalidMessages, [
    "Vercel team ID is required. もう一度入力してください。",
    "Vercel team ID is invalid. もう一度入力してください。",
    "Vercel canonical origin must be an exact HTTPS origin. もう一度入力してください。",
  ]);
  const storedConfig = JSON.parse(
    runner.parameters.get(DEPLOY_CONFIG_PARAMETER)?.Value ?? "{}",
  ) as StoredDeploymentConfig;
  assert.equal(storedConfig.vercel.canonicalOrigin, "https://example.com");
});

test("in-progress setup displays all saved, missing, and retry-required items without secret values", async () => {
  const partialValues: StoredDeploymentSetupDraft["values"] = {
    "vercel.orgId": completeDraftValues["vercel.orgId"],
    "vercel.projectId": completeDraftValues["vercel.projectId"],
  };
  const draft = createDraft({ vercelToken: 1, neonApiKey: 1 }, partialValues);
  const parameters = new Map<string, StoredParameter>([
    [
      DEPLOY_CONFIG_PARAMETER,
      { Type: "String", Value: JSON.stringify(draft), Version: 4 },
    ],
    [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      { Type: "SecureString", Value: vercelToken, Version: 1 },
    ],
  ]);
  const runner = new AwsSetupRunner({ parameters, hasKms: true });
  const prompter = new SetupPrompter(
    [...initialVisibleAnswers.slice(2)],
    [neonApiKey, neonApiKey, adminPassword, adminPassword],
  );

  await runAwsSetup(
    runner,
    prompter,
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, neonApiKey),
  );

  assert.equal(prompter.notices.length, 1);
  const status = prompter.notices[0] ?? "";
  assert.match(status, /^現在の設定状況:/);
  assert.equal(
    status
      .split("\n")
      .filter((line) => /^  \[(?:保存済み|未設定|再入力が必要)\]/.test(line))
      .length,
    14,
    status,
  );
  assert.match(status, /\[保存済み\] Vercel team ID: team_abc123/);
  assert.match(status, /\[未設定\] Vercel project name/);
  assert.match(
    status,
    /\[保存済み\] Vercel access token: 値は非表示 \(SSM version 1\)/,
  );
  assert.match(
    status,
    /\[再入力が必要\] Neon API key: 値は非表示 \(予定 SSM version 1\)/,
  );
  assert.match(status, /\[未設定\] Administrator password/);
  assert.match(status, /未完了の項目から設定を再開します。$/);
  assert.ok(!status.includes(vercelToken));
  assert.ok(!status.includes(neonApiKey));
  assert.ok(!status.includes(adminPassword));
});

test("in-progress setup resumes without re-prompting saved fields and secret", async () => {
  const draft = createDraft({ vercelToken: 1 });
  const parameters = new Map<string, StoredParameter>([
    [
      DEPLOY_CONFIG_PARAMETER,
      { Type: "String", Value: JSON.stringify(draft), Version: 12 },
    ],
    [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      { Type: "SecureString", Value: vercelToken, Version: 1 },
    ],
  ]);
  const runner = new AwsSetupRunner({ parameters, hasKms: true });
  const prompter = new SetupPrompter(
    [],
    [neonApiKey, neonApiKey, adminPassword, adminPassword],
  );

  await runAwsSetup(
    runner,
    prompter,
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, neonApiKey),
  );

  assert.match(prompter.messages[0] ?? "", /setup 123456789012/);
  assert.ok(
    !prompter.messages.some((message) =>
      message.startsWith("Vercel access token"),
    ),
  );
  assert.ok(
    !prompter.messages.some((message) =>
      initialVisibleAnswers.some((_answer, index) =>
        message.startsWith(
          [
            "Vercel team ID",
            "Vercel project ID",
            "Vercel project name",
            "Canonical Production origin",
            "Neon project ID",
            "Neon project name",
            "Neon branch ID",
            "Neon database name",
            "Neon role name",
            "Administrator email",
          ][index] ?? "",
        ),
      ),
    ),
  );
  assert.deepEqual(
    parameterPutInputs(runner).map(({ Name }) => Name),
    [
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_NEON_API_KEY_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_DEVELOPER_API_KEY_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
    ],
  );
});

test("prepared secret version resumes after a crash before SecureString write", async () => {
  const draft = createDraft({ vercelToken: 1 });
  const parameters = new Map<string, StoredParameter>([
    [
      DEPLOY_CONFIG_PARAMETER,
      { Type: "String", Value: JSON.stringify(draft), Version: 12 },
    ],
  ]);
  const runner = new AwsSetupRunner({ parameters, hasKms: true });
  const prompter = new SetupPrompter(
    [],
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
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, neonApiKey),
  );

  assert.deepEqual(
    parameterPutInputs(runner).map(({ Name }) => Name),
    [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_NEON_API_KEY_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_DEVELOPER_API_KEY_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
    ],
  );
});

test("in-progress setup rejects orphan and mismatched secret versions", async () => {
  const orphanParameters = new Map<string, StoredParameter>([
    [
      DEPLOY_CONFIG_PARAMETER,
      { Type: "String", Value: JSON.stringify(createDraft()), Version: 12 },
    ],
    [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      { Type: "SecureString", Value: vercelToken, Version: 1 },
    ],
  ]);
  const orphanRunner = new AwsSetupRunner({
    parameters: orphanParameters,
    hasKms: true,
  });
  await assert.rejects(
    runAwsSetup(
      orphanRunner,
      new SetupPrompter(),
      new SecretRegistry(),
      { profile: "splai-prd", reconfigure: false },
      providerFetch,
    ),
    /exists without a prepared setup draft version/,
  );
  assert.equal(parameterPutInputs(orphanRunner).length, 0);

  const mismatchedParameters = new Map<string, StoredParameter>([
    [
      DEPLOY_CONFIG_PARAMETER,
      {
        Type: "String",
        Value: JSON.stringify(createDraft({ vercelToken: 3 })),
        Version: 12,
      },
    ],
    [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      { Type: "SecureString", Value: vercelToken, Version: 1 },
    ],
  ]);
  const mismatchedRunner = new AwsSetupRunner({
    parameters: mismatchedParameters,
    hasKms: true,
  });
  await assert.rejects(
    runAwsSetup(
      mismatchedRunner,
      new SetupPrompter(),
      new SecretRegistry(),
      { profile: "splai-prd", reconfigure: false },
      providerFetch,
    ),
    /version does not match the prepared setup draft/,
  );
  assert.equal(parameterPutInputs(mismatchedRunner).length, 0);
});

test("complete setup displays current values and validates without writes", async () => {
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
  });
  const prompter = new SetupPrompter([""]);
  await runAwsSetup(
    runner,
    prompter,
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    providerFetch,
  );
  assert.equal(prompter.messages.length, 1);
  const menu = prompter.messages[0] ?? "";
  assert.match(menu, /^設定完了項目:/);
  assert.match(menu, /  1\. Vercel team ID: team_abc123/);
  assert.match(
    menu,
    /  4\. Canonical Production origin: https:\/\/example\.com/,
  );
  assert.match(menu, /  10\. Administrator email: admin@example\.com/);
  assert.match(menu, /  11\. Vercel access token: 設定済み \(SSM version 1\)/);
  assert.match(menu, /  12\. Neon API key: 設定済み \(SSM version 1\)/);
  assert.match(
    menu,
    /  13\. Administrator password: 設定済み \(SSM version 1\)/,
  );
  assert.match(menu, /更新する設定番号を選択してください。/);
  assert.ok(!menu.includes(vercelToken));
  assert.ok(!menu.includes(neonApiKey));
  assert.ok(!menu.includes(adminPassword));
  assert.ok(
    !runner.calls.some(
      ({ arguments_ }) =>
        arguments_[1] === "put-parameter" ||
        arguments_[1] === "create-key" ||
        arguments_[1] === "create-alias",
    ),
  );
});

test("completed setup menu updates only one visible field", async () => {
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
  });
  const prompter = new SetupPrompter(["99", "10", "updated-admin@example.com"]);

  await runAwsSetup(
    runner,
    prompter,
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, neonApiKey),
  );

  assert.deepEqual(prompter.invalidMessages, [
    "選択値が不正です。0から13の番号を入力してください。",
  ]);
  assert.equal(
    prompter.messages.filter((message) =>
      message.includes("更新する設定番号を選択してください。"),
    ).length,
    2,
  );
  assert.match(
    prompter.messages[0] ?? "",
    /  10\. Administrator email: admin@example\.com/,
  );
  assert.ok(
    prompter.messages.includes("Administrator email [admin@example.com]: "),
  );
  assert.deepEqual(
    parameterPutInputs(runner).map(({ Name }) => Name),
    [DEPLOY_CONFIG_PARAMETER],
  );
  const storedConfig = JSON.parse(
    runner.parameters.get(DEPLOY_CONFIG_PARAMETER)?.Value ?? "{}",
  ) as StoredDeploymentConfig;
  assert.equal(storedConfig.admin.email, "updated-admin@example.com");
  assert.deepEqual(storedConfig.secretVersions, {
    vercelToken: 1,
    neonApiKey: 1,
    adminPassword: 1,
    developerApiSettingsEncryptionKey: 1,
  });
});

test("completed setup menu rotates only one selected secret", async () => {
  const runner = new AwsSetupRunner({
    parameters: completeParameters(),
    hasKms: true,
  });
  const rotatedNeonKey = "menu-rotated-neon-key-123456";

  await runAwsSetup(
    runner,
    new SetupPrompter(["12"], [rotatedNeonKey, rotatedNeonKey]),
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, rotatedNeonKey),
  );

  const puts = parameterPutInputs(runner);
  assert.deepEqual(
    puts.map(({ Name }) => Name),
    [
      DEPLOY_CONFIG_PARAMETER,
      DEPLOY_NEON_API_KEY_PARAMETER,
      DEPLOY_CONFIG_PARAMETER,
    ],
  );
  const prepared = JSON.parse(
    puts[0]?.Value ?? "{}",
  ) as StoredDeploymentSetupDraft;
  assert.equal(prepared.schemaVersion, 4);
  assert.equal(prepared.secretVersions.neonApiKey, 2);
  assert.equal(
    runner.parameters.get(DEPLOY_VERCEL_TOKEN_PARAMETER)?.Value,
    vercelToken,
  );
  assert.equal(
    runner.parameters.get(DEPLOY_NEON_API_KEY_PARAMETER)?.Value,
    rotatedNeonKey,
  );
  assert.equal(
    runner.parameters.get(DEPLOY_ADMIN_PASSWORD_PARAMETER)?.Value,
    adminPassword,
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
    new SetupPrompter([""]),
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
    !runner.calls.some(({ arguments_ }) => arguments_[1] === "put-parameter"),
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
      arguments_[0] === "kms" && arguments_[1] === "get-key-rotation-status",
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
    strictProviderFetch(vercelToken, rotatedNeonKey),
  );
  const puts = parameterPutInputs(runner);
  const putNames = puts.map(({ Name }) => Name);
  assert.deepEqual(putNames, [
    DEPLOY_CONFIG_PARAMETER,
    DEPLOY_NEON_API_KEY_PARAMETER,
    DEPLOY_CONFIG_PARAMETER,
  ]);
  const prepared = JSON.parse(
    puts[0]?.Value ?? "{}",
  ) as StoredDeploymentSetupDraft;
  assert.equal(prepared.schemaVersion, 4);
  assert.deepEqual(prepared.secretVersions, {
    vercelToken: 1,
    neonApiKey: 2,
    adminPassword: 1,
    developerApiSettingsEncryptionKey: 1,
  });
  const storedConfig = JSON.parse(
    runner.parameters.get(DEPLOY_CONFIG_PARAMETER)?.Value ?? "{}",
  ) as StoredDeploymentConfig;
  assert.deepEqual(storedConfig.secretVersions, {
    vercelToken: 1,
    neonApiKey: 2,
    adminPassword: 1,
    developerApiSettingsEncryptionKey: 1,
  });
  assert.equal(
    runner.parameters.get(DEPLOY_NEON_API_KEY_PARAMETER)?.Value,
    rotatedNeonKey,
  );
});

test("invalid and mismatched secrets retry only the current item", async () => {
  const runner = new AwsSetupRunner();
  const prompter = new SetupPrompter(
    [...initialVisibleAnswers],
    [
      vercelToken,
      `${vercelToken}-mismatch`,
      "short",
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
    new SecretRegistry(),
    { profile: "splai-prd", reconfigure: false },
    strictProviderFetch(vercelToken, neonApiKey),
  );
  assert.deepEqual(
    prompter.messages.filter((message) =>
      message.startsWith("Vercel access token"),
    ),
    [
      "Vercel access token: ",
      "Vercel access token (again): ",
      "Vercel access token: ",
      "Vercel access token: ",
      "Vercel access token (again): ",
    ],
  );
  assert.equal(
    prompter.messages.filter((message) => message === "Vercel team ID: ")
      .length,
    1,
  );
  assert.deepEqual(prompter.invalidMessages, [
    "Vercel access token confirmation did not match. もう一度入力してください。",
    "Vercel access token is invalid. もう一度入力してください。",
  ]);
  assert.equal(
    parameterPutInputs(runner).filter(
      ({ Name }) => Name === DEPLOY_VERCEL_TOKEN_PARAMETER,
    ).length,
    1,
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
    developerApiSettingsEncryptionKey: 1,
  });
});

function legacyParameters(schema: 1 | 2 = 1): Map<string, StoredParameter> {
  const parameters = completeParameters();
  parameters.delete(DEPLOY_DEVELOPER_API_KEY_PARAMETER);
  const versions = { vercelToken: 1, neonApiKey: 1, adminPassword: 1 };
  const legacy =
    schema === 1
      ? { ...createConfig(), schemaVersion: 1, secretVersions: versions }
      : { ...createDraft(versions), schemaVersion: 2 };
  parameters.set(DEPLOY_CONFIG_PARAMETER, {
    Type: "String",
    Value: JSON.stringify(legacy),
    Version: 1,
  });
  return parameters;
}

const setupOptions = { profile: "splai-prd", reconfigure: false };

test("legacy complete and incomplete setup preserve existing secrets and create the encryption key once", async () => {
  for (const schema of [1, 2] as const) {
    const runner = new AwsSetupRunner({
      parameters: legacyParameters(schema),
      hasKms: true,
      aliasPresent: true,
      rotationEnabled: true,
      rotationPeriodInDays: 365,
    });
    const registry = new SecretRegistry();
    const before = new Map(runner.parameters);
    await runAwsSetup(
      runner,
      new SetupPrompter([`setup ${accountId}`]),
      registry,
      setupOptions,
      providerFetch,
    );
    const key = runner.parameters.get(DEPLOY_DEVELOPER_API_KEY_PARAMETER)!;
    assert.equal(Buffer.from(key.Value, "base64").length, 32);
    assert.equal(key.Version, 1);
    assert.equal(registry.redact(key.Value), "[REDACTED]");
    const keyWrites = parameterPutInputs(runner).filter(
      (p) => p.Name === DEPLOY_DEVELOPER_API_KEY_PARAMETER,
    );
    assert.equal(keyWrites.length, 1);
    assert.equal(keyWrites[0].Overwrite, false);
    assert.equal(keyWrites[0].KeyId, kmsKeyArn);
    for (const name of [
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      DEPLOY_NEON_API_KEY_PARAMETER,
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
    ]) {
      assert.deepEqual(runner.parameters.get(name), before.get(name));
    }
    assert.equal(
      JSON.parse(runner.parameters.get(DEPLOY_CONFIG_PARAMETER)!.Value)
        .schemaVersion,
      3,
    );
    const count = parameterPutInputs(runner).length;
    await runAwsSetup(
      runner,
      new SetupPrompter([""]),
      registry,
      setupOptions,
      providerFetch,
    );
    assert.equal(parameterPutInputs(runner).length, count);
    assert.deepEqual(
      runner.parameters.get(DEPLOY_DEVELOPER_API_KEY_PARAMETER),
      key,
    );
    assert.ok(
      !JSON.stringify(
        runner.calls.filter((c) => c.arguments_[1] !== "put-parameter"),
      ).includes(key.Value),
    );
  }
});

test("setup resumes crashes before and after key creation without overwriting a saved key", async () => {
  for (const crashAfterWrite of [false, true]) {
    const runner = new AwsSetupRunner({
      parameters: legacyParameters(),
      hasKms: true,
      aliasPresent: true,
      rotationEnabled: true,
      rotationPeriodInDays: 365,
    });
    const baseWriter = createTestParameterWriter(runner);
    const writer: DeploymentParameterWriter = {
      async put(input) {
        if (input.Name === DEPLOY_DEVELOPER_API_KEY_PARAMETER) {
          if (crashAfterWrite) await baseWriter.put(input, "test");
          throw new Error("simulated interruption");
        }
        return baseWriter.put(input, "test");
      },
      destroy() {},
    };
    await assert.rejects(
      runAwsSetupImplementation(
        runner,
        new SetupPrompter([`setup ${accountId}`]),
        new SecretRegistry(),
        setupOptions,
        providerFetch,
        writer,
      ),
      /simulated interruption/,
    );
    const saved = runner.parameters.get(DEPLOY_DEVELOPER_API_KEY_PARAMETER);
    await runAwsSetup(
      runner,
      new SetupPrompter([`setup ${accountId}`]),
      new SecretRegistry(),
      setupOptions,
      providerFetch,
    );
    const key = runner.parameters.get(DEPLOY_DEVELOPER_API_KEY_PARAMETER)!;
    assert.equal(key.Version, 1);
    if (saved) assert.deepEqual(key, saved);
    assert.equal(
      parameterPutInputs(runner).filter(
        (p) => p.Name === DEPLOY_DEVELOPER_API_KEY_PARAMETER,
      ).length,
      1,
    );
  }
});

test("missing, invalid, orphaned or mismatched registered encryption keys never trigger writes", async () => {
  for (const mode of [
    "missing",
    "invalid",
    "version",
    "kms",
    "orphan",
    "legacy-missing-secret",
  ] as const) {
    const parameters =
      mode === "orphan" || mode === "legacy-missing-secret"
        ? legacyParameters()
        : completeParameters();
    if (mode === "missing")
      parameters.delete(DEPLOY_DEVELOPER_API_KEY_PARAMETER);
    if (mode === "invalid")
      parameters.get(DEPLOY_DEVELOPER_API_KEY_PARAMETER)!.Value =
        "synthetic-invalid-key";
    if (mode === "version")
      parameters.get(DEPLOY_DEVELOPER_API_KEY_PARAMETER)!.Version = 2;
    if (mode === "kms")
      parameters.get(DEPLOY_DEVELOPER_API_KEY_PARAMETER)!.KeyId = "wrong-key";
    if (mode === "orphan")
      parameters.set(DEPLOY_DEVELOPER_API_KEY_PARAMETER, {
        Type: "SecureString",
        Value: Buffer.alloc(32).toString("base64"),
        Version: 1,
      });
    if (mode === "legacy-missing-secret")
      parameters.delete(DEPLOY_ADMIN_PASSWORD_PARAMETER);
    const runner = new AwsSetupRunner({
      parameters,
      hasKms: true,
      aliasPresent: true,
      rotationEnabled: true,
      rotationPeriodInDays: 365,
    });
    await assert.rejects(
      runAwsSetup(
        runner,
        new SetupPrompter(),
        new SecretRegistry(),
        setupOptions,
        providerFetch,
      ),
    );
    assert.equal(parameterPutInputs(runner).length, 0, mode);
  }
});


test("a registered key lost during another secret update is never regenerated", async () => {
  const parameters = completeParameters();
  parameters.delete(DEPLOY_DEVELOPER_API_KEY_PARAMETER);
  parameters.set(DEPLOY_CONFIG_PARAMETER, { Type: "String", Value: JSON.stringify(createDraft(createConfig().secretVersions)), Version: 2 });
  const runner = new AwsSetupRunner({ parameters, hasKms: true, aliasPresent: true, rotationEnabled: true, rotationPeriodInDays: 365 });
  await assert.rejects(runAwsSetup(runner, new SetupPrompter(), new SecretRegistry(), setupOptions, providerFetch), /Restore the original key/);
  assert.equal(parameterPutInputs(runner).length, 0);
});

test("concurrent key creation fails without overwriting the competing value", async () => {
  const runner = new AwsSetupRunner({ parameters: legacyParameters(), hasKms: true, aliasPresent: true, rotationEnabled: true, rotationPeriodInDays: 365 });
  const baseWriter = createTestParameterWriter(runner);
  const competingValue = Buffer.alloc(32, 99).toString("base64");
  const writer: DeploymentParameterWriter = {
    async put(input) {
      if (input.Name === DEPLOY_DEVELOPER_API_KEY_PARAMETER) {
        assert.equal(input.Overwrite, false);
        runner.parameters.set(input.Name, { Type: "SecureString", Value: competingValue, Version: 1 });
        throw new Error("ParameterAlreadyExists");
      }
      return baseWriter.put(input, "test");
    }, destroy() {},
  };
  await assert.rejects(runAwsSetupImplementation(runner, new SetupPrompter([`setup ${accountId}`]), new SecretRegistry(), setupOptions, providerFetch, writer), /ParameterAlreadyExists/);
  assert.equal(runner.parameters.get(DEPLOY_DEVELOPER_API_KEY_PARAMETER)!.Value, competingValue);
  assert.equal(JSON.parse(runner.parameters.get(DEPLOY_CONFIG_PARAMETER)!.Value).schemaVersion, 4);
});


test("malformed setup config never exposes its contents in an error", async () => {
  const parameters = completeParameters();
  const secret = "synthetic-config-fragment-secret";
  parameters.get(DEPLOY_CONFIG_PARAMETER)!.Value = `{"secret":"${secret}"`;
  const runner = new AwsSetupRunner({ parameters });
  await assert.rejects(runAwsSetup(runner, new SetupPrompter(), new SecretRegistry(), setupOptions, providerFetch), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /invalid JSON/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
  assert.equal(parameterPutInputs(runner).length, 0);
});
