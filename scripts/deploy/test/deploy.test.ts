import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
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

import {
  captureAwsCleanupPlan,
  executeAwsCleanup,
  inspectLocalAwsArtifacts,
  removeLocalAwsArtifacts,
} from "../lib/aws-cleanup";
import {
  classifyPrismaStatus,
  createMigrationPlan,
  findDestructiveStatements,
  normalizePrismaDiff,
  readLocalMigrations,
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
  parseVercelProjectApi,
  validateDatabaseUrls,
} from "../lib/validation";
import {
  assertAllowedProductionEnvironment,
  assertExistingProductionAuthSecret,
  assertNoLinkedProductionSharedEnvironment,
  assertNoProductionSharedEnvironment,
  assertProductionEnvironmentReady,
  assertSameMigrationPlan,
  createBuildEnvironment,
  parseProductionEnvironmentAudit,
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

test("DBTLS-02: require入力をverify-fullへ正規化しverify-full入力は冪等である", () => {
  const pooled =
    "postgresql://demo:p%40ss@ep-safe-pooler.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
  const direct =
    "postgresql://demo:p%40ss@ep-safe.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
  const target = validateDatabaseUrls(pooled, direct);
  assert.equal(target.endpointId, "ep-safe");
  for (const [actual, expectedHost] of [
    [target.pooledUrl, "ep-safe-pooler.c-2.ap-southeast-1.aws.neon.tech"],
    [target.directUrl, "ep-safe.c-2.ap-southeast-1.aws.neon.tech"],
  ] as const) {
    const url = new URL(actual);
    assert.deepEqual(url.searchParams.getAll("sslmode"), ["verify-full"]);
    assert.equal(url.searchParams.get("channel_binding"), "require");
    assert.equal(url.hostname, expectedHost);
    assert.equal(url.pathname, "/app");
    assert.equal(url.username, "demo");
    assert.equal(url.password, "p%40ss");
  }
  assert.deepEqual(
    validateDatabaseUrls(target.pooledUrl, target.directUrl),
    target,
  );
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
});

test("DBTLS-04: 弱いTLS modeとoverrideを拒否する", () => {
  const pooled =
    "postgresql://demo:p%40ss@ep-safe-pooler.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
  const direct =
    "postgresql://demo:p%40ss@ep-safe.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";

  for (const mode of [
    "disable",
    "prefer",
    "verify-ca",
    "no-verify",
    "unknown",
  ]) {
    assert.throws(
      () => validateDatabaseUrls(pooled.replace("sslmode=require", `sslmode=${mode}`), direct),
      /sslmode=require or sslmode=verify-full/,
    );
  }
  for (const invalidPooled of [
    pooled.replace("sslmode=require&", ""),
    `${pooled}&sslmode=verify-full`,
    pooled.replace("sslmode=require", "SSLMODE=require"),
  ]) {
    assert.throws(
      () => validateDatabaseUrls(invalidPooled, direct),
      /sslmode exactly once/,
    );
  }
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
});

test("database URL target validation rejects endpoint mismatches", () => {
  const pooled =
    "postgresql://demo:p%40ss@ep-safe-pooler.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
  const direct =
    "postgresql://demo:p%40ss@ep-safe.c-2.ap-southeast-1.aws.neon.tech/app?sslmode=require&channel_binding=require";
  const target = validateDatabaseUrls(pooled, direct);
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
  assert.doesNotThrow(() => assertExistingProductionAuthSecret(validAudit));
  const withoutSecret = parseProductionEnvironmentAudit(
    JSON.stringify({
      envs: valid.envs.filter((entry) => entry.key !== "BETTER_AUTH_SECRET"),
    }),
  );
  assert.throws(
    () => assertExistingProductionAuthSecret(withoutSecret),
    /must already contain one Sensitive BETTER_AUTH_SECRET/,
  );
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

test("Production environment preflight repeats exact project and shared audits", () => {
  const runner = new RecordingRunner((_command, arguments_) => {
    const endpoint = arguments_[1];
    if (endpoint?.startsWith(`/v10/projects/${link.projectId}/env?`)) {
      return success(
        JSON.stringify({
          envs: [
            { key: "DEVELOPER_API_SETTINGS_ENCRYPTION_KEY", type: "sensitive", target: ["production"] },
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
          pagination: { count: 7, next: null, prev: null },
        }),
      );
    }
    if (endpoint?.startsWith("/v1/env?projectId=")) {
      return success(
        JSON.stringify({ data: [], pagination: { count: 0 } }),
      );
    }
    throw new Error("Unexpected Production environment audit command.");
  });

  assert.doesNotThrow(() => assertProductionEnvironmentReady(runner, link));
  assert.equal(runner.calls.length, 2);
  assert.match(
    runner.calls[0]?.arguments_[1] ?? "",
    /\/v10\/projects\/prj_abc123\/env\?decrypt=false&limit=100&teamId=team_abc123/,
  );
  assert.equal(
    runner.calls[1]?.arguments_[1],
    "/v1/env?projectId=prj_abc123&teamId=team_abc123",
  );
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

test("production build env replaces every real database URL with a fixed synthetic URL", () => {
  const environment = createBuildEnvironment(
    {
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://ambient.invalid/runtime",
      DATABASE_URL_UNPOOLED: "postgresql://ambient.invalid/direct",
    },
    "auth-secret",
    "https://example.test",
  );
  assert.equal(
    environment.DATABASE_URL,
    "postgresql://deploy_build:deploy_build@127.0.0.1:5432/deploy_build?sslmode=disable",
  );
  assert.equal(environment.DATABASE_URL?.includes("ambient.invalid"), false);
  assert.equal(environment.DATABASE_URL_UNPOOLED, undefined);
  assert.equal(environment.BETTER_AUTH_URL, "https://example.test");
  assert.equal(environment.APP_CANONICAL_ORIGIN, "https://example.test");
  assert.throws(
    () =>
      createBuildEnvironment(
        { NODE_ENV: "production" },
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
    totalMigrationCount: 9,
  };
}

test("migration TOCTOU changes block execution", () => {
  assert.doesNotThrow(() =>
    assertSameMigrationPlan(migrationPlan("same"), migrationPlan("same")),
  );
  assert.throws(
    () => assertSameMigrationPlan(migrationPlan("before"), migrationPlan("after")),
    /changed after validation/,
  );
});

test("rolled-back migration attempts can be retried only in verified order", () => {
  const local = readLocalMigrations(
    new URL("../../../prisma/migrations/", import.meta.url).pathname,
  );
  const appliedPrefix = local.slice(0, -1).map((migration) => ({
    name: migration.name,
    checksum: migration.hash,
    finished: true,
    rolledBack: false,
    logs: null,
  }));
  const retryMigration = local.at(-1);
  assert.ok(retryMigration);
  const rolledBackAttempt = {
    name: retryMigration.name,
    checksum: retryMigration.hash,
    finished: false,
    rolledBack: true,
    logs: "simulated resolved failure",
  };
  const successfulRetry = {
    ...rolledBackAttempt,
    finished: true,
    rolledBack: false,
    logs: null,
  };
  const database = {
    migrationsTableExists: true,
    migrations: appliedPrefix,
    userTables: ["User"],
    userObjects: ["table:User"],
    tablesWithData: [],
    adminAccessRoleCardinalityViolations: 0,
  };

  for (const migrations of [
    [...appliedPrefix, rolledBackAttempt],
    [...appliedPrefix, rolledBackAttempt, rolledBackAttempt],
    [
      ...appliedPrefix,
      rolledBackAttempt,
      rolledBackAttempt,
      successfulRetry,
    ],
  ]) {
    assert.doesNotThrow(() =>
      validateMigrationHistory(local, { ...database, migrations }),
    );
  }

  assert.throws(
    () =>
      validateMigrationHistory(local, {
        ...database,
        migrations: [
          ...appliedPrefix,
          { ...rolledBackAttempt, name: "unexpected_migration" },
        ],
      }),
    /diverged/,
  );
  assert.throws(
    () =>
      validateMigrationHistory(local, {
        ...database,
        migrations: [...appliedPrefix.slice(0, -1), rolledBackAttempt],
      }),
    /diverged/,
  );
  assert.throws(
    () =>
      validateMigrationHistory(local, {
        ...database,
        migrations: [
          ...appliedPrefix,
          { ...rolledBackAttempt, checksum: "0".repeat(64) },
        ],
      }),
    /checksum mismatch/i,
  );
});

test("resolved migration attempts participate in the migration plan hash", async () => {
  const local = readLocalMigrations(
    new URL("../../../prisma/migrations/", import.meta.url).pathname,
  );
  const retryMigration = local.at(-1);
  assert.ok(retryMigration);
  const appliedPrefix = local.slice(0, -1).map((migration) => ({
    name: migration.name,
    checksum: migration.hash,
    finished: true,
    rolledBack: false,
    logs: null,
  }));
  const rolledBackAttempt = {
    name: retryMigration.name,
    checksum: retryMigration.hash,
    finished: false,
    rolledBack: true,
    logs: "simulated resolved failure",
  };
  const successfulRetry = {
    ...rolledBackAttempt,
    finished: true,
    rolledBack: false,
    logs: null,
  };
  const runner = new RecordingRunner((_command, arguments_) =>
    arguments_.includes("status")
      ? success("Database schema is up to date")
      : success("-- This is an empty migration."),
  );
  const inspect = (attempts: typeof rolledBackAttempt[]) => async () => ({
    migrationsTableExists: true,
    migrations: [...appliedPrefix, ...attempts, successfulRetry],
    userTables: ["user"],
    userObjects: ["table:user"],
    tablesWithData: [],
    adminAccessRoleCardinalityViolations: 0,
  });
  const firstPlan = await createMigrationPlan({
    projectRoot: process.cwd(),
    directUrl: "postgresql://redacted.invalid/database",
    runner,
    inspect: inspect([rolledBackAttempt]),
  });
  const changedPlan = await createMigrationPlan({
    projectRoot: process.cwd(),
    directUrl: "postgresql://redacted.invalid/database",
    runner,
    inspect: inspect([rolledBackAttempt, rolledBackAttempt]),
  });
  const changedLogsPlan = await createMigrationPlan({
    projectRoot: process.cwd(),
    directUrl: "postgresql://redacted.invalid/database",
    runner,
    inspect: inspect([
      { ...rolledBackAttempt, logs: "different diagnostic text" },
    ]),
  });

  assert.equal(firstPlan.state, "up-to-date");
  assert.notEqual(firstPlan.planHash, changedPlan.planHash);
  assert.equal(firstPlan.planHash, changedLogsPlan.planHash);
});

test("unresolved, contradictory, diverged, checksum, status, and drift states fail closed", async () => {
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
    adminAccessRoleCardinalityViolations: 0,
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
    /Contradictory/,
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

test("access-role cardinality preflight stops before Prisma records a failed migration", async () => {
  const runner = new RecordingRunner(() =>
    success("runner must remain unused when cardinality is invalid"),
  );

  await assert.rejects(
    createMigrationPlan({
      projectRoot: process.cwd(),
      directUrl: "postgresql://redacted.invalid/database",
      runner,
      inspect: async () => ({
        migrationsTableExists: true,
        migrations: [],
        userTables: ["admin_access_role_assignments", "user"],
        userObjects: [
          "table:admin_access_role_assignments",
          "table:user",
        ],
        tablesWithData: ["admin_access_role_assignments", "user"],
        adminAccessRoleCardinalityViolations: 2,
      }),
    }),
    /cardinality preflight found 2 user\(s\)/,
  );
  assert.equal(runner.calls.length, 0);
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

test("destructive SQL detection ignores truncate references in trigger definitions", () => {
  const triggerStatements = findDestructiveStatements(`
    CREATE FUNCTION assert_not_truncated()
    RETURNS TRIGGER AS $body$
    BEGIN
      IF TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'cannot truncate';
      END IF;
      RETURN NULL;
    END
    $body$ LANGUAGE plpgsql;

    CREATE TRIGGER no_truncate
    BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION assert_not_truncated();
  `);
  assert.deepEqual(triggerStatements, []);

  const actualTruncates = findDestructiveStatements(`
    TRUNCATE public.audit_log;
    TRUNCATE TABLE public.audit_archive;
  `);
  assert.equal(actualTruncates.length, 2);
});

test("affected-table detection ignores trigger event grammar", () => {
  const singleRoleMigration = readLocalMigrations(
    new URL("../../../prisma/migrations/", import.meta.url).pathname,
  ).find(
    ({ name }) => name === "20260828210000_enforce_single_admin_access_role",
  );
  assert.ok(singleRoleMigration);
  assert.deepEqual(singleRoleMigration.affectedTables, [
    "admin_access_role_assignments",
    "user",
  ]);
});

test("an object-empty database requires a separately reviewed bootstrap path", async () => {
  const runner = new RecordingRunner(() => {
    throw new Error("Prisma must not run for an unsupported empty database.");
  });
  const inspection = {
    migrationsTableExists: false,
    migrations: [],
    userTables: [],
    userObjects: [],
    tablesWithData: [],
    adminAccessRoleCardinalityViolations: null,
  };
  await assert.rejects(
    createMigrationPlan({
      projectRoot: process.cwd(),
      directUrl: "postgresql://redacted.invalid/database",
      runner,
      inspect: async () => inspection,
    }),
    /Automatic bootstrap is outside this deployment interface/u,
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
      { length: 276 - representativePaths.length },
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
    new URL("https://canonical.example.test"),
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
