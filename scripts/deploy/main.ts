import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateAdminInput } from "./lib/admin";
import {
  loadDeploymentContextFromStdin,
  MissingDeploymentParametersError,
  type DeploymentSecrets,
  type StoredDeploymentConfig,
} from "./lib/aws-config";
import { inspectDatabase } from "./lib/database";
import {
  applyMigrationPlan,
  createMigrationPlan,
  renderMigrationPlan,
  type MigrationPlan,
} from "./lib/migrations";
import {
  createMaintenancePublicExpectation,
  readMaintenanceSettingsDatabase,
  verifyMaintenanceSettingsDatabase,
  type MaintenanceEnvironment,
} from "./lib/maintenance";
import { loadNeonConnectionContext } from "./lib/neon-api";
import {
  assertCommandSucceeded,
  combinedOutput,
  SecretRegistry,
  SystemCommandRunner,
  type CommandResult,
  type CommandRunner,
} from "./lib/process";
import {
  renderDeploymentDetail,
  renderDeploymentFailure,
  renderDeploymentPhase,
  renderDeploymentRevalidation,
  renderDeploymentSuccess,
  renderDeploymentSuccessSummary,
  renderDeploymentWarning,
  resolveDeploymentLogStyle,
} from "./lib/logging";
import {
  capturePublicSiteBaseline,
  runSmokeChecks,
  type RequestFunction,
  type SmokeCredentials,
} from "./lib/smoke";
import {
  assertMinimumVersion,
  parseDeploymentOutput,
  parseVercelProjectApi,
  parseVersion,
  validateCanonicalUrl,
  type DatabaseTarget,
  type VercelLink,
} from "./lib/validation";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const VERCEL_MINIMUM = [54, 17, 2] as const;
const AWS_CREDENTIAL_ENVIRONMENT_NAMES = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SECURITY_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_ROLE_ARN",
  "AWS_ROLE_SESSION_NAME",
  "AWS_PROFILE",
  "AWS_DEFAULT_PROFILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONFIG_FILE",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "ACTIONS_RUNTIME_TOKEN",
  "GITHUB_TOKEN",
] as const;
const PRODUCTION_ENV_ALLOWLIST = new Set([
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_TRUSTED_ORIGINS",
  "BETTER_AUTH_TRUST_PROXY_HEADERS",
  "APP_CANONICAL_ORIGIN",
]);
const VERCEL_ENVIRONMENT_PAGE_LIMIT = 100;
const VERCEL_ENVIRONMENT_MAX_PAGES = 32;
const SYNTHETIC_BUILD_DATABASE_URL =
  "postgresql://deploy_build:deploy_build@127.0.0.1:5432/deploy_build?sslmode=disable";
const CANONICAL_PUBLIC_STATUS_ATTEMPTS = 6;
const CANONICAL_PUBLIC_STATUS_DELAY_MS = 5_000;
const DEPLOYMENT_LOG_STYLE = resolveDeploymentLogStyle(
  process.env.DEPLOY_LOG_STYLE,
);
const PG_SSL_WARNING_PREFIX =
  "SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.";

class CliUnavailableError extends Error {}

class MigrationApprovalRequiredError extends Error {
  readonly exitCode = 75;

  constructor() {
    super("Pending migrations require Production approval.");
    this.name = "MigrationApprovalRequiredError";
  }
}

export type ProductionEnvironmentAudit = {
  names: Set<string>;
  types: Map<string, string>;
};

type DeploymentPhase = "validate" | "migrate" | "release" | "smoke";

function logDeploymentPhase(step: number, label: string): void {
  console.log(renderDeploymentPhase(step, label, DEPLOYMENT_LOG_STYLE));
}

function logDeploymentRevalidation(label: string): void {
  console.log(renderDeploymentRevalidation(label, DEPLOYMENT_LOG_STYLE));
}

function logDeploymentDetail(message: string): void {
  console.log(renderDeploymentDetail(message, DEPLOYMENT_LOG_STYLE));
}

function logDeploymentSuccess(message: string): void {
  console.log(renderDeploymentSuccess(message, DEPLOYMENT_LOG_STYLE));
}

export function summarizeDeploymentProcessWarning(
  warningName: string,
  warningMessage: string,
  phase: DeploymentPhase,
): string | undefined {
  if (warningMessage.startsWith(PG_SSL_WARNING_PREFIX)) {
    return phase === "validate"
      ? "Database TLS: sslmode=requireは現在verify-full相当です。pgの次回major更新前に接続設定を見直してください。"
      : undefined;
  }
  return `${warningName}: ${warningMessage.trim()}`;
}

function installDeploymentWarningHandler(phase: DeploymentPhase): void {
  process.on("warning", (warning) => {
    const message = summarizeDeploymentProcessWarning(
      warning.name,
      warning.message,
      phase,
    );
    if (message !== undefined) {
      console.warn(renderDeploymentWarning(message, DEPLOYMENT_LOG_STYLE));
    }
  });
}

type DeploymentGitSnapshot = {
  branch: string;
  commitSha: string;
  githubRunId?: string;
};

export type VerifiedDeploymentTarget = {
  link: VercelLink;
  canonicalUrl: URL;
  projectName: string;
  database: DatabaseTarget;
  adminCredentials: SmokeCredentials;
  targetFingerprint: string;
  vercelEnvironment: NodeJS.ProcessEnv;
};

type DirectDeploymentState = {
  target?: VerifiedDeploymentTarget;
  previousProductionId?: string;
  attemptedDeploymentId?: string;
  migrationAttempted: boolean;
  productionDeploymentAttempted: boolean;
};

export type ProductionDeploymentEvidence = {
  id: string;
  url: string;
  projectId: string;
  readyState: "READY";
  target: "production";
  commitSha: string;
  githubRunId?: string;
  regions: ["sin1"];
};

export async function runDeploymentWorkflow(
  runner: CommandRunner,
  secrets: SecretRegistry,
  projectRoot = PROJECT_ROOT,
): Promise<void> {
  const phase = readDeploymentPhase(process.env.DEPLOY_PHASE);
  const git = readDeploymentGitSnapshot(process.env);
  assertPhaseExecutionContext(phase, git, process.env);
  const state: DirectDeploymentState = {
    migrationAttempted: false,
    productionDeploymentAttempted: false,
  };

  try {
    const expectedTargetFingerprint =
      phase === "validate" &&
      process.env.DEPLOY_EXPECTED_TARGET_FINGERPRINT === undefined
        ? undefined
        : readExpectedTargetFingerprint(
            process.env.DEPLOY_EXPECTED_TARGET_FINGERPRINT,
          );
    if (phase === "smoke") {
      state.attemptedDeploymentId = readExpectedDeploymentId(
        process.env.DEPLOY_EXPECTED_DEPLOYMENT_ID,
      );
      state.previousProductionId = readExpectedPreviousDeploymentId(
        process.env.DEPLOY_EXPECTED_PREVIOUS_DEPLOYMENT_ID,
      );
    }
    if (phase === "validate") {
      logDeploymentPhase(1, "デプロイ対象の検証");
    } else {
      const labels: Record<Exclude<DeploymentPhase, "validate">, string> = {
        migrate: "Migration適用前のデプロイ対象を再検証",
        release: "Production反映前のデプロイ対象を再検証",
        smoke: "Canonical smoke前のデプロイ対象を再検証",
      };
      logDeploymentRevalidation(labels[phase]);
    }
    validateLocalDeploymentConfig(projectRoot);
    const target = await loadVerifiedDeploymentTarget(
      runner,
      secrets,
      process.env.DEPLOY_AWS_PROFILE,
      expectedTargetFingerprint,
    );
    state.target = target;
    if (phase === "validate") {
      logDeploymentDetail(`Git commit: ${git.commitSha}`);
      logDeploymentDetail(
        `Vercel target: ${redactIdentifier(target.link.projectId)} @ ${redactHostname(target.canonicalUrl.hostname)}`,
      );
      logDeploymentDetail(
        `Neon target: ${redactIdentifier(target.database.endpointId)}`,
      );
    } else {
      logDeploymentSuccess(
        `デプロイ対象の再検証完了 (${git.commitSha.slice(0, 12)})`,
      );
    }

    if (phase === "smoke") {
      logDeploymentPhase(5, "Canonical smoke");
      if (state.attemptedDeploymentId === undefined) {
        throw new Error("The expected smoke deployment ID is unavailable.");
      }
      await runCanonicalSmoke(
        runner,
        target,
        state.attemptedDeploymentId,
      );
      logDeploymentSuccess(
        `Canonical smoke passed: ${state.attemptedDeploymentId}`,
      );
      console.log(
        renderDeploymentSuccessSummary(
          {
            canonicalOrigin: target.canonicalUrl.origin,
            commitSha: git.commitSha,
            deploymentId: state.attemptedDeploymentId,
          },
          DEPLOYMENT_LOG_STYLE,
        ),
      );
      return;
    }

    if (phase === "validate") {
      logDeploymentPhase(2, "品質ゲート");
      const buildAuthSecret = randomBytes(48).toString("base64url");
      secrets.add(buildAuthSecret);
      const buildEnvironment = createBuildEnvironment(
        createSecretFreeBuildEnvironment(process.env),
        buildAuthSecret,
        target.canonicalUrl.origin,
      );
      runQualityGates(runner, projectRoot, buildEnvironment);
      assertDeploymentGitSnapshotUnchanged(git, process.env);
    }

    if (phase === "validate") {
      logDeploymentPhase(3, "DB migrationの確認");
    } else if (phase === "migrate") {
      logDeploymentPhase(3, "承認済みDB migrationの適用");
    } else {
      logDeploymentRevalidation("Production反映前のmigration状態を再検証");
    }
    const migrationPlan = await createMigrationPlan({
      projectRoot,
      directUrl: target.database.directUrl,
      runner,
      inspect: inspectDatabase,
    });

    if (phase === "validate") {
      if (migrationPlan.state === "pending") {
        console.log(renderMigrationPlan(migrationPlan));
      } else {
        logDeploymentSuccess("Migration state: up to date");
      }
      writeDeploymentOutputs({
        "migration-required":
          migrationPlan.state === "pending" ? "true" : "false",
        "plan-digest": migrationPlan.planHash,
        "target-fingerprint": target.targetFingerprint,
      });
      logDeploymentSuccess("検証完了（Production変更なし）");
      if (shouldRequireLocalMigrationApproval(migrationPlan.state, process.env)) {
        throw new MigrationApprovalRequiredError();
      }
      return;
    }

    if (phase === "migrate") {
      const expectedPlanDigest = readExpectedPlanDigest(
        process.env.DEPLOY_EXPECTED_PLAN_DIGEST,
      );
      if (migrationPlan.planHash !== expectedPlanDigest) {
        throw new Error(
          "The migration plan digest changed after validation. No migration was applied.",
        );
      }
      if (migrationPlan.state !== "pending") {
        throw new Error(
          "The approved migration plan is no longer pending. No migration was applied.",
        );
      }
      console.log(renderMigrationPlan(migrationPlan));
      assertDeploymentGitSnapshotUnchanged(git, process.env);
      const executionPlan = await createMigrationPlan({
        projectRoot,
        directUrl: target.database.directUrl,
        runner,
        inspect: inspectDatabase,
      });
      assertSameMigrationPlan(migrationPlan, executionPlan);
      state.migrationAttempted = true;
      applyMigrationPlan(runner, target.database.directUrl);
      await assertMigrationUpToDate(runner, target.database.directUrl, projectRoot);
      await verifyMaintenanceSettingsDatabase(target.database.directUrl);
      logDeploymentSuccess("Migration applied and verified");
      return;
    }

    if (migrationPlan.state === "up-to-date") {
      logDeploymentSuccess("Migration state: up to date");
    }

    if (phase === "release" && migrationPlan.state !== "up-to-date") {
      throw new Error(
        "Production release is blocked until the reviewed migration plan is up to date.",
      );
    }
    if (phase === "release") {
      await verifyMaintenanceSettingsDatabase(target.database.directUrl);
      assertDeploymentGitSnapshotUnchanged(git, process.env);

      logDeploymentPhase(4, "Productionへ直接デプロイ");
      const previousProduction = readCanonicalDeployment(
        runner,
        target.link,
        target.canonicalUrl,
        target.vercelEnvironment,
      );
      state.previousProductionId = previousProduction?.id;
      if (previousProduction) {
        const publicBaseline = await capturePublicSiteBaseline(
          target.canonicalUrl,
          globalThis.fetch,
        );
        logDeploymentDetail(
          `Canonical before deployment: ${previousProduction.id} (HTTP ${publicBaseline.status})`,
        );
      } else {
        logDeploymentDetail("Canonical before deployment: none");
      }

      state.productionDeploymentAttempted = true;
      syncProductionEnvironment(runner, target);
      const productionDeployment = deployDirectlyToProduction(
        runner,
        target,
        git,
        projectRoot,
        (deploymentId) => {
          state.attemptedDeploymentId = deploymentId;
        },
      );
      state.attemptedDeploymentId = productionDeployment.id;
      await waitForCanonicalDeployment(
        runner,
        target.link,
        target.canonicalUrl,
        productionDeployment.id,
        true,
        target.vercelEnvironment,
      );
      const current = readCanonicalDeployment(
        runner,
        target.link,
        target.canonicalUrl,
        target.vercelEnvironment,
      );
      if (current?.id !== productionDeployment.id) {
        throw new Error(
          "The canonical domain does not resolve to the exact direct Production deployment.",
        );
      }
      logDeploymentSuccess(
        `Production deployment verified: ${productionDeployment.id}`,
      );
      writeDeploymentOutputs({
        "deployment-id": productionDeployment.id,
        "previous-deployment-id": previousProduction?.id ?? "none",
      });
      return;
    }
  } catch (error) {
    if (state.migrationAttempted) {
      console.error(
        "Database migration execution was attempted and may be partially applied; it is never reverted automatically.",
      );
    }
    if (state.productionDeploymentAttempted && state.target) {
      let currentProductionId = "unknown";
      try {
        currentProductionId =
          readCanonicalDeployment(
            runner,
            state.target.link,
            state.target.canonicalUrl,
            state.target.vercelEnvironment,
          )?.id ?? "none";
      } catch {
        // The primary error remains authoritative when the failure audit cannot run.
      }
      console.error(
        "Production environment synchronization or a direct Production deployment was attempted. No automatic rollback was performed, and database migrations were not reverted.",
      );
      console.error(
        `Previous deployment ID: ${state.previousProductionId ?? "none"}`,
      );
      console.error(
        `Attempted deployment ID: ${state.attemptedDeploymentId ?? "unknown"}`,
      );
      console.error(`Current canonical deployment ID: ${currentProductionId}`);
      console.error(
        "Recovery runbook: docs/deploy/vercel-neon/redeploy.md",
      );
    } else if (phase === "smoke" && state.attemptedDeploymentId) {
      let currentProductionId = "unknown";
      if (state.target) {
        try {
          currentProductionId =
            readCanonicalDeployment(
              runner,
              state.target.link,
              state.target.canonicalUrl,
              state.target.vercelEnvironment,
            )?.id ?? "none";
        } catch {
          // The smoke error remains authoritative when the failure audit cannot run.
        }
      }
      console.error(
        "Canonical smoke failed. No automatic rollback was performed, and database migrations were not reverted.",
      );
      console.error(
        `Previous deployment ID: ${state.previousProductionId ?? "none"}`,
      );
      console.error(`Attempted deployment ID: ${state.attemptedDeploymentId}`);
      console.error(`Current canonical deployment ID: ${currentProductionId}`);
      console.error("Recovery runbook: docs/deploy/vercel-neon/redeploy.md");
    }
    throw error;
  }
}

async function loadVerifiedDeploymentTarget(
  runner: CommandRunner,
  secrets: SecretRegistry,
  profile: string | undefined,
  expectedTargetFingerprint: string | undefined,
): Promise<VerifiedDeploymentTarget> {
  const contextSource = process.env.DEPLOY_CONTEXT_SOURCE;
  let loaded;
  try {
    if (contextSource !== "stdin") {
      throw new Error("DEPLOY_CONTEXT_SOURCE must be 'stdin'.");
    }
    loaded = loadDeploymentContextFromStdin(
      readDeploymentContextInput(),
      process.env.DEPLOY_AWS_ACCOUNT_ID ?? "",
      profile,
    );
  } finally {
    clearAwsCredentialEnvironment(process.env);
  }
  return verifyStoredDeploymentTarget(
    runner,
    secrets,
    loaded.config,
    loaded.secrets,
    expectedTargetFingerprint,
  );
}

/**
 * Revalidates every stored provider target without reading credentials from
 * ambient environment variables and without mutating Neon, Vercel, or the DB.
 */
export async function verifyStoredDeploymentTarget(
  runner: CommandRunner,
  secrets: SecretRegistry,
  config: StoredDeploymentConfig,
  deploymentSecrets: DeploymentSecrets,
  expectedTargetFingerprint?: string,
): Promise<VerifiedDeploymentTarget> {
  const targetFingerprint = createDeploymentTargetFingerprint(config);
  if (
    expectedTargetFingerprint !== undefined &&
    targetFingerprint !== expectedTargetFingerprint
  ) {
    throw new Error(
      "The deployment target fingerprint changed after validation. No provider or database mutation was started.",
    );
  }
  secrets.add(
    deploymentSecrets.vercelToken,
    deploymentSecrets.neonApiKey,
    deploymentSecrets.adminPassword,
  );
  if (
    config.vercel.expectedPlan !== "hobby" ||
    config.neon.expectedPlan !== "free"
  ) {
    throw new Error("The stored deployment provider policy is unsupported.");
  }

  const link = {
    orgId: config.vercel.orgId,
    projectId: config.vercel.projectId,
  };
  const canonicalUrl = validateCanonicalUrl(config.vercel.canonicalOrigin);
  const vercelEnvironment = createVercelCommandEnvironment(
    process.env,
    link,
    deploymentSecrets.vercelToken,
  );
  ensureDirectProductionCli(runner, vercelEnvironment);
  runChecked(
    runner,
    "vercel",
    ["whoami"],
    "Vercel authentication check",
    vercelEnvironment,
  );
  const project = inspectVercelProject(runner, link, vercelEnvironment);
  if (project.name !== config.vercel.projectName) {
    throw new Error("The Vercel project does not match the stored deployment target.");
  }
  assertCanonicalDomain(runner, link, canonicalUrl, vercelEnvironment);

  const neon = await loadNeonConnectionContext(
    config.neon,
    deploymentSecrets.neonApiKey,
  );
  const pooledPassword = new URL(neon.database.pooledUrl).password;
  const directPassword = new URL(neon.database.directUrl).password;
  secrets.add(
    neon.database.pooledUrl,
    neon.database.directUrl,
    pooledPassword,
    directPassword,
    decodeURIComponent(pooledPassword),
    decodeURIComponent(directPassword),
  );

  const environmentAudit = listProductionEnvironment(
    runner,
    link,
    vercelEnvironment,
  );
  assertAllowedProductionEnvironment(environmentAudit);
  assertExistingProductionAuthSecret(environmentAudit);
  assertNoLinkedProductionSharedEnvironment(runner, link, vercelEnvironment);
  const validatedAdmin = validateAdminInput({
    email: config.admin.email,
    name: "existing",
    password: deploymentSecrets.adminPassword,
  });

  return {
    link,
    canonicalUrl,
    projectName: project.name,
    database: neon.database,
    adminCredentials: {
      email: validatedAdmin.email,
      password: validatedAdmin.password,
    },
    targetFingerprint,
    vercelEnvironment,
  };
}

function syncProductionEnvironment(
  runner: CommandRunner,
  target: VerifiedDeploymentTarget,
): void {
  const before = listProductionEnvironment(
    runner,
    target.link,
    target.vercelEnvironment,
  );
  assertAllowedProductionEnvironment(before);
  assertExistingProductionAuthSecret(before);
  assertNoLinkedProductionSharedEnvironment(
    runner,
    target.link,
    target.vercelEnvironment,
  );

  setVercelEnvironment(
    runner,
    target.link,
    "DATABASE_URL",
    target.database.pooledUrl,
    true,
    true,
    target.vercelEnvironment,
  );
  for (const [name, value] of [
    ["BETTER_AUTH_URL", target.canonicalUrl.origin],
    ["BETTER_AUTH_TRUSTED_ORIGINS", target.canonicalUrl.origin],
    ["BETTER_AUTH_TRUST_PROXY_HEADERS", "true"],
    ["APP_CANONICAL_ORIGIN", target.canonicalUrl.origin],
  ] as const) {
    setVercelEnvironment(
      runner,
      target.link,
      name,
      value,
      false,
      true,
      target.vercelEnvironment,
    );
  }

  const after = listProductionEnvironment(
    runner,
    target.link,
    target.vercelEnvironment,
  );
  assertExactProductionEnvironment(after);
  assertNoLinkedProductionSharedEnvironment(
    runner,
    target.link,
    target.vercelEnvironment,
  );
}

function deployDirectlyToProduction(
  runner: CommandRunner,
  target: VerifiedDeploymentTarget,
  git: DeploymentGitSnapshot,
  projectRoot: string,
  recordDeploymentId: (deploymentId: string) => void,
): ProductionDeploymentEvidence {
  assertProductionEnvironmentReady(
    runner,
    target.link,
    target.vercelEnvironment,
  );
  const arguments_ = createDirectProductionDeployArguments(
    target.link,
    git.commitSha,
    git.githubRunId,
  );
  const deployment = runner.run("vercel", arguments_, {
    cwd: projectRoot,
    env: target.vercelEnvironment,
  });
  assertCommandSucceeded(deployment, "Vercel direct Production deployment");
  const output = parseDeploymentOutput(deployment.stdout);
  if (output.id === undefined) {
    throw new Error(
      "Vercel direct Production deployment did not return a deployment ID.",
    );
  }
  recordDeploymentId(output.id);
  const evidence = inspectProductionDeployment(
    runner,
    target,
    output.url,
    git,
  );
  if (output.id !== evidence.id) {
    throw new Error(
      "The Vercel deploy output ID does not match the verified Production deployment.",
    );
  }
  return evidence;
}

export function createDirectProductionDeployArguments(
  link: VercelLink,
  commitSha: string,
  githubRunId?: string,
): string[] {
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) {
    throw new Error("The Production deployment commit SHA is invalid.");
  }
  if (githubRunId !== undefined && !/^\d+$/u.test(githubRunId)) {
    throw new Error("The Production deployment GitHub run ID is invalid.");
  }
  return [
    "deploy",
    "--prod",
    "--yes",
    "--json",
    "--meta",
    `deployCommitSha=${commitSha}`,
    ...(githubRunId
      ? ["--meta", `githubRunId=${githubRunId}`]
      : []),
    "--scope",
    link.orgId,
    "--project",
    link.projectId,
  ];
}

function inspectProductionDeployment(
  runner: CommandRunner,
  target: VerifiedDeploymentTarget,
  deploymentUrl: URL,
  git: DeploymentGitSnapshot,
): ProductionDeploymentEvidence {
  const inspect = runChecked(
    runner,
    "vercel",
    [
      "inspect",
      deploymentUrl.origin,
      "--wait",
      "--timeout=10m",
      "--json",
      "--scope",
      target.link.orgId,
    ],
    "Vercel Production deployment inspect",
    target.vercelEnvironment,
  );
  const api = vercelApi(
    runner,
    target.link,
    `/v13/deployments/${encodeURIComponent(deploymentUrl.hostname)}?withGitRepoInfo=true&teamId=${target.link.orgId}`,
    target.vercelEnvironment,
  );
  return validateProductionDeploymentEvidence(
    inspect.stdout,
    api.stdout,
    target.link,
    target.projectName,
    deploymentUrl,
    git.commitSha,
    git.githubRunId,
  );
}

export function validateProductionDeploymentEvidence(
  inspectOutput: string,
  apiOutput: string,
  link: VercelLink,
  projectName: string,
  deploymentUrl: URL,
  commitSha: string,
  githubRunId?: string,
): ProductionDeploymentEvidence {
  const inspected = parseJsonObject(
    inspectOutput,
    "Vercel inspect Production deployment",
  );
  if (
    typeof inspected.id !== "string" ||
    !/^dpl_[A-Za-z0-9]+$/u.test(inspected.id) ||
    inspected.url !== deploymentUrl.hostname ||
    inspected.name !== projectName ||
    inspected.target !== "production" ||
    inspected.readyState !== "READY"
  ) {
    throw new Error(
      "Vercel inspect JSON did not verify deployment ID, URL, project name, READY state, and Production target.",
    );
  }
  const api = parseJsonObject(apiOutput, "Vercel Production deployment");
  const meta = isRecord(api.meta) ? api.meta : undefined;
  const regions = Array.isArray(api.regions) ? api.regions : [];
  if (
    api.id !== inspected.id ||
    api.url !== deploymentUrl.hostname ||
    api.projectId !== link.projectId ||
    api.readyState !== "READY" ||
    api.target !== "production" ||
    regions.length !== 1 ||
    regions[0] !== "sin1" ||
    meta?.deployCommitSha !== commitSha ||
    (githubRunId !== undefined && meta?.githubRunId !== githubRunId)
  ) {
    throw new Error(
      "Vercel deployment API did not verify project, URL, READY state, Production target, sin1 region, commit SHA, and run metadata.",
    );
  }
  return {
    id: inspected.id,
    url: deploymentUrl.hostname,
    projectId: link.projectId,
    readyState: "READY",
    target: "production",
    commitSha,
    ...(githubRunId === undefined ? {} : { githubRunId }),
    regions: ["sin1"],
  };
}

async function runCanonicalSmoke(
  runner: CommandRunner,
  target: VerifiedDeploymentTarget,
  expectedDeploymentId: string,
): Promise<void> {
  await runCanonicalDeploymentBoundSmoke(
    expectedDeploymentId,
    () =>
      readCanonicalDeployment(
        runner,
        target.link,
        target.canonicalUrl,
        target.vercelEnvironment,
      ),
    async () => {
      readReadyProductionDeployment(
        runner,
        target.link,
        expectedDeploymentId,
        target.vercelEnvironment,
      );
      const expectation = await readMaintenancePublicExpectation(
        target.database.directUrl,
        "PRODUCTION",
      );
      await waitForCanonicalPublicStatus(
        target.canonicalUrl,
        expectedDeploymentId,
        expectation.status,
        () =>
          readCanonicalDeployment(
            runner,
            target.link,
            target.canonicalUrl,
            target.vercelEnvironment,
          ),
      );
      await runSmokeChecks(
        target.canonicalUrl,
        target.adminCredentials,
        globalThis.fetch,
        {
          canonicalOrigin: target.canonicalUrl,
          publicSiteExpectation: expectation,
        },
      );
    },
  );
}

export async function runCanonicalDeploymentBoundSmoke(
  expectedDeploymentId: string,
  readCurrent: () => { id: string } | undefined,
  smoke: () => Promise<void>,
): Promise<void> {
  const before = readCurrent();
  if (before?.id !== expectedDeploymentId) {
    throw new Error(
      `Canonical Production is '${before?.id ?? "none"}', expected '${expectedDeploymentId}'. No smoke requests were sent.`,
    );
  }
  await smoke();
  const after = readCurrent();
  if (after?.id !== expectedDeploymentId) {
    throw new Error(
      `Canonical Production changed to '${after?.id ?? "none"}' after smoke, expected '${expectedDeploymentId}'.`,
    );
  }
}

export async function waitForCanonicalPublicStatus(
  canonicalUrl: URL,
  expectedDeploymentId: string,
  expectedStatus: 200 | 503,
  readCurrent: () => { id: string } | undefined,
  options: {
    attempts?: number;
    delayMs?: number;
    request?: RequestFunction;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<void> {
  const attempts = options.attempts ?? CANONICAL_PUBLIC_STATUS_ATTEMPTS;
  const delayMs = options.delayMs ?? CANONICAL_PUBLIC_STATUS_DELAY_MS;
  const request = options.request ?? globalThis.fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds)));
  if (!Number.isSafeInteger(attempts) || attempts < 1 || delayMs < 0) {
    throw new Error("Canonical public status wait options are invalid.");
  }

  let lastFailure = "no response";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const current = readCurrent();
    if (current?.id !== expectedDeploymentId) {
      throw new Error(
        `Canonical Production changed to '${current?.id ?? "none"}' while waiting for public routing, expected '${expectedDeploymentId}'.`,
      );
    }

    try {
      const response = await request(new URL("/", canonicalUrl), {
        cache: "no-store",
        headers: {
          "cache-control": "no-cache",
          "user-agent": "zoom-gov-demo-deployment-smoke/1.0",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      const responseUrl = response.url ? new URL(response.url) : canonicalUrl;
      await response.arrayBuffer();
      if (responseUrl.origin !== canonicalUrl.origin) {
        lastFailure = `redirected outside the canonical origin to '${responseUrl.origin}'`;
      } else if (response.status === expectedStatus) {
        return;
      } else {
        lastFailure = `returned HTTP ${response.status}; expected ${expectedStatus}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "request failed";
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Canonical public routing did not converge for deployment '${expectedDeploymentId}': ${lastFailure}.`,
  );
}

async function assertMigrationUpToDate(
  runner: CommandRunner,
  directUrl: string,
  projectRoot: string,
): Promise<void> {
  const afterMigration = await createMigrationPlan({
    projectRoot,
    directUrl,
    runner,
    inspect: inspectDatabase,
  });
  if (afterMigration.state !== "up-to-date") {
    throw new Error("Migration deploy completed but verification is not up to date.");
  }
}

function createVercelCommandEnvironment(
  ambient: Readonly<NodeJS.ProcessEnv>,
  link: VercelLink,
  token: string,
): NodeJS.ProcessEnv {
  const environment = createSecretFreeBuildEnvironment(ambient);
  environment.VERCEL_TOKEN = token;
  environment.VERCEL_ORG_ID = link.orgId;
  environment.VERCEL_PROJECT_ID = link.projectId;
  environment.VERCEL_TEAM_ID = link.orgId;
  environment.NO_COLOR = "1";
  environment.CI = "1";
  return environment;
}

export function createSecretFreeBuildEnvironment(
  ambient: Readonly<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...ambient };
  clearAwsCredentialEnvironment(environment);
  for (const name of [
    "VERCEL_TOKEN",
    "NEON_API_KEY",
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_TRUSTED_ORIGINS",
    "BETTER_AUTH_TRUST_PROXY_HEADERS",
    "APP_CANONICAL_ORIGIN",
  ]) {
    delete environment[name];
  }
  return environment;
}

export function clearAwsCredentialEnvironment(
  environment: NodeJS.ProcessEnv,
): void {
  for (const name of AWS_CREDENTIAL_ENVIRONMENT_NAMES) {
    delete environment[name];
  }
}

function ensureDirectProductionCli(
  runner: CommandRunner,
  environment: NodeJS.ProcessEnv,
): void {
  let version: CommandResult;
  try {
    version = runner.run("vercel", ["--version"], { env: environment });
  } catch {
    throw new CliUnavailableError("The Vercel deployment CLI is unavailable.");
  }
  if (version.status !== 0) {
    throw new CliUnavailableError("The Vercel deployment CLI is unavailable.");
  }
  try {
    assertMinimumVersion(
      parseVersion(combinedOutput(version)),
      VERCEL_MINIMUM,
      "Vercel CLI",
    );
  } catch (error) {
    throw new CliUnavailableError(
      error instanceof Error ? error.message : "The Vercel CLI is too old.",
    );
  }
  const probes: Array<[string[], RegExp, string]> = [
    [["--help"], /--scope/u, "vercel global --scope"],
    [
      ["deploy", "--help"],
      /(?=[\s\S]*--prod)(?=[\s\S]*--yes)(?=[\s\S]*--json)(?=[\s\S]*--meta)(?=[\s\S]*--project)/u,
      "vercel deploy prod/yes/json/meta/project",
    ],
    [["api", "--help"], /--raw/u, "vercel api --raw"],
    [
      ["env", "add", "--help"],
      /(?=[\s\S]*--sensitive)(?=[\s\S]*--no-sensitive)(?=[\s\S]*--force)(?=[\s\S]*--project)/u,
      "vercel env add sensitive/no-sensitive/force/project",
    ],
    [
      ["inspect", "--help"],
      /(?=[\s\S]*--wait)(?=[\s\S]*--timeout)(?=[\s\S]*--json)/u,
      "vercel inspect wait/timeout/json",
    ],
    [["project", "inspect", "--help"], /inspect/iu, "vercel project inspect"],
  ];
  for (const [arguments_, expected, description] of probes) {
    const result = runner.run("vercel", arguments_, { env: environment });
    if (
      (result.status !== 0 && result.status !== 2) ||
      !expected.test(combinedOutput(result))
    ) {
      throw new CliUnavailableError(
        `Required CLI capability is unavailable: ${description}.`,
      );
    }
  }
}

function readDeploymentPhase(value: string | undefined): DeploymentPhase {
  const normalized = value?.trim() ?? "";
  if (
    normalized !== "validate" &&
    normalized !== "migrate" &&
    normalized !== "release" &&
    normalized !== "smoke"
  ) {
    throw new Error("DEPLOY_PHASE is invalid.");
  }
  return normalized;
}

function readDeploymentGitSnapshot(
  environment: Readonly<NodeJS.ProcessEnv>,
): DeploymentGitSnapshot {
  const commitSha = environment.DEPLOY_GIT_SHA?.trim() ?? "";
  const branch = environment.DEPLOY_GIT_BRANCH?.trim() ?? "";
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) {
    throw new Error("DEPLOY_GIT_SHA must identify the immutable Git snapshot.");
  }
  if (!branch || branch.length > 255 || /[\r\n\0]/u.test(branch)) {
    throw new Error("DEPLOY_GIT_BRANCH is invalid.");
  }
  const githubRunId = environment.GITHUB_RUN_ID?.trim();
  if (githubRunId !== undefined && !/^\d+$/u.test(githubRunId)) {
    throw new Error("GITHUB_RUN_ID is invalid.");
  }
  return {
    branch,
    commitSha,
    ...(githubRunId === undefined ? {} : { githubRunId }),
  };
}

function assertDeploymentGitSnapshotUnchanged(
  expected: DeploymentGitSnapshot,
  environment: Readonly<NodeJS.ProcessEnv>,
): void {
  const actual = readDeploymentGitSnapshot(environment);
  if (
    actual.commitSha !== expected.commitSha ||
    actual.branch !== expected.branch ||
    actual.githubRunId !== expected.githubRunId
  ) {
    throw new Error("The immutable Git deployment identity changed during execution.");
  }
}

function assertPhaseExecutionContext(
  phase: DeploymentPhase,
  git: DeploymentGitSnapshot,
  environment: Readonly<NodeJS.ProcessEnv>,
): void {
  const contextSource = environment.DEPLOY_CONTEXT_SOURCE;
  if (environment.GITHUB_ACTIONS !== "true") {
    if (
      contextSource !== "stdin" ||
      git.githubRunId !== undefined ||
      environment.DEPLOY_OUTPUT_PATH !== "/deploy-output/result"
    ) {
      throw new Error(
        `The local '${phase}' phase requires the stdin deployment context and protected phase output contract.`,
      );
    }
    return;
  }
  const expectedEnvironment =
    phase === "migrate" ? "production-migration" : "production-deploy";
  if (
    contextSource !== "stdin" ||
    environment.DEPLOY_OUTPUT_PATH !== "/deploy-output/result" ||
    environment.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    environment.GITHUB_REF !== "refs/heads/main" ||
    environment.GITHUB_SHA !== git.commitSha ||
    environment.DEPLOY_GITHUB_ENVIRONMENT !== expectedEnvironment ||
    git.branch !== "main" ||
    git.githubRunId === undefined
  ) {
    throw new Error(
      `The '${phase}' phase is restricted to workflow_dispatch on protected main in ${expectedEnvironment}.`,
    );
  }
}

function readExpectedPlanDigest(value: string | undefined): string {
  const digest = value?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/u.test(digest)) {
    throw new Error("DEPLOY_EXPECTED_PLAN_DIGEST is invalid.");
  }
  return digest;
}

export function shouldRequireLocalMigrationApproval(
  migrationState: MigrationPlan["state"],
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return (
    migrationState === "pending" &&
    environment.DEPLOY_CONTEXT_SOURCE === "stdin" &&
    environment.GITHUB_ACTIONS !== "true"
  );
}

function readExpectedTargetFingerprint(value: string | undefined): string {
  const fingerprint = value?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/u.test(fingerprint)) {
    throw new Error("DEPLOY_EXPECTED_TARGET_FINGERPRINT is invalid.");
  }
  return fingerprint;
}

function readExpectedDeploymentId(value: string | undefined): string {
  const deploymentId = value?.trim() ?? "";
  if (!/^dpl_[A-Za-z0-9]+$/u.test(deploymentId)) {
    throw new Error("DEPLOY_EXPECTED_DEPLOYMENT_ID is invalid.");
  }
  return deploymentId;
}

export function readExpectedPreviousDeploymentId(
  value: string | undefined,
): string | undefined {
  const deploymentId = value?.trim() ?? "";
  if (deploymentId === "none") {
    return undefined;
  }
  if (!/^dpl_[A-Za-z0-9]+$/u.test(deploymentId)) {
    throw new Error("DEPLOY_EXPECTED_PREVIOUS_DEPLOYMENT_ID is invalid.");
  }
  return deploymentId;
}

function writeDeploymentOutputs(outputs: Readonly<Record<string, string>>): void {
  const contents = Object.entries(outputs)
    .map(([name, value]) => {
      if (!/^[a-z][a-z0-9-]*$/u.test(name) || /[\r\n\0]/u.test(value)) {
        throw new Error("A deployment phase output is invalid.");
      }
      return `${name}=${value}\n`;
    })
    .join("");
  if (contents.length === 0) {
    throw new Error("A deployment phase output cannot be empty.");
  }

  const outputPath = process.env.DEPLOY_OUTPUT_PATH;
  if (outputPath !== "/deploy-output/result") {
    throw new Error("DEPLOY_OUTPUT_PATH must be /deploy-output/result.");
  }
  const directory = lstatSync(dirname(outputPath));
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (directory.mode & 0o077) !== 0
  ) {
    throw new Error("The deployment output directory must be a private directory.");
  }
  writeFileSync(outputPath, contents, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

export function createDeploymentTargetFingerprint(
  config: StoredDeploymentConfig,
): string {
  return createHash("sha256").update(canonicalJson(config)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Deployment target config contains a non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("Deployment target config contains an unsupported JSON value.");
}

export function assertExistingProductionAuthSecret(
  audit: ProductionEnvironmentAudit,
): void {
  if (
    !audit.names.has("BETTER_AUTH_SECRET") ||
    audit.types.get("BETTER_AUTH_SECRET") !== "sensitive"
  ) {
    throw new Error(
      "Vercel Production must already contain one Sensitive BETTER_AUTH_SECRET; deploy.sh never creates or reads it.",
    );
  }
}

function redactIdentifier(value: string): string {
  const separator = value.search(/[-_]/u);
  const prefix = (separator > 0 ? value.slice(0, separator) : value.slice(0, 3)) ||
    "target";
  return `${prefix}…`;
}

function redactHostname(hostname: string): string {
  const [firstLabel = "target", ...remainingLabels] = hostname.split(".");
  const redactedFirstLabel = `${firstLabel.slice(0, 1) || "t"}…`;
  return [redactedFirstLabel, ...remainingLabels].join(".");
}

function readDeploymentContextInput(): string {
  const input = readFileSync(0, "utf8");
  if (Buffer.byteLength(input, "utf8") > 1024 * 1024) {
    throw new Error("The deployment context input exceeds the size limit.");
  }
  if (!input.trim()) {
    throw new Error("The deployment context input is empty.");
  }
  return input;
}

async function readMaintenancePublicExpectation(
  directUrl: string,
  environment: MaintenanceEnvironment,
) {
  const snapshot = await readMaintenanceSettingsDatabase(directUrl);
  return createMaintenancePublicExpectation(snapshot, environment);
}

function inspectVercelProject(
  runner: CommandRunner,
  link: VercelLink,
  environment: NodeJS.ProcessEnv = process.env,
) {
  runChecked(
    runner,
    "vercel",
    [
      "project",
      "inspect",
      link.projectId,
      "--scope",
      link.orgId,
    ],
    "Vercel project inspect",
    environment,
  );
  const raw = vercelApi(
    runner,
    link,
    `/v9/projects/${link.projectId}?teamId=${link.orgId}`,
    environment,
  );
  const project = parseVercelProjectApi(raw.stdout, link);
  const rawValue = parseJsonObject(raw.stdout, "Vercel project");
  if (rawValue.nodeVersion !== undefined && rawValue.nodeVersion !== "24.x") {
    console.warn(
      `Vercel Project Settings reports Node.js '${String(rawValue.nodeVersion)}'; package.json engines.node=24.x is the deployment override and is verified locally.`,
    );
  }
  const team = parseJsonObject(
    vercelApi(
      runner,
      link,
      `/v2/teams/${link.orgId}?teamId=${link.orgId}`,
      environment,
    ).stdout,
    "Vercel scope",
  );
  const billing = isRecord(team.billing) ? team.billing : undefined;
  if (billing?.plan !== "hobby") {
    throw new Error("The linked Vercel scope is not on the Hobby plan.");
  }
  return project;
}

function assertCanonicalDomain(
  runner: CommandRunner,
  link: VercelLink,
  canonicalUrl: URL,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const domain = parseJsonObject(
    vercelApi(
      runner,
      link,
      `/v9/projects/${encodeURIComponent(link.projectId)}/domains/${encodeURIComponent(canonicalUrl.hostname)}?teamId=${encodeURIComponent(link.orgId)}`,
      environment,
    ).stdout,
    "Vercel canonical project domain",
  );
  if (
    domain.name !== canonicalUrl.hostname ||
    domain.projectId !== link.projectId
  ) {
    throw new Error(
      `Canonical domain '${canonicalUrl.hostname}' is not assigned to the linked Vercel project.`,
    );
  }
  const hasRedirect =
    (domain.redirect !== undefined &&
      domain.redirect !== null &&
      domain.redirect !== false) ||
    (domain.redirects !== undefined &&
      domain.redirects !== null &&
      domain.redirects !== false);
  const productionTarget =
    (domain.gitBranch === undefined || domain.gitBranch === null) &&
    (domain.customEnvironmentId === undefined ||
      domain.customEnvironmentId === null) &&
    (domain.environment === undefined || domain.environment === "production");
  if (domain.verified !== true || hasRedirect || !productionTarget) {
    throw new Error(
      `Canonical domain '${canonicalUrl.hostname}' must be verified, non-redirecting, and assigned to Production.`,
    );
  }
}

function listProductionEnvironment(
  runner: CommandRunner,
  link: VercelLink,
  environment: NodeJS.ProcessEnv = process.env,
): ProductionEnvironmentAudit {
  const combined: ProductionEnvironmentAudit = {
    names: new Set<string>(),
    types: new Map<string, string>(),
  };
  const seenCursors = new Set<number>();
  let cursor: number | undefined;

  for (
    let pageNumber = 1;
    pageNumber <= VERCEL_ENVIRONMENT_MAX_PAGES;
    pageNumber += 1
  ) {
    const search = new URLSearchParams({
      decrypt: "false",
      limit: String(VERCEL_ENVIRONMENT_PAGE_LIMIT),
      teamId: link.orgId,
    });
    if (cursor !== undefined) {
      search.set("until", String(cursor));
    }
    const result = vercelApi(
      runner,
      link,
      `/v10/projects/${encodeURIComponent(link.projectId)}/env?${search.toString()}`,
      environment,
    );
    const page = parseProductionEnvironmentPage(result.stdout);
    mergeProductionEnvironmentAudit(combined, page.audit);
    if (page.next === null) {
      return combined;
    }
    if (
      page.count === 0 ||
      seenCursors.has(page.next) ||
      (cursor !== undefined && page.next >= cursor)
    ) {
      throw new Error(
        "Vercel Production environment pagination did not make forward progress.",
      );
    }
    seenCursors.add(page.next);
    cursor = page.next;
  }

  throw new Error(
    "Vercel Production environment pagination exceeded the reviewed page limit.",
  );
}

function parseProductionEnvironmentPage(output: string): {
  audit: ProductionEnvironmentAudit;
  count: number;
  next: number | null;
} {
  const parsed = parseJsonObject(output, "Vercel Production environment API");
  if (!Array.isArray(parsed.envs)) {
    throw new Error(
      "Vercel Production environment API returned invalid pagination.",
    );
  }
  const pagination = parsed.pagination;
  const hiddenProductionEnvCount = parsed.hiddenProductionEnvCount;
  const hasPagination = pagination !== undefined;
  const hasHiddenProductionEnvCount = hiddenProductionEnvCount !== undefined;
  if (hasPagination === hasHiddenProductionEnvCount) {
    throw new Error(
      "Vercel Production environment API returned invalid pagination.",
    );
  }
  if (hasHiddenProductionEnvCount) {
    if (
      !Number.isSafeInteger(hiddenProductionEnvCount) ||
      (hiddenProductionEnvCount as number) < 0
    ) {
      throw new Error(
        "Vercel Production environment API returned invalid pagination.",
      );
    }
    if ((hiddenProductionEnvCount as number) > 0) {
      throw new Error(
        "Vercel Production environment API hid one or more Production variables; the allowlist audit cannot continue.",
      );
    }
    return {
      audit: parseProductionEnvironmentAudit(output),
      count: parsed.envs.length,
      next: null,
    };
  }
  if (
    !isRecord(pagination) ||
    !Number.isSafeInteger(pagination.count) ||
    (pagination.count as number) < 0 ||
    (pagination.count as number) > VERCEL_ENVIRONMENT_PAGE_LIMIT ||
    pagination.count !== parsed.envs.length ||
    !isPaginationCursor(pagination.next) ||
    !isPaginationCursor(pagination.prev)
  ) {
    throw new Error(
      "Vercel Production environment API returned invalid pagination.",
    );
  }
  return {
    audit: parseProductionEnvironmentAudit(output),
    count: pagination.count as number,
    next: pagination.next,
  };
}

function isPaginationCursor(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function mergeProductionEnvironmentAudit(
  combined: ProductionEnvironmentAudit,
  page: ProductionEnvironmentAudit,
): void {
  for (const name of page.names) {
    if (combined.names.has(name)) {
      throw new Error(
        `Vercel Production contains duplicate environment entries for ${name}.`,
      );
    }
    const type = page.types.get(name);
    if (type === undefined) {
      throw new Error(
        "Vercel Production environment audit lost an environment type.",
      );
    }
    combined.names.add(name);
    combined.types.set(name, type);
  }
}

export function assertProductionEnvironmentReady(
  runner: CommandRunner,
  link: VercelLink,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  assertExactProductionEnvironment(
    listProductionEnvironment(runner, link, environment),
  );
  assertNoLinkedProductionSharedEnvironment(runner, link, environment);
}

export function parseProductionEnvironmentAudit(
  output: string,
): ProductionEnvironmentAudit {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new Error("Vercel Production environment API returned invalid JSON.");
  }
  const records = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.envs)
      ? parsed.envs
      : undefined;
  if (!records) {
    throw new Error("Vercel Production environment API response has no envs array.");
  }
  const names = new Set<string>();
  const types = new Map<string, string>();
  for (const record of records) {
    if (
      !isRecord(record) ||
      typeof record.key !== "string" ||
      !/^[A-Z][A-Z0-9_]*$/.test(record.key) ||
      typeof record.type !== "string" ||
      !Array.isArray(record.target) ||
      record.target.length === 0 ||
      !record.target.every(
        (target) =>
          target === "production" ||
          target === "preview" ||
          target === "development",
      )
    ) {
      throw new Error(
        "Vercel Production environment API returned an invalid key/type/target record.",
      );
    }
    if (record.key === "DATABASE_URL_UNPOOLED") {
      throw new Error(
        "DATABASE_URL_UNPOOLED must never be stored in any Vercel environment.",
      );
    }
    if (!record.target.includes("production")) {
      continue;
    }
    if (
      record.target.length !== 1 ||
      (record.gitBranch !== undefined && record.gitBranch !== null)
    ) {
      throw new Error(
        `Vercel Production environment entry ${record.key} must target only Production without a Git branch.`,
      );
    }
    if (names.has(record.key)) {
      throw new Error(
        `Vercel Production contains duplicate environment entries for ${record.key}.`,
      );
    }
    names.add(record.key);
    types.set(record.key, record.type);
  }
  return { names, types };
}

const SHARED_ENVIRONMENT_AUDIT_FAILURE =
  "Vercel Shared Environment Variable audit could not prove the Production environment is unlinked.";
const PRODUCTION_SHARED_ENVIRONMENT_FAILURE =
  "Vercel Production has a linked Shared Environment Variable. Unlink every Production-targeted shared variable from this project and retry.";

export function assertNoLinkedProductionSharedEnvironment(
  runner: CommandRunner,
  link: VercelLink,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  let result: CommandResult;
  try {
    result = runner.run(
      "vercel",
      [
        "api",
        `/v1/env?projectId=${encodeURIComponent(link.projectId)}&teamId=${encodeURIComponent(link.orgId)}`,
        "--raw",
        "--scope",
        link.orgId,
      ],
      { env: { ...environment, NO_COLOR: "1" } },
    );
  } catch {
    throw new Error(SHARED_ENVIRONMENT_AUDIT_FAILURE);
  }
  if (result.status !== 0) {
    throw new Error(SHARED_ENVIRONMENT_AUDIT_FAILURE);
  }
  assertNoProductionSharedEnvironment(result.stdout, link);
}

export function assertNoProductionSharedEnvironment(
  output: string,
  link: VercelLink,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new Error(SHARED_ENVIRONMENT_AUDIT_FAILURE);
  }
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.data) ||
    !isRecord(parsed.pagination) ||
    !Number.isSafeInteger(parsed.pagination.count) ||
    (parsed.pagination.count as number) < 0 ||
    parsed.pagination.count !== parsed.data.length ||
    !(parsed.pagination.next === undefined ||
      parsed.pagination.next === null) ||
    !(parsed.pagination.prev === undefined || parsed.pagination.prev === null)
  ) {
    throw new Error(SHARED_ENVIRONMENT_AUDIT_FAILURE);
  }

  for (const record of parsed.data) {
    if (!isRecord(record)) {
      throw new Error(SHARED_ENVIRONMENT_AUDIT_FAILURE);
    }
    if (
      record.ownerId !== undefined &&
      record.ownerId !== null &&
      record.ownerId !== link.orgId
    ) {
      throw new Error(SHARED_ENVIRONMENT_AUDIT_FAILURE);
    }
    if (
      record.projectId !== undefined &&
      (!Array.isArray(record.projectId) ||
        !record.projectId.every((projectId) => typeof projectId === "string") ||
        !record.projectId.includes(link.projectId))
    ) {
      throw new Error(SHARED_ENVIRONMENT_AUDIT_FAILURE);
    }
    if (
      !Array.isArray(record.target) ||
      record.target.length === 0 ||
      !record.target.every(
        (target) =>
          target === "development" ||
          target === "preview" ||
          target === "production",
      )
    ) {
      throw new Error(SHARED_ENVIRONMENT_AUDIT_FAILURE);
    }
    if (record.target.includes("production")) {
      throw new Error(PRODUCTION_SHARED_ENVIRONMENT_FAILURE);
    }
  }
}

export function assertAllowedProductionEnvironment(
  audit: ProductionEnvironmentAudit,
): void {
  const forbidden = [...audit.names].filter(
    (name) => !PRODUCTION_ENV_ALLOWLIST.has(name),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Vercel Production contains env names outside the reviewed allowlist: ${forbidden.sort().join(", ")}. Remove them manually and retry.`,
    );
  }
  if (audit.names.has("DATABASE_URL_UNPOOLED")) {
    throw new Error(
      "DATABASE_URL_UNPOOLED must never be stored in Vercel Production.",
    );
  }
  for (const name of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
  ]) {
    if (audit.names.has(name) && audit.types.get(name) !== "sensitive") {
      throw new Error(`${name} must be a Vercel Sensitive value.`);
    }
  }
  for (const name of [
    "BETTER_AUTH_URL",
    "BETTER_AUTH_TRUSTED_ORIGINS",
    "BETTER_AUTH_TRUST_PROXY_HEADERS",
    "APP_CANONICAL_ORIGIN",
  ]) {
    if (audit.names.has(name) && audit.types.get(name) !== "encrypted") {
      throw new Error(`${name} must be an encrypted non-Sensitive value.`);
    }
  }
}

export function assertExactProductionEnvironment(
  audit: ProductionEnvironmentAudit,
): void {
  assertAllowedProductionEnvironment(audit);
  const missing = [...PRODUCTION_ENV_ALLOWLIST].filter(
    (name) => !audit.names.has(name),
  );
  if (
    missing.length > 0 ||
    audit.names.size !== PRODUCTION_ENV_ALLOWLIST.size
  ) {
    throw new Error(
      `Vercel Production env verification failed; missing: ${missing.join(", ") || "none"}.`,
    );
  }
}

export function setVercelEnvironment(
  runner: CommandRunner,
  link: VercelLink,
  name: string,
  value: string,
  sensitive: boolean,
  forceOverwrite = true,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const result = runner.run(
    "vercel",
    [
      "env",
      "add",
      name,
      "production",
      ...(forceOverwrite ? ["--force"] : []),
      sensitive ? "--sensitive" : "--no-sensitive",
      "--scope",
      link.orgId,
      "--project",
      link.projectId,
    ],
    { input: `${value}\n`, env: { ...environment, NO_COLOR: "1" } },
  );
  assertCommandSucceeded(result, `Vercel env update for ${name}`);
  logDeploymentSuccess(`Vercel Production env updated: ${name}`);
}

function runQualityGates(
  runner: CommandRunner,
  projectRoot: string,
  buildEnvironment: NodeJS.ProcessEnv,
): void {
  const qualityEnvironment = createSecretFreeBuildEnvironment(process.env);
  const commands: Array<[string, string[], NodeJS.ProcessEnv | undefined]> = [
    ...(process.env.DEPLOY_BOOTSTRAP_NPM_CI === "1"
      ? []
      : ([["npm", ["ci"], qualityEnvironment]] as Array<[
          string,
          string[],
          NodeJS.ProcessEnv | undefined,
        ]>)),
    ["npm", ["test"], qualityEnvironment],
    ["npm", ["run", "lint"], qualityEnvironment],
    ["npm", ["run", "typecheck"], qualityEnvironment],
    ["npm", ["run", "audit:runtime"], qualityEnvironment],
    ["npm", ["run", "build"], buildEnvironment],
  ];
  for (const [command, arguments_, env] of commands) {
    logDeploymentDetail(`実行: ${command} ${arguments_.join(" ")}`);
    const result = runner.run(command, arguments_, {
      cwd: projectRoot,
      env: env ?? qualityEnvironment,
    });
    assertCommandSucceeded(result, `${command} ${arguments_.join(" ")}`);
  }
}

async function waitForCanonicalDeployment(
  runner: CommandRunner,
  link: VercelLink,
  canonicalUrl: URL,
  expectedId: string,
  throwOnFailure: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const deployment = readCanonicalDeployment(
        runner,
        link,
        canonicalUrl,
        environment,
      );
      if (deployment?.id === expectedId) {
        return true;
      }
      lastError = new Error(
        `Canonical deployment is '${deployment?.id ?? "none"}', expected '${expectedId}'.`,
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < 12) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
    }
  }
  if (throwOnFailure) {
    throw new Error(
      `Canonical alias did not converge to the direct Production deployment: ${lastError instanceof Error ? lastError.message : "unknown API result"}`,
    );
  }
  return false;
}

export function createBuildEnvironment(
  ambient: Readonly<NodeJS.ProcessEnv>,
  authSecret: string,
  canonicalOrigin: string,
): NodeJS.ProcessEnv {
  const normalizedCanonicalOrigin = validateCanonicalUrl(canonicalOrigin).origin;
  const environment: NodeJS.ProcessEnv = {
    ...ambient,
    NODE_ENV: "production",
    DATABASE_URL: SYNTHETIC_BUILD_DATABASE_URL,
    BETTER_AUTH_SECRET: authSecret,
    BETTER_AUTH_URL: normalizedCanonicalOrigin,
    BETTER_AUTH_TRUSTED_ORIGINS: normalizedCanonicalOrigin,
    BETTER_AUTH_TRUST_PROXY_HEADERS: "true",
    APP_CANONICAL_ORIGIN: normalizedCanonicalOrigin,
  };
  delete environment.DATABASE_URL_UNPOOLED;
  return environment;
}

export function readCanonicalDeployment(
  runner: CommandRunner,
  link: VercelLink,
  canonicalUrl: URL,
  environment: NodeJS.ProcessEnv = process.env,
): { id: string; url: string } | undefined {
  const endpoint = `/v13/deployments/${encodeURIComponent(canonicalUrl.hostname)}?teamId=${link.orgId}`;
  const result = runner.run(
    "vercel",
    [
      "api",
      endpoint,
      "--raw",
      "--scope",
      link.orgId,
    ],
    { env: { ...environment, NO_COLOR: "1" } },
  );
  return validateCanonicalDeploymentResult(result, link);
}

export function validateCanonicalDeploymentResult(
  result: CommandResult,
  link: VercelLink,
): { id: string; url: string } {
  assertCommandSucceeded(result, "Vercel canonical deployment API");
  const value = parseJsonObject(result.stdout, "Vercel canonical deployment");
  if (
    typeof value.id !== "string" ||
    !/^dpl_[A-Za-z0-9]+$/u.test(value.id) ||
    typeof value.url !== "string" ||
    value.projectId !== link.projectId ||
    value.readyState !== "READY" ||
    value.target !== "production"
  ) {
    throw new Error(
      "Canonical deployment API did not prove a READY deployment for the linked project.",
    );
  }
  return { id: value.id, url: value.url };
}

function readReadyProductionDeployment(
  runner: CommandRunner,
  link: VercelLink,
  deploymentId: string,
  environment: NodeJS.ProcessEnv = process.env,
): { id: string; url: string } {
  const value = parseJsonObject(
    vercelApi(
      runner,
      link,
      `/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${link.orgId}`,
      environment,
    ).stdout,
    "Vercel Production deployment",
  );
  if (
    value.id !== deploymentId ||
    typeof value.url !== "string" ||
    value.projectId !== link.projectId ||
    value.readyState !== "READY" ||
    value.target !== "production"
  ) {
    throw new Error(
      "The deployment API did not prove the exact READY Production deployment for the linked project.",
    );
  }
  return { id: deploymentId, url: value.url };
}

export function assertSameMigrationPlan(
  before: MigrationPlan,
  after: MigrationPlan,
): void {
  if (before.planHash !== after.planHash || before.state !== after.state) {
    throw new Error(
      "Migration status, SQL hashes, classification, or schema diff changed after validation. No migration was performed.",
    );
  }
}

function validateLocalDeploymentConfig(projectRoot: string): void {
  if (Number(process.versions.node.split(".", 1)[0]) !== 24) {
    throw new Error(`Node.js 24 is required; current runtime is ${process.version}.`);
  }
  if (!existsSync(join(projectRoot, "package-lock.json"))) {
    throw new Error("package-lock.json is required; npm is the package-manager source of truth.");
  }
  if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) {
    throw new Error("pnpm-lock.yaml must be removed before deployment.");
  }
  const packageManifest = parseJsonObject(
    readFileSync(join(projectRoot, "package.json"), "utf8"),
    "package.json",
  );
  const engines = isRecord(packageManifest.engines)
    ? packageManifest.engines
    : undefined;
  if (engines?.node !== "24.x") {
    throw new Error("package.json must set engines.node exactly to 24.x.");
  }
  const vercel = parseJsonObject(
    readFileSync(join(projectRoot, "vercel.json"), "utf8"),
    "vercel.json",
  );
  if (
    !Array.isArray(vercel.regions) ||
    vercel.regions.length !== 1 ||
    vercel.regions[0] !== "sin1"
  ) {
    throw new Error("vercel.json must pin Vercel Functions to sin1.");
  }
}

function vercelApi(
  runner: CommandRunner,
  link: VercelLink,
  endpoint: string,
  environment: NodeJS.ProcessEnv = process.env,
): CommandResult {
  return runChecked(
    runner,
    "vercel",
    [
      "api",
      endpoint,
      "--raw",
      "--scope",
      link.orgId,
    ],
    `Vercel API GET ${endpoint.split("?", 1)[0]}`,
    environment,
  );
}

function runChecked(
  runner: CommandRunner,
  command: string,
  arguments_: readonly string[],
  description: string,
  env?: NodeJS.ProcessEnv,
  cwd?: string,
): CommandResult {
  const result = runner.run(command, arguments_, {
    env: env ?? { ...process.env, NO_COLOR: "1" },
    cwd,
  });
  assertCommandSucceeded(result, description);
  return result;
}

function parseJsonObject(value: string, description: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new Error(`${description} did not return a JSON object.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function missingDeploymentParametersMutationMessage(
  phase: string | undefined,
): string {
  switch (phase) {
    case "validate":
      return "Production環境変数更新、DB migration、Production deployは開始されていません。";
    case "migrate":
      return "このmigrate phaseのDB migrationは開始されていません。先行phaseの変更有無はこのメッセージでは断定しません。";
    case "release":
      return "このrelease phaseのVercel環境変数更新とProduction deployは開始されていません。先行phaseのDB migration適用有無はこのメッセージでは断定しません。";
    case "smoke":
      return "このsmoke phaseのcanonical smokeは開始されていません。先行phaseのDB migration、Vercel環境変数更新、Production deployの変更有無はこのメッセージでは断定しません。";
    default:
      return "現在のdeploy phaseは開始されていません。先行phaseの変更有無はこのメッセージでは断定しません。";
  }
}

async function main(): Promise<void> {
  const secrets = new SecretRegistry();
  const runner = new SystemCommandRunner(secrets, PROJECT_ROOT);
  try {
    installDeploymentWarningHandler(
      readDeploymentPhase(process.env.DEPLOY_PHASE),
    );
    await runDeploymentWorkflow(runner, secrets);
  } catch (error) {
    if (error instanceof MigrationApprovalRequiredError) {
      process.exitCode = error.exitCode;
      return;
    }
    if (error instanceof MissingDeploymentParametersError) {
      const profileDescription = error.profile
        ? `AWS profile '${error.profile}'`
        : "AWS OIDC role";
      console.error(
        renderDeploymentFailure("DEPLOYMENT BLOCKED", DEPLOYMENT_LOG_STYLE),
      );
      console.error(`${profileDescription} のデプロイ設定が不足しています。`);
      console.error("不足している SSM parameter:");
      for (const name of error.missingParameterNames) {
        console.error(`  ${name}`);
      }
      console.error("");
      console.error("次を実行して初期設定してください:");
      console.error(
        error.profile
          ? `  ./setup-deploy-aws.sh --profile ${error.profile}`
          : "  ./setup-deploy-aws.sh --profile <setup-profile>",
      );
      console.error("");
      console.error(
        missingDeploymentParametersMutationMessage(process.env.DEPLOY_PHASE),
      );
      process.exitCode = error.exitCode;
      return;
    }
    console.error(
      renderDeploymentFailure("DEPLOYMENT FAILED", DEPLOYMENT_LOG_STYLE),
    );
    if (error instanceof CliUnavailableError) {
      console.error(error.message);
      console.error(
        "Verify the pinned deployment runner image build and its Vercel CLI version.",
      );
    } else {
      console.error(
        secrets.redact(error instanceof Error ? error.message : "Deployment failed."),
      );
    }
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (executedPath === import.meta.url) {
  void main();
}
