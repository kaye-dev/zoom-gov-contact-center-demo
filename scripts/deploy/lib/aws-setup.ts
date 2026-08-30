import {
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
  DEPLOY_CONFIG_PARAMETER,
  DEPLOY_KMS_ALIAS,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_PARAMETER_NAMES,
  DEPLOY_REGION,
  DEPLOY_VERCEL_TOKEN_PARAMETER,
  DEPLOYMENT_SETUP_FIELDS,
  InvalidDeploymentConfigurationError,
  parseDeploymentSetupField,
  parseStoredDeploymentConfig,
  parseStoredDeploymentSetupState,
  type DeploymentSetupField,
  type DeploymentSecrets,
  type StoredDeploymentSetupDraft,
  type StoredDeploymentConfig,
  validateAwsProfileName,
} from "./aws-config";
import {
  type DeploymentParameterInput,
  type DeploymentParameterWriter,
} from "./aws-parameter-writer";
import { requireExact, type Prompter } from "./input";
import {
  combinedOutput,
  type CommandResult,
  type CommandRunner,
  type SecretRegistry,
} from "./process";

export type RotatableDeploymentSecret =
  "vercel-token" | "neon-api-key" | "admin-password";

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

type SetupUpdateSelection =
  | { kind: "validate" }
  | { kind: "field"; field: DeploymentSetupField }
  | { kind: "secret"; secret: RotatableDeploymentSecret };

type SetupFieldSpec = {
  field: DeploymentSetupField;
  label: string;
  example?: string;
};

const SETUP_FIELD_LABELS: Record<DeploymentSetupField, string> = {
  "vercel.orgId": "Vercel team ID",
  "vercel.projectId": "Vercel project ID",
  "vercel.projectName": "Vercel project name",
  "vercel.canonicalOrigin": "Canonical Production origin",
  "neon.projectId": "Neon project ID",
  "neon.projectName": "Neon project name",
  "neon.branchId": "Neon branch ID",
  "neon.databaseName": "Neon database name",
  "neon.roleName": "Neon role name",
  "admin.email": "Administrator email",
};

const SETUP_FIELD_EXAMPLES: Partial<Record<DeploymentSetupField, string>> = {
  "vercel.canonicalOrigin": "https://demo.example.com",
};

const SETUP_FIELD_SPECS = DEPLOYMENT_SETUP_FIELDS.map((field) => {
  const example = SETUP_FIELD_EXAMPLES[field];
  return {
    field,
    label: SETUP_FIELD_LABELS[field],
    ...(example === undefined ? {} : { example }),
  };
}) satisfies readonly SetupFieldSpec[];

const SETUP_SECRET_SELECTIONS = [
  "vercel-token",
  "neon-api-key",
  "admin-password",
] as const satisfies readonly RotatableDeploymentSecret[];

type ProgressiveSecretCheckpoint =
  | { state: "missing" }
  | { state: "prepared"; expectedVersion: number }
  | { state: "saved"; version: number };

class InvalidSetupInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSetupInputError";
  }
}

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
  fetchImplementation: typeof globalThis.fetch,
  parameterWriter: DeploymentParameterWriter,
): Promise<void> {
  const profile = validateAwsProfileName(options.profile);
  const identity = readCallerIdentity(runner, profile);
  console.log(`AWS profile: ${profile}`);
  console.log(`AWS account: ${identity.accountId}`);
  console.log(`AWS principal: ${identity.arn}`);
  console.log(`AWS region: ${DEPLOY_REGION}`);

  const snapshot = readSetupSnapshot(runner, profile);
  const existingState = readExistingSetupState(snapshot);
  const storedAccountId =
    existingState?.state === "complete"
      ? existingState.config.aws.accountId
      : existingState?.draft.aws.accountId;
  if (storedAccountId !== undefined && storedAccountId !== identity.accountId) {
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
    existingState?.state === "complete"
      ? existingState.config.kmsKeyArn
      : existingState?.draft.kmsKeyArn,
    identity.accountId,
  );
  if (
    existingState === undefined &&
    (existingSecrets.vercelToken !== undefined ||
      existingSecrets.neonApiKey !== undefined ||
      existingSecrets.adminPassword !== undefined)
  ) {
    throw new InvalidDeploymentConfigurationError(
      "SecureString deployment parameters exist without a setup draft or final config. No key was created; reconcile the existing parameters manually.",
    );
  }
  if (existingState?.state === "incomplete" && kms === undefined) {
    throw new InvalidDeploymentConfigurationError(
      "The in-progress setup draft references a managed KMS key that is unavailable.",
    );
  }
  if (kms !== undefined) {
    assertExistingParameterMetadata(runner, profile, snapshot, kms.arn);
  }

  if (existingState?.state === "complete") {
    if (!DEPLOY_PARAMETER_NAMES.every((name) => snapshot.has(name))) {
      throw new InvalidDeploymentConfigurationError(
        "The final deployment config exists, but one or more required SecureString parameters are missing.",
      );
    }
    if (kms === undefined) {
      throw new InvalidDeploymentConfigurationError(
        "The deployment parameters exist, but the managed KMS key is unavailable.",
      );
    }
    if (
      (!kms.aliasPresent ||
        !kms.rotationEnabled ||
        kms.rotationPeriodInDays !== 365) &&
      !options.reconfigure
    ) {
      throw new InvalidDeploymentConfigurationError(
        "The deployment parameters exist, but the managed KMS configuration is incomplete. Re-run setup with --reconfigure.",
      );
    }
    const completeSecrets = requireCompleteDeploymentSecrets(existingSecrets);
    assertSnapshotSecretVersions(snapshot, existingState.config);
    await runCompletedSetup(
      runner,
      prompter,
      secrets,
      parameterWriter,
      profile,
      identity.accountId,
      snapshot,
      kms,
      existingState.config,
      completeSecrets,
      options,
      fetchImplementation,
    );
    return;
  }

  await runProgressiveSetup(
    runner,
    prompter,
    secrets,
    parameterWriter,
    profile,
    identity.accountId,
    snapshot,
    kms,
    existingState?.draft,
    existingSecrets,
    options,
    fetchImplementation,
  );
}

async function runCompletedSetup(
  runner: CommandRunner,
  prompter: Prompter,
  secrets: SecretRegistry,
  parameterWriter: DeploymentParameterWriter,
  profile: string,
  accountId: string,
  snapshot: SetupSnapshot,
  kms: KmsKey,
  existingConfig: StoredDeploymentConfig,
  existingSecrets: DeploymentSecrets,
  options: AwsSetupOptions,
  fetchImplementation: typeof globalThis.fetch,
): Promise<void> {
  const interactiveSelection =
    options.reconfigure || options.rotate !== undefined
      ? undefined
      : await promptUpdateSelection(prompter, existingConfig);
  if (interactiveSelection?.kind === "validate") {
    await verifyProviderTargets(
      existingConfig,
      existingSecrets,
      fetchImplementation,
    );
    console.log("AWS deployment settings are already configured and valid.");
    return;
  }

  const values = valuesFromConfig(existingConfig);
  if (options.reconfigure) {
    for (const spec of SETUP_FIELD_SPECS) {
      values[spec.field] = await promptSetupField(
        prompter,
        spec,
        values[spec.field],
      );
    }
  } else if (interactiveSelection?.kind === "field") {
    const spec = requireSetupFieldSpec(interactiveSelection.field);
    values[spec.field] = await promptSetupField(
      prompter,
      spec,
      values[spec.field],
    );
  }

  const selectedSecret =
    options.rotate ??
    (interactiveSelection?.kind === "secret"
      ? interactiveSelection.secret
      : undefined);
  const desiredSecrets: DeploymentSecrets = { ...existingSecrets };
  if (selectedSecret !== undefined) {
    const secretSpec = secretPromptSpec(selectedSecret);
    desiredSecrets[secretSpec.key] = await promptConfirmedSecret(
      prompter,
      secrets,
      secretSpec.label,
      secretSpec.minimum,
      secretSpec.maximum,
    );
  }
  secrets.add(
    desiredSecrets.vercelToken,
    desiredSecrets.neonApiKey,
    desiredSecrets.adminPassword,
  );

  const nonSecretInput = buildNonSecretSetupInput(accountId, values);
  const candidateConfig = buildConfig(
    nonSecretInput,
    kms.arn,
    existingConfig.secretVersions,
  );
  await verifyProviderTargets(
    candidateConfig,
    desiredSecrets,
    fetchImplementation,
  );

  const nonSecretChanged =
    JSON.stringify(withoutSecretMetadata(candidateConfig)) !==
    JSON.stringify(withoutSecretMetadata(existingConfig));
  const kmsNeedsRepair =
    !kms.aliasPresent ||
    !kms.rotationEnabled ||
    kms.rotationPeriodInDays !== 365;
  if (!nonSecretChanged && selectedSecret === undefined && !kmsNeedsRepair) {
    console.log(
      "No deployment settings were changed; the existing settings are valid.",
    );
    return;
  }

  await requireExact(
    prompter,
    `AWS account ${accountId} のKMS/SSM設定を書き込む場合は 'setup ${accountId}' と入力してください。`,
    `setup ${accountId}`,
    "AWS deployment setup was cancelled before any write.",
  );

  const configuredKms = ensureKmsConfiguration(runner, profile, kms, accountId);
  assertExistingParameterMetadata(runner, profile, snapshot, configuredKms.arn);

  let expectedSelectedSecretVersion: number | undefined;
  if (selectedSecret !== undefined) {
    const secretSpec = secretPromptSpec(selectedSecret);
    const currentParameter = snapshot.get(secretSpec.parameterName);
    if (currentParameter === undefined) {
      throw new InvalidDeploymentConfigurationError(
        `${secretSpec.parameterName} is missing from the completed setup.`,
      );
    }
    expectedSelectedSecretVersion = currentParameter.version + 1;
    if (!Number.isSafeInteger(expectedSelectedSecretVersion)) {
      throw new InvalidDeploymentConfigurationError(
        `${secretSpec.label} cannot create another SSM version.`,
      );
    }
    const updateDraft = createSetupDraft(accountId, configuredKms.arn, values, {
      ...existingConfig.secretVersions,
      [secretSpec.key]: expectedSelectedSecretVersion,
    });
    await writeSetupDraft(parameterWriter, updateDraft, true);
  }

  const versions = {
    vercelToken: await putSecretIfNeeded(
      parameterWriter,
      snapshot,
      DEPLOY_VERCEL_TOKEN_PARAMETER,
      desiredSecrets.vercelToken,
      configuredKms.arn,
      selectedSecret === "vercel-token",
    ),
    neonApiKey: await putSecretIfNeeded(
      parameterWriter,
      snapshot,
      DEPLOY_NEON_API_KEY_PARAMETER,
      desiredSecrets.neonApiKey,
      configuredKms.arn,
      selectedSecret === "neon-api-key",
    ),
    adminPassword: await putSecretIfNeeded(
      parameterWriter,
      snapshot,
      DEPLOY_ADMIN_PASSWORD_PARAMETER,
      desiredSecrets.adminPassword,
      configuredKms.arn,
      selectedSecret === "admin-password",
    ),
  };
  if (selectedSecret !== undefined) {
    const selectedKey = secretPromptSpec(selectedSecret).key;
    if (versions[selectedKey] !== expectedSelectedSecretVersion) {
      throw new InvalidDeploymentConfigurationError(
        "The selected SecureString version did not match the prepared setup draft.",
      );
    }
  }
  const config = buildConfig(nonSecretInput, configuredKms.arn, versions);
  await writeFinalConfig(parameterWriter, config, true);
  await verifyProviderTargets(config, desiredSecrets, fetchImplementation);
  console.log("AWS deployment settings were updated and verified.");
}

async function runProgressiveSetup(
  runner: CommandRunner,
  prompter: Prompter,
  secrets: SecretRegistry,
  parameterWriter: DeploymentParameterWriter,
  profile: string,
  accountId: string,
  snapshot: SetupSnapshot,
  kms: KmsKey | undefined,
  existingDraft: StoredDeploymentSetupDraft | undefined,
  existingSecrets: Partial<DeploymentSecrets>,
  options: AwsSetupOptions,
  fetchImplementation: typeof globalThis.fetch,
): Promise<void> {
  if (existingDraft === undefined) {
    prompter.notice("デプロイ設定がありません。初期設定を開始します。");
  } else {
    prompter.notice(formatProgressiveSetupStatus(existingDraft, snapshot));
  }

  await requireExact(
    prompter,
    `AWS account ${accountId} のKMS/SSM設定を途中保存・更新する場合は 'setup ${accountId}' と入力してください。`,
    `setup ${accountId}`,
    "AWS deployment setup was cancelled before any write.",
  );

  const configuredKms = ensureKmsConfiguration(runner, profile, kms, accountId);
  assertExistingParameterMetadata(runner, profile, snapshot, configuredKms.arn);
  if (
    existingDraft !== undefined &&
    existingDraft.kmsKeyArn !== configuredKms.arn
  ) {
    throw new InvalidDeploymentConfigurationError(
      "The in-progress setup draft references a different KMS key.",
    );
  }

  let draft = existingDraft ?? createSetupDraft(accountId, configuredKms.arn);
  let configExists = snapshot.has(DEPLOY_CONFIG_PARAMETER);
  if (!configExists) {
    await writeSetupDraft(parameterWriter, draft, false);
    configExists = true;
  }

  const forceAllFields = options.reconfigure;
  for (const spec of SETUP_FIELD_SPECS) {
    const current = draft.values[spec.field];
    if (current !== undefined && !forceAllFields) {
      continue;
    }
    const value = await promptSetupField(prompter, spec, current);
    if (value === current) {
      continue;
    }
    draft = {
      ...draft,
      values: { ...draft.values, [spec.field]: value },
    };
    await writeSetupDraft(parameterWriter, draft, configExists);
    configExists = true;
    console.log(`Setup item saved: ${spec.label}.`);
  }

  const nonSecretInput = buildNonSecretSetupInput(accountId, draft.values);
  const validationConfig = buildConfig(nonSecretInput, configuredKms.arn, {
    vercelToken: 1,
    neonApiKey: 1,
    adminPassword: 1,
  });
  const desiredSecrets: Partial<DeploymentSecrets> = {};
  const versions: Partial<StoredDeploymentConfig["secretVersions"]> = {};

  const vercel = await ensureProgressiveSecret({
    prompter,
    secrets,
    parameterWriter,
    snapshot,
    draft,
    selection: "vercel-token",
    existingValue: existingSecrets.vercelToken,
    kmsKeyArn: configuredKms.arn,
    rotateRequested: options.rotate === "vercel-token",
    verify: (value) =>
      verifyVercelTarget(validationConfig, value, fetchImplementation),
  });
  draft = vercel.draft;
  desiredSecrets.vercelToken = vercel.value;
  versions.vercelToken = vercel.version;

  const neon = await ensureProgressiveSecret({
    prompter,
    secrets,
    parameterWriter,
    snapshot,
    draft,
    selection: "neon-api-key",
    existingValue: existingSecrets.neonApiKey,
    kmsKeyArn: configuredKms.arn,
    rotateRequested: options.rotate === "neon-api-key",
    verify: (value) =>
      verifyNeonTarget(validationConfig, value, fetchImplementation),
  });
  draft = neon.draft;
  desiredSecrets.neonApiKey = neon.value;
  versions.neonApiKey = neon.version;

  const admin = await ensureProgressiveSecret({
    prompter,
    secrets,
    parameterWriter,
    snapshot,
    draft,
    selection: "admin-password",
    existingValue: existingSecrets.adminPassword,
    kmsKeyArn: configuredKms.arn,
    rotateRequested: options.rotate === "admin-password",
  });
  draft = admin.draft;
  desiredSecrets.adminPassword = admin.value;
  versions.adminPassword = admin.version;

  const completeSecrets = requireCompleteDeploymentSecrets(desiredSecrets);
  const finalVersions = requireCompleteSecretVersions(versions);
  const config = buildConfig(nonSecretInput, configuredKms.arn, finalVersions);
  await verifyProviderTargets(config, completeSecrets, fetchImplementation);
  await writeFinalConfig(parameterWriter, config, true);
  await verifyProviderTargets(config, completeSecrets, fetchImplementation);
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
        throw new Error(
          "--profile must be specified exactly once with a value.",
        );
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
        throw new Error(
          "--rotate must be specified at most once with a value.",
        );
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
  const result = runAws(runner, profile, ["sts", "get-caller-identity"]);
  if (result.status !== 0) {
    throw new Error(
      `AWS authentication failed for profile '${profile}'. If this profile uses IAM Identity Center (SSO), run 'aws sso login --profile ${profile}' and retry the original command.`,
    );
  }
  let response: unknown;
  try {
    response = JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error("AWS caller identity check returned invalid JSON.");
  }
  if (
    !isRecord(response) ||
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
    const {
      Name: name,
      Type: type,
      Value: parameterValue,
      Version: version,
    } = value;
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
    throw new Error(
      "SSM setup inspection returned an unexpected parameter name.",
    );
  }
  return snapshot;
}

function readExistingSetupState(
  snapshot: SetupSnapshot,
): ReturnType<typeof parseStoredDeploymentSetupState> | undefined {
  const parameter = snapshot.get(DEPLOY_CONFIG_PARAMETER);
  if (parameter === undefined) {
    return undefined;
  }
  if (parameter.type !== "String") {
    throw new Error(`${DEPLOY_CONFIG_PARAMETER} must have type String.`);
  }
  return parseStoredDeploymentSetupState(parameter.value);
}

function readExistingSecrets(
  snapshot: SetupSnapshot,
): Partial<DeploymentSecrets> {
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

async function promptConfirmedSecret(
  prompter: Prompter,
  secrets: SecretRegistry,
  label: string,
  minimum: number,
  maximum = 4_096,
): Promise<string> {
  for (;;) {
    const rawFirst = await prompter.hidden(`${label}: `);
    secrets.add(rawFirst);
    let first: string;
    try {
      first = validateSecret(rawFirst, label, minimum, maximum);
    } catch (error) {
      if (!(error instanceof InvalidSetupInputError)) {
        throw error;
      }
      prompter.invalid(`${error.message} もう一度入力してください。`);
      continue;
    }
    const second = await prompter.hidden(`${label} (again): `);
    secrets.add(second);
    if (first !== second) {
      prompter.invalid(
        `${label} confirmation did not match. もう一度入力してください。`,
      );
      continue;
    }
    return first;
  }
}

async function promptUpdateSelection(
  prompter: Prompter,
  config: StoredDeploymentConfig,
): Promise<SetupUpdateSelection> {
  for (;;) {
    const answer = (
      await prompter.ask(formatCompletedSetupMenu(config))
    ).trim();
    if (!answer || answer === "0") {
      return { kind: "validate" };
    }
    if (/^(?:[1-9]|10)$/.test(answer)) {
      const spec = SETUP_FIELD_SPECS[Number(answer) - 1];
      if (spec !== undefined) {
        return { kind: "field", field: spec.field };
      }
    }
    if (answer === "11") {
      return { kind: "secret", secret: "vercel-token" };
    }
    if (answer === "12") {
      return { kind: "secret", secret: "neon-api-key" };
    }
    if (answer === "13") {
      return { kind: "secret", secret: "admin-password" };
    }
    prompter.invalid("選択値が不正です。0から13の番号を入力してください。");
  }
}

function formatCompletedSetupMenu(config: StoredDeploymentConfig): string {
  const values = valuesFromConfig(config);
  return [
    "設定完了項目:",
    ...SETUP_FIELD_SPECS.map(
      ({ field, label }, index) => `  ${index + 1}. ${label}: ${values[field]}`,
    ),
    `  11. Vercel access token: 設定済み (SSM version ${config.secretVersions.vercelToken})`,
    `  12. Neon API key: 設定済み (SSM version ${config.secretVersions.neonApiKey})`,
    `  13. Administrator password: 設定済み (SSM version ${config.secretVersions.adminPassword})`,
    "",
    "更新する設定番号を選択してください。",
    "  0. 変更せず検証のみ",
    "選択 [0]: ",
  ].join("\n");
}

function formatProgressiveSetupStatus(
  draft: StoredDeploymentSetupDraft,
  snapshot: SetupSnapshot,
): string {
  const lines = [
    "現在の設定状況:",
    ...SETUP_FIELD_SPECS.map(({ field, label }) => {
      const value = draft.values[field];
      return value === undefined
        ? `  [未設定] ${label}`
        : `  [保存済み] ${label}: ${value}`;
    }),
  ];
  for (const selection of SETUP_SECRET_SELECTIONS) {
    const spec = secretPromptSpec(selection);
    const checkpoint = inspectProgressiveSecretCheckpoint(
      draft,
      snapshot,
      selection,
    );
    switch (checkpoint.state) {
      case "missing":
        lines.push(`  [未設定] ${spec.label}`);
        break;
      case "prepared":
        lines.push(
          `  [再入力が必要] ${spec.label}: 値は非表示 (予定 SSM version ${checkpoint.expectedVersion})`,
        );
        break;
      case "saved":
        lines.push(
          `  [保存済み] ${spec.label}: 値は非表示 (SSM version ${checkpoint.version})`,
        );
        break;
    }
  }
  lines.push("", "未完了の項目から設定を再開します。");
  return lines.join("\n");
}

async function promptSetupField(
  prompter: Prompter,
  spec: SetupFieldSpec,
  current?: string,
): Promise<string> {
  for (;;) {
    const answer = (
      await prompter.ask(
        `${spec.label}${spec.example ? ` (ex. ${spec.example})` : ""}${current ? ` [${current}]` : ""}: `,
      )
    ).trim();
    const candidate = answer || current;
    if (candidate === undefined) {
      prompter.invalid(`${spec.label} is required. もう一度入力してください。`);
      continue;
    }
    try {
      return parseDeploymentSetupField(spec.field, candidate);
    } catch (error) {
      if (!(error instanceof InvalidDeploymentConfigurationError)) {
        throw error;
      }
      prompter.invalid(`${error.message} もう一度入力してください。`);
    }
  }
}

function requireSetupFieldSpec(field: DeploymentSetupField): SetupFieldSpec {
  const spec = SETUP_FIELD_SPECS.find((candidate) => candidate.field === field);
  if (spec === undefined) {
    throw new InvalidDeploymentConfigurationError(
      "The requested setup field is unsupported.",
    );
  }
  return spec;
}

function secretPromptSpec(secret: RotatableDeploymentSecret): {
  key: keyof DeploymentSecrets;
  parameterName:
    | typeof DEPLOY_VERCEL_TOKEN_PARAMETER
    | typeof DEPLOY_NEON_API_KEY_PARAMETER
    | typeof DEPLOY_ADMIN_PASSWORD_PARAMETER;
  label: string;
  minimum: number;
  maximum: number;
} {
  switch (secret) {
    case "vercel-token":
      return {
        key: "vercelToken",
        parameterName: DEPLOY_VERCEL_TOKEN_PARAMETER,
        label: "Vercel access token",
        minimum: 16,
        maximum: 4_096,
      };
    case "neon-api-key":
      return {
        key: "neonApiKey",
        parameterName: DEPLOY_NEON_API_KEY_PARAMETER,
        label: "Neon API key",
        minimum: 16,
        maximum: 4_096,
      };
    case "admin-password":
      return {
        key: "adminPassword",
        parameterName: DEPLOY_ADMIN_PASSWORD_PARAMETER,
        label: "Administrator password",
        minimum: 12,
        maximum: 128,
      };
  }
}

function valuesFromConfig(
  config: StoredDeploymentConfig,
): Record<DeploymentSetupField, string> {
  return {
    "vercel.orgId": config.vercel.orgId,
    "vercel.projectId": config.vercel.projectId,
    "vercel.projectName": config.vercel.projectName,
    "vercel.canonicalOrigin": config.vercel.canonicalOrigin,
    "neon.projectId": config.neon.projectId,
    "neon.projectName": config.neon.projectName,
    "neon.branchId": config.neon.branchId,
    "neon.databaseName": config.neon.databaseName,
    "neon.roleName": config.neon.roleName,
    "admin.email": config.admin.email,
  };
}

function buildNonSecretSetupInput(
  accountId: string,
  values: Partial<Record<DeploymentSetupField, string>>,
): NonSecretSetupInput {
  const requireValue = (field: DeploymentSetupField): string => {
    const value = values[field];
    if (value === undefined) {
      throw new InvalidDeploymentConfigurationError(
        `The setup draft is missing ${requireSetupFieldSpec(field).label}.`,
      );
    }
    return value;
  };
  return {
    schemaVersion: 1,
    policyVersion: "demo-v1",
    aws: { accountId, region: DEPLOY_REGION },
    vercel: {
      orgId: requireValue("vercel.orgId"),
      projectId: requireValue("vercel.projectId"),
      projectName: requireValue("vercel.projectName"),
      canonicalOrigin: requireValue("vercel.canonicalOrigin"),
      expectedPlan: "hobby",
    },
    neon: {
      projectId: requireValue("neon.projectId"),
      projectName: requireValue("neon.projectName"),
      branchId: requireValue("neon.branchId"),
      databaseName: requireValue("neon.databaseName"),
      roleName: requireValue("neon.roleName"),
      regionId: "aws-ap-southeast-1",
      expectedPlan: "free",
    },
    admin: {
      email: requireValue("admin.email"),
    },
  };
}

function inspectProgressiveSecretCheckpoint(
  draft: StoredDeploymentSetupDraft,
  snapshot: SetupSnapshot,
  selection: RotatableDeploymentSecret,
): ProgressiveSecretCheckpoint {
  const spec = secretPromptSpec(selection);
  const actual = snapshot.get(spec.parameterName);
  const expected = draft.secretVersions[spec.key];
  if (expected === undefined) {
    if (actual !== undefined) {
      throw new InvalidDeploymentConfigurationError(
        `${spec.parameterName} exists without a prepared setup draft version. Reconcile the setup state manually.`,
      );
    }
    return { state: "missing" };
  }
  if (actual?.version === expected) {
    return { state: "saved", version: expected };
  }
  if (
    (actual === undefined && expected === 1) ||
    (actual !== undefined && expected === actual.version + 1)
  ) {
    return { state: "prepared", expectedVersion: expected };
  }
  throw new InvalidDeploymentConfigurationError(
    `${spec.parameterName} version does not match the prepared setup draft. Reconcile the setup state manually.`,
  );
}

async function ensureProgressiveSecret(options: {
  prompter: Prompter;
  secrets: SecretRegistry;
  parameterWriter: DeploymentParameterWriter;
  snapshot: SetupSnapshot;
  draft: StoredDeploymentSetupDraft;
  selection: RotatableDeploymentSecret;
  existingValue: string | undefined;
  kmsKeyArn: string;
  rotateRequested: boolean;
  verify?: (value: string) => Promise<void>;
}): Promise<{
  draft: StoredDeploymentSetupDraft;
  value: string;
  version: number;
}> {
  const spec = secretPromptSpec(options.selection);
  const actual = options.snapshot.get(spec.parameterName);
  const checkpoint = inspectProgressiveSecretCheckpoint(
    options.draft,
    options.snapshot,
    options.selection,
  );
  if (checkpoint.state === "missing" && options.existingValue !== undefined) {
    throw new InvalidDeploymentConfigurationError(
      `${spec.parameterName} has a decrypted value without an SSM parameter.`,
    );
  }

  if (checkpoint.state === "saved" && !options.rotateRequested) {
    const storedValue = options.existingValue;
    if (storedValue === undefined) {
      throw new InvalidDeploymentConfigurationError(
        `${spec.parameterName} has no decrypted value in the setup snapshot.`,
      );
    }
    const value = validateSecret(
      storedValue,
      spec.label,
      spec.minimum,
      spec.maximum,
    );
    options.secrets.add(value);
    await options.verify?.(value);
    return {
      draft: options.draft,
      value,
      version: checkpoint.version,
    };
  }

  const value = await promptConfirmedSecret(
    options.prompter,
    options.secrets,
    spec.label,
    spec.minimum,
    spec.maximum,
  );
  options.secrets.add(value);
  await options.verify?.(value);

  let draft = options.draft;
  let targetVersion =
    checkpoint.state === "prepared" ? checkpoint.expectedVersion : undefined;
  if (checkpoint.state !== "prepared") {
    targetVersion = (actual?.version ?? 0) + 1;
    if (!Number.isSafeInteger(targetVersion) || targetVersion < 1) {
      throw new InvalidDeploymentConfigurationError(
        `${spec.label} cannot create another SSM version.`,
      );
    }
    draft = {
      ...draft,
      secretVersions: {
        ...draft.secretVersions,
        [spec.key]: targetVersion,
      },
    };
    await writeSetupDraft(options.parameterWriter, draft, true);
  }
  const requiredTargetVersion = requireProgressVersion(
    targetVersion,
    spec.label,
  );
  const writtenVersion = await putSecretIfNeeded(
    options.parameterWriter,
    options.snapshot,
    spec.parameterName,
    value,
    options.kmsKeyArn,
    actual !== undefined,
  );
  if (writtenVersion !== requiredTargetVersion) {
    throw new InvalidDeploymentConfigurationError(
      `${spec.parameterName} was written at an unexpected SSM version.`,
    );
  }
  console.log(`Setup item saved: ${spec.label}.`);
  return { draft, value, version: writtenVersion };
}

function createSetupDraft(
  accountId: string,
  kmsKeyArn: string,
  values: Partial<Record<DeploymentSetupField, string>> = {},
  secretVersions: Partial<StoredDeploymentConfig["secretVersions"]> = {},
): StoredDeploymentSetupDraft {
  return {
    schemaVersion: 2,
    policyVersion: "demo-v1",
    setupState: "incomplete",
    aws: { accountId, region: DEPLOY_REGION },
    kmsKeyArn,
    values: { ...values },
    secretVersions: { ...secretVersions },
  };
}

function requireProgressVersion(
  version: number | undefined,
  label: string,
): number {
  if (!Number.isSafeInteger(version) || (version ?? 0) < 1) {
    throw new InvalidDeploymentConfigurationError(
      `${label} was not saved with a valid SSM version.`,
    );
  }
  return version as number;
}

function requireCompleteSecretVersions(
  versions: Partial<StoredDeploymentConfig["secretVersions"]>,
): StoredDeploymentConfig["secretVersions"] {
  return {
    vercelToken: requireProgressVersion(
      versions.vercelToken,
      "Vercel access token",
    ),
    neonApiKey: requireProgressVersion(versions.neonApiKey, "Neon API key"),
    adminPassword: requireProgressVersion(
      versions.adminPassword,
      "Administrator password",
    ),
  };
}

async function writeSetupDraft(
  parameterWriter: DeploymentParameterWriter,
  draft: StoredDeploymentSetupDraft,
  overwrite: boolean,
): Promise<void> {
  const parsed = parseStoredDeploymentSetupState(JSON.stringify(draft));
  if (parsed.state !== "incomplete") {
    throw new InvalidDeploymentConfigurationError(
      "The setup progress payload was not an incomplete draft.",
    );
  }
  await putParameter(
    parameterWriter,
    {
      Name: DEPLOY_CONFIG_PARAMETER,
      Description:
        "In-progress non-secret setup state for the controlled Production deployment workflow.",
      Type: "String",
      Value: JSON.stringify(parsed.draft),
      Tier: "Standard",
      Overwrite: overwrite,
      ...(overwrite ? {} : { Tags: PARAMETER_TAGS }),
    },
    false,
  );
}

async function writeFinalConfig(
  parameterWriter: DeploymentParameterWriter,
  config: StoredDeploymentConfig,
  overwrite: boolean,
): Promise<void> {
  const parsed = parseStoredDeploymentConfig(JSON.stringify(config));
  await putParameter(
    parameterWriter,
    {
      Name: DEPLOY_CONFIG_PARAMETER,
      Description:
        "Validated Production deployment target configuration for the Zoom Government Contact Center demo.",
      Type: "String",
      Value: JSON.stringify(parsed),
      Tier: "Standard",
      Overwrite: overwrite,
      ...(overwrite ? {} : { Tags: PARAMETER_TAGS }),
    },
    false,
  );
}

function inspectConfiguredKmsKey(
  runner: CommandRunner,
  profile: string,
  configuredArn: string | undefined,
  accountId: string,
): KmsKey | undefined {
  const aliasResult = runAws(runner, profile, [
    "kms",
    "describe-key",
    "--key-id",
    DEPLOY_KMS_ALIAS,
  ]);
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
    (!Number.isSafeInteger(period) ||
      (period as number) < 90 ||
      (period as number) > 2560)
  ) {
    throw new Error("KMS rotation inspection returned an invalid response.");
  }
  if (rotation.KeyRotationEnabled && period === undefined) {
    throw new Error("KMS rotation inspection returned an invalid response.");
  }
  return {
    rotationEnabled: rotation.KeyRotationEnabled,
    ...(period === undefined ? {} : { rotationPeriodInDays: period as number }),
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
      !metadata.arn.startsWith(`arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/`)
    ) {
      throw new Error(
        "KMS created a key outside the expected account or region.",
      );
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
    if (
      !Array.isArray(response.Parameters) ||
      response.Parameters.length !== 1
    ) {
      throw new Error(
        `SSM metadata for ${name} was not returned exactly once.`,
      );
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

async function putSecretIfNeeded(
  parameterWriter: DeploymentParameterWriter,
  snapshot: SetupSnapshot,
  name: string,
  value: string,
  kmsKeyArn: string,
  rotate: boolean,
): Promise<number> {
  const existing = snapshot.get(name);
  if (existing !== undefined && !rotate) {
    return existing.version;
  }
  return putParameter(
    parameterWriter,
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

async function putParameter(
  parameterWriter: DeploymentParameterWriter,
  input: DeploymentParameterInput,
  containsSecret: boolean,
): Promise<number> {
  return parameterWriter.put(
    input,
    containsSecret ? "SecureString write" : "deployment config write",
  );
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
      `https://api.vercel.com/v2/teams/${encodeURIComponent(config.vercel.orgId)}?${query}`,
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
    (domain.redirect !== undefined &&
      domain.redirect !== null &&
      domain.redirect !== false) ||
    (domain.gitBranch !== undefined && domain.gitBranch !== null) ||
    (domain.customEnvironmentId !== undefined &&
      domain.customEnvironmentId !== null)
  ) {
    throw new Error(
      "The canonical Vercel domain is not a verified Production target.",
    );
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
    (branch.project_id !== undefined &&
      branch.project_id !== config.neon.projectId)
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
    throw new InvalidSetupInputError(`${label} is invalid.`);
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
