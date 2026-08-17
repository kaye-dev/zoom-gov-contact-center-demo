import {
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
  DEPLOY_CONFIG_PARAMETER,
  DEPLOY_KMS_ALIAS,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_PARAMETER_NAMES,
  DEPLOY_REGION,
  DEPLOY_VERCEL_TOKEN_PARAMETER,
  InvalidDeploymentConfigurationError,
  parseStoredDeploymentConfig,
  type DeploymentSecrets,
  type StoredDeploymentConfig,
  validateAwsProfileName,
} from "./aws-config";
import { requireExact, type Prompter } from "./input";
import {
  combinedOutput,
  type CommandResult,
  type CommandRunner,
  type SecretRegistry,
} from "./process";

export type RotatableDeploymentSecret =
  | "vercel-token"
  | "neon-api-key"
  | "admin-password";

export type AwsSetupOptions = {
  profile: string;
  reconfigure: boolean;
  rotate?: RotatableDeploymentSecret;
};

type SetupParameter = {
  name: string;
  type: "String" | "SecureString";
  value: string;
  version: number;
};

type SetupSnapshot = Map<string, SetupParameter>;

type KmsKey = {
  arn: string;
  id: string;
  aliasPresent: boolean;
  rotationEnabled: boolean;
  rotationPeriodInDays?: number;
};

type NonSecretSetupInput = Omit<
  StoredDeploymentConfig,
  "kmsKeyArn" | "secretVersions"
>;

const EXPECTED_KMS_TAGS = new Map([
  ["Application", "zoom-gov-contact-center-demo"],
  ["Environment", "production"],
  ["ManagedBy", "setup-deploy-aws.sh"],
]);

const PARAMETER_TAGS = [
  { Key: "Application", Value: "zoom-gov-contact-center-demo" },
  { Key: "Environment", Value: "production" },
  { Key: "ManagedBy", Value: "setup-deploy-aws.sh" },
];

export async function runAwsSetup(
  runner: CommandRunner,
  prompter: Prompter,
  secrets: SecretRegistry,
  options: AwsSetupOptions,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  const profile = validateAwsProfileName(options.profile);
  const identity = readCallerIdentity(runner, profile);
  console.log(`AWS profile: ${profile}`);
  console.log(`AWS account: ${identity.accountId}`);
  console.log(`AWS principal: ${identity.arn}`);
  console.log(`AWS region: ${DEPLOY_REGION}`);

  const snapshot = readSetupSnapshot(runner, profile);
  const existingConfig = readExistingConfig(snapshot);
  if (
    existingConfig !== undefined &&
    existingConfig.aws.accountId !== identity.accountId
  ) {
    throw new InvalidDeploymentConfigurationError(
      "The existing deployment config belongs to a different AWS account.",
    );
  }

  const existingSecrets = readExistingSecrets(snapshot);
  secrets.add(
    existingSecrets.vercelToken,
    existingSecrets.neonApiKey,
    existingSecrets.adminPassword,
  );

  const kms = inspectConfiguredKmsKey(
    runner,
    profile,
    existingConfig?.kmsKeyArn,
    identity.accountId,
  );
  if (
    kms === undefined &&
    (existingSecrets.vercelToken !== undefined ||
      existingSecrets.neonApiKey !== undefined ||
      existingSecrets.adminPassword !== undefined)
  ) {
    throw new InvalidDeploymentConfigurationError(
      "SecureString deployment parameters exist without a managed KMS alias or config. No key was created; reconcile the existing parameters manually.",
    );
  }
  if (kms !== undefined) {
    assertExistingParameterMetadata(runner, profile, snapshot, kms.arn);
  }

  const complete = DEPLOY_PARAMETER_NAMES.every((name) => snapshot.has(name));
  if (complete && !options.reconfigure && options.rotate === undefined) {
    if (
      kms === undefined ||
      !kms.aliasPresent ||
      !kms.rotationEnabled ||
      kms.rotationPeriodInDays !== 365
    ) {
      throw new InvalidDeploymentConfigurationError(
        "The deployment parameters exist, but the managed KMS configuration is incomplete. Re-run setup with --reconfigure.",
      );
    }
    if (existingConfig === undefined) {
      throw new InvalidDeploymentConfigurationError(
        "The complete deployment snapshot did not contain its config.",
      );
    }
    const completeSecrets = requireCompleteDeploymentSecrets(existingSecrets);
    assertSnapshotSecretVersions(snapshot, existingConfig);
    await verifyProviderTargets(
      existingConfig,
      completeSecrets,
      fetchImplementation,
    );
    console.log("AWS deployment settings are already configured and valid.");
    return;
  }

  const nonSecretInput =
    existingConfig === undefined || options.reconfigure
      ? await promptNonSecretInput(
          prompter,
          identity.accountId,
          existingConfig,
        )
      : withoutSecretMetadata(existingConfig);
  const desiredSecrets = await collectDesiredSecrets(
    prompter,
    existingSecrets,
    options.rotate,
  );
  secrets.add(
    desiredSecrets.vercelToken,
    desiredSecrets.neonApiKey,
    desiredSecrets.adminPassword,
  );
  const configForValidation = buildConfig(
    nonSecretInput,
    kms?.arn ?? placeholderKmsArn(identity.accountId),
    {
      vercelToken: snapshot.get(DEPLOY_VERCEL_TOKEN_PARAMETER)?.version ?? 1,
      neonApiKey: snapshot.get(DEPLOY_NEON_API_KEY_PARAMETER)?.version ?? 1,
      adminPassword:
        snapshot.get(DEPLOY_ADMIN_PASSWORD_PARAMETER)?.version ?? 1,
    },
  );
  await verifyProviderTargets(
    configForValidation,
    desiredSecrets,
    fetchImplementation,
  );

  await requireExact(
    prompter,
    `AWS account ${identity.accountId} のKMS/SSM設定を書き込む場合は 'setup ${identity.accountId}' と入力してください。`,
    `setup ${identity.accountId}`,
    "AWS deployment setup was cancelled before any write.",
  );

  const configuredKms = ensureKmsConfiguration(
    runner,
    profile,
    kms,
    identity.accountId,
  );
  assertExistingParameterMetadata(
    runner,
    profile,
    snapshot,
    configuredKms.arn,
  );

  const versions = {
    vercelToken: putSecretIfNeeded(
      runner,
      profile,
      snapshot,
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      desiredSecrets.vercelToken,
      configuredKms.arn,
      options.rotate === "vercel-token",
    ),
    neonApiKey: putSecretIfNeeded(
      runner,
      profile,
      snapshot,
      DEPLOY_NEON_API_KEY_PARAMETER,
      desiredSecrets.neonApiKey,
      configuredKms.arn,
      options.rotate === "neon-api-key",
    ),
    adminPassword: putSecretIfNeeded(
      runner,
      profile,
      snapshot,
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
      desiredSecrets.adminPassword,
      configuredKms.arn,
      options.rotate === "admin-password",
    ),
  };
  const config = buildConfig(nonSecretInput, configuredKms.arn, versions);
  putParameter(
    runner,
    profile,
    {
      Name: DEPLOY_CONFIG_PARAMETER,
      Description:
        "Validated Production deployment target configuration for the Zoom Government Contact Center demo.",
      Type: "String",
      Value: JSON.stringify(config),
      Tier: "Standard",
      Overwrite: snapshot.has(DEPLOY_CONFIG_PARAMETER),
      ...(snapshot.has(DEPLOY_CONFIG_PARAMETER) ? {} : { Tags: PARAMETER_TAGS }),
    },
    false,
  );

  await verifyProviderTargets(
    config,
    desiredSecrets,
    fetchImplementation,
  );
  console.log("AWS deployment settings were created and verified.");
}

export function parseAwsSetupArguments(
  arguments_: readonly string[],
): AwsSetupOptions {
  let profile: string | undefined;
  let reconfigure = false;
  let rotate: RotatableDeploymentSecret | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--profile") {
      if (profile !== undefined || index + 1 >= arguments_.length) {
        throw new Error("--profile must be specified exactly once with a value.");
      }
      profile = validateAwsProfileName(arguments_[index + 1]);
      index += 1;
      continue;
    }
    if (argument === "--reconfigure") {
      if (reconfigure) {
        throw new Error("--reconfigure must not be repeated.");
      }
      reconfigure = true;
      continue;
    }
    if (argument === "--rotate") {
      if (rotate !== undefined || index + 1 >= arguments_.length) {
        throw new Error("--rotate must be specified at most once with a value.");
      }
      const value = arguments_[index + 1];
      if (
        value !== "vercel-token" &&
        value !== "neon-api-key" &&
        value !== "admin-password"
      ) {
        throw new Error(
          "--rotate must be vercel-token, neon-api-key, or admin-password.",
        );
      }
      rotate = value;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported setup argument: ${argument}`);
  }
  if (profile === undefined) {
    throw new Error("--profile is required by the setup container entrypoint.");
  }
  return {
    profile,
    reconfigure,
    ...(rotate === undefined ? {} : { rotate }),
  };
}

function readCallerIdentity(
  runner: CommandRunner,
  profile: string,
): { accountId: string; arn: string } {
  const response = runAwsJson(
    runner,
    profile,
    ["sts", "get-caller-identity"],
    "AWS caller identity check",
  );
  if (
    typeof response.Account !== "string" ||
    !/^\d{12}$/.test(response.Account) ||
    typeof response.Arn !== "string" ||
    !response.Arn.startsWith("arn:aws:")
  ) {
    throw new Error("AWS caller identity returned an invalid response.");
  }
  return { accountId: response.Account, arn: response.Arn };
}

function readSetupSnapshot(
  runner: CommandRunner,
  profile: string,
): SetupSnapshot {
  const response = runAwsJson(
    runner,
    profile,
    [
      "ssm",
      "get-parameters",
      "--names",
      ...DEPLOY_PARAMETER_NAMES,
      "--with-decryption",
    ],
    "SSM setup inspection",
  );
  if (
    !Array.isArray(response.Parameters) ||
    !Array.isArray(response.InvalidParameters)
  ) {
    throw new Error("SSM setup inspection returned an invalid response.");
  }
  const expected = new Set<string>(DEPLOY_PARAMETER_NAMES);
  const snapshot = new Map<string, SetupParameter>();
  for (const value of response.Parameters) {
    if (!isRecord(value)) {
      throw new Error("SSM setup inspection returned an invalid parameter.");
    }
    const { Name: name, Type: type, Value: parameterValue, Version: version } =
      value;
    if (
      typeof name !== "string" ||
      !expected.has(name) ||
      snapshot.has(name) ||
      (type !== "String" && type !== "SecureString") ||
      typeof parameterValue !== "string" ||
      !Number.isSafeInteger(version) ||
      (version as number) < 1
    ) {
      throw new Error("SSM setup inspection returned invalid metadata.");
    }
    snapshot.set(name, {
      name,
      type,
      value: parameterValue,
      version: version as number,
    });
  }
  if (
    !response.InvalidParameters.every(
      (name) => typeof name === "string" && expected.has(name),
    )
  ) {
    throw new Error("SSM setup inspection returned an unexpected parameter name.");
  }
  return snapshot;
}

function readExistingConfig(
  snapshot: SetupSnapshot,
): StoredDeploymentConfig | undefined {
  const parameter = snapshot.get(DEPLOY_CONFIG_PARAMETER);
  if (parameter === undefined) {
    return undefined;
  }
  if (parameter.type !== "String") {
    throw new Error(`${DEPLOY_CONFIG_PARAMETER} must have type String.`);
  }
  return parseStoredDeploymentConfig(parameter.value);
}

function readExistingSecrets(snapshot: SetupSnapshot): Partial<DeploymentSecrets> {
  const read = (name: string): string | undefined => {
    const parameter = snapshot.get(name);
    if (parameter === undefined) {
      return undefined;
    }
    if (parameter.type !== "SecureString" || !parameter.value) {
      throw new Error(`${name} must be a non-empty SecureString.`);
    }
    return parameter.value;
  };
  return {
    vercelToken: read(DEPLOY_VERCEL_TOKEN_PARAMETER),
    neonApiKey: read(DEPLOY_NEON_API_KEY_PARAMETER),
    adminPassword: read(DEPLOY_ADMIN_PASSWORD_PARAMETER),
  };
}

function requireCompleteDeploymentSecrets(
  secrets: Partial<DeploymentSecrets>,
): DeploymentSecrets {
  if (
    secrets.vercelToken === undefined ||
    secrets.neonApiKey === undefined ||
    secrets.adminPassword === undefined
  ) {
    throw new InvalidDeploymentConfigurationError(
      "The complete deployment snapshot did not contain all secrets.",
    );
  }
  return {
    vercelToken: secrets.vercelToken,
    neonApiKey: secrets.neonApiKey,
    adminPassword: secrets.adminPassword,
  };
}

function assertSnapshotSecretVersions(
  snapshot: SetupSnapshot,
  config: StoredDeploymentConfig,
): void {
  const checks = [
    [DEPLOY_VERCEL_TOKEN_PARAMETER, config.secretVersions.vercelToken],
    [DEPLOY_NEON_API_KEY_PARAMETER, config.secretVersions.neonApiKey],
    [DEPLOY_ADMIN_PASSWORD_PARAMETER, config.secretVersions.adminPassword],
  ] as const;
  for (const [name, expectedVersion] of checks) {
    if (snapshot.get(name)?.version !== expectedVersion) {
      throw new InvalidDeploymentConfigurationError(
        `${name} version does not match the deployment config.`,
      );
    }
  }
}

async function collectDesiredSecrets(
  prompter: Prompter,
  existing: Partial<DeploymentSecrets>,
  rotate: RotatableDeploymentSecret | undefined,
): Promise<DeploymentSecrets> {
  const vercelToken =
    existing.vercelToken !== undefined && rotate !== "vercel-token"
      ? existing.vercelToken
      : validateSecret(
          await prompter.hidden("Vercel access token: "),
          "Vercel access token",
          16,
        );
  const neonApiKey =
    existing.neonApiKey !== undefined && rotate !== "neon-api-key"
      ? existing.neonApiKey
      : validateSecret(
          await prompter.hidden("Neon API key: "),
          "Neon API key",
          16,
        );
  let adminPassword = existing.adminPassword;
  if (adminPassword === undefined || rotate === "admin-password") {
    const first = validateSecret(
      await prompter.hidden("Administrator password: "),
      "Administrator password",
      12,
      128,
    );
    const second = await prompter.hidden("Administrator password (again): ");
    if (first !== second) {
      throw new Error("Administrator password confirmation did not match.");
    }
    adminPassword = first;
  }
  return {
    vercelToken: validateSecret(vercelToken, "Vercel access token", 16),
    neonApiKey: validateSecret(neonApiKey, "Neon API key", 16),
    adminPassword: validateSecret(
      adminPassword,
      "Administrator password",
      12,
      128,
    ),
  };
}

async function promptNonSecretInput(
  prompter: Prompter,
  accountId: string,
  existing?: StoredDeploymentConfig,
): Promise<NonSecretSetupInput> {
  const ask = async (label: string, current?: string): Promise<string> => {
    const answer = (
      await prompter.ask(`${label}${current ? ` [${current}]` : ""}: `)
    ).trim();
    if (answer) {
      return answer;
    }
    if (current) {
      return current;
    }
    throw new Error(`${label} is required.`);
  };
  return {
    schemaVersion: 1,
    policyVersion: "demo-v1",
    aws: { accountId, region: DEPLOY_REGION },
    vercel: {
      orgId: await ask("Vercel org ID", existing?.vercel.orgId),
      projectId: await ask("Vercel project ID", existing?.vercel.projectId),
      projectName: await ask(
        "Vercel project name",
        existing?.vercel.projectName,
      ),
      canonicalOrigin: await ask(
        "Canonical Production origin",
        existing?.vercel.canonicalOrigin,
      ),
      expectedPlan: "hobby",
    },
    neon: {
      projectId: await ask("Neon project ID", existing?.neon.projectId),
      projectName: await ask("Neon project name", existing?.neon.projectName),
      branchId: await ask("Neon branch ID", existing?.neon.branchId),
      databaseName: await ask(
        "Neon database name",
        existing?.neon.databaseName,
      ),
      roleName: await ask("Neon role name", existing?.neon.roleName),
      regionId: "aws-ap-southeast-1",
      expectedPlan: "free",
    },
    admin: {
      email: await ask("Administrator email", existing?.admin.email),
    },
  };
}

function inspectConfiguredKmsKey(
  runner: CommandRunner,
  profile: string,
  configuredArn: string | undefined,
  accountId: string,
): KmsKey | undefined {
  const aliasResult = runAws(
    runner,
    profile,
    ["kms", "describe-key", "--key-id", DEPLOY_KMS_ALIAS],
  );
  let keyId: string | undefined;
  let aliasPresent = true;
  if (aliasResult.status !== 0) {
    if (!/NotFoundException/i.test(combinedOutput(aliasResult))) {
      throwAwsFailure(aliasResult, "KMS alias inspection");
    }
    aliasPresent = false;
    keyId = configuredArn;
  } else {
    keyId = readKmsMetadata(aliasResult.stdout).arn;
  }
  if (keyId === undefined) {
    return undefined;
  }
  const described = runAwsJson(
    runner,
    profile,
    ["kms", "describe-key", "--key-id", keyId],
    "KMS key inspection",
  );
  const metadata = readKmsMetadata(JSON.stringify(described));
  const expectedArnPrefix = `arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/`;
  if (
    !metadata.arn.startsWith(expectedArnPrefix) ||
    (configuredArn !== undefined && configuredArn !== metadata.arn)
  ) {
    throw new Error("The managed KMS alias points to an unexpected key.");
  }
  const tagsResponse = runAwsJson(
    runner,
    profile,
    ["kms", "list-resource-tags", "--key-id", metadata.arn],
    "KMS tag inspection",
  );
  if (!Array.isArray(tagsResponse.Tags)) {
    throw new Error("KMS tag inspection returned an invalid response.");
  }
  const actualTags = new Map<string, string>();
  for (const tag of tagsResponse.Tags) {
    if (
      !isRecord(tag) ||
      typeof tag.TagKey !== "string" ||
      typeof tag.TagValue !== "string"
    ) {
      throw new Error("KMS tag inspection returned an invalid tag.");
    }
    actualTags.set(tag.TagKey, tag.TagValue);
  }
  for (const [key, value] of EXPECTED_KMS_TAGS) {
    if (actualTags.get(key) !== value) {
      throw new Error(`The managed KMS key tag '${key}' does not match.`);
    }
  }
  const rotation = inspectKmsRotation(runner, profile, metadata.arn);
  return {
    arn: metadata.arn,
    id: metadata.id,
    aliasPresent,
    ...rotation,
  };
}

function inspectKmsRotation(
  runner: CommandRunner,
  profile: string,
  keyArn: string,
): Pick<KmsKey, "rotationEnabled" | "rotationPeriodInDays"> {
  const rotation = runAwsJson(
    runner,
    profile,
    ["kms", "get-key-rotation-status", "--key-id", keyArn],
    "KMS rotation inspection",
  );
  if (typeof rotation.KeyRotationEnabled !== "boolean") {
    throw new Error("KMS rotation inspection returned an invalid response.");
  }
  const period = rotation.RotationPeriodInDays;
  if (
    period !== undefined &&
    (!Number.isSafeInteger(period) || (period as number) < 90 || (period as number) > 2560)
  ) {
    throw new Error("KMS rotation inspection returned an invalid response.");
  }
  if (rotation.KeyRotationEnabled && period === undefined) {
    throw new Error("KMS rotation inspection returned an invalid response.");
  }
  return {
    rotationEnabled: rotation.KeyRotationEnabled,
    ...(period === undefined
      ? {}
      : { rotationPeriodInDays: period as number }),
  };
}

function readKmsMetadata(raw: string): { arn: string; id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("KMS key inspection returned invalid JSON.");
  }
  if (!isRecord(parsed) || !isRecord(parsed.KeyMetadata)) {
    throw new Error("KMS key inspection returned invalid metadata.");
  }
  const metadata = parsed.KeyMetadata;
  if (
    typeof metadata.Arn !== "string" ||
    typeof metadata.KeyId !== "string" ||
    metadata.Enabled !== true ||
    metadata.KeyState !== "Enabled" ||
    metadata.KeyUsage !== "ENCRYPT_DECRYPT" ||
    metadata.KeySpec !== "SYMMETRIC_DEFAULT" ||
    metadata.Origin !== "AWS_KMS" ||
    metadata.KeyManager !== "CUSTOMER" ||
    metadata.MultiRegion !== false
  ) {
    throw new Error("The managed KMS key properties do not match.");
  }
  return { arn: metadata.Arn, id: metadata.KeyId };
}

function ensureKmsConfiguration(
  runner: CommandRunner,
  profile: string,
  inspected: KmsKey | undefined,
  accountId: string,
): KmsKey {
  let key = inspected;
  if (key === undefined) {
    const created = runAwsJson(
      runner,
      profile,
      [
        "kms",
        "create-key",
        "--description",
        "Production deployment SecureString key for zoom-gov-contact-center-demo",
        "--key-usage",
        "ENCRYPT_DECRYPT",
        "--key-spec",
        "SYMMETRIC_DEFAULT",
        "--origin",
        "AWS_KMS",
        "--no-multi-region",
        "--tags",
        ...[...EXPECTED_KMS_TAGS].map(
          ([tagKey, tagValue]) => `TagKey=${tagKey},TagValue=${tagValue}`,
        ),
      ],
      "KMS key creation",
    );
    const metadata = readKmsMetadata(JSON.stringify(created));
    if (
      !metadata.arn.startsWith(
        `arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/`,
      )
    ) {
      throw new Error("KMS created a key outside the expected account or region.");
    }
    key = {
      arn: metadata.arn,
      id: metadata.id,
      aliasPresent: false,
      rotationEnabled: false,
    };
  }
  if (!key.rotationEnabled || key.rotationPeriodInDays !== 365) {
    assertAwsSuccess(
      runAws(runner, profile, [
        "kms",
        "enable-key-rotation",
        "--key-id",
        key.arn,
        "--rotation-period-in-days",
        "365",
      ]),
      "KMS key rotation enablement",
    );
    key = { ...key, ...inspectKmsRotation(runner, profile, key.arn) };
    if (!key.rotationEnabled || key.rotationPeriodInDays !== 365) {
      throw new Error(
        "KMS key rotation did not converge to the required 365-day period.",
      );
    }
  }
  if (!key.aliasPresent) {
    assertAwsSuccess(
      runAws(runner, profile, [
        "kms",
        "create-alias",
        "--alias-name",
        DEPLOY_KMS_ALIAS,
        "--target-key-id",
        key.arn,
      ]),
      "KMS alias creation",
    );
    key = { ...key, aliasPresent: true };
  }
  return key;
}

function assertExistingParameterMetadata(
  runner: CommandRunner,
  profile: string,
  snapshot: SetupSnapshot,
  kmsKeyArn: string,
): void {
  for (const name of DEPLOY_PARAMETER_NAMES) {
    if (!snapshot.has(name)) {
      continue;
    }
    const filter = JSON.stringify([
      { Key: "Name", Option: "Equals", Values: [name] },
    ]);
    const response = runAwsJson(
      runner,
      profile,
      [
        "ssm",
        "describe-parameters",
        "--parameter-filters",
        filter,
        "--max-results",
        "10",
      ],
      `SSM metadata inspection for ${name}`,
    );
    if (!Array.isArray(response.Parameters) || response.Parameters.length !== 1) {
      throw new Error(`SSM metadata for ${name} was not returned exactly once.`);
    }
    const metadata = response.Parameters[0];
    if (!isRecord(metadata) || metadata.Name !== name) {
      throw new Error(`SSM metadata for ${name} is invalid.`);
    }
    if (metadata.Tier !== "Standard") {
      throw new Error(`${name} must use the SSM Standard tier.`);
    }
    if (name === DEPLOY_CONFIG_PARAMETER) {
      if (metadata.Type !== "String" || metadata.KeyId !== undefined) {
        throw new Error(`${name} must be an unencrypted String parameter.`);
      }
    } else if (
      metadata.Type !== "SecureString" ||
      metadata.KeyId !== kmsKeyArn
    ) {
      throw new Error(`${name} is not encrypted by the managed KMS key.`);
    }
  }
}

function putSecretIfNeeded(
  runner: CommandRunner,
  profile: string,
  snapshot: SetupSnapshot,
  name: string,
  value: string,
  kmsKeyArn: string,
  rotate: boolean,
): number {
  const existing = snapshot.get(name);
  if (existing !== undefined && !rotate) {
    return existing.version;
  }
  return putParameter(
    runner,
    profile,
    {
      Name: name,
      Description:
        "Secret used only by the controlled Production deployment workflow.",
      Type: "SecureString",
      Value: value,
      KeyId: kmsKeyArn,
      Tier: "Standard",
      Overwrite: existing !== undefined,
      ...(existing === undefined ? { Tags: PARAMETER_TAGS } : {}),
    },
    true,
  );
}

function putParameter(
  runner: CommandRunner,
  profile: string,
  input: Record<string, unknown>,
  containsSecret: boolean,
): number {
  const result = runner.run(
    "aws",
    [
      "ssm",
      "put-parameter",
      "--cli-input-json",
      "file:///dev/stdin",
      "--output",
      "json",
      "--no-cli-pager",
      "--region",
      DEPLOY_REGION,
      "--profile",
      profile,
    ],
    { input: JSON.stringify(input) },
  );
  assertAwsSuccess(
    result,
    containsSecret ? "SecureString write" : "deployment config write",
  );
  let response: unknown;
  try {
    response = JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error("SSM PutParameter returned invalid JSON.");
  }
  if (
    !isRecord(response) ||
    !Number.isSafeInteger(response.Version) ||
    (response.Version as number) < 1
  ) {
    throw new Error("SSM PutParameter did not return a valid version.");
  }
  return response.Version as number;
}

async function verifyProviderTargets(
  config: StoredDeploymentConfig,
  secrets: DeploymentSecrets,
  fetchImplementation: typeof globalThis.fetch,
): Promise<void> {
  await Promise.all([
    verifyVercelTarget(config, secrets.vercelToken, fetchImplementation),
    verifyNeonTarget(config, secrets.neonApiKey, fetchImplementation),
  ]);
}

async function verifyVercelTarget(
  config: StoredDeploymentConfig,
  token: string,
  fetchImplementation: typeof globalThis.fetch,
): Promise<void> {
  const authorization = { Authorization: `Bearer ${token}` };
  const query = `teamId=${encodeURIComponent(config.vercel.orgId)}`;
  const hostname = new URL(config.vercel.canonicalOrigin).hostname;
  const [project, scope, domain] = await Promise.all([
    fetchJson(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(config.vercel.projectId)}?${query}`,
      authorization,
      "Vercel project",
      fetchImplementation,
    ),
    fetchJson(
      `https://api.vercel.com/v2/teams/${encodeURIComponent(config.vercel.orgId)}`,
      authorization,
      "Vercel scope",
      fetchImplementation,
    ),
    fetchJson(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(config.vercel.projectId)}/domains/${encodeURIComponent(hostname)}?${query}`,
      authorization,
      "Vercel domain",
      fetchImplementation,
    ),
  ]);
  if (
    project.id !== config.vercel.projectId ||
    project.name !== config.vercel.projectName ||
    project.accountId !== config.vercel.orgId
  ) {
    throw new Error("The Vercel project does not match the stored target.");
  }
  const scopeValue = isRecord(scope.user) ? scope.user : scope;
  const billing = isRecord(scopeValue.billing) ? scopeValue.billing : undefined;
  if (
    (scopeValue.id !== undefined && scopeValue.id !== config.vercel.orgId) ||
    billing?.plan !== config.vercel.expectedPlan
  ) {
    throw new Error("The Vercel scope does not match the required plan or ID.");
  }
  if (
    domain.name !== hostname ||
    domain.projectId !== config.vercel.projectId ||
    domain.verified !== true ||
    (domain.redirect !== undefined && domain.redirect !== null && domain.redirect !== false) ||
    (domain.gitBranch !== undefined && domain.gitBranch !== null) ||
    (domain.customEnvironmentId !== undefined &&
      domain.customEnvironmentId !== null)
  ) {
    throw new Error("The canonical Vercel domain is not a verified Production target.");
  }
}

async function verifyNeonTarget(
  config: StoredDeploymentConfig,
  apiKey: string,
  fetchImplementation: typeof globalThis.fetch,
): Promise<void> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const base = `https://console.neon.tech/api/v2/projects/${encodeURIComponent(config.neon.projectId)}`;
  const projectResponse = await fetchJson(
    base,
    headers,
    "Neon project",
    fetchImplementation,
  );
  const project = isRecord(projectResponse.project)
    ? projectResponse.project
    : projectResponse;
  if (
    project.id !== config.neon.projectId ||
    project.name !== config.neon.projectName ||
    project.region_id !== config.neon.regionId ||
    typeof project.org_id !== "string" ||
    !project.org_id
  ) {
    throw new Error("The Neon project does not match the stored target.");
  }
  const [organizationResponse, branchResponse, databaseResponse, roleResponse] =
    await Promise.all([
      fetchJson(
        `https://console.neon.tech/api/v2/organizations/${encodeURIComponent(project.org_id)}`,
        headers,
        "Neon organization",
        fetchImplementation,
      ),
      fetchJson(
        `${base}/branches/${encodeURIComponent(config.neon.branchId)}`,
        headers,
        "Neon branch",
        fetchImplementation,
      ),
      fetchJson(
        `${base}/branches/${encodeURIComponent(config.neon.branchId)}/databases/${encodeURIComponent(config.neon.databaseName)}`,
        headers,
        "Neon database",
        fetchImplementation,
      ),
      fetchJson(
        `${base}/branches/${encodeURIComponent(config.neon.branchId)}/roles/${encodeURIComponent(config.neon.roleName)}`,
        headers,
        "Neon role",
        fetchImplementation,
      ),
    ]);
  const organization = isRecord(organizationResponse.organization)
    ? organizationResponse.organization
    : organizationResponse;
  if (
    organization.id !== project.org_id ||
    organization.plan !== config.neon.expectedPlan
  ) {
    throw new Error("The Neon organization does not match the required plan.");
  }
  const branch = isRecord(branchResponse.branch)
    ? branchResponse.branch
    : branchResponse;
  if (
    branch.id !== config.neon.branchId ||
    (branch.project_id !== undefined && branch.project_id !== config.neon.projectId)
  ) {
    throw new Error("The Neon branch does not match the stored target.");
  }
  const database = isRecord(databaseResponse.database)
    ? databaseResponse.database
    : databaseResponse;
  if (
    database.name !== config.neon.databaseName ||
    database.owner_name !== config.neon.roleName ||
    database.branch_id !== config.neon.branchId
  ) {
    throw new Error("The configured Neon database was not found.");
  }
  const role = isRecord(roleResponse.role) ? roleResponse.role : roleResponse;
  if (
    role.name !== config.neon.roleName ||
    role.branch_id !== config.neon.branchId
  ) {
    throw new Error("The configured Neon role was not found.");
  }
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  label: string,
  fetchImplementation: typeof globalThis.fetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: "GET",
      headers: { ...headers, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`${label} API request failed.`);
  }
  if (!response.ok) {
    throw new Error(`${label} API returned HTTP ${response.status}.`);
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(`${label} API returned invalid JSON.`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${label} API returned an invalid response.`);
  }
  return parsed;
}

function buildConfig(
  input: NonSecretSetupInput,
  kmsKeyArn: string,
  secretVersions: StoredDeploymentConfig["secretVersions"],
): StoredDeploymentConfig {
  return parseStoredDeploymentConfig(
    JSON.stringify({ ...input, kmsKeyArn, secretVersions }),
  );
}

function withoutSecretMetadata(
  config: StoredDeploymentConfig,
): NonSecretSetupInput {
  return {
    schemaVersion: config.schemaVersion,
    policyVersion: config.policyVersion,
    aws: config.aws,
    vercel: config.vercel,
    neon: config.neon,
    admin: config.admin,
  };
}

function placeholderKmsArn(accountId: string): string {
  return `arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/00000000-0000-0000-0000-000000000000`;
}

function validateSecret(
  value: string,
  label: string,
  minimum: number,
  maximum = 4_096,
): string {
  if (
    value.length < minimum ||
    value.length > maximum ||
    /[\0\r\n]/.test(value)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function runAwsJson(
  runner: CommandRunner,
  profile: string,
  arguments_: readonly string[],
  description: string,
): Record<string, unknown> {
  const result = runAws(runner, profile, arguments_);
  assertAwsSuccess(result, description);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error(`${description} returned invalid JSON.`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${description} returned an invalid response.`);
  }
  return parsed;
}

function runAws(
  runner: CommandRunner,
  profile: string,
  arguments_: readonly string[],
): CommandResult {
  return runner.run("aws", [
    ...arguments_,
    "--output",
    "json",
    "--no-cli-pager",
    "--region",
    DEPLOY_REGION,
    "--profile",
    profile,
  ]);
}

function assertAwsSuccess(result: CommandResult, description: string): void {
  if (result.status !== 0) {
    throwAwsFailure(result, description);
  }
}

function throwAwsFailure(result: CommandResult, description: string): never {
  void result;
  throw new Error(
    `${description} failed. Verify the selected AWS identity, session, region, and IAM permissions.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
