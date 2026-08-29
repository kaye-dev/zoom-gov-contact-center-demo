import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  captureAdminAccessBaseSnapshot,
  verifyAdminAccessPostMigration,
} from "./lib/admin-access-rehearsal";
import {
  getProfileFromEnvironment,
  loadDeploymentContextFromStdin,
  MissingDeploymentParametersError,
} from "./lib/aws-config";
import { inspectDatabase } from "./lib/database";
import {
  createMaintenancePublicExpectation,
  verifyMaintenanceSettingsDatabase,
  type MaintenancePublicExpectation,
  type MaintenanceSetting,
} from "./lib/maintenance";
import {
  applyMigrationPlan,
  createMigrationPlan,
  renderMigrationPlan,
} from "./lib/migrations";
import {
  createNeonRehearsal,
  deleteNeonRehearsal,
} from "./lib/neon-rehearsal";
import {
  assertCommandSucceeded,
  SecretRegistry,
  SystemCommandRunner,
  type CommandRunner,
} from "./lib/process";
import {
  createReviewedMigrationOperationDigest,
  runReviewedMigrationApplication,
  type ReviewedMigrationSourceEvidence,
} from "./lib/reviewed-migration-workflow";
import { createAdminAccessReviewedMigrationPlan } from "./lib/reviewed-migrations";
import { capturePublicSiteBaseline } from "./lib/smoke";
import {
  createBuildEnvironment,
  createSecretFreeBuildEnvironment,
  readCanonicalDeployment,
  verifyStoredDeploymentTarget,
} from "./main";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const MAX_CONTEXT_BYTES = 1024 * 1024;

type ReviewedMigrationPhase = "validate" | "apply";

type GitSnapshot = {
  commitSha: string;
  branch: string;
};

export async function runReviewedMigrationWorkflow(
  runner: CommandRunner,
  secrets: SecretRegistry,
  projectRoot = PROJECT_ROOT,
): Promise<void> {
  const phase = readPhase(process.env.REVIEWED_MIGRATION_PHASE);
  const git = readGitSnapshot(process.env);
  assertExecutionContext(phase, process.env);
  const profile = getProfileFromEnvironment();
  const accountId = process.env.DEPLOY_AWS_ACCOUNT_ID ?? "";
  const loaded = loadDeploymentContextFromStdin(
    await readStandardInput(),
    accountId,
    profile,
  );
  clearAmbientCloudCredentials(process.env);
  secrets.add(
    loaded.secrets.vercelToken,
    loaded.secrets.neonApiKey,
    loaded.secrets.adminPassword,
  );

  const expectedTargetFingerprint =
    phase === "apply"
      ? readDigest(
          process.env.REVIEWED_EXPECTED_TARGET_FINGERPRINT,
          "REVIEWED_EXPECTED_TARGET_FINGERPRINT",
        )
      : undefined;
  const target = await verifyStoredDeploymentTarget(
    runner,
    secrets,
    loaded.config,
    loaded.secrets,
    expectedTargetFingerprint,
  );
  const targetFingerprint = target.targetFingerprint;
  const canonicalUrl = target.canonicalUrl;
  const database = target.database;
  const approvedCanonicalDeployment = readCanonicalDeployment(
    runner,
    target.link,
    canonicalUrl,
    target.vercelEnvironment,
  );
  if (approvedCanonicalDeployment === undefined) {
    throw new Error(
      "The reviewed migration requires an existing canonical Production deployment. Production was not changed.",
    );
  }
  const canonicalDeploymentId = approvedCanonicalDeployment.id;

  const inspectReviewedSource = async (
    directUrl: string,
  ): Promise<ReviewedMigrationSourceEvidence> => {
    const reviewed = await createAdminAccessReviewedMigrationPlan({
      projectRoot,
      directUrl,
      runner,
      inspect: inspectDatabase,
    });
    const source = await captureAdminAccessBaseSnapshot(directUrl);
    return {
      reviewedPlanDigest: reviewed.reviewedPlanDigest,
      source,
    };
  };

  const assertMaintenanceActive = async (): Promise<void> => {
    const settings = await verifyMaintenanceSettingsDatabase(
      database.directUrl,
    );
    const expected = createMaintenancePublicExpectation(
      settings,
      "PRODUCTION",
    );
    assertReviewedMaintenanceConfiguration(settings.PRODUCTION, expected);
    const canonical = await capturePublicSiteBaseline(canonicalUrl);
    assertReviewedMaintenancePublicState(expected, canonical);
    const currentCanonicalDeployment = readCanonicalDeployment(
      runner,
      target.link,
      canonicalUrl,
      target.vercelEnvironment,
    );
    if (currentCanonicalDeployment?.id !== canonicalDeploymentId) {
      throw new Error(
        "The canonical Production deployment changed during reviewed migration validation. Production was not changed.",
      );
    }
  };

  console.log("[1/3] Reviewed migration target validation");
  console.log(`Git commit: ${git.commitSha}`);
  console.log("Reviewed batch: admin-access-v1");
  await assertMaintenanceActive();

  if (phase === "validate") {
    console.log("[2/3] Quality gates");
    validateRunnerConfig(projectRoot);
    const buildAuthSecret = randomBytes(48).toString("base64url");
    secrets.add(buildAuthSecret);
    runQualityGates(
      runner,
      projectRoot,
      createBuildEnvironment(
        createSecretFreeBuildEnvironment(process.env),
        buildAuthSecret,
        canonicalUrl.origin,
      ),
    );

    console.log("[3/3] Exact migration window verification");
    const reviewed = await createAdminAccessReviewedMigrationPlan({
      projectRoot,
      directUrl: database.directUrl,
      runner,
      inspect: inspectDatabase,
    });
    const source = await captureAdminAccessBaseSnapshot(
      database.directUrl,
    );
    const operationDigest = createReviewedMigrationOperationDigest({
      gitCommitSha: git.commitSha,
      targetFingerprint,
      reviewedPlanDigest: reviewed.reviewedPlanDigest,
      canonicalDeploymentId,
      source,
    });
    console.log(renderMigrationPlan(reviewed.migration));
    writeOutputs({
      "target-fingerprint": targetFingerprint,
      "reviewed-plan-digest": reviewed.reviewedPlanDigest,
      "operation-digest": operationDigest,
    });
    console.log(
      "Validation completed without Neon branch creation or Production mutation.",
    );
    return;
  }

  const expectedReviewedPlanDigest = readDigest(
    process.env.REVIEWED_EXPECTED_PLAN_DIGEST,
    "REVIEWED_EXPECTED_PLAN_DIGEST",
  );
  const expectedOperationDigest = readDigest(
    process.env.REVIEWED_EXPECTED_OPERATION_DIGEST,
    "REVIEWED_EXPECTED_OPERATION_DIGEST",
  );
  let productionAttempted = false;
  try {
    const result = await runReviewedMigrationApplication({
      productionDirectUrl: database.directUrl,
      expectedOperationDigest,
      gitCommitSha: git.commitSha,
      targetFingerprint,
      canonicalDeploymentId,
      inspectReviewedSource: async (directUrl) => {
        const evidence = await inspectReviewedSource(directUrl);
        if (evidence.reviewedPlanDigest !== expectedReviewedPlanDigest) {
          throw new Error(
            "The reviewed migration plan changed after approval. Production was not changed.",
          );
        }
        return evidence;
      },
      assertMaintenanceActive,
      createRehearsal: async () => {
        console.log("[2/3] Isolated Neon rehearsal");
        const rehearsal = await createNeonRehearsal(
          loaded.config.neon,
          loaded.secrets.neonApiKey,
        );
        registerDatabaseSecrets(secrets, rehearsal.directUrl);
        return rehearsal;
      },
      deleteRehearsal: async (rehearsal) => {
        await deleteNeonRehearsal(
          loaded.config.neon,
          loaded.secrets.neonApiKey,
          rehearsal,
        );
        console.log("Isolated Neon rehearsal was removed and verified.");
      },
      applyMigrations: (directUrl) => {
        applyMigrationPlan(runner, directUrl);
      },
      verifyUpToDate: async (directUrl) => {
        const plan = await createMigrationPlan({
          projectRoot,
          directUrl,
          runner,
          inspect: inspectDatabase,
        });
        if (plan.state !== "up-to-date") {
          throw new Error(
            "The reviewed migration did not finish in an up-to-date state.",
          );
        }
      },
      verifyPostMigration: async (directUrl, source) => {
        await verifyAdminAccessPostMigration(directUrl, source);
      },
      onProductionAttempt: () => {
        productionAttempted = true;
        console.log("[3/3] Reviewed Production migration");
      },
    });
    await assertMaintenanceActive();
    console.log(
      `Reviewed migration applied and verified: ${result.rehearsalEvidenceDigest}`,
    );
  } catch (error) {
    if (productionAttempted) {
      console.error(
        "Production migration execution was attempted and may be partially applied; it is never reverted or retried automatically.",
      );
    } else {
      console.error(
        "Production migration was not started. Vercel environment synchronization and Production deployment were not started.",
      );
    }
    throw error;
  }
}

function runQualityGates(
  runner: CommandRunner,
  projectRoot: string,
  buildEnvironment: NodeJS.ProcessEnv,
): void {
  const qualityEnvironment = createSecretFreeBuildEnvironment(process.env);
  const commands: Array<[string, string[], NodeJS.ProcessEnv]> = [
    ["npm", ["test"], qualityEnvironment],
    ["npm", ["run", "lint"], qualityEnvironment],
    ["npm", ["run", "typecheck"], qualityEnvironment],
    ["npm", ["run", "audit:runtime"], qualityEnvironment],
    ["npm", ["run", "build"], buildEnvironment],
  ];
  for (const [command, arguments_, environment] of commands) {
    console.log(`Running: ${command} ${arguments_.join(" ")}`);
    assertCommandSucceeded(
      runner.run(command, arguments_, {
        cwd: projectRoot,
        env: environment,
      }),
      `${command} ${arguments_.join(" ")}`,
    );
  }
}

function validateRunnerConfig(projectRoot: string): void {
  if (Number(process.versions.node.split(".", 1)[0]) !== 24) {
    throw new Error(`Node.js 24 is required; current runtime is ${process.version}.`);
  }
  if (!existsSync(join(projectRoot, "package-lock.json"))) {
    throw new Error("package-lock.json is required.");
  }
  if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) {
    throw new Error("pnpm-lock.yaml must not exist.");
  }
  const packageManifest = readJsonObject(
    join(projectRoot, "package.json"),
    "package.json",
  );
  const engines = isRecord(packageManifest.engines)
    ? packageManifest.engines
    : undefined;
  if (engines?.node !== "24.x") {
    throw new Error("package.json must set engines.node exactly to 24.x.");
  }
  const vercel = readJsonObject(
    join(projectRoot, "vercel.json"),
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

function registerDatabaseSecrets(
  secrets: SecretRegistry,
  directUrl: string,
): void {
  const parsed = new URL(directUrl);
  secrets.add(
    directUrl,
    parsed.password,
    decodeURIComponent(parsed.password),
  );
}

export function assertReviewedMaintenanceConfiguration(
  production: MaintenanceSetting,
  expected: MaintenancePublicExpectation,
): void {
  if (
    production.environment !== "PRODUCTION" ||
    production.mode !== "ENABLED" ||
    expected.environment !== "PRODUCTION" ||
    expected.status !== 503 ||
    expected.retryAfter !== undefined
  ) {
    throw new Error(
      "The reviewed migration requires non-expiring Production maintenance mode. Production was not changed.",
    );
  }
}

export function assertReviewedMaintenancePublicState(
  expected: MaintenancePublicExpectation,
  canonical: MaintenancePublicExpectation,
): void {
  if (
    canonical.environment !== "PRODUCTION" ||
    canonical.status !== expected.status ||
    canonical.retryAfter !== expected.retryAfter
  ) {
    throw new Error(
      "Canonical Production is not serving the verified maintenance response. Production was not changed.",
    );
  }
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_CONTEXT_BYTES) {
      throw new Error("The SSM deployment context exceeds the size limit.");
    }
    chunks.push(buffer);
  }
  if (length === 0) {
    throw new Error("The SSM deployment context was not provided on stdin.");
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeOutputs(outputs: Readonly<Record<string, string>>): void {
  const path = process.env.DEPLOY_OUTPUT_PATH;
  if (path !== "/deploy-output/result") {
    throw new Error("DEPLOY_OUTPUT_PATH must be /deploy-output/result.");
  }
  const directory = lstatSync(dirname(path));
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (directory.mode & 0o077) !== 0
  ) {
    throw new Error("The reviewed migration output directory is unsafe.");
  }
  const contents = Object.entries(outputs)
    .map(([name, value]) => {
      if (!/^[a-z][a-z0-9-]*$/u.test(name) || /[\r\n\0]/u.test(value)) {
        throw new Error("A reviewed migration output is invalid.");
      }
      return `${name}=${value}\n`;
    })
    .join("");
  writeFileSync(path, contents, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function readPhase(value: string | undefined): ReviewedMigrationPhase {
  if (value === "validate" || value === "apply") {
    return value;
  }
  throw new Error("REVIEWED_MIGRATION_PHASE is invalid.");
}

function readGitSnapshot(
  environment: Readonly<NodeJS.ProcessEnv>,
): GitSnapshot {
  const commitSha = environment.DEPLOY_GIT_SHA?.trim() ?? "";
  const branch = environment.DEPLOY_GIT_BRANCH?.trim() ?? "";
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) {
    throw new Error("DEPLOY_GIT_SHA must identify the immutable Git snapshot.");
  }
  if (!branch || branch.length > 255 || /[\r\n\0]/u.test(branch)) {
    throw new Error("DEPLOY_GIT_BRANCH is invalid.");
  }
  return { commitSha, branch };
}

function assertExecutionContext(
  phase: ReviewedMigrationPhase,
  environment: Readonly<NodeJS.ProcessEnv>,
): void {
  if (
    environment.GITHUB_ACTIONS === "true" ||
    environment.DEPLOY_CONTEXT_SOURCE !== "stdin" ||
    environment.DEPLOY_OUTPUT_PATH !== "/deploy-output/result" ||
    environment.DEPLOY_BOOTSTRAP_NPM_CI !== "1"
  ) {
    throw new Error(
      `The one-time reviewed '${phase}' phase requires the protected local Docker/stdin contract.`,
    );
  }
}

function readDigest(value: string | undefined, name: string): string {
  const normalized = value?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${name} is invalid.`);
  }
  return normalized;
}

function clearAmbientCloudCredentials(environment: NodeJS.ProcessEnv): void {
  for (const name of [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN",
    "AWS_PROFILE",
    "AWS_DEFAULT_PROFILE",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AWS_ROLE_ARN",
    "VERCEL_TOKEN",
    "NEON_API_KEY",
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
  ]) {
    delete environment[name];
  }
}

function readJsonObject(path: string, description: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new Error(`${description} is invalid.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const secrets = new SecretRegistry();
  const runner = new SystemCommandRunner(secrets, PROJECT_ROOT);
  try {
    await runReviewedMigrationWorkflow(runner, secrets);
  } catch (error) {
    if (error instanceof MissingDeploymentParametersError) {
      const profile = error.profile ?? "<setup-profile>";
      console.error(`AWS profile '${profile}' のデプロイ設定が不足しています。`);
      console.error("不足している SSM parameter:");
      for (const name of error.missingParameterNames) {
        console.error(`  ${name}`);
      }
      console.error("");
      console.error("次を実行して初期設定してください:");
      console.error(`  ./setup-deploy-aws.sh --profile ${profile}`);
      console.error("");
      console.error(
        "Neon branch rehearsal、DB migration、Vercel Production deployは開始されていません。",
      );
      process.exitCode = error.exitCode;
      return;
    }
    console.error(
      secrets.redact(
        error instanceof Error
          ? error.message
          : "Reviewed Production migration failed.",
      ),
    );
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (executedPath === import.meta.url) {
  void main();
}
