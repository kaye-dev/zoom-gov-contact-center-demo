import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const evaluator = path.join(root, "scripts/eval-plan-skills.mjs");
type PreparedFixture = {
  fixtureRoot: string;
  repo: string;
  scenario: { simulate(repo: string): Promise<void> };
};
type EvaluatorModule = {
  codexEnvironment(): Record<string, string>;
  executeScenario(name: string): Promise<void>;
  fixtureGitEnvironment(): Record<string, string>;
  gradePreparedScenario(fixture: PreparedFixture, final: string): Promise<void>;
  prepareScenario(
    name: string,
    fixtureName?: string,
  ): Promise<PreparedFixture>;
  run(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      containmentRoot?: string;
      env?: NodeJS.ProcessEnv;
      maxOutputBytes?: number;
      timeoutMs?: number;
      trackDescendants?: boolean;
    },
  ): Promise<{ stdout: string; stderr: string }>;
  scenarios: Record<string, unknown>;
};
const evaluatorModulePromise = import(pathToFileURL(evaluator).href) as Promise<EvaluatorModule>;

async function temporaryEntries(prefix: string) {
  return (await readdir(tmpdir())).filter((entry) => entry.startsWith(prefix));
}

test("plan skill behavioral evalは実promptの8 scenarioを公開する", async () => {
  const { stdout } = await execFileAsync(process.execPath, [evaluator, "--list"], { cwd: root });
  assert.deepEqual(stdout.trim().split("\n"), [
    "plan-canonical",
    "plan-existing-collision",
    "plan-ui-revision",
    "implement-stale-revision",
    "implement-contract-mismatch",
    "implement-related-source-drift",
    "implement-browser-gate",
    "review-ui-gate",
  ]);
});

test("plan skill behavioral evalはsymlink経由のCLI起動でもmainを実行する", async (context) => {
  const aliasRoot = await mkdtemp(path.join(tmpdir(), "plan-eval-cli-alias-"));
  context.after(() => rm(aliasRoot, { recursive: true, force: true }));
  const linkedEvaluator = path.join(aliasRoot, "eval-plan-skills.mjs");
  await symlink(evaluator, linkedEvaluator);

  const { stdout, stderr } = await execFileAsync(process.execPath, [linkedEvaluator, "--list"], {
    cwd: root,
  });
  assert.equal(stderr, "");
  assert.deepEqual(stdout.trim().split("\n"), [
    "plan-canonical",
    "plan-existing-collision",
    "plan-ui-revision",
    "implement-stale-revision",
    "implement-contract-mismatch",
    "implement-related-source-drift",
    "implement-browser-gate",
    "review-ui-gate",
  ]);
});

test("plan skill behavioral evalのartifact graderはpositive/negative controlを判別する", async () => {
  const { stdout } = await execFileAsync(process.execPath, [evaluator, "--self-test"], {
    cwd: root,
    timeout: 180_000,
  });
  assert.match(stdout, /self-test passed: 8 scenarios/);
});

test("eval fixtureは外部MCPなしで必要なcustom agent定義を読み込める", async (context) => {
  const evaluatorModule = await evaluatorModulePromise;
  const fixture = await evaluatorModule.prepareScenario(
    "plan-canonical",
    `agent-routing-${process.pid}`,
  );
  context.after(() => rm(fixture.fixtureRoot, { recursive: true, force: true }));

  const config = await readFile(path.join(fixture.repo, ".codex/config.toml"), "utf8");
  assert.match(config, /^\[agents\.project_explorer\]$/m);
  assert.match(config, /^\[agents\.independent_reviewer\]$/m);
  assert.doesNotMatch(config, /mcp_servers/);
  for (const name of ["project_explorer", "independent_reviewer"]) {
    assert.match(config, new RegExp(`config_file = "\\./agents/${name}\\.toml"`));
    const agent = await readFile(path.join(fixture.repo, `.codex/agents/${name}.toml`), "utf8");
    assert.match(agent, new RegExp(`^name = "${name}"$`, "m"));
    assert.match(agent, /^sandbox_mode = "read-only"$/m);
  }
});

test("eval runnerは環境と出力量を制限し通常のtimeout・子process treeをcleanupする", async (context) => {
  const evaluatorModule = await evaluatorModulePromise;
  const secretKey = "PLAN_SKILL_EVAL_SECRET_SENTINEL";
  const previousSecret = process.env[secretKey];
  process.env[secretKey] = "must-not-reach-codex";
  context.after(() => {
    if (previousSecret === undefined) delete process.env[secretKey];
    else process.env[secretKey] = previousSecret;
  });
  const scrubbed = evaluatorModule.codexEnvironment();
  assert.equal(scrubbed[secretKey], undefined);
  assert.equal(scrubbed.PATH, process.env.PATH);

  await assert.rejects(
    evaluatorModule.run(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);"],
      { cwd: root, timeoutMs: 75 },
    ),
    /timed out/u,
  );

  await assert.rejects(
    evaluatorModule.run(
      process.execPath,
      ["-e", "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000);"],
      { cwd: root, maxOutputBytes: 1024, timeoutMs: 2_000 },
    ),
    /exceeded the 1024-byte output limit/u,
  );

  const processTreeRoot = await mkdtemp(path.join(tmpdir(), "plan-eval-process-tree-"));
  context.after(() => rm(processTreeRoot, { recursive: true, force: true }));
  const marker = path.join(processTreeRoot, "grandchild-survived.txt");
  const grandchild = `process.on('SIGTERM', () => {}); setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'survived'), 400); setInterval(() => {}, 1000);`;
  const parent = `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore', detached: true }); child.unref(); process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);`;
  await assert.rejects(
    evaluatorModule.run(process.execPath, ["-e", parent], { cwd: root, timeoutMs: 100 }),
    /timed out/u,
  );
  await delay(550);
  await assert.rejects(access(marker), { code: "ENOENT" });

  const normalExitMarker = path.join(processTreeRoot, "normal-exit-grandchild-survived.txt");
  const normalExitPid = path.join(processTreeRoot, "normal-exit-grandchild.pid");
  const normalExitGrandchild = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(normalExitMarker)}, 'survived'), 400); setInterval(() => {}, 1000);`;
  const normalExitParent = `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(normalExitGrandchild)}], { stdio: 'ignore', detached: true, env: { PATH: process.env.PATH } }); require('node:fs').writeFileSync(${JSON.stringify(normalExitPid)}, String(child.pid)); child.unref();`;
  await evaluatorModule.run(process.execPath, ["-e", normalExitParent], {
    cwd: processTreeRoot,
    containmentRoot: processTreeRoot,
    timeoutMs: 2_000,
  });
  await delay(550);
  await assert.rejects(access(normalExitMarker), { code: "ENOENT" });
  const escapedPid = Number(await readFile(normalExitPid, "utf8"));
  assert.ok(Number.isInteger(escapedPid));
  assert.throws(
    () => process.kill(escapedPid, 0),
    (error: NodeJS.ErrnoException) => error.code === "ESRCH",
  );
});

test("eval fixtureのGit操作はhostのGIT_*環境変数を継承しない", async () => {
  const evaluatorModule = await evaluatorModulePromise;
  const scenarioName = `git-environment-${process.pid}`;
  const externalRoot = await mkdtemp(path.join(tmpdir(), "plan-eval-git-environment-"));
  const externalIndex = path.join(externalRoot, "external-index");
  const hostileGitEnvironment = {
    GIT_INDEX_FILE: externalIndex,
    GIT_DIR: path.join(externalRoot, "external-git-dir"),
    GIT_WORK_TREE: externalRoot,
    GIT_OBJECT_DIRECTORY: path.join(externalRoot, "external-objects"),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(externalRoot, "external-alternates"),
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: externalRoot,
  };
  const previousValues = new Map(
    Object.keys(hostileGitEnvironment).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(hostileGitEnvironment)) process.env[key] = value;
  evaluatorModule.scenarios[scenarioName] = { async prepare() {} };
  let fixture: { fixtureRoot: string; repo: string } | undefined;

  try {
    const isolated = evaluatorModule.fixtureGitEnvironment();
    assert.deepEqual(
      Object.keys(isolated).filter((key) => key.startsWith("GIT_")).sort(),
      [
        "GIT_CONFIG_GLOBAL",
        "GIT_CONFIG_NOSYSTEM",
        "GIT_CONFIG_SYSTEM",
        "GIT_EXTERNAL_DIFF",
        "GIT_PAGER",
        "GIT_TERMINAL_PROMPT",
      ],
    );
    fixture = await evaluatorModule.prepareScenario(scenarioName, scenarioName);
    await assert.rejects(access(externalIndex), { code: "ENOENT" });
    await access(path.join(fixture.repo, ".git", "index"));
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete evaluatorModule.scenarios[scenarioName];
    if (fixture) await rm(fixture.fixtureRoot, { recursive: true, force: true });
    await rm(externalRoot, { recursive: true, force: true });
  }
});

test("eval fixtureはsetup失敗とgrade失敗の双方でcleanupされる", async (context) => {
  const evaluatorModule = await evaluatorModulePromise;
  const setupScenario = `setup-cleanup-${process.pid}`;
  const setupFixtureName = `${setupScenario}-fixture`;
  evaluatorModule.scenarios[setupScenario] = {
    async prepare() {
      throw new Error("intentional setup failure");
    },
  };
  context.after(() => {
    delete evaluatorModule.scenarios[setupScenario];
  });
  await assert.rejects(
    evaluatorModule.prepareScenario(setupScenario, setupFixtureName),
    /intentional setup failure/u,
  );
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${setupFixtureName}-`), []);

  const fakeBin = await mkdtemp(path.join(tmpdir(), "plan-eval-fake-bin-"));
  context.after(() => rm(fakeBin, { recursive: true, force: true }));
  const fakeCodex = path.join(fakeBin, "codex");
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
const index = process.argv.indexOf("--output-last-message");
if (index < 0 || !process.argv[index + 1]) process.exit(2);
fs.writeFileSync(process.argv[index + 1], "fake final output\\n");
`,
  );
  await chmod(fakeCodex, 0o755);

  const gradeScenario = `grade-cleanup-${process.pid}`;
  evaluatorModule.scenarios[gradeScenario] = {
    async prepare() {},
    prompt: "fixture prompt",
    async grade() {
      throw new Error("intentional grade failure");
    },
  };
  context.after(() => {
    delete evaluatorModule.scenarios[gradeScenario];
  });
  const previousPath = process.env.PATH;
  process.env.PATH = `${fakeBin}${path.delimiter}${previousPath ?? ""}`;
  try {
    await assert.rejects(
      evaluatorModule.executeScenario(gradeScenario),
      /intentional grade failure/u,
    );
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${gradeScenario}-`), []);
});

test("eval runnerは危険なfinal output、fixture内commit、Git config改変を拒否してcleanupする", async (context) => {
  const evaluatorModule = await evaluatorModulePromise;
  const fakeBin = await mkdtemp(path.join(tmpdir(), "plan-eval-hostile-bin-"));
  context.after(() => rm(fakeBin, { recursive: true, force: true }));
  const fakeCodex = path.join(fakeBin, "codex");
  const previousPath = process.env.PATH;
  process.env.PATH = `${fakeBin}${path.delimiter}${previousPath ?? ""}`;
  context.after(() => {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  });

  const oversizedScenario = `oversized-final-${process.pid}`;
  evaluatorModule.scenarios[oversizedScenario] = {
    async prepare() {},
    prompt: "fixture prompt",
    async grade() {},
  };
  context.after(() => {
    delete evaluatorModule.scenarios[oversizedScenario];
  });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
const index = process.argv.indexOf("--output-last-message");
fs.writeFileSync(process.argv[index + 1], "x".repeat(1024 * 1024 + 1));
`,
  );
  await chmod(fakeCodex, 0o755);
  await assert.rejects(
    evaluatorModule.executeScenario(oversizedScenario),
    /final output exceeded the 1048576-byte output limit/u,
  );
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${oversizedScenario}-`), []);

  const symlinkScenario = `symlink-final-${process.pid}`;
  evaluatorModule.scenarios[symlinkScenario] = {
    async prepare() {},
    prompt: "fixture prompt",
    async grade() {},
  };
  context.after(() => {
    delete evaluatorModule.scenarios[symlinkScenario];
  });
  const symlinkTarget = path.join(fakeBin, "symlink-final-target.txt");
  await writeFile(symlinkTarget, "outside final output\n");
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
const index = process.argv.indexOf("--output-last-message");
fs.symlinkSync(${JSON.stringify(symlinkTarget)}, process.argv[index + 1]);
`,
  );
  await assert.rejects(
    evaluatorModule.executeScenario(symlinkScenario),
    /final output must not be a symlink/u,
  );
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${symlinkScenario}-`), []);

  const commitScenario = `fixture-commit-${process.pid}`;
  evaluatorModule.scenarios[commitScenario] = {
    async prepare() {},
    prompt: "fixture prompt",
    async grade() {},
  };
  context.after(() => {
    delete evaluatorModule.scenarios[commitScenario];
  });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
fs.mkdirSync("src", { recursive: true });
fs.writeFileSync("src/forbidden.ts", "export const forbidden = true;\\n");
spawnSync("git", ["add", "."], { stdio: "ignore" });
spawnSync("git", ["commit", "-qm", "hide forbidden change"], { stdio: "ignore" });
const index = process.argv.indexOf("--output-last-message");
fs.writeFileSync(process.argv[index + 1], "fake final output\\n");
`,
  );
  await assert.rejects(
    evaluatorModule.executeScenario(commitScenario),
    /changed Git HEAD or committed fixture changes/u,
  );
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${commitScenario}-`), []);

  const tagScenario = `fixture-git-tag-${process.pid}`;
  evaluatorModule.scenarios[tagScenario] = {
    async prepare() {},
    prompt: "fixture prompt",
    async grade() {},
  };
  context.after(() => {
    delete evaluatorModule.scenarios[tagScenario];
  });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
spawnSync("git", ["tag", "unauthorized-eval-tag"], { stdio: "ignore" });
const index = process.argv.indexOf("--output-last-message");
fs.writeFileSync(process.argv[index + 1], "fake final output\\n");
`,
  );
  await assert.rejects(
    evaluatorModule.executeScenario(tagScenario),
    /modified fixture Git metadata:.*refs\/tags\/unauthorized-eval-tag/u,
  );
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${tagScenario}-`), []);

  const reflogScenario = `fixture-git-reflog-${process.pid}`;
  evaluatorModule.scenarios[reflogScenario] = {
    async prepare() {},
    prompt: "fixture prompt",
    async grade() {},
  };
  context.after(() => {
    delete evaluatorModule.scenarios[reflogScenario];
  });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(".git/logs/HEAD", "forbidden reflog mutation\\n");
const index = process.argv.indexOf("--output-last-message");
fs.writeFileSync(process.argv[index + 1], "fake final output\\n");
`,
  );
  await assert.rejects(
    evaluatorModule.executeScenario(reflogScenario),
    /modified fixture Git metadata:.*logs\/HEAD/u,
  );
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${reflogScenario}-`), []);

  const objectScenario = `fixture-git-object-${process.pid}`;
  evaluatorModule.scenarios[objectScenario] = {
    async prepare() {},
    prompt: "fixture prompt",
    async grade() {},
  };
  context.after(() => {
    delete evaluatorModule.scenarios[objectScenario];
  });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.mkdirSync(".git/objects/aa", { recursive: true });
fs.writeFileSync(".git/objects/aa/00000000000000000000000000000000000000", "forbidden object");
const index = process.argv.indexOf("--output-last-message");
fs.writeFileSync(process.argv[index + 1], "fake final output\\n");
`,
  );
  await assert.rejects(
    evaluatorModule.executeScenario(objectScenario),
    /modified fixture Git metadata:.*objects\/aa\/00000000000000000000000000000000000000/u,
  );
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${objectScenario}-`), []);

  const configScenario = `fixture-git-config-${process.pid}`;
  const fsmonitorMarker = path.join(fakeBin, "fsmonitor-executed.txt");
  const fsmonitorHook = path.join(fakeBin, "fsmonitor-hook");
  await writeFile(
    fsmonitorHook,
    `#!/usr/bin/env node
require("node:fs").writeFileSync(${JSON.stringify(fsmonitorMarker)}, "executed\n");
`,
  );
  await chmod(fsmonitorHook, 0o755);
  evaluatorModule.scenarios[configScenario] = {
    async prepare() {},
    prompt: "fixture prompt",
    async grade(repo: string) {
      // This is intentionally unsafe: it proves the evaluator's direct config
      // comparison stops before any host-side Git command or scenario grader.
      await execFileAsync("git", ["status", "--porcelain=v1"], { cwd: repo });
    },
  };
  context.after(() => {
    delete evaluatorModule.scenarios[configScenario];
  });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(".git/config", "\\n[core]\\n\\tfsmonitor = " + ${JSON.stringify(fsmonitorHook)} + "\\n");
const index = process.argv.indexOf("--output-last-message");
fs.writeFileSync(process.argv[index + 1], "fake final output\\n");
`,
  );
  await assert.rejects(
    evaluatorModule.executeScenario(configScenario),
    /modified fixture \.git\/config/u,
  );
  await delay(100);
  await assert.rejects(access(fsmonitorMarker), { code: "ENOENT" });
  assert.deepEqual(await temporaryEntries(`zoom-plan-skill-eval-${configScenario}-`), []);

  const hookRoot = await mkdtemp(path.join(tmpdir(), "plan-eval-global-hook-"));
  const hookMarker = path.join(hookRoot, "pre-commit-executed.txt");
  const hookScript = path.join(hookRoot, "pre-commit");
  const globalConfig = path.join(hookRoot, "global.gitconfig");
  await writeFile(
    hookScript,
    `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(hookMarker)}, "executed\\n");\n`,
  );
  await chmod(hookScript, 0o755);
  await writeFile(globalConfig, `[core]\n\thooksPath = ${hookRoot}\n`);
  const globalHookScenario = `global-hook-${process.pid}`;
  evaluatorModule.scenarios[globalHookScenario] = {
    async prepare(repo: string) {
      await writeFile(path.join(repo, "hook-fixture.txt"), "fixture\n");
    },
    prompt: "fixture prompt",
    async grade() {},
  };
  const previousGlobalConfig = process.env.GIT_CONFIG_GLOBAL;
  let globalHookFixture: { fixtureRoot: string } | undefined;
  try {
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    globalHookFixture = await evaluatorModule.prepareScenario(globalHookScenario);
  } finally {
    if (previousGlobalConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previousGlobalConfig;
    delete evaluatorModule.scenarios[globalHookScenario];
    if (globalHookFixture) {
      await rm(globalHookFixture.fixtureRoot, { recursive: true, force: true });
    }
  }
  await assert.rejects(access(hookMarker), { code: "ENOENT" });

  const trustedHelperFixture = await evaluatorModule.prepareScenario(
    "plan-ui-revision",
    `trusted-helper-${process.pid}`,
  );
  const helperMarker = path.join(fakeBin, "untrusted-helper-executed.txt");
  try {
    await trustedHelperFixture.scenario.simulate(trustedHelperFixture.repo);
    const ignoredUnexpected = path.join(
      trustedHelperFixture.repo,
      "plans/plan-ui-revision/unexpected-note.md",
    );
    await writeFile(ignoredUnexpected, "unexpected ignored artifact\n");
    await assert.rejects(
      evaluatorModule.gradePreparedScenario(
        trustedHelperFixture,
        "planとprototypeを作成し、Browser未利用のため影響rowのsmokeは未確認です。",
      ),
      /unexpected fixture changes: plans\/plan-ui-revision\/unexpected-note\.md/u,
    );
    await rm(ignoredUnexpected);
    await writeFile(
      path.join(
        trustedHelperFixture.repo,
        ".agents/skills/plan/scripts/prototype-revision.mjs",
      ),
      `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(helperMarker)}, "executed\\n");\n`,
    );
    await assert.rejects(
      evaluatorModule.gradePreparedScenario(
        trustedHelperFixture,
        "planとprototypeを作成し、Browser未利用のため影響rowのsmokeは未確認です。",
      ),
      /unexpected fixture changes/u,
    );
    await assert.rejects(access(helperMarker), { code: "ENOENT" });
  } finally {
    await rm(trustedHelperFixture.fixtureRoot, { recursive: true, force: true });
  }
});
