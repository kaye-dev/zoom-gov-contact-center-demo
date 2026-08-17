import type { CommandRunner } from "./process";

export const DEPLOY_REGION = "ap-northeast-1" as const;
export const DEPLOY_PARAMETER_PREFIX =
  "/zoom-gov-contact-center-demo/production/deploy" as const;
export const DEPLOY_CONFIG_PARAMETER =
  `${DEPLOY_PARAMETER_PREFIX}/config` as const;
export const DEPLOY_VERCEL_TOKEN_PARAMETER =
  `${DEPLOY_PARAMETER_PREFIX}/vercel-token` as const;
export const DEPLOY_NEON_API_KEY_PARAMETER =
  `${DEPLOY_PARAMETER_PREFIX}/neon-api-key` as const;
export const DEPLOY_ADMIN_PASSWORD_PARAMETER =
  `${DEPLOY_PARAMETER_PREFIX}/admin-password` as const;
export const DEPLOY_PARAMETER_NAMES = [
  DEPLOY_CONFIG_PARAMETER,
  DEPLOY_VERCEL_TOKEN_PARAMETER,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
] as const;
export const DEPLOY_SECRET_PARAMETER_NAMES = [
  DEPLOY_VERCEL_TOKEN_PARAMETER,
  DEPLOY_NEON_API_KEY_PARAMETER,
  DEPLOY_ADMIN_PASSWORD_PARAMETER,
] as const;
export const DEPLOY_KMS_ALIAS =
  "alias/zoom-gov-contact-center-demo-production-deploy" as const;
export const DEPLOY_CONTEXT_COMPLETION_MARKER =
  "ZOOM_DEPLOY_SSM_CONTEXT_COMPLETE_V1" as const;

export type StoredDeploymentConfig = {
  schemaVersion: 1;
  policyVersion: "demo-v1";
  aws: {
    accountId: string;
    region: typeof DEPLOY_REGION;
  };
  vercel: {
    orgId: string;
    projectId: string;
    projectName: string;
    canonicalOrigin: string;
    expectedPlan: "hobby";
  };
  neon: {
    projectId: string;
    projectName: string;
    branchId: string;
    databaseName: string;
    roleName: string;
    regionId: "aws-ap-southeast-1";
    expectedPlan: "free";
  };
  admin: {
    email: string;
  };
  kmsKeyArn: string;
  secretVersions: {
    vercelToken: number;
    neonApiKey: number;
    adminPassword: number;
  };
};

export type DeploymentSecrets = {
  vercelToken: string;
  neonApiKey: string;
  adminPassword: string;
};

export type LoadedDeploymentContext = {
  profile?: string;
  accountId: string;
  config: StoredDeploymentConfig;
  secrets: DeploymentSecrets;
};

type ParameterRecord = {
  Name: string;
  Type: "String" | "SecureString";
  Value: string;
  Version: number;
  ARN?: string;
};

export class MissingDeploymentParametersError extends Error {
  readonly exitCode = 78;

  constructor(
    readonly profile: string | undefined,
    readonly missingParameterNames: readonly string[],
  ) {
    super("AWS deployment parameters are missing.");
    this.name = "MissingDeploymentParametersError";
  }
}

export class AwsDeploymentAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsDeploymentAccessError";
  }
}

export class InvalidDeploymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDeploymentConfigurationError";
  }
}

export function getProfileFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const profile = environment.DEPLOY_AWS_PROFILE;
  if (profile === undefined) {
    return undefined;
  }
  return validateAwsProfileName(profile);
}

export function validateAwsProfileName(profile: string): string {
  if (
    profile.length < 1 ||
    profile.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9_.@+=,-]*$/.test(profile)
  ) {
    throw new InvalidDeploymentConfigurationError(
      "DEPLOY_AWS_PROFILE contains an invalid AWS profile name.",
    );
  }
  return profile;
}

export function loadDeploymentContext(
  runner: CommandRunner,
  profile?: string,
): LoadedDeploymentContext {
  const selectedProfile =
    profile === undefined ? undefined : validateAwsProfileName(profile);
  const accountId = getCallerAccountId(runner, selectedProfile);
  const parameters = getExactDeploymentParameters(runner, selectedProfile);
  return buildLoadedDeploymentContext(
    accountId,
    parameters,
    selectedProfile,
  );
}

export function loadDeploymentContextFromStdin(
  input: string,
  accountId: string,
  profile?: string,
): LoadedDeploymentContext {
  const selectedProfile =
    profile === undefined ? undefined : validateAwsProfileName(profile);
  const validatedAccountId = expectString(
    accountId,
    "AWS caller account ID",
    /^\d{12}$/,
  );
  const suffix = `\n${DEPLOY_CONTEXT_COMPLETION_MARKER}\n`;
  if (!input.endsWith(suffix)) {
    throw new InvalidDeploymentConfigurationError(
      "The SSM deployment context did not complete successfully.",
    );
  }
  const payload = input.slice(0, -suffix.length);
  if (!payload.trim() || payload.includes(DEPLOY_CONTEXT_COMPLETION_MARKER)) {
    throw new InvalidDeploymentConfigurationError(
      "The SSM deployment context completion marker is invalid.",
    );
  }
  const parameters = parseExactDeploymentParametersResponse(
    payload,
    selectedProfile,
  );
  return buildLoadedDeploymentContext(
    validatedAccountId,
    parameters,
    selectedProfile,
  );
}

function buildLoadedDeploymentContext(
  accountId: string,
  parameters: ReadonlyMap<string, ParameterRecord>,
  profile: string | undefined,
): LoadedDeploymentContext {
  const configParameter = parameters.get(DEPLOY_CONFIG_PARAMETER);
  if (!configParameter) {
    throw new MissingDeploymentParametersError(profile, [
      DEPLOY_CONFIG_PARAMETER,
    ]);
  }
  if (configParameter.Type !== "String") {
    throw new InvalidDeploymentConfigurationError(
      `${DEPLOY_CONFIG_PARAMETER} must have type String.`,
    );
  }

  const config = parseStoredDeploymentConfig(configParameter.Value);
  if (config.aws.accountId !== accountId) {
    throw new InvalidDeploymentConfigurationError(
      "The selected AWS account does not match the deployment config.",
    );
  }

  const vercelToken = requireSecretParameter(
    parameters,
    DEPLOY_VERCEL_TOKEN_PARAMETER,
    config.secretVersions.vercelToken,
  );
  const neonApiKey = requireSecretParameter(
    parameters,
    DEPLOY_NEON_API_KEY_PARAMETER,
    config.secretVersions.neonApiKey,
  );
  const adminPassword = requireSecretParameter(
    parameters,
    DEPLOY_ADMIN_PASSWORD_PARAMETER,
    config.secretVersions.adminPassword,
  );

  return {
    ...(profile === undefined ? {} : { profile }),
    accountId,
    config,
    secrets: {
      vercelToken,
      neonApiKey,
      adminPassword,
    },
  };
}

export function parseStoredDeploymentConfig(
  raw: string,
): StoredDeploymentConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidDeploymentConfigurationError(
      `${DEPLOY_CONFIG_PARAMETER} contains invalid JSON.`,
    );
  }
  const root = expectRecord(parsed, "deployment config");
  assertExactKeys(root, [
    "schemaVersion",
    "policyVersion",
    "aws",
    "vercel",
    "neon",
    "admin",
    "kmsKeyArn",
    "secretVersions",
  ], "deployment config");
  if (root.schemaVersion !== 1 || root.policyVersion !== "demo-v1") {
    throw new InvalidDeploymentConfigurationError(
      "The deployment config schema or policy version is unsupported.",
    );
  }

  const aws = expectRecord(root.aws, "deployment config aws");
  assertExactKeys(aws, ["accountId", "region"], "deployment config aws");
  const accountId = expectString(aws.accountId, "AWS account ID", /^\d{12}$/);
  if (aws.region !== DEPLOY_REGION) {
    throw new InvalidDeploymentConfigurationError(
      `The deployment config AWS region must be ${DEPLOY_REGION}.`,
    );
  }

  const vercel = expectRecord(root.vercel, "deployment config vercel");
  assertExactKeys(
    vercel,
    [
      "orgId",
      "projectId",
      "projectName",
      "canonicalOrigin",
      "expectedPlan",
    ],
    "deployment config vercel",
  );
  const orgId = expectString(
    vercel.orgId,
    "Vercel org ID",
    /^team_[A-Za-z0-9]+$/,
  );
  const vercelProjectId = expectString(
    vercel.projectId,
    "Vercel project ID",
    /^prj_[A-Za-z0-9]+$/,
  );
  const vercelProjectName = expectIdentifier(
    vercel.projectName,
    "Vercel project name",
  );
  const canonicalOrigin = expectHttpsOrigin(vercel.canonicalOrigin);
  if (vercel.expectedPlan !== "hobby") {
    throw new InvalidDeploymentConfigurationError(
      "The Vercel expected plan must be hobby.",
    );
  }

  const neon = expectRecord(root.neon, "deployment config neon");
  assertExactKeys(
    neon,
    [
      "projectId",
      "projectName",
      "branchId",
      "databaseName",
      "roleName",
      "regionId",
      "expectedPlan",
    ],
    "deployment config neon",
  );
  const neonProjectId = expectString(
    neon.projectId,
    "Neon project ID",
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
  );
  const neonProjectName = expectIdentifier(
    neon.projectName,
    "Neon project name",
  );
  const branchId = expectString(
    neon.branchId,
    "Neon branch ID",
    /^br-[A-Za-z0-9-]+$/,
  );
  const databaseName = expectPostgresIdentifier(
    neon.databaseName,
    "Neon database name",
  );
  const roleName = expectPostgresIdentifier(neon.roleName, "Neon role name");
  if (neon.regionId !== "aws-ap-southeast-1") {
    throw new InvalidDeploymentConfigurationError(
      "The Neon region must be aws-ap-southeast-1.",
    );
  }
  if (neon.expectedPlan !== "free") {
    throw new InvalidDeploymentConfigurationError(
      "The Neon expected plan must be free.",
    );
  }

  const admin = expectRecord(root.admin, "deployment config admin");
  assertExactKeys(admin, ["email"], "deployment config admin");
  const email = expectString(
    admin.email,
    "administrator email",
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  );

  const kmsKeyArn = expectString(
    root.kmsKeyArn,
    "KMS key ARN",
    new RegExp(
      `^arn:aws:kms:${DEPLOY_REGION}:${accountId}:key/[0-9a-fA-F-]{36}$`,
    ),
  );

  const secretVersions = expectRecord(
    root.secretVersions,
    "deployment config secretVersions",
  );
  assertExactKeys(
    secretVersions,
    ["vercelToken", "neonApiKey", "adminPassword"],
    "deployment config secretVersions",
  );

  return {
    schemaVersion: 1,
    policyVersion: "demo-v1",
    aws: { accountId, region: DEPLOY_REGION },
    vercel: {
      orgId,
      projectId: vercelProjectId,
      projectName: vercelProjectName,
      canonicalOrigin,
      expectedPlan: "hobby",
    },
    neon: {
      projectId: neonProjectId,
      projectName: neonProjectName,
      branchId,
      databaseName,
      roleName,
      regionId: "aws-ap-southeast-1",
      expectedPlan: "free",
    },
    admin: { email },
    kmsKeyArn,
    secretVersions: {
      vercelToken: expectVersion(
        secretVersions.vercelToken,
        "Vercel token version",
      ),
      neonApiKey: expectVersion(
        secretVersions.neonApiKey,
        "Neon API key version",
      ),
      adminPassword: expectVersion(
        secretVersions.adminPassword,
        "administrator password version",
      ),
    },
  };
}

function getExactDeploymentParameters(
  runner: CommandRunner,
  profile: string | undefined,
): Map<string, ParameterRecord> {
  const result = runner.run(
    "aws",
    addAwsTargetArguments(
      [
        "ssm",
        "get-parameters",
        "--names",
        ...DEPLOY_PARAMETER_NAMES,
        "--with-decryption",
        "--output",
        "json",
        "--no-cli-pager",
      ],
      profile,
    ),
  );
  assertAwsCommandSucceeded(result.status, "SSM GetParameters");
  return parseExactDeploymentParametersResponse(result.stdout, profile);
}

function parseExactDeploymentParametersResponse(
  raw: string,
  profile: string | undefined,
): Map<string, ParameterRecord> {
  const response = parseJsonRecord(raw, "SSM GetParameters");
  const records = response.Parameters;
  const invalid = response.InvalidParameters ?? [];
  if (!Array.isArray(records) || !Array.isArray(invalid)) {
    throw new InvalidDeploymentConfigurationError(
      "SSM GetParameters returned an invalid response shape.",
    );
  }
  if (!invalid.every((name) => typeof name === "string")) {
    throw new InvalidDeploymentConfigurationError(
      "SSM GetParameters returned invalid missing parameter names.",
    );
  }
  const allowedNames = new Set<string>(DEPLOY_PARAMETER_NAMES);
  const parameters = new Map<string, ParameterRecord>();
  for (const rawRecord of records) {
    const record = parseParameterRecord(rawRecord);
    if (!allowedNames.has(record.Name) || parameters.has(record.Name)) {
      throw new InvalidDeploymentConfigurationError(
        "SSM GetParameters returned an unexpected or duplicate parameter.",
      );
    }
    parameters.set(record.Name, record);
  }
  const invalidNames = new Set(invalid);
  if ([...invalidNames].some((name) => !allowedNames.has(name))) {
    throw new InvalidDeploymentConfigurationError(
      "SSM GetParameters returned an unexpected invalid parameter name.",
    );
  }
  const missing = DEPLOY_PARAMETER_NAMES.filter(
    (name) => !parameters.has(name) || invalidNames.has(name),
  );
  if (missing.length > 0) {
    throw new MissingDeploymentParametersError(profile, missing);
  }
  return parameters;
}

function getCallerAccountId(
  runner: CommandRunner,
  profile: string | undefined,
): string {
  const result = runner.run(
    "aws",
    addAwsTargetArguments(
      ["sts", "get-caller-identity", "--output", "json", "--no-cli-pager"],
      profile,
    ),
  );
  assertAwsCommandSucceeded(
    result.status,
    "AWS caller identity check",
  );
  const response = parseJsonRecord(result.stdout, "AWS caller identity");
  return expectString(response.Account, "AWS caller account ID", /^\d{12}$/);
}

function requireSecretParameter(
  parameters: ReadonlyMap<string, ParameterRecord>,
  name: string,
  expectedVersion: number,
): string {
  const parameter = parameters.get(name);
  if (!parameter) {
    throw new InvalidDeploymentConfigurationError(
      `The required SecureString ${name} was not returned.`,
    );
  }
  if (parameter.Type !== "SecureString") {
    throw new InvalidDeploymentConfigurationError(
      `${name} must have type SecureString.`,
    );
  }
  if (parameter.Version !== expectedVersion) {
    throw new InvalidDeploymentConfigurationError(
      `${name} version does not match the deployment config.`,
    );
  }
  if (!parameter.Value) {
    throw new InvalidDeploymentConfigurationError(`${name} is empty.`);
  }
  return parameter.Value;
}

function addAwsTargetArguments(
  arguments_: readonly string[],
  profile: string | undefined,
): string[] {
  return [
    ...arguments_,
    "--region",
    DEPLOY_REGION,
    ...(profile === undefined ? [] : ["--profile", profile]),
  ];
}

function assertAwsCommandSucceeded(
  status: number,
  description: string,
): void {
  if (status === 0) {
    return;
  }
  throw new AwsDeploymentAccessError(
    `${description} failed. Verify the selected AWS identity, session, exact IAM permissions, region, and KMS access.`,
  );
}

function parseParameterRecord(value: unknown): ParameterRecord {
  const record = expectRecord(value, "SSM parameter");
  const name = expectString(record.Name, "SSM parameter name", /^\//);
  if (record.Type !== "String" && record.Type !== "SecureString") {
    throw new InvalidDeploymentConfigurationError(
      `SSM parameter ${name} has an unsupported type.`,
    );
  }
  return {
    Name: name,
    Type: record.Type,
    Value: expectString(record.Value, `SSM parameter ${name} value`),
    Version: expectVersion(record.Version, `SSM parameter ${name} version`),
    ...(typeof record.ARN === "string" ? { ARN: record.ARN } : {}),
  };
}

function parseJsonRecord(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidDeploymentConfigurationError(
      `${label} returned invalid JSON.`,
    );
  }
  return expectRecord(parsed, label);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidDeploymentConfigurationError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new InvalidDeploymentConfigurationError(
      `${label} contains missing or unsupported fields.`,
    );
  }
}

function expectString(
  value: unknown,
  label: string,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    /[\0\r\n]/.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  ) {
    throw new InvalidDeploymentConfigurationError(`${label} is invalid.`);
  }
  return value;
}

function expectIdentifier(value: unknown, label: string): string {
  return expectString(value, label, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
}

function expectPostgresIdentifier(value: unknown, label: string): string {
  return expectString(value, label, /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/);
}

function expectVersion(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new InvalidDeploymentConfigurationError(`${label} is invalid.`);
  }
  return value as number;
}

function expectHttpsOrigin(value: unknown): string {
  const raw = expectString(value, "Vercel canonical origin");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidDeploymentConfigurationError(
      "Vercel canonical origin is invalid.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin !== raw
  ) {
    throw new InvalidDeploymentConfigurationError(
      "Vercel canonical origin must be an exact HTTPS origin.",
    );
  }
  return url.origin;
}
