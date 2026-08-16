import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  inspectAdmin,
  provisionAdmin,
  renderAdminChanges,
  validateAdminInput,
} from "./lib/admin";
import { inspectDatabase } from "./lib/database";
import {
  isAffirmative,
  requireAffirmative,
  requireExact,
  type Prompter,
  TtyPrompter,
} from "./lib/input";
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
import {
  assertCommandSucceeded,
  combinedOutput,
  SecretRegistry,
  SystemCommandRunner,
  type CommandResult,
  type CommandRunner,
} from "./lib/process";
import {
  capturePublicSiteBaseline,
  resolvePublicSiteBaselineAt,
  runSmokeChecks,
  verifyIdleRecovery,
  type SmokeCredentials,
} from "./lib/smoke";
import {
  assertDeploymentOutputMatchesCandidate,
  assertMinimumVersion,
  assertNeonEndpointMatches,
  parseDeploymentOutput,
  parseNeonProjectApi,
  parseVercelProjectApi,
  parseVersion,
  readNeonEndpointState,
  readVercelLink,
  redactDatabaseHost,
  stripAnsi,
  validateCanonicalUrl,
  validateDatabaseUrls,
  type DatabaseTarget,
  type VercelLink,
} from "./lib/validation";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const VERCEL_MINIMUM = [54, 17, 2] as const;
const NEON_MINIMUM = [2, 43, 0] as const;
const NEON_ENDPOINT_STATE_MAX_ATTEMPTS = 31;
const NEON_ENDPOINT_STATE_POLL_INTERVAL_MS = 10_000;
const PRODUCTION_ENV_ALLOWLIST = new Set([
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_TRUSTED_ORIGINS",
  "BETTER_AUTH_TRUST_PROXY_HEADERS",
  "APP_CANONICAL_ORIGIN",
]);

class CliUnavailableError extends Error {}

type VercelDeployment = {
  id: string;
  url: string;
  projectId: string;
  readyState: "READY";
  target: "production";
  commitSha: string;
  readySubstate: "STAGED";
  regions: ["sin1"];
};

export class PromotionGuard {
  #migrationVerified = false;
  #smokeVerified = false;

  markMigrationVerified(): void {
    this.#migrationVerified = true;
  }

  markSmokeVerified(): void {
    this.#smokeVerified = true;
  }

  promote(
    runner: CommandRunner,
    candidateUrl: URL,
    link: VercelLink,
  ): void {
    if (!this.#migrationVerified || !this.#smokeVerified) {
      throw new Error(
        "Promotion is blocked until migration revalidation and staged smoke both pass.",
      );
    }
    runChecked(
      runner,
      "vercel",
      [
        "promote",
        candidateUrl.origin,
        "--yes",
        "--scope",
        link.orgId,
      ],
      "Vercel promotion",
    );
  }
}

type WorkflowState = {
  candidateUrl?: URL;
  candidateId?: string;
  canonicalUrl?: URL;
  vercelLink?: VercelLink;
  previousProductionId?: string;
  smokeCredentials?: SmokeCredentials;
  rollbackPublicExpectation?: ReturnType<
    typeof createMaintenancePublicExpectation
  >;
  promoted: boolean;
  promotionAttempted: boolean;
  productionAcceptanceComplete: boolean;
  migrationApplied: boolean;
  migrationAttempted: boolean;
};

export type ProductionEnvironmentAudit = {
  names: Set<string>;
  types: Map<string, string>;
};

export async function runDeploymentWorkflow(
  runner: CommandRunner,
  prompter: Prompter,
  secrets: SecretRegistry,
  projectRoot = PROJECT_ROOT,
): Promise<void> {
  const state: WorkflowState = {
    promoted: false,
    promotionAttempted: false,
    productionAcceptanceComplete: false,
    migrationApplied: false,
    migrationAttempted: false,
  };

  try {
    assertInteractiveTerminal();
    console.log("[1/7] Local and CLI preflight");
    const git = inspectGit(runner, projectRoot);
    validateLocalDeploymentConfig(projectRoot);
    ensureCliTools(runner);
    const vercelUser = await authenticateVercel(runner, prompter);
    const neonUser = await authenticateNeon(runner, prompter);
    const link = await ensureVercelLink(runner, prompter, projectRoot);
    state.vercelLink = link;
    assertAmbientVercelTarget(link);
    const project = inspectVercelProject(runner, link);

    console.log(`Git branch: ${git.branch}`);
    console.log(`Git commit: ${git.commitSha}`);
    console.log(`Vercel user: ${vercelUser}`);
    console.log(`Vercel project: ${project.name} (${project.id})`);
    console.log(`Vercel scope: ${project.accountId}`);
    console.log(`Neon user: ${neonUser}`);
    await requireExact(
      prompter,
      "Vercel APIでHobby planを確認しました。このscopeが個人・非商用用途で、本番データを扱わず、日本国内のデータ所在要件がない場合に限り 'hobby' と入力してください。",
      "hobby",
      "Personal Hobby scope confirmation was refused.",
    );

    const canonicalUrl = validateCanonicalUrl(
      await prompter.ask("Canonical Production URL (https://...): "),
    );
    state.canonicalUrl = canonicalUrl;
    assertCanonicalDomain(runner, link, canonicalUrl);

    console.log("[2/7] Neon target and secret input");
    const neonProjectId = validateNeonProjectId(
      await prompter.ask("Neon project ID: "),
    );
    assertAmbientNeonTarget(neonProjectId);
    const neonProjectName = validateIdentifier(
      await prompter.ask("Neon project name: "),
      "Neon project name",
    );
    const neonProject = inspectNeonProject(
      runner,
      neonProjectId,
      neonProjectName,
    );
    console.log(
      `Neon project: ${neonProject.name} (${neonProject.id}), ${neonProject.regionId}`,
    );
    await verifyNeonFreePlan(runner, prompter, neonProject.orgId);

    const pooledRaw = await prompter.hidden("DATABASE_URL (pooled): ");
    secrets.add(pooledRaw);
    const directRaw = await prompter.hidden(
      "DATABASE_URL_UNPOOLED (migration only): ",
    );
    secrets.add(directRaw);
    const database = validateDatabaseUrls(pooledRaw, directRaw);
    const pooledPassword = new URL(database.pooledUrl).password;
    const directPassword = new URL(database.directUrl).password;
    secrets.add(
      database.pooledUrl,
      database.directUrl,
      pooledPassword,
      directPassword,
      decodeURIComponent(pooledPassword),
      decodeURIComponent(directPassword),
    );
    const endpoints = runChecked(
      runner,
      "neon",
      [
        "api",
        `/projects/${neonProject.id}/endpoints`,
        "--output",
        "json",
      ],
      "Neon endpoints API",
      { ...process.env, CI: "1" },
    );
    assertNeonEndpointMatches(endpoints.stdout, database, neonProject.id);

    const currentEnvironment = listProductionEnvironment(runner, link);
    assertAllowedProductionEnvironment(currentEnvironment);
    assertNoLinkedProductionSharedEnvironment(runner, link);
    console.log("Deployment target review:");
    console.log(`  Project: ${project.name} (${project.id})`);
    console.log(`  Domain: ${canonicalUrl.origin}`);
    console.log(`  Neon: ${neonProject.name} (${neonProject.id})`);
    console.log(`  Pooled host: ${redactDatabaseHost(database.pooledHost)}`);
    console.log(`  Direct host: ${redactDatabaseHost(database.directHost)} (not saved)`);
    console.log(
      `  Production env: ${[...PRODUCTION_ENV_ALLOWLIST].sort().join(", ")}`,
    );
    await requireAffirmative(
      prompter,
      "Update only the reviewed Vercel Production environment variables?",
      "Vercel environment update was cancelled.",
    );

    const generatedAuthSecret = shouldCreateAuthSecret(currentEnvironment)
      ? randomBytes(48).toString("base64url")
      : undefined;
    secrets.add(generatedAuthSecret);
    setVercelEnvironment(
      runner,
      link,
      "DATABASE_URL",
      database.pooledUrl,
      true,
    );
    if (generatedAuthSecret) {
      setVercelEnvironment(
        runner,
        link,
        "BETTER_AUTH_SECRET",
        generatedAuthSecret,
        true,
        false,
      );
      console.log("Created BETTER_AUTH_SECRET for the first deployment.");
    } else {
      console.log("Preserved the existing BETTER_AUTH_SECRET.");
    }
    setVercelEnvironment(
      runner,
      link,
      "BETTER_AUTH_URL",
      canonicalUrl.origin,
      false,
    );
    setVercelEnvironment(
      runner,
      link,
      "BETTER_AUTH_TRUSTED_ORIGINS",
      canonicalUrl.origin,
      false,
    );
    setVercelEnvironment(
      runner,
      link,
      "BETTER_AUTH_TRUST_PROXY_HEADERS",
      "true",
      false,
    );
    setVercelEnvironment(
      runner,
      link,
      "APP_CANONICAL_ORIGIN",
      canonicalUrl.origin,
      false,
    );
    const resultingEnvironment = listProductionEnvironment(runner, link);
    assertExactProductionEnvironment(resultingEnvironment);
    assertNoLinkedProductionSharedEnvironment(runner, link);

    console.log("[3/7] Quality gates");
    const buildAuthSecret =
      generatedAuthSecret ?? randomBytes(48).toString("base64url");
    secrets.add(buildAuthSecret);
    const buildEnvironment = createBuildEnvironment(
      process.env,
      database.pooledUrl,
      buildAuthSecret,
      canonicalUrl.origin,
    );
    runQualityGates(runner, projectRoot, buildEnvironment);
    assertGitClean(runner, projectRoot, "after quality gates");

    console.log("[4/7] Migration preflight");
    const promotionGuard = new PromotionGuard();
    let migrationPlan = await createMigrationPlan({
      projectRoot,
      directUrl: database.directUrl,
      runner,
      inspect: inspectDatabase,
    });
    console.log(renderMigrationPlan(migrationPlan));
    if (migrationPlan.state === "pending") {
      await requireAffirmative(
        prompter,
        "Create this migration plan as the only candidate for this deployment?",
        "Pending migration was not approved; deployment stopped before candidate creation.",
      );
    }

    console.log("[5/7] Staged Production candidate");
    const deploymentGit = inspectGit(runner, projectRoot);
    if (
      deploymentGit.branch !== git.branch ||
      deploymentGit.commitSha !== git.commitSha
    ) {
      throw new Error(
        "Git branch or commit changed after preflight. Candidate creation was blocked.",
      );
    }
    const previousProduction = readCanonicalDeployment(
      runner,
      link,
      canonicalUrl,
    );
    state.previousProductionId = previousProduction?.id;
    console.log(
      `Canonical deployment before staging: ${previousProduction?.id ?? "none"}`,
    );
    if (previousProduction) {
      state.rollbackPublicExpectation = await capturePublicSiteBaseline(
        canonicalUrl,
        globalThis.fetch,
      );
      console.log(
        `Existing canonical public baseline verified: HTTP ${state.rollbackPublicExpectation.status}${state.rollbackPublicExpectation.retryAfter ? " with Retry-After" : ""}.`,
      );
    }
    assertCandidateProductionEnvironmentReady(runner, link);
    const deployment = runner.run(
      "vercel",
      [
        "deploy",
        "--prod",
        "--skip-domain",
        "--yes",
        "--json",
        "--meta",
        `deployCommitSha=${git.commitSha}`,
        "--scope",
        link.orgId,
        "--project",
        link.projectId,
      ],
      { env: { ...process.env, NO_COLOR: "1" } },
    );
    assertCommandSucceeded(deployment, "Vercel staged Production deployment");
    const deploymentOutput = parseDeploymentOutput(deployment.stdout);
    const candidateUrl = deploymentOutput.url;
    state.candidateUrl = candidateUrl;
    const candidate = inspectCandidateDeployment(
      runner,
      link,
      project.name,
      candidateUrl,
      git.commitSha,
    );
    assertDeploymentOutputMatchesCandidate(deploymentOutput, candidate.id);
    state.candidateId = candidate.id;
    console.log(`Staged URL: ${candidateUrl.origin}`);
    console.log(`Deployment ID: ${candidate.id}`);
    const canonicalAfterStaging = readCanonicalDeployment(
      runner,
      link,
      canonicalUrl,
    );
    if (canonicalAfterStaging?.id !== previousProduction?.id) {
      throw new Error(
        "Canonical Production changed during --skip-domain staging. Migration and promotion were blocked.",
      );
    }

    const recheckedPlan = await createMigrationPlan({
      projectRoot,
      directUrl: database.directUrl,
      runner,
      inspect: inspectDatabase,
    });
    assertSameMigrationPlan(migrationPlan, recheckedPlan);
    migrationPlan = recheckedPlan;
    if (migrationPlan.state === "pending") {
      console.log(renderMigrationPlan(migrationPlan));
      await requireExact(
        prompter,
        "上記と同一のmigration計画を実行する場合は 'migrate' と入力してください。",
        "migrate",
        "Migration execution was refused. The staged candidate will not be promoted.",
      );
      const migrationGit = inspectGit(runner, projectRoot);
      if (
        migrationGit.branch !== git.branch ||
        migrationGit.commitSha !== git.commitSha
      ) {
        throw new Error(
          "Git branch or commit changed while migration approval was pending. Migration was not executed.",
        );
      }
      const executionPlan = await createMigrationPlan({
        projectRoot,
        directUrl: database.directUrl,
        runner,
        inspect: inspectDatabase,
      });
      assertSameMigrationPlan(migrationPlan, executionPlan);
      migrationPlan = executionPlan;
      state.migrationAttempted = true;
      try {
        applyMigrationPlan(runner, database.directUrl);
      } catch (migrationError) {
        try {
          const failurePlan = await createMigrationPlan({
            projectRoot,
            directUrl: database.directUrl,
            runner,
            inspect: inspectDatabase,
          });
          console.error(
            secrets.redact(
              `Post-failure migration audit:\n${renderMigrationPlan(failurePlan)}`,
            ),
          );
        } catch (auditError) {
          console.error(
            secrets.redact(
              `Post-failure migration state could not be proven automatically: ${auditError instanceof Error ? auditError.message : "unknown audit error"}`,
            ),
          );
        }
        throw migrationError;
      }
      state.migrationApplied = true;
      const afterMigration = await createMigrationPlan({
        projectRoot,
        directUrl: database.directUrl,
        runner,
        inspect: inspectDatabase,
      });
      if (afterMigration.state !== "up-to-date") {
        throw new Error("Migration deploy completed but verification is not up to date.");
      }
      console.log(renderMigrationPlan(afterMigration));
    }
    await verifyMaintenanceSettingsDatabase(database.directUrl);
    console.log(
      "Maintenance settings table, constraints, and three version-1 environment rows verified.",
    );
    promotionGuard.markMigrationVerified();

    console.log("[6/7] Administrator and staged smoke tests");
    const credentials = await prepareAdminCredentials(
      prompter,
      secrets,
      database.pooledUrl,
    );
    state.smokeCredentials = credentials;
    const stagedExpectation = await readMaintenancePublicExpectation(
      database.directUrl,
      "PREVIEW",
    );
    const stagedSmoke = await runSmokeChecks(
      candidateUrl,
      credentials,
      globalThis.fetch,
      {
        canonicalOrigin: canonicalUrl,
        publicSiteExpectation: stagedExpectation,
      },
    );
    console.log(`Staged smoke passed: ${stagedSmoke.checks.join(", ")}`);
    console.log(
      "Waiting at least 5 minutes without polling, then allowing up to 5 minutes for the Neon management API to report idle before one health wake-up check...",
    );
    await verifyIdleRecovery(
      candidateUrl,
      5 * 60_000,
      globalThis.fetch,
      (expected) =>
        waitForNeonEndpointState(
          runner,
          neonProject.id,
          database,
          expected,
        ),
    );
    console.log("Staged five-minute idle recovery health check passed.");
    promotionGuard.markSmokeVerified();

    console.log("[7/7] Promotion");
    console.log(`Commit: ${git.commitSha}`);
    console.log(`Candidate: ${candidateUrl.origin}`);
    console.log(`Canonical: ${canonicalUrl.origin}`);
    console.log(
      `Migration: ${state.migrationApplied ? "applied and verified" : "already up to date"}`,
    );
    await requireAffirmative(
      prompter,
      "Promote this exact staged deployment to canonical Production?",
      "Promotion was refused. Canonical traffic was not changed.",
    );
    const finalCandidate = inspectCandidateDeployment(
      runner,
      link,
      project.name,
      candidateUrl,
      git.commitSha,
    );
    if (finalCandidate.id !== candidate.id) {
      throw new Error(
        "The staged candidate identity changed before promotion. No promotion was attempted.",
      );
    }
    const canonicalBeforePromotion = readCanonicalDeployment(
      runner,
      link,
      canonicalUrl,
    );
    if (canonicalBeforePromotion?.id !== previousProduction?.id) {
      throw new Error(
        "Canonical Production changed while staged checks were running. No promotion was attempted; review the new baseline first.",
      );
    }
    state.promotionAttempted = true;
    try {
      promotionGuard.promote(runner, candidateUrl, link);
      state.promoted = true;
    } catch (error) {
      const resolved = await waitForCanonicalDeployment(
        runner,
        link,
        canonicalUrl,
        candidate.id,
        false,
      );
      if (!resolved) {
        throw error;
      }
      state.promoted = true;
      console.warn(
        "The promote command did not report success, but the canonical deployment API confirms the exact candidate; promotion was not retried.",
      );
    }
    await waitForCanonicalDeployment(
      runner,
      link,
      canonicalUrl,
      candidate.id,
      true,
    );
    const canonicalExpectation = await readMaintenancePublicExpectation(
      database.directUrl,
      "PRODUCTION",
    );
    const canonicalSmoke = await runSmokeChecks(
      canonicalUrl,
      credentials,
      globalThis.fetch,
      {
        canonicalOrigin: canonicalUrl,
        publicSiteExpectation: canonicalExpectation,
      },
    );
    console.log(`Canonical smoke passed: ${canonicalSmoke.checks.join(", ")}`);
    state.productionAcceptanceComplete = true;
    console.log(
      `Deployment completed: ${canonicalUrl.origin} (${git.commitSha})`,
    );
  } catch (error) {
    if (state.candidateUrl && !state.promoted) {
      console.error(
        `Staged candidate remains unpromoted: ${state.candidateUrl.origin}`,
      );
    }
    if (state.migrationAttempted) {
      console.error(
        "Database migration execution was attempted and may be partially applied; it is never reverted automatically.",
      );
    }
    if (state.promoted) {
      console.error(
        "Production was promoted. No automatic Vercel rollback was attempted; rollback requires a separate explicit approval and does not revert database migrations.",
      );
      console.error(
        `Rollback path: inspect previous Production deployment '${state.previousProductionId ?? "unknown"}', obtain explicit approval, then run 'vercel rollback <previous-deployment-url-or-id>' and repeat canonical smoke checks.`,
      );
      if (
        !state.productionAcceptanceComplete &&
        state.previousProductionId &&
        state.candidateId &&
        state.vercelLink &&
        state.canonicalUrl &&
        state.rollbackPublicExpectation
      ) {
        const expected = `rollback ${state.previousProductionId}`;
        try {
          const answer = await prompter.ask(
            `Canonical acceptance failed. Database migrations will NOT be reverted. To roll Vercel traffic back, type '${expected}'.\n> `,
          );
          if (answer.trim() === expected) {
            const currentProduction = readCanonicalDeployment(
              runner,
              state.vercelLink,
              state.canonicalUrl,
            );
            if (currentProduction?.id !== state.candidateId) {
              throw new Error(
                "Canonical Production is no longer this workflow's candidate; rollback was blocked to avoid overwriting another actor's recovery.",
              );
            }
            const rollbackTarget = readReadyProductionDeployment(
              runner,
              state.vercelLink,
              state.previousProductionId,
            );
            if (rollbackTarget.id !== state.previousProductionId) {
              throw new Error(
                "The previous Production deployment identity changed; rollback was blocked.",
              );
            }
            const rollback = runner.run(
              "vercel",
              [
                "rollback",
                state.previousProductionId,
                "--yes",
                "--scope",
                state.vercelLink.orgId,
              ],
              { env: { ...process.env, NO_COLOR: "1" } },
            );
            assertCommandSucceeded(rollback, "Explicit Vercel rollback");
            await waitForCanonicalDeployment(
              runner,
              state.vercelLink,
              state.canonicalUrl,
              state.previousProductionId,
              true,
            );
            if (state.smokeCredentials) {
              const rollbackSmoke = await runSmokeChecks(
                state.canonicalUrl,
                state.smokeCredentials,
                globalThis.fetch,
                {
                  canonicalOrigin: state.canonicalUrl,
                  publicSiteExpectation: resolvePublicSiteBaselineAt(
                    state.rollbackPublicExpectation,
                  ),
                  searchIndexingExpectation: "legacy-compatible",
                },
              );
              console.error(
                `Rolled-back canonical smoke passed: ${rollbackSmoke.checks.join(", ")}`,
              );
              console.error(
                "Rollback search-index checks used legacy-compatible mode; the restored release may predate noindex, robots.txt, and sitemap.xml support.",
              );
            }
            console.error(
              `Vercel traffic rollback to '${state.previousProductionId}' was verified. Database migrations remain applied.`,
            );
          } else {
            console.error("Vercel rollback was not approved; no rollback command ran.");
          }
        } catch (rollbackError) {
          console.error(
            secrets.redact(
              `Explicit rollback failed or could not be verified: ${rollbackError instanceof Error ? rollbackError.message : "unknown error"}`,
            ),
          );
        }
      }
    } else if (state.promotionAttempted) {
      console.error(
        "Promotion was attempted but its outcome could not be confirmed. Inspect the canonical deployment API before any retry or rollback.",
      );
    }
    throw error;
  }
}

async function readMaintenancePublicExpectation(
  directUrl: string,
  environment: MaintenanceEnvironment,
) {
  const snapshot = await readMaintenanceSettingsDatabase(directUrl);
  return createMaintenancePublicExpectation(snapshot, environment);
}

export function ensureCliTools(runner: CommandRunner): void {
  let vercelVersion: CommandResult;
  let neonVersion: CommandResult;
  try {
    vercelVersion = runner.run("vercel", ["--version"]);
    neonVersion = runner.run("neon", ["--version"]);
  } catch {
    throw new CliUnavailableError("A required deployment CLI is unavailable.");
  }
  if (vercelVersion.status !== 0 || neonVersion.status !== 0) {
    throw new CliUnavailableError("Vercel or Neon CLI is unavailable.");
  }
  try {
    assertMinimumVersion(
      parseVersion(combinedOutput(vercelVersion)),
      VERCEL_MINIMUM,
      "Vercel CLI",
    );
    assertMinimumVersion(
      parseVersion(combinedOutput(neonVersion)),
      NEON_MINIMUM,
      "Neon CLI",
    );
  } catch (error) {
    throw new CliUnavailableError(
      error instanceof Error ? error.message : "A deployment CLI is too old.",
    );
  }

  const probes: Array<[string, string[], RegExp, string]> = [
    ["vercel", ["--help"], /--scope/, "vercel global --scope"],
    ["vercel", ["deploy", "--help"], /(?=[\s\S]*--prod)(?=[\s\S]*--skip-domain)(?=[\s\S]*--yes)(?=[\s\S]*--json)(?=[\s\S]*--meta)(?=[\s\S]*--project)/, "vercel deploy prod/skip-domain/yes/json/meta/project"],
    ["vercel", ["api", "--help"], /--raw/, "vercel api --raw"],
    ["vercel", ["env", "add", "--help"], /(?=[\s\S]*--sensitive)(?=[\s\S]*--no-sensitive)(?=[\s\S]*--force)(?=[\s\S]*--project)/, "vercel env add sensitive/no-sensitive/force/project"],
    ["vercel", ["inspect", "--help"], /(?=[\s\S]*--wait)(?=[\s\S]*--timeout)(?=[\s\S]*--json)/, "vercel inspect wait/timeout/json"],
    ["vercel", ["promote", "--help"], /--yes/, "vercel promote --yes"],
    ["vercel", ["rollback", "--help"], /--yes/, "vercel rollback --yes"],
    ["vercel", ["project", "inspect", "--help"], /inspect/i, "vercel project inspect"],
    ["neon", ["me", "--help"], /me|current user/i, "neon me"],
    ["neon", ["api", "--help"], /api|endpoint/i, "neon api"],
    ["neon", ["auth", "--help"], /auth/i, "neon auth"],
  ];
  for (const [command, arguments_, expected, description] of probes) {
    const result = runner.run(command, arguments_);
    const validHelpStatus =
      command === "vercel"
        ? result.status === 0 || result.status === 2
        : result.status === 0;
    if (!validHelpStatus || !expected.test(combinedOutput(result))) {
      throw new CliUnavailableError(
        `Required CLI capability is unavailable: ${description}.`,
      );
    }
  }
}

export async function authenticateVercel(
  runner: CommandRunner,
  prompter: Prompter,
): Promise<string> {
  let result = runner.run("vercel", ["whoami"], {
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.status !== 0) {
    await requireAffirmative(
      prompter,
      "Vercel authentication is unavailable. Run 'vercel login' now?",
      "Vercel authentication was refused.",
    );
    result = runner.run("vercel", ["login"], { interactive: true });
    assertCommandSucceeded(result, "Vercel login");
    result = runner.run("vercel", ["whoami"], {
      env: { ...process.env, NO_COLOR: "1" },
    });
  }
  assertCommandSucceeded(result, "Vercel authentication check");
  const lines = stripAnsi(result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^vercel cli/i.test(line));
  const username = lines.at(-1);
  if (!username || !/^[A-Za-z0-9_.-]+$/.test(username)) {
    throw new Error("Could not parse the authenticated Vercel username.");
  }
  return username;
}

export async function authenticateNeon(
  runner: CommandRunner,
  prompter: Prompter,
): Promise<string> {
  const check = () =>
    runner.run("neon", ["me", "--output", "json"], {
      env: { ...process.env, CI: "1" },
    });
  let result = check();
  if (result.status !== 0) {
    await requireAffirmative(
      prompter,
      "Neon authentication is unavailable. Run 'neon auth' now?",
      "Neon authentication was refused before any browser auth.",
    );
    result = runner.run("neon", ["auth"], { interactive: true });
    assertCommandSucceeded(result, "Neon authentication");
    result = check();
  }
  assertCommandSucceeded(result, "Neon non-interactive authentication check");
  const value = parseJsonObject(result.stdout, "Neon account");
  const identity = value.email ?? value.name ?? value.id;
  if (typeof identity !== "string" || !identity) {
    throw new Error("Could not parse the authenticated Neon account.");
  }
  return identity;
}

async function verifyNeonFreePlan(
  runner: CommandRunner,
  prompter: Prompter,
  organizationId: string,
): Promise<void> {
  const result = runner.run(
    "neon",
    ["api", `/organizations/${organizationId}`, "--output", "json"],
    { env: { ...process.env, CI: "1" } },
  );
  if (result.status !== 0) {
    const detail = combinedOutput(result);
    if (!/\b403\b|forbidden|permission|not authorized|not allowed/i.test(detail)) {
      assertCommandSucceeded(result, "Neon organization plan API");
    }
    await requireExact(
      prompter,
      "Neon API権限ではplanを証明できませんでした。Consoleで対象organizationがFreeであることを確認し、'free' と入力してください。",
      "free",
      "Neon Free plan could not be verified.",
    );
    return;
  }
  const raw = parseJsonObject(result.stdout, "Neon organization");
  const organization = isRecord(raw.organization) ? raw.organization : raw;
  if (organization.id !== organizationId || organization.plan !== "free") {
    throw new Error(
      "The selected Neon project's organization is not proven to be on the Free plan.",
    );
  }
}

export function inspectNeonProject(
  runner: CommandRunner,
  projectId: string,
  expectedName: string,
): ReturnType<typeof parseNeonProjectApi> {
  const result = runChecked(
    runner,
    "neon",
    ["api", `/projects/${projectId}`, "--output", "json"],
    "Neon project API",
    { ...process.env, CI: "1" },
  );
  return parseNeonProjectApi(result.stdout, projectId, expectedName);
}

export async function waitForNeonEndpointState(
  runner: CommandRunner,
  projectId: string,
  target: DatabaseTarget,
  expected: "idle" | "active",
  options: {
    attempts?: number;
    intervalMs?: number;
    wait?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<void> {
  const attempts =
    options.attempts ?? NEON_ENDPOINT_STATE_MAX_ATTEMPTS;
  const intervalMs =
    options.intervalMs ?? NEON_ENDPOINT_STATE_POLL_INTERVAL_MS;
  const wait =
    options.wait ??
    ((delayMs: number) =>
      new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delayMs)));
  if (!Number.isInteger(attempts) || attempts < 1 || intervalMs < 0) {
    throw new Error("Neon endpoint state polling options are invalid.");
  }
  let lastState = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = runChecked(
      runner,
      "neon",
      ["api", `/projects/${projectId}/endpoints`, "--output", "json"],
      `Neon endpoint ${expected} state check`,
      { ...process.env, CI: "1" },
    );
    lastState = readNeonEndpointState(result.stdout, target, projectId);
    if (lastState === expected) {
      return;
    }
    if (attempt < attempts) {
      await wait(intervalMs);
    }
  }
  throw new Error(
    `Neon endpoint did not reach '${expected}' during the bounded management-API check (last state: '${lastState}').`,
  );
}

export async function ensureVercelLink(
  runner: CommandRunner,
  prompter: Prompter,
  projectRoot: string,
): Promise<VercelLink> {
  const linkPath = join(projectRoot, ".vercel", "project.json");
  if (!existsSync(linkPath)) {
    await requireAffirmative(
      prompter,
      "No .vercel/project.json exists. Run interactive 'vercel link' now?",
      "Vercel project linking was refused.",
    );
    const result = runner.run("vercel", ["link"], { interactive: true });
    assertCommandSucceeded(result, "Vercel project link");
  }
  return readVercelLink(linkPath);
}

function assertAmbientVercelTarget(link: VercelLink): void {
  const ambient = [
    ["VERCEL_ORG_ID", process.env.VERCEL_ORG_ID, link.orgId],
    ["VERCEL_PROJECT_ID", process.env.VERCEL_PROJECT_ID, link.projectId],
    ["VERCEL_TEAM_ID", process.env.VERCEL_TEAM_ID, link.orgId],
  ] as const;
  for (const [name, actual, expected] of ambient) {
    if (actual !== undefined && actual !== expected) {
      throw new Error(
        `${name} conflicts with .vercel/project.json. Unset it or make it exactly '${expected}'.`,
      );
    }
  }
}

function assertAmbientNeonTarget(projectId: string): void {
  const ambientProjectId = process.env.NEON_PROJECT_ID;
  if (
    ambientProjectId !== undefined &&
    ambientProjectId !== projectId
  ) {
    throw new Error(
      `NEON_PROJECT_ID conflicts with the reviewed project '${projectId}'. Unset it or make it exactly equal.`,
    );
  }
}

function inspectVercelProject(runner: CommandRunner, link: VercelLink) {
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
  );
  const raw = vercelApi(
    runner,
    link,
    `/v9/projects/${link.projectId}?teamId=${link.orgId}`,
  );
  const project = parseVercelProjectApi(raw.stdout, link);
  const rawValue = parseJsonObject(raw.stdout, "Vercel project");
  if (rawValue.nodeVersion !== undefined && rawValue.nodeVersion !== "24.x") {
    console.warn(
      `Vercel Project Settings reports Node.js '${String(rawValue.nodeVersion)}'; package.json engines.node=24.x is the deployment override and is verified locally.`,
    );
  }
  const team = parseJsonObject(
    vercelApi(runner, link, `/v2/teams/${link.orgId}?teamId=${link.orgId}`).stdout,
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
): void {
  const value = parseJsonObject(
    vercelApi(
      runner,
      link,
      `/v9/projects/${link.projectId}/domains?teamId=${link.orgId}`,
    ).stdout,
    "Vercel project domains",
  );
  const domains = Array.isArray(value.domains) ? value.domains : [];
  const domain = domains.find(
    (candidate) =>
      isRecord(candidate) && candidate.name === canonicalUrl.hostname,
  );
  if (!isRecord(domain)) {
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
): ProductionEnvironmentAudit {
  const result = vercelApi(
    runner,
    link,
    `/v10/projects/${link.projectId}/env?decrypt=false&teamId=${link.orgId}`,
  );
  return parseProductionEnvironmentAudit(result.stdout);
}

export function assertCandidateProductionEnvironmentReady(
  runner: CommandRunner,
  link: VercelLink,
): void {
  assertExactProductionEnvironment(listProductionEnvironment(runner, link));
  assertNoLinkedProductionSharedEnvironment(runner, link);
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
      { env: { ...process.env, NO_COLOR: "1" } },
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

export function shouldCreateAuthSecret(
  audit: ProductionEnvironmentAudit,
): boolean {
  assertAllowedProductionEnvironment(audit);
  return !audit.names.has("BETTER_AUTH_SECRET");
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
    { input: `${value}\n`, env: { ...process.env, NO_COLOR: "1" } },
  );
  assertCommandSucceeded(result, `Vercel env update for ${name}`);
  console.log(`Updated Vercel Production env: ${name}`);
}

function runQualityGates(
  runner: CommandRunner,
  projectRoot: string,
  buildEnvironment: NodeJS.ProcessEnv,
): void {
  const commands: Array<[string, string[], NodeJS.ProcessEnv | undefined]> = [
    ...(process.env.DEPLOY_BOOTSTRAP_NPM_CI === "1"
      ? []
      : ([["npm", ["ci"], undefined]] as Array<[
          string,
          string[],
          NodeJS.ProcessEnv | undefined,
        ]>)),
    ["npm", ["test"], undefined],
    ["npm", ["run", "lint"], undefined],
    ["npm", ["run", "typecheck"], undefined],
    ["npm", ["run", "audit:runtime"], undefined],
    ["npm", ["run", "build"], buildEnvironment],
  ];
  for (const [command, arguments_, env] of commands) {
    console.log(`Running: ${command} ${arguments_.join(" ")}`);
    const result = runner.run(command, arguments_, {
      cwd: projectRoot,
      env: env ?? process.env,
    });
    assertCommandSucceeded(result, `${command} ${arguments_.join(" ")}`);
  }
}

function inspectCandidateDeployment(
  runner: CommandRunner,
  link: VercelLink,
  projectName: string,
  candidateUrl: URL,
  commitSha: string,
): VercelDeployment {
  const inspect = runChecked(
    runner,
    "vercel",
    [
      "inspect",
      candidateUrl.origin,
      "--wait",
      "--timeout=10m",
      "--json",
      "--scope",
      link.orgId,
    ],
    "Vercel candidate inspect",
  );
  const apiResult = vercelApi(
    runner,
    link,
    `/v13/deployments/${encodeURIComponent(candidateUrl.hostname)}?withGitRepoInfo=true&teamId=${link.orgId}`,
  );
  return validateCandidateDeploymentEvidence(
    inspect.stdout,
    apiResult.stdout,
    link,
    projectName,
    candidateUrl,
    commitSha,
  );
}

export function validateCandidateDeploymentEvidence(
  inspectOutput: string,
  apiOutput: string,
  link: VercelLink,
  projectName: string,
  candidateUrl: URL,
  commitSha: string,
): VercelDeployment {
  const inspected = parseJsonObject(
    inspectOutput,
    "Vercel inspect deployment",
  );
  if (
    typeof inspected.id !== "string" ||
    inspected.url !== candidateUrl.hostname ||
    inspected.name !== projectName ||
    inspected.target !== "production" ||
    inspected.readyState !== "READY"
  ) {
    throw new Error(
      "Vercel inspect JSON did not verify deployment ID, URL, project name, READY state, and Production target.",
    );
  }
  const value = parseJsonObject(apiOutput, "Vercel deployment");
  const meta = isRecord(value.meta) ? value.meta : undefined;
  const regions = Array.isArray(value.regions) ? value.regions : [];
  if (
    value.id !== inspected.id ||
    value.url !== candidateUrl.hostname ||
    value.projectId !== link.projectId ||
    value.readyState !== "READY" ||
    value.target !== "production" ||
    value.readySubstate !== "STAGED" ||
    regions.length !== 1 ||
    regions[0] !== "sin1" ||
    meta?.deployCommitSha !== commitSha
  ) {
    throw new Error(
      "Vercel deployment API did not verify project, URL, READY/STAGED state, Production target, sin1 region, and commit SHA.",
    );
  }
  return {
    id: value.id,
    url: value.url,
    projectId: value.projectId,
    readyState: "READY",
    target: "production",
    commitSha,
    readySubstate: "STAGED",
    regions: ["sin1"],
  };
}

async function waitForCanonicalDeployment(
  runner: CommandRunner,
  link: VercelLink,
  canonicalUrl: URL,
  expectedId: string,
  throwOnFailure: boolean,
): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const deployment = readCanonicalDeployment(runner, link, canonicalUrl);
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
      `Canonical alias did not converge to the promoted candidate: ${lastError instanceof Error ? lastError.message : "unknown API result"}`,
    );
  }
  return false;
}

export function createBuildEnvironment(
  ambient: Readonly<NodeJS.ProcessEnv>,
  pooledUrl: string,
  authSecret: string,
  canonicalOrigin: string,
): NodeJS.ProcessEnv {
  const normalizedCanonicalOrigin = validateCanonicalUrl(canonicalOrigin).origin;
  const environment: NodeJS.ProcessEnv = {
    ...ambient,
    NODE_ENV: "production",
    DATABASE_URL: pooledUrl,
    BETTER_AUTH_SECRET: authSecret,
    BETTER_AUTH_URL: normalizedCanonicalOrigin,
    BETTER_AUTH_TRUSTED_ORIGINS: normalizedCanonicalOrigin,
    BETTER_AUTH_TRUST_PROXY_HEADERS: "true",
    APP_CANONICAL_ORIGIN: normalizedCanonicalOrigin,
  };
  delete environment.DATABASE_URL_UNPOOLED;
  return environment;
}

function readCanonicalDeployment(
  runner: CommandRunner,
  link: VercelLink,
  canonicalUrl: URL,
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
    { env: { ...process.env, NO_COLOR: "1" } },
  );
  if (result.status !== 0) {
    if (/\b404\b|not found|does not exist/i.test(combinedOutput(result))) {
      return undefined;
    }
    assertCommandSucceeded(result, "Vercel canonical deployment API");
  }
  const value = parseJsonObject(result.stdout, "Vercel canonical deployment");
  if (
    typeof value.id !== "string" ||
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
): { id: string; url: string } {
  const value = parseJsonObject(
    vercelApi(
      runner,
      link,
      `/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${link.orgId}`,
    ).stdout,
    "Vercel rollback target deployment",
  );
  if (
    value.id !== deploymentId ||
    typeof value.url !== "string" ||
    value.projectId !== link.projectId ||
    value.readyState !== "READY" ||
    value.target !== "production"
  ) {
    throw new Error(
      "The rollback target API did not prove the exact READY Production deployment for the linked project.",
    );
  }
  return { id: deploymentId, url: value.url };
}

async function prepareAdminCredentials(
  prompter: Prompter,
  secrets: SecretRegistry,
  pooledUrl: string,
): Promise<SmokeCredentials> {
  const initialize = isAffirmative(
    await prompter.ask(
      "Create or transactionally update an administrator before smoke tests? [y/N] ",
    ),
  );
  if (!initialize) {
    const email = (await prompter.ask("Existing administrator email: "))
      .trim()
      .toLowerCase();
    const password = await prompter.hidden("Existing administrator password: ");
    secrets.add(password);
    validateAdminInput({ email, name: "existing", password });
    return { email, password };
  }

  const email = (await prompter.ask("Administrator email: ")).trim().toLowerCase();
  const name = await prompter.ask("Administrator name: ");
  const password = await prompter.hidden("Administrator password: ");
  secrets.add(password);
  const passwordConfirmation = await prompter.hidden(
    "Confirm administrator password: ",
  );
  secrets.add(passwordConfirmation);
  if (password !== passwordConfirmation) {
    throw new Error("Administrator passwords did not match.");
  }
  const input = validateAdminInput({ email, name, password });
  const snapshot = await inspectAdmin(pooledUrl, input.email);
  console.log(renderAdminChanges(snapshot, input.name));
  await requireAffirmative(
    prompter,
    snapshot.exists
      ? "Apply exactly these existing-user changes in one transaction?"
      : "Create this new administrator?",
    "Administrator provisioning was refused; promotion cannot proceed without authenticated CRUD smoke tests.",
  );
  const result = await provisionAdmin(pooledUrl, input, snapshot);
  console.log(`Administrator ${result}: ${input.email}`);
  return { email: input.email, password };
}

export function assertSameMigrationPlan(
  before: MigrationPlan,
  after: MigrationPlan,
): void {
  if (before.planHash !== after.planHash || before.state !== after.state) {
    throw new Error(
      "Migration status, SQL hashes, or schema diff changed after staged deployment. No migration or promotion was performed.",
    );
  }
}

function inspectGit(
  runner: CommandRunner,
  projectRoot: string,
): { branch: string; commitSha: string } {
  assertGitClean(runner, projectRoot, "at preflight");
  const branch = runChecked(
    runner,
    "git",
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    "Git branch inspection",
    undefined,
    projectRoot,
  ).stdout.trim();
  const commitSha = runChecked(
    runner,
    "git",
    ["rev-parse", "HEAD"],
    "Git commit inspection",
    undefined,
    projectRoot,
  ).stdout.trim();
  if (!branch || !/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error("Git branch or commit SHA is invalid.");
  }
  return { branch, commitSha };
}

function assertGitClean(
  runner: CommandRunner,
  projectRoot: string,
  phase: string,
): void {
  const status = runChecked(
    runner,
    "git",
    ["status", "--porcelain=v1", "--untracked-files=normal"],
    `Git status ${phase}`,
    undefined,
    projectRoot,
  );
  if (status.stdout.trim()) {
    throw new Error(`Git worktree must be clean ${phase}.`);
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

function assertInteractiveTerminal(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("deploy.sh requires an interactive stdin and stdout TTY.");
  }
}

function vercelApi(
  runner: CommandRunner,
  link: VercelLink,
  endpoint: string,
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

function validateIdentifier(value: string, description: string): string {
  const normalized = value.trim();
  if (!normalized || /[\s\0]/.test(normalized) || normalized.length > 128) {
    throw new Error(`${description} is invalid.`);
  }
  return normalized;
}

function validateNeonProjectId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9-]{1,60}$/.test(normalized)) {
    throw new Error("Neon project ID is invalid.");
  }
  return normalized;
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

async function main(): Promise<void> {
  const secrets = new SecretRegistry();
  const runner = new SystemCommandRunner(secrets, PROJECT_ROOT);
  try {
    await runDeploymentWorkflow(runner, new TtyPrompter(), secrets);
  } catch (error) {
    if (error instanceof CliUnavailableError) {
      console.error(error.message);
      console.error("Install or update the CLIs, then retry:");
      console.error("npm install -g vercel@latest");
      console.error("npm install -g neon@latest");
      console.error("# NeonはmacOSなら次も選択可");
      console.error("brew install neonctl");
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
