import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { Client } from "pg";

import {
  captureAwsCleanupPlan,
  executeAwsCleanup,
  inspectLocalAwsArtifacts,
  removeLocalAwsArtifacts,
} from "../lib/aws-cleanup";
import type { LegacyRollbackAdminPlan } from "../lib/admin";
import {
  assertAdminAccessSessionLockHeld,
  type AdminAccessSessionLock,
  withAdminAccessSessionLock,
} from "../../../lib/server/admin-access/mutation-lock";
import { requireAffirmative, type Prompter } from "../lib/input";
import {
  classifyPrismaStatus,
  createMigrationPlan,
  findDestructiveStatements,
  normalizePrismaDiff,
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
  assertDeploymentOutputMatchesCandidate,
  assertNeonEndpointMatches,
  parseDeploymentOutput,
  parseVercelProjectApi,
  validateDatabaseUrls,
} from "../lib/validation";
import {
  assertAllowedProductionEnvironment,
  assertCandidateProductionEnvironmentReady,
  assertNoLinkedProductionSharedEnvironment,
  assertNoProductionSharedEnvironment,
  assertSameMigrationPlan,
  authenticateNeon,
  authenticateVercel,
  createBuildEnvironment,
  ensureCliTools,
  ensureVercelLink,
  inspectNeonProject,
  parseProductionEnvironmentAudit,
  AdminAccessFreezeRecoveryRequiredError,
  prepareLegacyRollbackForDeployment,
  recoverAdminAccessMutationFreezeForDeployment,
  recheckRollbackDeploymentIdentities,
  PromotionGuard,
  setVercelEnvironment,
  shouldCreateAuthSecret,
  validateCandidateDeploymentEvidence,
  waitForNeonEndpointState,
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
const tmuxAvailable =
  process.platform === "darwin" &&
  spawnSync("tmux", ["-V"], { encoding: "utf8" }).status === 0;

type HiddenPromptPty = {
  fixturePid: number;
  paste(value: string): void;
  sendKey(key: string): void;
  signal(signal: NodeJS.Signals): void;
};

async function runHiddenPromptPty(
  interact: (pty: HiddenPromptPty) => void | Promise<void>,
): Promise<{ pane: string; raw: string }> {
  const fixture = new URL("./hidden-prompt-fixture.ts", import.meta.url).pathname;
  const temporaryRoot = mkdtempSync(join(tmpdir(), "zoom-hidden-pty-"));
  const gatePath = join(temporaryRoot, "start");
  const rawLogPath = join(temporaryRoot, "raw.log");
  const socketName = `deploy-hidden-${process.pid}-${randomBytes(6).toString("hex")}`;
  const sessionName = "hidden-prompt";
  const paneTarget = `${sessionName}:0.0`;
  const runTmux = (arguments_: readonly string[], input?: string) =>
    spawnSync("tmux", ["-L", socketName, ...arguments_], {
      cwd: process.cwd(),
      encoding: "utf8",
      input,
    });
  const capturePane = (): string => {
    const result = runTmux([
      "capture-pane",
      "-p",
      "-S",
      "-",
      "-t",
      paneTarget,
    ]);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const waitForPane = async (marker: string): Promise<string> => {
    let transcript = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      transcript = capturePane();
      if (transcript.includes(marker)) {
        return transcript;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for PTY marker '${marker}'.`);
  };

  try {
    const started = runTmux([
      "new-session",
      "-d",
      "-s",
      sessionName,
      "-x",
      "120",
      "-y",
      "40",
      process.execPath,
      "--import",
      "tsx",
      fixture,
      gatePath,
    ]);
    assert.equal(started.status, 0, started.stderr);
    const retained = runTmux([
      "set-option",
      "-p",
      "-t",
      paneTarget,
      "remain-on-exit",
      "on",
    ]);
    assert.equal(retained.status, 0, retained.stderr);
    const quotedRawLog = `'${rawLogPath.replaceAll("'", `'\\''`)}'`;
    const piped = runTmux([
      "pipe-pane",
      "-O",
      "-t",
      paneTarget,
      `exec cat > ${quotedRawLog}`,
    ]);
    assert.equal(piped.status, 0, piped.stderr);
    writeFileSync(gatePath, "ready", "utf8");

    const promptTranscript = await waitForPane("SECRET_PROMPT>");
    const pidMatch = /FIXTURE_PID=(\d+)/.exec(promptTranscript);
    assert.ok(pidMatch?.[1], "PTY fixture PID is missing.");
    const fixturePid = Number(pidMatch[1]);
    await interact({
      fixturePid,
      paste(value) {
        const loaded = runTmux(
          ["load-buffer", "-b", "secret-input", "-"],
          `${value}\n`,
        );
        assert.equal(loaded.status, 0, loaded.stderr);
        const pasted = runTmux([
          "paste-buffer",
          "-d",
          "-b",
          "secret-input",
          "-t",
          paneTarget,
        ]);
        assert.equal(pasted.status, 0, pasted.stderr);
      },
      sendKey(key) {
        const sent = runTmux(["send-keys", "-t", paneTarget, key]);
        assert.equal(sent.status, 0, sent.stderr);
      },
      signal(signal) {
        process.kill(fixturePid, signal);
      },
    });

    const pane = await waitForPane("TTY_STATE_RESTORED=");
    let raw = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      raw = existsSync(rawLogPath) ? readFileSync(rawLogPath, "utf8") : "";
      if (raw.includes("TTY_STATE_RESTORED=")) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.match(raw, /TTY_STATE_RESTORED=/);
    return { pane, raw };
  } finally {
    runTmux(["kill-server"]);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

test(
  "hidden prompt never exposes pasted input in raw PTY output and restores exact mode",
  { skip: !tmuxAvailable, timeout: 10_000 },
  async () => {
    const secret = `synthetic-pty-secret-${randomBytes(24).toString("hex")}`;
    const expectedHash = createHash("sha256").update(secret).digest("hex");
    const transcripts = await runHiddenPromptPty((pty) => pty.paste(secret));

    for (const transcript of [transcripts.pane, transcripts.raw]) {
      assert.equal(transcript.includes(secret), false);
      assert.match(transcript, /FIXTURE_RESULT=success/);
      assert.match(transcript, new RegExp(`ANSWER_SHA256=${expectedHash}`));
      assert.match(transcript, /TTY_STATE_RESTORED=true/);
    }
  },
);

test(
  "hidden prompt restores exact PTY mode after Ctrl-D EOF",
  { skip: !tmuxAvailable, timeout: 10_000 },
  async () => {
    const transcripts = await runHiddenPromptPty((pty) => pty.sendKey("C-d"));
    for (const transcript of [transcripts.pane, transcripts.raw]) {
      assert.match(transcript, /FIXTURE_RESULT=error/);
      assert.match(transcript, /Secret input ended before a complete line/);
      assert.match(transcript, /TTY_STATE_RESTORED=true/);
    }
  },
);

for (const scenario of [
  { name: "SIGINT", act: (pty: HiddenPromptPty) => pty.sendKey("C-c") },
  { name: "SIGTERM", act: (pty: HiddenPromptPty) => pty.signal("SIGTERM") },
  { name: "SIGTSTP", act: (pty: HiddenPromptPty) => pty.sendKey("C-z") },
] as const) {
  test(
    `hidden prompt turns ${scenario.name} into a safe stop after exact PTY restore`,
    { skip: !tmuxAvailable, timeout: 10_000 },
    async () => {
      const transcripts = await runHiddenPromptPty(scenario.act);
      for (const transcript of [transcripts.pane, transcripts.raw]) {
        assert.match(transcript, /FIXTURE_RESULT=error/);
        assert.match(
          transcript,
          new RegExp(`Secret input was interrupted by ${scenario.name}`),
        );
        assert.match(transcript, /TTY_STATE_RESTORED=true/);
      }
    },
  );
}

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
    "postgresql://demo:p%40ss@ep-safe-pooler.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
  const direct =
    "postgresql://demo:p%40ss@ep-safe.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
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
            host: "ep-safe.c-2.ap-southeast-1.aws.neon.tech",
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

test("database URLs accept matching legacy hosts and reject proxy mismatches", () => {
  const legacyPooled =
    "postgresql://demo:secret@ep-safe-pooler.ap-southeast-1.aws.neon.tech/app?sslmode=require";
  const legacyDirect =
    "postgresql://demo:secret@ep-safe.ap-southeast-1.aws.neon.tech/app?sslmode=require";
  assert.equal(
    validateDatabaseUrls(legacyPooled, legacyDirect).endpointId,
    "ep-safe",
  );

  const currentPooled = legacyPooled.replace("-pooler.", "-pooler.c-2.");
  const currentDirect = legacyDirect.replace("ep-safe.", "ep-safe.c-2.");
  assert.equal(
    validateDatabaseUrls(currentPooled, currentDirect).endpointId,
    "ep-safe",
  );

  for (const [pooled, direct] of [
    [currentPooled, currentDirect.replace(".c-2.", ".c-3.")],
    [legacyPooled, currentDirect],
    [currentPooled, legacyDirect],
    [currentPooled, currentDirect.replace("ep-safe", "ep-other")],
    [currentPooled, currentDirect.replace("ap-southeast-1", "us-east-1")],
  ]) {
    assert.throws(
      () => validateDatabaseUrls(pooled, direct),
      /same Neon endpoint/,
    );
  }

  for (const proxy of ["c-0", "c-01", "c-x", "proxy", "c-2.extra"]) {
    assert.throws(
      () =>
        validateDatabaseUrls(
          legacyPooled.replace("-pooler.", `-pooler.${proxy}.`),
          legacyDirect.replace("ep-safe.", `ep-safe.${proxy}.`),
        ),
      /Neon pooled hostname/,
    );
  }

  assert.throws(
    () =>
      validateDatabaseUrls(
        currentPooled.replace("ap-southeast-1", "us-east-1"),
        currentDirect.replace("ap-southeast-1", "us-east-1"),
      ),
    /Singapore/,
  );

  assert.throws(
    () =>
      validateDatabaseUrls(
        currentPooled.replace(".aws.neon.tech/", ".aws.neon.tech./"),
        currentDirect.replace(".aws.neon.tech/", ".aws.neon.tech./"),
      ),
    /Neon pooled hostname/,
  );

});

test("Neon project inspection uses the project ID API without an organization list", () => {
  const projectId = "green-star-22081727";
  const runner = new RecordingRunner((command, arguments_, options) => {
    assert.equal(command, "neon");
    assert.deepEqual(arguments_, [
      "api",
      `/projects/${projectId}`,
      "--output",
      "json",
    ]);
    assert.equal(options?.env?.CI, "1");
    return success(
      JSON.stringify({
        project: {
          id: projectId,
          name: "zoom-gov-contact-center-demo",
          region_id: "aws-ap-southeast-1",
          org_id: "org-polished-bonus-27326276",
        },
      }),
    );
  });

  assert.deepEqual(
    inspectNeonProject(runner, projectId, "zoom-gov-contact-center-demo"),
    {
      id: projectId,
      name: "zoom-gov-contact-center-demo",
      regionId: "aws-ap-southeast-1",
      orgId: "org-polished-bonus-27326276",
    },
  );
  assert.equal(runner.calls.length, 1);
  assert.equal(
    runner.calls.some((call) => call.arguments_.includes("projects")),
    false,
  );
});

test("staged URL parser supports legacy URL and non-interactive JSON output", () => {
  assert.equal(
    parseDeploymentOutput("https://candidate.vercel.app\n").url.origin,
    "https://candidate.vercel.app",
  );
  assert.throws(
    () =>
      parseDeploymentOutput(
        "https://candidate.vercel.app\nhttps://other.vercel.app",
      ),
    /one URL/,
  );
  const wrapped = parseDeploymentOutput(
    JSON.stringify({
      status: "ok",
      deployment: {
        id: "dpl_candidate123",
        url: "https://candidate.vercel.app",
        readyState: "READY",
        target: "production",
      },
    }),
  );
  assert.equal(wrapped.url.origin, "https://candidate.vercel.app");
  assert.equal(wrapped.id, "dpl_candidate123");
  assert.equal(
    parseDeploymentOutput(
      JSON.stringify({
        id: "dpl_candidate123",
        url: "https://candidate.vercel.app",
        readyState: "READY",
        target: "production",
      }),
    ).id,
    "dpl_candidate123",
  );
  for (const [field, value] of [
    ["status", "error"],
    ["readyState", "BUILDING"],
    ["target", "preview"],
  ] as const) {
    const output = {
      status: "ok",
      deployment: {
        id: "dpl_candidate123",
        url: "https://candidate.vercel.app",
        readyState: "READY",
        target: "production",
      },
    };
    if (field === "status") {
      output.status = value;
    } else {
      output.deployment[field] = value;
    }
    assert.throws(
      () => parseDeploymentOutput(JSON.stringify(output)),
      /READY Production/,
    );
  }
  for (const output of [
    "[]",
    "{not-json}",
    JSON.stringify({
      url: "https://candidate.vercel.app",
      readyState: "READY",
      target: "production",
    }),
    JSON.stringify({
      id: "dpl_candidate123",
      readyState: "READY",
      target: "production",
    }),
    JSON.stringify({
      id: "invalid",
      url: "https://candidate.vercel.app",
      readyState: "READY",
      target: "production",
    }),
    JSON.stringify({
      id: "dpl_candidate123",
      url: "https://candidate.vercel.app/path",
      readyState: "READY",
      target: "production",
    }),
    JSON.stringify({
      id: "dpl_candidate123",
      url: "https://candidate.vercel.app",
      readyState: "READY",
      target: "production",
      error: "build failed",
    }),
    JSON.stringify({
      status: "ok",
      error: "build failed",
      deployment: {
        id: "dpl_candidate123",
        url: "https://candidate.vercel.app",
        readyState: "READY",
        target: "production",
      },
    }),
  ]) {
    assert.throws(() => parseDeploymentOutput(output));
  }

  const legacy = parseDeploymentOutput("https://candidate.vercel.app");
  assert.doesNotThrow(() =>
    assertDeploymentOutputMatchesCandidate(legacy, "dpl_candidate123"),
  );
  assert.throws(
    () =>
      assertDeploymentOutputMatchesCandidate(
        parseDeploymentOutput(
          JSON.stringify({
            id: "dpl_other",
            url: "https://candidate.vercel.app",
            readyState: "READY",
            target: "production",
          }),
        ),
        "dpl_candidate123",
      ),
    /does not match/,
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

test("Vercel project API requires an unprotected, Git-unlinked target", () => {
  const base = {
    id: link.projectId,
    accountId: link.orgId,
    name: "demo",
    autoExposeSystemEnvs: true,
    ssoProtection: null,
    protectionBypass: {},
  };
  const project = parseVercelProjectApi(JSON.stringify(base), link);
  assert.equal(project.gitLink, null);
  assert.equal(project.deploymentProtection, null);
  assert.equal(project.automationBypass, null);
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
        JSON.stringify({
          ...base,
          ssoProtection: { deploymentType: "all_except_custom_domains" },
        }),
        link,
      ),
    /Deployment Protection to None/,
  );
  for (const invalid of [
    { ...base, ssoProtection: undefined },
    { ...base, protectionBypass: undefined },
    { ...base, protectionBypass: null },
    { ...base, protectionBypass: [] },
  ]) {
    assert.throws(
      () => parseVercelProjectApi(JSON.stringify(invalid), link),
      /Deployment Protection to None|Protection Bypass for Automation/,
    );
  }
  assert.throws(
    () =>
      parseVercelProjectApi(
        JSON.stringify({
          ...base,
          protectionBypass: {
            syntheticSecret: { scope: "automation-bypass" },
          },
        }),
        link,
      ),
    /Protection Bypass for Automation/,
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
      {
        key: "APP_CANONICAL_ORIGIN",
        type: "encrypted",
        target: ["production"],
      },
      { key: "PREVIEW_ONLY", type: "encrypted", target: ["preview"] },
    ],
  };
  const validAudit = parseProductionEnvironmentAudit(JSON.stringify(valid));
  assert.equal(validAudit.names.size, 6);
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
  assert.throws(
    () =>
      assertAllowedProductionEnvironment(
        parseProductionEnvironmentAudit(
          JSON.stringify({
            envs: [
              {
                key: "APP_CANONICAL_ORIGIN",
                type: "sensitive",
                target: ["production"],
              },
            ],
          }),
        ),
      ),
    /APP_CANONICAL_ORIGIN must be an encrypted non-Sensitive value/,
  );
});

test("shared environment audit accepts only complete non-Production project results", () => {
  assert.doesNotThrow(() =>
    assertNoProductionSharedEnvironment(
      JSON.stringify({
        data: [],
        pagination: { count: 0, next: null, prev: null },
      }),
      link,
    ),
  );
  assert.doesNotThrow(() =>
    assertNoProductionSharedEnvironment(
      JSON.stringify({ data: [], pagination: { count: 0 } }),
      link,
    ),
  );
  assert.doesNotThrow(() =>
    assertNoProductionSharedEnvironment(
      JSON.stringify({
        data: [
          {
            ownerId: link.orgId,
            projectId: [link.projectId],
            target: ["preview", "development"],
          },
        ],
        pagination: { count: 1, next: null, prev: null },
      }),
      link,
    ),
  );

  for (const invalid of [
    "not json",
    JSON.stringify({ data: [] }),
    JSON.stringify({
      data: [{ target: ["preview"] }],
      pagination: { count: 0, next: null, prev: null },
    }),
    JSON.stringify({
      data: [{ target: ["preview"] }],
      pagination: { count: 1, next: 123, prev: null },
    }),
    JSON.stringify({
      data: [{ target: ["custom"] }],
      pagination: { count: 1, next: null, prev: null },
    }),
    JSON.stringify({
      data: [{ projectId: ["prj_other"], target: ["preview"] }],
      pagination: { count: 1, next: null, prev: null },
    }),
    JSON.stringify({
      data: [{ ownerId: "team_other", target: ["preview"] }],
      pagination: { count: 1, next: null, prev: null },
    }),
  ]) {
    assert.throws(
      () => assertNoProductionSharedEnvironment(invalid, link),
      /could not prove the Production environment is unlinked/,
    );
  }
});

test("shared environment audit fails closed without exposing keys or values", () => {
  const syntheticKey = "SYNTHETIC_SHARED_KEY";
  const syntheticValue = "synthetic-shared-secret-value";
  const productionOutput = JSON.stringify({
    data: [
      {
        key: syntheticKey,
        value: syntheticValue,
        ownerId: link.orgId,
        projectId: [link.projectId],
        target: ["production"],
      },
    ],
    pagination: { count: 1, next: null, prev: null },
  });
  assert.throws(
    () => assertNoProductionSharedEnvironment(productionOutput, link),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /has a linked Shared Environment Variable/);
      assert.equal(error.message.includes(syntheticKey), false);
      assert.equal(error.message.includes(syntheticValue), false);
      return true;
    },
  );

  const runner = new RecordingRunner(() => ({
    status: 403,
    stdout: syntheticValue,
    stderr: syntheticKey,
  }));
  assert.throws(
    () => assertNoLinkedProductionSharedEnvironment(runner, link),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /could not prove the Production environment is unlinked/,
      );
      assert.equal(error.message.includes(syntheticKey), false);
      assert.equal(error.message.includes(syntheticValue), false);
      return true;
    },
  );
  assert.deepEqual(runner.calls[0]?.arguments_, [
    "api",
    `/v1/env?projectId=${link.projectId}&teamId=${link.orgId}`,
    "--raw",
    "--scope",
    link.orgId,
  ]);
});

test("candidate environment preflight repeats exact project and shared audits", () => {
  const runner = new RecordingRunner((_command, arguments_) => {
    const endpoint = arguments_[1];
    if (endpoint?.startsWith(`/v10/projects/${link.projectId}/env?`)) {
      return success(
        JSON.stringify({
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
            {
              key: "APP_CANONICAL_ORIGIN",
              type: "encrypted",
              target: ["production"],
            },
          ],
        }),
      );
    }
    if (endpoint?.startsWith("/v1/env?projectId=")) {
      return success(
        JSON.stringify({ data: [], pagination: { count: 0 } }),
      );
    }
    throw new Error("Unexpected candidate environment audit command.");
  });

  assert.doesNotThrow(() =>
    assertCandidateProductionEnvironmentReady(runner, link),
  );
  assert.equal(runner.calls.length, 2);
  assert.match(
    runner.calls[0]?.arguments_[1] ?? "",
    /\/v10\/projects\/prj_abc123\/env\?decrypt=false&teamId=team_abc123/,
  );
  assert.equal(
    runner.calls[1]?.arguments_[1],
    "/v1/env?projectId=prj_abc123&teamId=team_abc123",
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
        ["deploy --help", "--prod --skip-domain --yes --json --meta --project"],
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
  assert.equal(environment.BETTER_AUTH_URL, "https://example.test");
  assert.equal(environment.APP_CANONICAL_ORIGIN, "https://example.test");
  assert.throws(
    () =>
      createBuildEnvironment(
        { NODE_ENV: "production" },
        "postgresql://pooled.invalid/runtime",
        "auth-secret",
        "http://example.test",
      ),
    /HTTPS origin/,
  );
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
    totalMigrationCount: 8,
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

  const synchronizedRunner = new RecordingRunner((_command, arguments_) =>
    arguments_.includes("status")
      ? success("Database schema is up to date")
      : success("-- This is an empty migration."),
  );
  const synchronized = await createMigrationPlan({
    projectRoot: process.cwd(),
    directUrl: "postgresql://redacted.invalid/database",
    runner: synchronizedRunner,
    inspect: async () => database,
  });
  assert.equal(synchronized.state, "up-to-date");
  assert.equal(synchronized.predictedDiff, "");
});

test("Prisma empty migration sentinel is not reported as schema drift", () => {
  assert.equal(normalizePrismaDiff("\n-- This is an empty migration.\n"), "");
  assert.equal(normalizePrismaDiff("  \n"), "");
  assert.equal(
    normalizePrismaDiff(
      '-- This is an empty migration.\nALTER TABLE "user" ADD COLUMN "x" TEXT;',
    ),
    '-- This is an empty migration.\nALTER TABLE "user" ADD COLUMN "x" TEXT;',
  );
});

test("reviewed CAS cleanup remains safe when followed by the additive freeze migration", async () => {
  const local = readLocalMigrations(
    new URL("../../../prisma/migrations/", import.meta.url).pathname,
  );
  const applied = local.slice(0, -2).map((migration) => ({
    name: migration.name,
    checksum: migration.hash,
    finished: true,
    rolledBack: false,
    logs: null,
  }));
  const runner = new RecordingRunner((_command, arguments_) =>
    arguments_.includes("status")
      ? success("The following migrations have not yet been applied")
      : {
          ...success('CREATE TABLE "admin_access_mutation_state" ("id" TEXT);'),
          status: 2,
        },
  );

  const plan = await createMigrationPlan({
    projectRoot: process.cwd(),
    directUrl: "postgresql://redacted.invalid/database",
    runner,
    inspect: async () => ({
      migrationsTableExists: true,
      migrations: applied,
      userTables: ["admin_access_role_assignments", "admin_access_roles", "user"],
      userObjects: [
        "function:bump_admin_access_role_revision",
        "table:admin_access_role_assignments",
        "table:admin_access_roles",
        "trigger:admin_access_role_assignment_revision",
        "table:user",
      ],
      tablesWithData: ["admin_access_role_assignments", "admin_access_roles", "user"],
    }),
  });
  assert.equal(plan.state, "pending");
  assert.equal(plan.freshDatabase, false);
  assert.match(plan.predictedDiff, /admin_access_mutation_state/);
  assert.deepEqual(
    plan.pending.map(({ name }) => name),
    [
      "20260828120000_separate_admin_access_cas_revisions",
      "20260828180000_add_admin_access_mutation_freeze",
    ],
  );
  assert.equal(plan.pending[0]?.destructiveStatements.length, 2);
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

test("legacy rollback preparation requires its own reviewed exact approval", async () => {
  const plan: LegacyRollbackAdminPlan = {
    admins: [
      {
        id: "recovery-admin",
        email: "recovery@example.test",
        name: "Recovery",
        banned: false,
        mustChangePassword: false,
        hasCredential: true,
        adminAccessRoleRevision: 1,
        accessRoleIds: ["system-full-access"],
        hasFullAccess: true,
        customDenyPermissions: [],
      },
      {
        id: "limited-admin",
        email: "limited@example.test",
        name: "Limited",
        banned: false,
        mustChangePassword: false,
        hasCredential: true,
        adminAccessRoleRevision: 4,
        accessRoleIds: ["custom-limited"],
        hasFullAccess: false,
        customDenyPermissions: [],
      },
      {
        id: "denied-full-admin",
        email: "denied-full@example.test",
        name: "Denied Full",
        banned: false,
        mustChangePassword: false,
        hasCredential: true,
        adminAccessRoleRevision: 2,
        accessRoleIds: ["custom-deny", "system-full-access"],
        hasFullAccess: true,
        customDenyPermissions: [
          {
            roleId: "custom-deny",
            resourceKey: "phone-settings",
            action: "UPDATE",
          },
        ],
      },
    ],
  };
  let preparationCalls = 0;
  let inspectCalls = 0;
  let operationCalls = 0;
  const writes: string[] = [];
  const safePlan: LegacyRollbackAdminPlan = { admins: [plan.admins[0]!] };
  const dependencies = {
    inspect: async (pooledUrl: string) => {
      assert.equal(pooledUrl, "postgresql://pooled.invalid/runtime");
      inspectCalls += 1;
      return inspectCalls === 1 ? plan : safePlan;
    },
    prepare: async (
      pooledUrl: string,
      expected: typeof plan,
      lock: AdminAccessSessionLock,
      freezeId: string,
    ) => {
      assert.equal(pooledUrl, "postgresql://pooled.invalid/runtime");
      assert.equal(expected, plan);
      assert.ok(lock);
      assert.equal(freezeId, "freeze-reviewed");
      preparationCalls += 1;
      return { demotedCount: 1, revokedSessionCount: 2 };
    },
    withLock: async <T>(
      directUrl: string,
      operation: (lock: AdminAccessSessionLock) => Promise<T>,
    ) => {
      assert.equal(directUrl, "postgresql://direct.invalid/runtime");
      return operation({} as AdminAccessSessionLock);
    },
    assertLock: async () => undefined,
    freeze: async () => "freeze-reviewed",
    inspectFreeze: async () => ({
      frozen: false,
      freezeId: null,
      frozenAt: null,
      reason: null,
    }),
    unfreeze: async (
      pooledUrl: string,
      lock: AdminAccessSessionLock,
      freezeId: string,
    ) => {
      assert.equal(pooledUrl, "postgresql://pooled.invalid/runtime");
      assert.ok(lock);
      assert.equal(freezeId, "freeze-reviewed");
    },
    write: (message: string) => writes.push(message),
  };

  await assert.rejects(
    prepareLegacyRollbackForDeployment(
      "postgresql://pooled.invalid/runtime",
      "postgresql://direct.invalid/runtime",
      "dpl_previous",
      { ask: async () => "no", hidden: async () => "" },
      async () => {
        operationCalls += 1;
      },
      dependencies,
    ),
    /preparation was refused/,
  );
  assert.equal(preparationCalls, 0);
  assert.equal(operationCalls, 0);
  assert.equal(writes.length, 1);
  assert.match(writes[0]!, /limited@example\.test/);
  assert.match(writes[0]!, /denied-full@example\.test/);
  assert.match(
    writes[0]!,
    /custom-deny:phone-settings:UPDATE/,
  );

  writes.length = 0;
  inspectCalls = 0;
  assert.deepEqual(
    await prepareLegacyRollbackForDeployment(
      "postgresql://pooled.invalid/runtime",
      "postgresql://direct.invalid/runtime",
      "dpl_previous",
      {
        ask: async () => "prepare legacy rollback dpl_previous",
        hidden: async () => "",
      },
      async () => {
        operationCalls += 1;
        return "rollback-complete" as const;
      },
      dependencies,
    ),
    "rollback-complete",
  );
  assert.equal(preparationCalls, 1);
  assert.equal(operationCalls, 1);
  assert.equal(writes.length, 3);
  assert.match(writes[1]!, /demoted=1, sessions revoked=2/);
  assert.match(writes[2]!, /post-switch audit passed/);
});

test("ambiguous freeze commit is classified with the persisted fencing id", async () => {
  const plan: LegacyRollbackAdminPlan = { admins: [] };
  let operationCalled = false;
  await assert.rejects(
    prepareLegacyRollbackForDeployment(
      "postgresql://pooled.invalid/runtime",
      "postgresql://direct.invalid/runtime",
      "dpl_previous",
      {
        ask: async () => "prepare legacy rollback dpl_previous",
        hidden: async () => "",
      },
      async () => {
        operationCalled = true;
      },
      {
        inspect: async () => plan,
        prepare: async () => ({ demotedCount: 0, revokedSessionCount: 0 }),
        freeze: async () => {
          throw new Error("response lost after commit");
        },
        inspectFreeze: async () => ({
          frozen: true,
          freezeId: "freeze-committed",
          frozenAt: new Date("2026-08-28T00:00:00Z"),
          reason: "rollback",
        }),
        unfreeze: async () => undefined,
        withLock: async <T>(
          _directUrl: string,
          operation: (lock: AdminAccessSessionLock) => Promise<T>,
        ) => operation({} as AdminAccessSessionLock),
        assertLock: async () => undefined,
        write: () => undefined,
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof AdminAccessFreezeRecoveryRequiredError);
      assert.equal(error.freezeId, "freeze-committed");
      assert.match(String(error.cause), /response lost after commit/);
      return true;
    },
  );
  assert.equal(operationCalled, false);
});

test("rollback deployment identities are rechecked immediately before execution", () => {
  const calls: string[] = [];
  const runner = new RecordingRunner((_command, arguments_) => {
    const endpoint = arguments_[1] ?? "";
    calls.push(endpoint);
    if (endpoint.includes("canonical.example.test")) {
      return success(JSON.stringify({
        id: "dpl_changed",
        url: "changed.example.test",
        projectId: link.projectId,
        readyState: "READY",
        target: "production",
      }));
    }
    throw new Error("rollback target must not be read after canonical drift");
  });

  assert.throws(
    () => recheckRollbackDeploymentIdentities(
      runner,
      link,
      new URL("https://canonical.example.test"),
      "dpl_candidate",
      "dpl_previous",
    ),
    /Canonical Production changed after rollback preparation/,
  );
  assert.equal(calls.length, 1);
  assert.equal(
    runner.calls.some(({ arguments_ }) => arguments_.includes("rollback")),
    false,
  );
});

test("rollback target drift is rejected after the canonical recheck", () => {
  const runner = new RecordingRunner((_command, arguments_) => {
    const endpoint = arguments_[1] ?? "";
    return success(JSON.stringify(endpoint.includes("canonical.example.test")
      ? {
          id: "dpl_candidate",
          url: "candidate.example.test",
          projectId: link.projectId,
          readyState: "READY",
          target: "production",
        }
      : {
          id: "dpl_changed_previous",
          url: "previous.example.test",
          projectId: link.projectId,
          readyState: "READY",
          target: "production",
        }));
  });

  assert.throws(
    () => recheckRollbackDeploymentIdentities(
      runner,
      link,
      new URL("https://canonical.example.test"),
      "dpl_candidate",
      "dpl_previous",
    ),
    /did not prove the exact READY Production deployment/,
  );
  assert.equal(runner.calls.length, 2);
  assert.equal(
    runner.calls.some(({ arguments_ }) => arguments_.includes("rollback")),
    false,
  );
});

test("session lock client errors are covered before connect and through cleanup", async () => {
  let cleanupTokenCheck: Promise<void> | undefined;
  let protectedLock: AdminAccessSessionLock | undefined;
  class FakeClient extends EventEmitter {
    queryCalls = 0;
    async connect() {}
    async query() {
      this.queryCalls += 1;
      if (this.queryCalls === 3) return { rows: [{ held: true }] };
      if (this.queryCalls === 4) {
        cleanupTokenCheck = assertAdminAccessSessionLockHeld(protectedLock!);
        this.emit("error", new Error("first cleanup loss"));
        this.emit("error", new Error("second cleanup loss"));
        return { rows: [{ unlocked: true }] };
      }
      return { rows: [] };
    }
    async end() {
      this.emit("error", new Error("end loss"));
    }
  }
  const client = new FakeClient();

  await assert.rejects(
    withAdminAccessSessionLock(
      "postgresql://direct.invalid/runtime",
      async (lock) => {
        protectedLock = lock;
        return "completed";
      },
      client as unknown as Client,
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /session lock connection was lost/);
      assert.equal((error.cause as Error).message, "first cleanup loss");
      return true;
    },
  );
  await assert.rejects(cleanupTokenCheck!, /session lock is no longer active/);
  assert.equal(client.listenerCount("error"), 0);

  class ConnectFailureClient extends FakeClient {
    override async connect() {
      this.emit("error", new Error("pre-connect event"));
      throw new Error("connect rejected");
    }
  }
  const connectFailure = new ConnectFailureClient();
  await assert.rejects(
    withAdminAccessSessionLock(
      "postgresql://direct.invalid/runtime",
      async () => undefined,
      connectFailure as unknown as Client,
    ),
    /connect rejected/,
  );
  assert.equal(connectFailure.listenerCount("error"), 0);
});

test("admin access freeze recovery rechecks canonical identity and freeze fencing", async () => {
  let canonicalReads = 0;
  let freezeReads = 0;
  let unfrozen = false;
  const dependencies = {
    inspectFreeze: async () => {
      freezeReads += 1;
      return {
        frozen: true,
        freezeId: "freeze-123",
        frozenAt: new Date("2026-08-28T00:00:00Z"),
        reason: "rollback",
      };
    },
    withLock: async <T>(
      directUrl: string,
      operation: (lock: AdminAccessSessionLock) => Promise<T>,
    ) => {
      assert.equal(directUrl, "postgresql://direct.invalid/runtime");
      return operation({} as AdminAccessSessionLock);
    },
    unfreeze: async (
      pooledUrl: string,
      lock: AdminAccessSessionLock,
      freezeId: string,
    ) => {
      assert.equal(pooledUrl, "postgresql://pooled.invalid/runtime");
      assert.ok(lock);
      assert.equal(freezeId, "freeze-123");
      unfrozen = true;
    },
    write: () => undefined,
  };

  assert.equal(
    await recoverAdminAccessMutationFreezeForDeployment(
      "postgresql://pooled.invalid/runtime",
      "postgresql://direct.invalid/runtime",
      () => {
        canonicalReads += 1;
        return "dpl_canonical";
      },
      {
        ask: async () =>
          "recover admin access freeze freeze-123 dpl_canonical",
        hidden: async () => "",
      },
      dependencies,
    ),
    true,
  );
  assert.equal(canonicalReads, 2);
  assert.equal(freezeReads, 2);
  assert.equal(unfrozen, true);
});

test("admin access freeze recovery refuses a changed canonical identity", async () => {
  let canonicalReads = 0;
  let unfrozen = false;
  const dependencies = {
    inspectFreeze: async () => ({
      frozen: true,
      freezeId: "freeze-changed-canonical",
      frozenAt: new Date("2026-08-28T00:00:00Z"),
      reason: "rollback",
    }),
    withLock: async <T>(
      _directUrl: string,
      operation: (lock: AdminAccessSessionLock) => Promise<T>,
    ) => operation({} as AdminAccessSessionLock),
    unfreeze: async () => {
      unfrozen = true;
    },
    write: () => undefined,
  };

  await assert.rejects(
    recoverAdminAccessMutationFreezeForDeployment(
      "postgresql://pooled.invalid/runtime",
      "postgresql://direct.invalid/runtime",
      () => (++canonicalReads === 1 ? "dpl_before" : "dpl_after"),
      {
        ask: async () =>
          "recover admin access freeze freeze-changed-canonical dpl_before",
        hidden: async () => "",
      },
      dependencies,
    ),
    /Canonical Production identity changed/,
  );
  assert.equal(canonicalReads, 2);
  assert.equal(unfrozen, false);
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
  const headers = new Headers(init.headers);
  headers.set("x-robots-tag", "noindex, nofollow");
  const value = new Response(body, { ...init, headers });
  Object.defineProperty(value, "url", { value: url.href });
  return value;
}

const ROBOTS_META = '<meta name="robots" content="noindex, nofollow">';

function deploymentSitemapXml(origin: URL): string {
  const representativePaths = [
    "/",
    "/life",
    "/life/trash-recycling",
    "/life/trash-recycling/sorting-and-collection",
    "/news/assembly-session-june-2026",
    "/life/frequently-asked-questions/administrative-service-center/location-and-access",
    "/docs/privacy-policy",
  ];
  const paths = [
    ...representativePaths,
    ...Array.from(
      { length: 275 - representativePaths.length },
      (_, index) => `/life/deployment-smoke-${index}`,
    ),
  ];
  const urls = paths
    .map((path) => `<url><loc>${new URL(path, origin).href}</loc></url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function createDeploymentSmokeHarness(
  ambiguousCreation: boolean,
  legacyAdminAccess = false,
) {
  const baseUrl = new URL("https://candidate.vercel.app");
  const temporary = { id: "", email: "" };
  let lookupCount = 0;
  let removeCount = 0;
  let legacyEndpointCount = 0;
  let createdWithAccessRoleIds = false;
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
      return response(url, `<html>${ROBOTS_META}ok</html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/robots.txt") {
      return response(
        url,
        `User-agent: *\nAllow: /\nSitemap: ${baseUrl.origin}/sitemap.xml\n`,
        {
          status: 200,
          headers: { "content-type": "text/plain" },
        },
      );
    }
    if (url.pathname === "/sitemap.xml") {
      return response(url, deploymentSitemapXml(baseUrl), {
        status: 200,
        headers: { "content-type": "application/xml" },
      });
    }
    if (url.pathname === "/news/news-default-item.png") {
      return response(url, "png", {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    if (url.pathname === "/docs/privacy-policy.md") {
      return response(url, "# プライバシーポリシー", {
        status: 200,
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }
    if (url.pathname === "/docs/privacy-policy") {
      return response(url, `<html>${ROBOTS_META}プライバシーポリシー</html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/life/frequently-asked-questions") {
      return response(url, `<html>${ROBOTS_META}未来市のよくある質問</html>`, {
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
      return response(url, `<html>${ROBOTS_META}users</html>`, {
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
    if (url.pathname === "/api/auth/admin/list-users" && method === "GET") {
      legacyEndpointCount += 1;
      if (!legacyAdminAccess) {
        return response(url, "not found", { status: 404 });
      }
      lookupCount += 1;
      const visible = Boolean(temporary.id);
      return response(
        url,
        JSON.stringify({
          users: visible
            ? [{ id: temporary.id, email: temporary.email }]
            : [],
          total: visible ? 1 : 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname === "/api/auth/admin/remove-user" && method === "POST") {
      legacyEndpointCount += 1;
      if (!legacyAdminAccess) {
        return response(url, "not found", { status: 404 });
      }
      temporary.id = "";
      temporary.email = "";
      removeCount += 1;
      return response(url, "{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/api/admin/users" && method === "GET") {
      lookupCount += 1;
      const visible =
        temporary.id && lookupCount >= (ambiguousCreation ? 3 : 2);
      return response(
        url,
        JSON.stringify({
          users: visible
            ? [
                {
                  id: temporary.id,
                  email: temporary.email,
                  assignedRoleIds: ["system-no-access"],
                },
              ]
            : [],
          total: visible ? 1 : 0,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname === "/api/admin/users" && method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        email: string;
        accessRoleIds?: unknown;
      };
      createdWithAccessRoleIds = "accessRoleIds" in body;
      temporary.id = "temporary-id";
      temporary.email = body.email;
      if (ambiguousCreation) {
        throw new Error("ambiguous network failure after server commit");
      }
      return response(
        url,
        JSON.stringify({
          user: { id: temporary.id, email: temporary.email },
          temporaryPassword: "generated-temporary-password",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }
    if (
      !legacyAdminAccess &&
      url.pathname === "/api/admin/users/temporary-id" &&
      method === "DELETE"
    ) {
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

  return {
    baseUrl,
    request,
    temporary,
    get removeCount() {
      return removeCount;
    },
    get legacyEndpointCount() {
      return legacyEndpointCount;
    },
    get createdWithAccessRoleIds() {
      return createdWithAccessRoleIds;
    },
  };
}

test("temporary user receives NO_ACCESS and removed admin auth endpoints stay 404", async () => {
  const harness = createDeploymentSmokeHarness(false);
  await runSmokeChecks(
    harness.baseUrl,
    { email: "admin@example.test", password: "password" },
    harness.request,
    { cleanupRetryDelayMs: 0 },
  );
  assert.equal(harness.temporary.id, "");
  assert.equal(harness.removeCount, 1);
  assert.equal(harness.legacyEndpointCount, 2);
  assert.equal(harness.createdWithAccessRoleIds, true);
});

test("ambiguous temporary-user write is found with retry and always removed", async () => {
  const harness = createDeploymentSmokeHarness(true);

  await assert.rejects(
    runSmokeChecks(
      harness.baseUrl,
      { email: "admin@example.test", password: "password" },
      harness.request,
      { cleanupRetryDelayMs: 0 },
    ),
    /ambiguous network failure/,
  );
  assert.equal(harness.temporary.id, "");
  assert.equal(harness.removeCount, 1);
  assert.equal(harness.legacyEndpointCount, 2);
  assert.equal(harness.createdWithAccessRoleIds, true);
});

test("legacy-compatible rollback smoke uses the prior admin endpoints", async () => {
  const harness = createDeploymentSmokeHarness(false, true);
  await runSmokeChecks(
    harness.baseUrl,
    { email: "admin@example.test", password: "password" },
    harness.request,
    {
      adminAccessExpectation: "legacy-compatible",
      cleanupRetryDelayMs: 0,
    },
  );
  assert.equal(harness.temporary.id, "");
  assert.equal(harness.removeCount, 1);
  assert.equal(harness.legacyEndpointCount, 3);
  assert.equal(harness.createdWithAccessRoleIds, false);
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

test("Neon state polling allows management API grace beyond the first minute", async () => {
  const target = validateDatabaseUrls(
    "postgresql://demo:secret@ep-safe-pooler.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require",
    "postgresql://demo:secret@ep-safe.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require",
  );
  let calls = 0;
  const waits: number[] = [];
  const runner = new RecordingRunner(() => {
    calls += 1;
    return success(
      JSON.stringify({
        endpoints: [
          {
            id: "ep-safe",
            project_id: "project-safe",
            branch_id: "br-safe",
            host: "ep-safe.c-2.ap-southeast-1.aws.neon.tech",
            region_id: "aws-ap-southeast-1",
            type: "read_write",
            current_state: calls < 7 ? "active" : "idle",
          },
        ],
      }),
    );
  });

  await waitForNeonEndpointState(
    runner,
    "project-safe",
    target,
    "idle",
    {
      wait: async (delayMs) => {
        waits.push(delayMs);
      },
    },
  );

  assert.equal(calls, 7);
  assert.deepEqual(waits, Array(6).fill(10_000));
});

test("Neon state polling remains bounded and fail-closed", async () => {
  const target = validateDatabaseUrls(
    "postgresql://demo:secret@ep-safe-pooler.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require",
    "postgresql://demo:secret@ep-safe.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require",
  );
  const runner = new RecordingRunner(() =>
    success(
      JSON.stringify({
        endpoints: [
          {
            id: "ep-safe",
            project_id: "project-safe",
            branch_id: "br-safe",
            host: "ep-safe.c-2.ap-southeast-1.aws.neon.tech",
            region_id: "aws-ap-southeast-1",
            type: "read_write",
            current_state: "active",
          },
        ],
      }),
    ),
  );

  await assert.rejects(
    waitForNeonEndpointState(runner, "project-safe", target, "idle", {
      attempts: 2,
      intervalMs: 0,
      wait: async () => undefined,
    }),
    /did not reach 'idle'.*last state: 'active'/,
  );
  assert.equal(runner.calls.length, 2);
});
