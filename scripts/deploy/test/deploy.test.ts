import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  captureAwsCleanupPlan,
  executeAwsCleanup,
  inspectLocalAwsArtifacts,
  removeLocalAwsArtifacts,
} from "../lib/aws-cleanup";
import { requireAffirmative, type Prompter } from "../lib/input";
import {
  classifyPrismaStatus,
  createMigrationPlan,
  findDestructiveStatements,
  readLocalMigrations,
  renderMigrationPlan,
  validateMigrationHistory,
  type MigrationPlan,
} from "../lib/migrations";
import {
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
  SecretRegistry,
  SystemCommandRunner,
} from "../lib/process";
import { runSmokeChecks, verifyIdleRecovery } from "../lib/smoke";
import {
  assertNeonEndpointMatches,
  parseDeploymentUrl,
  parseVercelProjectApi,
  validateDatabaseUrls,
} from "../lib/validation";
import {
  assertAllowedProductionEnvironment,
  assertSameMigrationPlan,
  authenticateNeon,
  authenticateVercel,
  createBuildEnvironment,
  ensureCliTools,
  ensureVercelLink,
  parseProductionEnvironmentAudit,
  PromotionGuard,
  setVercelEnvironment,
  shouldCreateAuthSecret,
  validateCandidateDeploymentEvidence,
} from "../main";

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

const success = (stdout = ""): CommandResult => ({
  status: 0,
  stdout,
  stderr: "",
});

const link = { orgId: "team_abc123", projectId: "prj_abc123" };

test("deploy.sh rejects non-TTY execution and missing CLIs with install guidance", () => {
  const deployScript = new URL("../../../deploy.sh", import.meta.url).pathname;
  const nonTty = spawnSync("bash", [deployScript], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(nonTty.status, 1);
  assert.match(nonTty.stderr, /interactive terminal/);

  const missing = spawnSync(
    "bash",
    [
      "-c",
      'source "$1"; PATH=/definitely-missing; require_deployment_clis',
      "deploy-test",
      deployScript,
    ],
    { encoding: "utf8" },
  );
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Required CLI is missing: vercel/);
  assert.match(missing.stderr, /Required CLI is missing: neon/);
  assert.match(missing.stderr, /npm install -g vercel@latest/);
  assert.match(missing.stderr, /npm install -g neon@latest/);
  assert.match(missing.stderr, /brew install neonctl/);
});

test("deploy.sh rejects a dirty Git worktree before deployment", () => {
  const deployScript = new URL("../../../deploy.sh", import.meta.url).pathname;
  const fixtureRoot = mkdtempSync(join(tmpdir(), "zoom-deploy-dirty-"));
  try {
    const initialized = spawnSync("git", ["init", "--quiet", fixtureRoot], {
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0, initialized.stderr);
    writeFileSync(join(fixtureRoot, "untracked.txt"), "dirty", "utf8");
    const result = spawnSync(
      "bash",
      [
        "-c",
        'source "$1"; require_clean_worktree "$2"',
        "deploy-test",
        deployScript,
        fixtureRoot,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Git worktree must be clean/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("database URLs require one sslmode=require and the exact Neon endpoint", () => {
  const pooled =
    "postgresql://demo:p%40ss@ep-safe-pooler.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
  const direct =
    "postgresql://demo:p%40ss@ep-safe.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
  const target = validateDatabaseUrls(pooled, direct);
  assert.equal(target.endpointId, "ep-safe");
  assert.doesNotThrow(() =>
    assertNeonEndpointMatches(
      JSON.stringify({
        endpoints: [
          {
            id: "ep-safe",
            project_id: "project-safe",
            branch_id: "br-safe",
            host: "ep-safe.ap-southeast-1.aws.neon.tech",
            region_id: "aws-ap-southeast-1",
            type: "read_write",
            current_state: "active",
          },
        ],
      }),
      target,
      "project-safe",
    ),
  );
  assert.throws(
    () =>
      validateDatabaseUrls(
        `${pooled}&sslmode=disable`,
        direct,
      ),
    /exactly once/,
  );
  for (const override of [
    "host=attacker.invalid",
    "port=6432",
    "password=override",
    "ssl=true",
    "sslrootcert=%2Ftmp%2Fca.pem",
    "uselibpqcompat=true",
    "sslnegotiation=direct",
  ]) {
    assert.throws(
      () => validateDatabaseUrls(`${pooled}&${override}`, direct),
      /forbidden identity or TLS override/,
    );
  }
  assert.throws(
    () =>
      assertNeonEndpointMatches(
        JSON.stringify({
          endpoints: [
            {
              id: "ep-safe",
              project_id: "project-safe",
              branch_id: "br-safe",
              region_id: "aws-ap-southeast-1",
              type: "read_write",
              current_state: "active",
            },
          ],
        }),
        target,
        "project-safe",
      ),
    /host does not match/,
  );
});

test("staged URL parser accepts only one stdout origin", () => {
  assert.equal(
    parseDeploymentUrl("https://candidate.vercel.app\n").origin,
    "https://candidate.vercel.app",
  );
  assert.throws(
    () =>
      parseDeploymentUrl(
        "https://candidate.vercel.app\nhttps://other.vercel.app",
      ),
    /exactly one/,
  );
});

test("candidate evidence rejects every identity, state, region, and SHA mismatch", () => {
  const candidateUrl = new URL("https://candidate.vercel.app");
  const commitSha = "a".repeat(40);
  const inspected = {
    id: "dpl_candidate",
    url: candidateUrl.hostname,
    name: "demo",
    target: "production",
    readyState: "READY",
  };
  const api = {
    id: inspected.id,
    url: candidateUrl.hostname,
    projectId: link.projectId,
    target: "production",
    readyState: "READY",
    readySubstate: "STAGED",
    regions: ["sin1"],
    meta: { deployCommitSha: commitSha },
  };
  assert.equal(
    validateCandidateDeploymentEvidence(
      JSON.stringify(inspected),
      JSON.stringify(api),
      link,
      "demo",
      candidateUrl,
      commitSha,
    ).id,
    inspected.id,
  );

  const mismatches: Array<[string, unknown]> = [
    ["projectId", "prj_other"],
    ["readyState", "ERROR"],
    ["readySubstate", "PROMOTED"],
    ["target", "preview"],
    ["regions", ["iad1"]],
    ["regions", ["sin1", "iad1"]],
    ["meta", { deployCommitSha: "b".repeat(40) }],
  ];
  for (const [key, value] of mismatches) {
    assert.throws(
      () =>
        validateCandidateDeploymentEvidence(
          JSON.stringify(inspected),
          JSON.stringify({ ...api, [key]: value }),
          link,
          "demo",
          candidateUrl,
          commitSha,
        ),
      /did not verify/,
    );
  }
});

test("Vercel project API requires system variables and rejects Git links", () => {
  const base = {
    id: link.projectId,
    accountId: link.orgId,
    name: "demo",
    autoExposeSystemEnvs: true,
  };
  assert.equal(parseVercelProjectApi(JSON.stringify(base), link).gitLink, null);
  assert.throws(
    () =>
      parseVercelProjectApi(
        JSON.stringify({ ...base, link: { type: "github" } }),
        link,
      ),
    /Git integration/,
  );
  assert.throws(
    () =>
      parseVercelProjectApi(
        JSON.stringify({ ...base, autoExposeSystemEnvs: false }),
        link,
      ),
    /System Environment Variables/,
  );
  assert.throws(
    () =>
      parseVercelProjectApi(
        JSON.stringify({ ...base, id: "prj_wrong" }),
        link,
      ),
    /does not match/,
  );
});

test("missing Vercel link is never created after refusal", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "zoom-deploy-link-"));
  try {
    const runner = new RecordingRunner(() => success());
    const prompter: Prompter = {
      ask: async () => "no",
      hidden: async () => "",
    };
    await assert.rejects(
      ensureVercelLink(runner, prompter, fixtureRoot),
      /linking was refused/,
    );
    assert.equal(runner.calls.length, 0);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("Vercel environment API audits every target and never stores direct URL", () => {
  const valid = {
    envs: [
      { key: "DATABASE_URL", type: "sensitive", target: ["production"] },
      {
        key: "BETTER_AUTH_SECRET",
        type: "sensitive",
        target: ["production"],
      },
      {
        key: "BETTER_AUTH_URL",
        type: "encrypted",
        target: ["production"],
      },
      {
        key: "BETTER_AUTH_TRUSTED_ORIGINS",
        type: "encrypted",
        target: ["production"],
      },
      {
        key: "BETTER_AUTH_TRUST_PROXY_HEADERS",
        type: "encrypted",
        target: ["production"],
      },
      { key: "PREVIEW_ONLY", type: "encrypted", target: ["preview"] },
    ],
  };
  const validAudit = parseProductionEnvironmentAudit(JSON.stringify(valid));
  assert.equal(validAudit.names.size, 5);
  assert.equal(shouldCreateAuthSecret(validAudit), false);
  const withoutSecret = parseProductionEnvironmentAudit(
    JSON.stringify({
      envs: valid.envs.filter((entry) => entry.key !== "BETTER_AUTH_SECRET"),
    }),
  );
  assert.equal(shouldCreateAuthSecret(withoutSecret), true);
  assert.throws(
    () =>
      parseProductionEnvironmentAudit(
        JSON.stringify({
          envs: [
            {
              key: "DATABASE_URL_UNPOOLED",
              type: "sensitive",
              target: ["preview"],
            },
          ],
        }),
      ),
    /must never be stored/,
  );
  assert.throws(
    () =>
      assertAllowedProductionEnvironment(
        parseProductionEnvironmentAudit(
          JSON.stringify({
            envs: [
              { key: "UNKNOWN", type: "encrypted", target: ["production"] },
            ],
          }),
        ),
      ),
    /outside the reviewed allowlist/,
  );
  assert.throws(
    () =>
      parseProductionEnvironmentAudit(
        JSON.stringify({
          envs: [
            { key: "UNKNOWN", type: "encrypted", target: ["production"] },
            { key: "UNKNOWN", type: "encrypted", target: ["production"] },
          ],
        }),
      ),
    /duplicate/,
  );
  assert.throws(
    () =>
      assertAllowedProductionEnvironment(
        parseProductionEnvironmentAudit(
          JSON.stringify({
            envs: [
              {
                key: "BETTER_AUTH_SECRET",
                type: "encrypted",
                target: ["production"],
              },
            ],
          }),
        ),
      ),
    /must be a Vercel Sensitive value/,
  );
});

test("first BETTER_AUTH_SECRET creation never uses force overwrite", () => {
  const runner = new RecordingRunner(() => success("updated"));
  setVercelEnvironment(
    runner,
    link,
    "BETTER_AUTH_SECRET",
    "new-secret",
    true,
    false,
  );
  assert.equal(runner.calls.length, 1);
  assert.equal(runner.calls[0]?.arguments_.includes("--force"), false);
  assert.equal(runner.calls[0]?.arguments_.includes("--sensitive"), true);
  assert.equal(runner.calls[0]?.arguments_.includes("--scope"), true);
  assert.equal(runner.calls[0]?.options?.input, "new-secret\n");
});

test("registered secrets are redacted from child output and refused in argv", () => {
  const secret = "never-print-this-password";
  const registry = new SecretRegistry();
  registry.add(secret);
  const runner = new SystemCommandRunner(registry, process.cwd());
  const result = runner.run(
    process.execPath,
    ["-e", "process.stdout.write(process.env.DEPLOY_TEST_SECRET || '')"],
    { env: { ...process.env, DEPLOY_TEST_SECRET: secret } },
  );
  assert.equal(result.stdout, "[REDACTED]");
  assert.doesNotMatch(result.stdout, new RegExp(secret));
  assert.throws(
    () => runner.run(process.execPath, ["-e", secret]),
    /registered secret in arguments/,
  );
});

test("Neon refusal never starts browser authentication", async () => {
  const runner = new RecordingRunner((_command, arguments_, options) => {
    assert.deepEqual(arguments_, ["me", "--output", "json"]);
    assert.equal(options?.env?.CI, "1");
    return { status: 1, stdout: "", stderr: "not authenticated" };
  });
  const prompter: Prompter = {
    ask: async () => "no",
    hidden: async () => "",
  };
  await assert.rejects(
    authenticateNeon(runner, prompter),
    /refused before any browser auth/,
  );
  assert.equal(
    runner.calls.some((call) => call.arguments_[0] === "auth"),
    false,
  );
});

test("Neon approval authenticates exactly once and repeats the CI probe", async () => {
  let meCalls = 0;
  const runner = new RecordingRunner((_command, arguments_, options) => {
    if (arguments_[0] === "me") {
      meCalls += 1;
      assert.equal(options?.env?.CI, "1");
      return meCalls === 1
        ? { status: 1, stdout: "", stderr: "not authenticated" }
        : success(JSON.stringify({ email: "operator@example.test" }));
    }
    assert.deepEqual(arguments_, ["auth"]);
    assert.equal(options?.interactive, true);
    return success();
  });
  const prompter: Prompter = {
    ask: async () => "yes",
    hidden: async () => "",
  };
  assert.equal(
    await authenticateNeon(runner, prompter),
    "operator@example.test",
  );
  assert.equal(meCalls, 2);
  assert.equal(
    runner.calls.filter((call) => call.arguments_[0] === "auth").length,
    1,
  );
});

test("Vercel login runs only after approval and is re-probed", async () => {
  const refusalRunner = new RecordingRunner(() => ({
    status: 1,
    stdout: "",
    stderr: "not authenticated",
  }));
  const refusalPrompter: Prompter = {
    ask: async () => "no",
    hidden: async () => "",
  };
  await assert.rejects(
    authenticateVercel(refusalRunner, refusalPrompter),
    /authentication was refused/,
  );
  assert.equal(
    refusalRunner.calls.some((call) => call.arguments_[0] === "login"),
    false,
  );

  let whoamiCalls = 0;
  const approvalRunner = new RecordingRunner((_command, arguments_, options) => {
    if (arguments_[0] === "whoami") {
      whoamiCalls += 1;
      return whoamiCalls === 1
        ? { status: 1, stdout: "", stderr: "not authenticated" }
        : success("operator-name\n");
    }
    assert.deepEqual(arguments_, ["login"]);
    assert.equal(options?.interactive, true);
    return success();
  });
  const approvalPrompter: Prompter = {
    ask: async () => "yes",
    hidden: async () => "",
  };
  assert.equal(
    await authenticateVercel(approvalRunner, approvalPrompter),
    "operator-name",
  );
  assert.equal(whoamiCalls, 2);
  assert.equal(
    approvalRunner.calls.filter((call) => call.arguments_[0] === "login")
      .length,
    1,
  );
});

test("old CLI versions fail before capability probes", () => {
  const runner = new RecordingRunner((command) =>
    success(command === "vercel" ? "54.0.0" : "2.43.0"),
  );
  assert.throws(() => ensureCliTools(runner), /too old/);
  assert.equal(runner.calls.length, 2);
});

test("Vercel help exit code 2 is accepted only with every required flag", () => {
  let versionCalls = 0;
  const runner = new RecordingRunner((command, arguments_) => {
    if (arguments_[0] === "--version") {
      versionCalls += 1;
      return success(command === "vercel" ? "58.8.0" : "2.43.0");
    }
    if (command === "vercel") {
      const helpByCommand = new Map<string, string>([
        ["--help", "--scope"],
        ["deploy --help", "--prod --skip-domain --yes --meta --project"],
        ["api --help", "--raw"],
        [
          "env add --help",
          "--sensitive --no-sensitive --force --project",
        ],
        ["inspect --help", "--wait --timeout --json"],
        ["promote --help", "--yes"],
        ["rollback --help", "--yes"],
        ["project inspect --help", "inspect"],
      ]);
      return {
        status: 2,
        stdout: helpByCommand.get(arguments_.join(" ")) ?? "",
        stderr: "",
      };
    }
    return success("me current user --output api endpoint auth");
  });
  assert.doesNotThrow(() => ensureCliTools(runner));
  assert.equal(versionCalls, 2);
});

test("production build env removes every ambient unpooled database URL", () => {
  const environment = createBuildEnvironment(
    {
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://ambient.invalid/runtime",
      DATABASE_URL_UNPOOLED: "postgresql://ambient.invalid/direct",
    },
    "postgresql://pooled.invalid/runtime",
    "auth-secret",
    "https://example.test",
  );
  assert.equal(environment.DATABASE_URL, "postgresql://pooled.invalid/runtime");
  assert.equal(environment.DATABASE_URL_UNPOOLED, undefined);
});

function migrationPlan(planHash: string): MigrationPlan {
  return {
    state: "pending",
    pending: [],
    appliedNames: [],
    predictedDiff: "CREATE TABLE example ();",
    predictedDiffHash: "diff",
    planHash,
    freshDatabase: true,
    databaseTables: [],
    databaseObjects: [],
    tablesWithData: [],
    statusSummary: "1 pending migration",
    totalMigrationCount: 4,
  };
}

test("migration TOCTOU changes block execution", () => {
  assert.doesNotThrow(() =>
    assertSameMigrationPlan(migrationPlan("same"), migrationPlan("same")),
  );
  assert.throws(
    () => assertSameMigrationPlan(migrationPlan("before"), migrationPlan("after")),
    /changed after staged deployment/,
  );
});

test("failed, rolled-back, diverged, checksum, status, and drift states fail closed", async () => {
  const local = readLocalMigrations(
    new URL("../../../prisma/migrations/", import.meta.url).pathname,
  );
  const applied = local.map((migration) => ({
    name: migration.name,
    checksum: migration.hash,
    finished: true,
    rolledBack: false,
    logs: null,
  }));
  const database = {
    migrationsTableExists: true,
    migrations: applied,
    userTables: ["User"],
    userObjects: ["table:User"],
    tablesWithData: [],
  };

  assert.throws(
    () =>
      validateMigrationHistory(local, {
        ...database,
        migrations: [
          {
            ...applied[0]!,
            finished: false,
          },
        ],
      }),
    /Failed or incomplete/,
  );
  assert.throws(
    () =>
      validateMigrationHistory(local, {
        ...database,
        migrations: [
          {
            ...applied[0]!,
            rolledBack: true,
          },
        ],
      }),
    /Rolled-back/,
  );
  assert.throws(
    () =>
      validateMigrationHistory(local, {
        ...database,
        migrations: [{ ...applied[0]!, name: "unexpected_migration" }],
      }),
    /diverged/,
  );
  assert.throws(
    () =>
      validateMigrationHistory(local, {
        ...database,
        migrations: [{ ...applied[0]!, checksum: "0".repeat(64) }],
      }),
    /checksum mismatch/i,
  );
  assert.throws(
    () => classifyPrismaStatus(1, "P1001: Can't reach database server"),
    /neither verified up-to-date nor confirmed pending/,
  );

  const driftRunner = new RecordingRunner((_command, arguments_) =>
    arguments_.includes("status")
      ? success("Database schema is up to date")
      : {
          status: 2,
          stdout: "ALTER TABLE public.\"User\" ADD COLUMN unexpected text;",
          stderr: "",
        },
  );
  await assert.rejects(
    createMigrationPlan({
      projectRoot: process.cwd(),
      directUrl: "postgresql://redacted.invalid/database",
      runner: driftRunner,
      inspect: async () => database,
    }),
    /Schema drift exists/,
  );
});

test("destructive SQL detection is conservative beyond table drops", () => {
  const destructive = findDestructiveStatements(`
    -- DROP TABLE ignored_comment;
    /* DROP FUNCTION ignored_comment(); */
    DROP VIEW public.old_view;
    DROP FUNCTION public.old_function();
    ALTER TABLE public.example RENAME COLUMN old_name TO new_name;
    ALTER TABLE public.example ALTER COLUMN amount TYPE bigint;
    TRUNCATE public.audit_log;
    DELETE FROM public.expired_rows;
  `);
  assert.equal(destructive.length, 6);
  assert.match(destructive.join("\n"), /DROP VIEW/);
  assert.match(destructive.join("\n"), /ALTER COLUMN amount TYPE/);
});

test("destructive migration is eligible only for an object-empty fresh database", async () => {
  const runner = new RecordingRunner((_command, arguments_, options) => {
    assert.equal(
      options?.env?.DATABASE_URL,
      "postgresql://redacted.invalid/database",
    );
    assert.equal(
      options?.env?.DATABASE_URL_UNPOOLED,
      "postgresql://redacted.invalid/database",
    );
    if (arguments_.includes("status")) {
      return success("The following migrations have not yet been applied");
    }
    return {
      status: 2,
      stdout: "CREATE TABLE example (id text);",
      stderr: "",
    };
  });
  const inspection = {
    migrationsTableExists: false,
    migrations: [],
    userTables: [],
    userObjects: [],
    tablesWithData: [],
  };
  const fresh = await createMigrationPlan({
    projectRoot: process.cwd(),
    directUrl: "postgresql://redacted.invalid/database",
    runner,
    inspect: async () => inspection,
  });
  assert.equal(fresh.freshDatabase, true);
  assert.match(renderMigrationPlan(fresh), /only destructive-DDL exception/);
  await assert.rejects(
    createMigrationPlan({
      projectRoot: process.cwd(),
      directUrl: "postgresql://redacted.invalid/database",
      runner,
      inspect: async () => ({
        ...inspection,
        userObjects: ["enum:Role"],
      }),
    }),
    /Destructive DDL is only eligible/,
  );
});

test("promotion guard never invokes promote before both gates pass", () => {
  const runner = new RecordingRunner(() => success());
  const guard = new PromotionGuard();
  assert.throws(
    () => guard.promote(runner, new URL("https://candidate.vercel.app"), link),
    /blocked/,
  );
  guard.markMigrationVerified();
  assert.throws(
    () => guard.promote(runner, new URL("https://candidate.vercel.app"), link),
    /blocked/,
  );
  assert.equal(runner.calls.length, 0);
  guard.markSmokeVerified();
  guard.promote(runner, new URL("https://candidate.vercel.app"), link);
  assert.equal(runner.calls.length, 1);
  assert.deepEqual(runner.calls[0]?.arguments_.slice(0, 2), [
    "promote",
    "https://candidate.vercel.app",
  ]);
});

test("promotion refusal leaves the promote runner untouched", async () => {
  const runner = new RecordingRunner(() => success());
  const prompter: Prompter = {
    ask: async () => "no",
    hidden: async () => "",
  };
  await assert.rejects(
    requireAffirmative(
      prompter,
      "Promote?",
      "Promotion was refused. Canonical traffic was not changed.",
    ),
    /Promotion was refused/,
  );
  assert.equal(runner.calls.length, 0);
});

function bootstrapResources(includeUnknown = false): unknown[] {
  const accountRegion = "686112929630-ap-northeast-1";
  const entries = [
    ["FileAssetsBucketEncryptionKey", "AWS::KMS::Key", "11111111-2222-3333-4444-555555555555"],
    ["FileAssetsBucketEncryptionKeyAlias", "AWS::KMS::Alias", "alias/cdk-hnb659fds-assets-key"],
    ["StagingBucket", "AWS::S3::Bucket", `cdk-hnb659fds-assets-${accountRegion}`],
    ["StagingBucketPolicy", "AWS::S3::BucketPolicy", `cdk-hnb659fds-assets-${accountRegion}`],
    ["ContainerAssetsRepository", "AWS::ECR::Repository", `cdk-hnb659fds-container-assets-${accountRegion}`],
    ["FilePublishingRole", "AWS::IAM::Role", `cdk-hnb659fds-file-publishing-role-${accountRegion}`],
    ["ImagePublishingRole", "AWS::IAM::Role", `cdk-hnb659fds-image-publishing-role-${accountRegion}`],
    ["LookupRole", "AWS::IAM::Role", `cdk-hnb659fds-lookup-role-${accountRegion}`],
    ["FilePublishingRoleDefaultPolicy", "AWS::IAM::Policy", `cdk-hnb659fds-file-publishing-role-default-policy-${accountRegion}`],
    ["ImagePublishingRoleDefaultPolicy", "AWS::IAM::Policy", `cdk-hnb659fds-image-publishing-role-default-policy-${accountRegion}`],
    ["DeploymentActionRole", "AWS::IAM::Role", `cdk-hnb659fds-deploy-role-${accountRegion}`],
    ["CloudFormationExecutionRole", "AWS::IAM::Role", `cdk-hnb659fds-cfn-exec-role-${accountRegion}`],
    ["CdkBootstrapVersion", "AWS::SSM::Parameter", "/cdk-bootstrap/hnb659fds/version"],
  ];
  if (includeUnknown) {
    entries.push(["UnexpectedTable", "AWS::DynamoDB::Table", "unexpected"]);
  }
  return entries.map(([LogicalResourceId, ResourceType, PhysicalResourceId]) => ({
    LogicalResourceId,
    ResourceType,
    PhysicalResourceId,
    ResourceStatus: "CREATE_COMPLETE",
  }));
}

function awsFixtureRunner(includeUnknown = false): RecordingRunner {
  return new RecordingRunner((_command, arguments_) => {
    const action = `${arguments_[0]} ${arguments_[1]}`;
    if (action === "sts get-caller-identity") {
      return success(
        JSON.stringify({
          Account: "686112929630",
          Arn: "arn:aws:iam::686112929630:user/deployer",
        }),
      );
    }
    if (action === "cloudformation list-stacks") {
      return success(
        JSON.stringify({
          StackSummaries: [
            { StackName: "ZoomGovDemoDataStack", StackStatus: "ROLLBACK_COMPLETE" },
            { StackName: "CDKToolkit", StackStatus: "CREATE_COMPLETE" },
            { StackName: "ZoomGovDemoWebStack", StackStatus: "DELETE_COMPLETE" },
          ],
        }),
      );
    }
    if (action === "cloudformation describe-stacks") {
      const name = arguments_[arguments_.indexOf("--stack-name") + 1];
      if (name === "ZoomGovDemoDataStack") {
        return success(JSON.stringify({ Stacks: [{ StackStatus: "ROLLBACK_COMPLETE" }] }));
      }
      return success(
        JSON.stringify({
          Stacks: [
            {
              StackStatus: "CREATE_COMPLETE",
              Outputs: [
                {
                  OutputKey: "BucketName",
                  OutputValue:
                    "cdk-hnb659fds-assets-686112929630-ap-northeast-1",
                },
              ],
              Parameters: [
                { ParameterKey: "Qualifier", ParameterValue: "hnb659fds" },
                { ParameterKey: "FileAssetsBucketKmsKeyId", ParameterValue: "" },
              ],
            },
          ],
        }),
      );
    }
    if (action === "cloudformation list-stack-resources") {
      const name = arguments_[arguments_.indexOf("--stack-name") + 1];
      return success(
        JSON.stringify({
          StackResourceSummaries:
            name === "CDKToolkit" ? bootstrapResources(includeUnknown) : [],
        }),
      );
    }
    if (action === "s3api list-object-versions") {
      return success(
        JSON.stringify({
          Versions: [1, 2, 3].map((index) => ({
            Key: `asset-${index}.zip`,
            VersionId: `version-${index}`,
          })),
        }),
      );
    }
    if (action === "ecr describe-repositories") {
      return success(
        JSON.stringify({
          repositories: [
            {
              repositoryName:
                "cdk-hnb659fds-container-assets-686112929630-ap-northeast-1",
            },
          ],
        }),
      );
    }
    if (action === "ecr describe-images") {
      return success(JSON.stringify({ imageDetails: [] }));
    }
    if (action === "ssm describe-parameters") {
      return success(
        JSON.stringify({
          Parameters: [{ Name: "/cdk-bootstrap/hnb659fds/version" }],
        }),
      );
    }
    if (action === "iam list-roles") {
      return success(
        JSON.stringify({
          Roles: bootstrapResources()
            .filter(
              (resource) =>
                (resource as { ResourceType: string }).ResourceType ===
                "AWS::IAM::Role",
            )
            .map((resource) => ({
              RoleName: (resource as { PhysicalResourceId: string })
                .PhysicalResourceId,
            })),
        }),
      );
    }
    if (action === "kms list-aliases") {
      return success(
        JSON.stringify({
          Aliases: [
            {
              AliasName: "alias/cdk-hnb659fds-assets-key",
              TargetKeyId: "11111111-2222-3333-4444-555555555555",
            },
          ],
        }),
      );
    }
    if (action === "kms describe-key") {
      return success(
        JSON.stringify({
          KeyMetadata: {
            KeyId: "11111111-2222-3333-4444-555555555555",
            KeyManager: "CUSTOMER",
            KeyState: "Enabled",
            Arn: "arn:aws:kms:ap-northeast-1:686112929630:key/11111111-2222-3333-4444-555555555555",
          },
        }),
      );
    }
    throw new Error(`Unexpected AWS fixture command: ${action}`);
  });
}

test("AWS cleanup capture accepts only the exact reviewed bootstrap fixture", () => {
  const plan = captureAwsCleanupPlan(awsFixtureRunner());
  assert.equal(plan.assetVersions.length, 3);
  assert.equal(plan.toolkitResources.length, 13);
  assert.equal(plan.kmsKeyId, "11111111-2222-3333-4444-555555555555");
  assert.match(plan.hash, /^[0-9a-f]{64}$/);
});

test("AWS unknown bootstrap resource stops before every delete", () => {
  const runner = awsFixtureRunner(true);
  assert.throws(
    () => captureAwsCleanupPlan(runner),
    /does not exactly match the reviewed modern bootstrap resource set/,
  );
  assert.equal(
    runner.calls.some((call) => call.arguments_.includes("delete-stack")),
    false,
  );
});

function awsCleanupExecutionRunner(failOnKey?: string): RecordingRunner {
  return new RecordingRunner((_command, arguments_) => {
    const action = `${arguments_[0]} ${arguments_[1]}`;
    if (
      action === "s3api delete-object" &&
      failOnKey &&
      arguments_.includes(failOnKey)
    ) {
      return { status: 1, stdout: "", stderr: "fixture deletion failed" };
    }
    if (action === "s3api list-object-versions") {
      return success(JSON.stringify({ Versions: [], DeleteMarkers: [] }));
    }
    if (action === "cloudformation describe-stacks") {
      return { status: 1, stdout: "", stderr: "Stack does not exist" };
    }
    if (action === "s3api head-bucket") {
      return { status: 1, stdout: "", stderr: "404 Not Found" };
    }
    if (action === "ecr describe-repositories") {
      return success(JSON.stringify({ repositories: [] }));
    }
    if (action === "ssm describe-parameters") {
      return success(JSON.stringify({ Parameters: [] }));
    }
    if (action === "iam list-roles") {
      return success(JSON.stringify({ Roles: [] }));
    }
    if (action === "kms list-aliases") {
      return success(JSON.stringify({ Aliases: [] }));
    }
    if (action === "kms describe-key") {
      return success(
        JSON.stringify({
          KeyMetadata: {
            KeyId: "11111111-2222-3333-4444-555555555555",
            KeyState: "PendingDeletion",
            DeletionDate: "2026-08-15T00:00:00.000Z",
          },
        }),
      );
    }
    return success("{}");
  });
}

test("AWS cleanup executes the reviewed order and stops at the first failure", () => {
  const plan = captureAwsCleanupPlan(awsFixtureRunner());
  const runner = awsCleanupExecutionRunner();
  executeAwsCleanup(runner, plan);
  const mutations = runner.calls
    .filter((call) =>
      ["delete-stack", "delete-object", "delete-bucket"].includes(
        call.arguments_[1] ?? "",
      ),
    )
    .map((call) => {
      const action = `${call.arguments_[0]} ${call.arguments_[1]}`;
      const keyIndex = call.arguments_.indexOf("--key");
      const stackIndex = call.arguments_.indexOf("--stack-name");
      return `${action}:${
        keyIndex >= 0
          ? call.arguments_[keyIndex + 1]
          : stackIndex >= 0
            ? call.arguments_[stackIndex + 1]
            : plan.bootstrapBucket
      }`;
    });
  assert.deepEqual(mutations, [
    "cloudformation delete-stack:ZoomGovDemoDataStack",
    "s3api delete-object:asset-1.zip",
    "s3api delete-object:asset-2.zip",
    "s3api delete-object:asset-3.zip",
    "cloudformation delete-stack:CDKToolkit",
    `s3api delete-bucket:${plan.bootstrapBucket}`,
  ]);

  const failureRunner = awsCleanupExecutionRunner("asset-2.zip");
  assert.throws(
    () => executeAwsCleanup(failureRunner, plan),
    /fixture deletion failed/,
  );
  assert.equal(
    failureRunner.calls.some(
      (call) =>
        call.arguments_[0] === "cloudformation" &&
        call.arguments_[1] === "delete-stack" &&
        call.arguments_.includes("CDKToolkit"),
    ),
    false,
  );
  assert.equal(
    failureRunner.calls.some((call) => call.arguments_[1] === "delete-bucket"),
    false,
  );
});

test("local AWS artifacts are fully prevalidated before directory-only removal", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "zoom-deploy-artifacts-"));
  try {
    const artifacts = join(fixtureRoot, ".aws-artifacts");
    const cdkOutput = join(fixtureRoot, "cdk.out");
    const outside = join(fixtureRoot, "outside");
    mkdirSync(outside);

    writeFileSync(artifacts, "not a directory", "utf8");
    assert.throws(
      () => inspectLocalAwsArtifacts(fixtureRoot),
      /unexpected AWS artifact path/,
    );
    rmSync(artifacts);

    symlinkSync(outside, artifacts);
    assert.throws(
      () => inspectLocalAwsArtifacts(fixtureRoot),
      /unexpected AWS artifact path/,
    );
    rmSync(artifacts);

    mkdirSync(artifacts);
    writeFileSync(join(artifacts, "keep.txt"), "keep until all validate", "utf8");
    symlinkSync("../outside", cdkOutput);
    assert.throws(
      () => removeLocalAwsArtifacts(fixtureRoot),
      /unexpected AWS artifact path/,
    );
    assert.equal(existsSync(join(artifacts, "keep.txt")), true);
    rmSync(cdkOutput);
    rmSync(artifacts, { recursive: true });

    mkdirSync(cdkOutput);
    writeFileSync(join(cdkOutput, "real.txt"), "safe", "utf8");
    symlinkSync("../outside", join(cdkOutput, "escape"));
    assert.throws(
      () => inspectLocalAwsArtifacts(fixtureRoot),
      /escapes its target directory/,
    );
    rmSync(cdkOutput, { recursive: true });

    mkdirSync(cdkOutput);
    writeFileSync(join(cdkOutput, "real.txt"), "safe", "utf8");
    symlinkSync("real.txt", join(cdkOutput, "internal"));
    assert.deepEqual(inspectLocalAwsArtifacts(fixtureRoot), [cdkOutput]);
    assert.deepEqual(removeLocalAwsArtifacts(fixtureRoot), [cdkOutput]);
    assert.equal(existsSync(cdkOutput), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function response(url: URL, body: BodyInit | null, init: ResponseInit): Response {
  const value = new Response(body, init);
  Object.defineProperty(value, "url", { value: url.href });
  return value;
}

test("ambiguous temporary-user write is found with retry and always removed", async () => {
  const baseUrl = new URL("https://candidate.vercel.app");
  const temporary = { id: "", email: "" };
  let lookupCount = 0;
  let removeCount = 0;
  const request = async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const authenticated = headers.has("cookie");
    if (url.pathname === "/api/health") {
      return response(
        url,
        JSON.stringify({
          status: "ok",
          database: { configured: true, driver: "postgresql", orm: "prisma" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (["/", "/login"].includes(url.pathname)) {
      return response(url, "<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/docs/privacy-policy") {
      return response(url, "<html>プライバシーポリシー</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/life/frequently-asked-questions") {
      return response(url, "<html>未来市のよくある質問</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/api/auth/get-session") {
      return response(
        url,
        authenticated
          ? JSON.stringify({ user: { email: "admin@example.test", role: "admin" } })
          : "null",
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname === "/api/admin/password-reset-requests") {
      return response(url, authenticated ? "[]" : "denied", {
        status: authenticated ? 200 : 401,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/admin/users") {
      return response(url, "<html>users</html>", {
        status: authenticated ? 200 : 401,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/api/auth/sign-in/email") {
      return response(url, "{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "better-auth.session_token=token; Path=/; HttpOnly",
        },
      });
    }
    if (url.pathname === "/api/auth/admin/list-users") {
      lookupCount += 1;
      const visible = temporary.id && lookupCount >= 3;
      return response(
        url,
        JSON.stringify({
          users: visible ? [{ id: temporary.id, email: temporary.email }] : [],
          total: visible ? 1 : 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname === "/api/admin/users" && method === "POST") {
      const body = JSON.parse(String(init.body)) as { email: string };
      temporary.id = "temporary-id";
      temporary.email = body.email;
      throw new Error("ambiguous network failure after server commit");
    }
    if (url.pathname === "/api/auth/admin/remove-user") {
      temporary.id = "";
      temporary.email = "";
      removeCount += 1;
      return response(url, "{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/api/auth/sign-out") {
      return response(url, "{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected smoke request: ${method} ${url.pathname}`);
  };

  await assert.rejects(
    runSmokeChecks(
      baseUrl,
      { email: "admin@example.test", password: "password" },
      request,
      { cleanupRetryDelayMs: 0 },
    ),
    /ambiguous network failure/,
  );
  assert.equal(temporary.id, "");
  assert.equal(removeCount, 1);
});

test("idle recovery observes idle, wakes once, then proves active", async () => {
  const states: string[] = [];
  let healthCalls = 0;
  await verifyIdleRecovery(
    new URL("https://candidate.vercel.app"),
    0,
    async (input) => {
      healthCalls += 1;
      return response(
        new URL(String(input)),
        JSON.stringify({
          status: "ok",
          database: { configured: true, driver: "postgresql", orm: "prisma" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
    async (state) => {
      states.push(state);
    },
  );
  assert.deepEqual(states, ["idle", "active"]);
  assert.equal(healthCalls, 1);
});
