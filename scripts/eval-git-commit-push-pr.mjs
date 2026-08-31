#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const scenarioNames = [
  "detached-auto-adopt",
  "resume-base-choice",
  "resume-foreign-history",
  "resume-local-name-collision",
  "resume-worktree-occupied",
  "resume-staged-scope",
  "stale-recovery-prompt",
];
const codexEnvironmentKeys = [
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TERM",
  "COLORTERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NO_COLOR",
  "CODEX_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, { cwd, env = process.env, allowFailure = false, timeout = 60_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function git(repo, args, options = {}) {
  return run("git", args, { cwd: repo, ...options });
}

function gitOutput(repo, args) {
  return git(repo, args).stdout.trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function exists(target) {
  try {
    await readFile(target);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function write(target, contents) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

function fakeGhSource() {
  return `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const statePath = process.env.EVAL_GH_STATE;
const logPath = process.env.EVAL_GH_LOG;
const remote = process.env.EVAL_GIT_REMOTE;
appendFileSync(logPath, JSON.stringify({ args }) + "\\n");
const readState = () => existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
const value = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const remoteOid = (branch) => {
  const result = spawnSync("git", ["--git-dir", remote, "rev-parse", "refs/heads/" + branch], { encoding: "utf8" });
  if (result.status !== 0) process.exit(2);
  return result.stdout.trim();
};
if (args[0] === "--version") {
  console.log("gh version 2.99.0 (fixture)");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  console.error("Logged in to github.com as fixture-user");
  process.exit(0);
}
if (args[0] === "repo" && args[1] === "view") {
  console.log(JSON.stringify({
    nameWithOwner: "fixture/repo",
    url: "https://github.com/fixture/repo",
    defaultBranchRef: { name: "main" },
  }));
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "list") {
  const state = readState();
  const head = value("--head");
  console.log(JSON.stringify(state && (!head || state.headRefName === head) ? [state] : []));
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "create") {
  const base = value("--base");
  const rawHead = value("--head");
  const head = rawHead.includes(":") ? rawHead.split(":").at(-1) : rawHead;
  const bodyFile = value("--body-file");
  const body = bodyFile === "-" ? readFileSync(0, "utf8") : bodyFile ? readFileSync(bodyFile, "utf8") : value("--body") || "";
  const state = {
    number: 1,
    url: "https://github.com/fixture/repo/pull/1",
    state: "OPEN",
    title: value("--title") || "fixture pull request",
    body,
    baseRefName: base,
    baseRefOid: remoteOid(base),
    headRefName: head,
    headRefOid: remoteOid(head),
    isDraft: args.includes("--draft"),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    headRepositoryOwner: { login: "fixture" },
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\\n");
  console.log(state.url);
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "edit") {
  const state = readState();
  if (!state) process.exit(1);
  const title = value("--title");
  const bodyFile = value("--body-file");
  if (title) state.title = title;
  if (bodyFile) state.body = bodyFile === "-" ? readFileSync(0, "utf8") : readFileSync(bodyFile, "utf8");
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\\n");
  console.log(state.url);
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "view") {
  const state = readState();
  if (!state) process.exit(1);
  console.log(JSON.stringify(state));
  process.exit(0);
}
console.error("unsupported fixture gh command: " + args.join(" "));
process.exit(64);
`;
}

function denyNetworkCommandSource() {
  return `#!/bin/sh
echo "external network command disabled in git shipping eval: $(basename "$0")" >&2
exit 97
`;
}

async function createFixture(name) {
  const fixtureRoot = await realpath(
    await mkdtemp(path.join(os.tmpdir(), `zoom-git-shipping-eval-${name}-`)),
  );
  const repo = path.join(fixtureRoot, "repo");
  const remote = path.join(fixtureRoot, "remote.git");
  const bin = path.join(fixtureRoot, "bin");
  const shellConfig = path.join(fixtureRoot, "shell-config");
  const ghState = path.join(fixtureRoot, "gh-state.json");
  const ghLog = path.join(fixtureRoot, "gh-log.jsonl");
  const gitTrace = path.join(fixtureRoot, "git-trace.log");
  const occupiedWorktree = path.join(fixtureRoot, "occupied-worktree");
  await Promise.all([mkdir(repo), mkdir(bin), mkdir(shellConfig)]);
  git(fixtureRoot, ["init", "--bare", "-q", remote]);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "shipping-eval@example.invalid"]);
  git(repo, ["config", "user.name", "Shipping Eval"]);
  await cp(
    path.join(repositoryRoot, ".agents", "skills", "git-commit-push-pr"),
    path.join(repo, ".agents", "skills", "git-commit-push-pr"),
    { recursive: true },
  );
  await write(
    path.join(repo, "AGENTS.md"),
    "# Isolated shipping eval\n\nUse only the repo-local `$git-commit-push-pr` skill. The explicit invocation authorizes commit, push to the configured local fixture remote, and pull-request operations through the fixture `gh`. Never access another repository, remote, credential, or external service.\n",
  );
  await write(path.join(repo, "src/task.txt"), "before\n");
  await write(path.join(repo, "src/unrelated.txt"), "unchanged\n");
  git(repo, ["add", "--", "AGENTS.md", ".agents/skills/git-commit-push-pr", "src/task.txt", "src/unrelated.txt"]);
  git(repo, ["commit", "-qm", "chore: shipping eval fixture"]);
  git(repo, ["remote", "add", "origin", "git@github.com:fixture/repo.git"]);
  git(repo, ["config", `url.file://${remote}.insteadOf`, "git@github.com:fixture/repo.git"]);
  git(repo, ["push", "-q", "-u", "origin", "main"]);
  git(fixtureRoot, ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);
  git(repo, ["remote", "set-head", "origin", "-a"]);

  const mainOid = gitOutput(repo, ["rev-parse", "main"]);
  let detachedOid = mainOid;
  if (["resume-base-choice", "stale-recovery-prompt"].includes(name)) {
    git(repo, ["switch", "-qc", "develop"]);
    await write(path.join(repo, "src/develop.txt"), "develop\n");
    git(repo, ["add", "--", "src/develop.txt"]);
    git(repo, ["commit", "-qm", "chore: add develop fixture"]);
    git(repo, ["push", "-q", "-u", "origin", "develop"]);
    git(repo, ["switch", "-q", "main"]);
  }
  if (name === "resume-foreign-history") {
    git(repo, ["switch", "-qc", "source-topic"]);
    await write(path.join(repo, "src/source-topic.txt"), "source topic\n");
    git(repo, ["add", "--", "src/source-topic.txt"]);
    git(repo, ["commit", "-qm", "feat: add source topic"]);
    git(repo, ["push", "-q", "-u", "origin", "source-topic"]);
    detachedOid = gitOutput(repo, ["rev-parse", "HEAD"]);
  }
  if (["resume-local-name-collision", "resume-worktree-occupied"].includes(name)) {
    git(repo, ["branch", "feature/eval-shipping", detachedOid]);
  }
  if (name === "resume-worktree-occupied") {
    git(repo, ["worktree", "add", "-q", occupiedWorktree, "feature/eval-shipping"]);
  }
  git(repo, ["switch", "-q", "--detach", detachedOid]);
  await write(path.join(repo, "src/task.txt"), "after\n");
  if (name === "resume-staged-scope") {
    await write(path.join(repo, "src/unrelated.txt"), "preserve me\n");
    git(repo, ["add", "--", "src/task.txt", "src/unrelated.txt"]);
  }

  const ghPath = path.join(bin, "gh");
  await write(ghPath, fakeGhSource());
  await chmod(ghPath, 0o755);
  for (const command of ["curl", "nc", "scp", "ssh", "wget"]) {
    const commandPath = path.join(bin, command);
    await write(commandPath, denyNetworkCommandSource());
    await chmod(commandPath, 0o755);
  }
  await write(
    path.join(shellConfig, ".zprofile"),
    `export PATH=${JSON.stringify(`${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`)}\n`,
  );
  await write(ghLog, "");
  await write(gitTrace, "");
  return {
    name,
    fixtureRoot,
    repo,
    remote,
    bin,
    shellConfig,
    ghState,
    ghLog,
    gitTrace,
    occupiedWorktree,
  };
}

async function removeFixture(fixture) {
  const canonicalTemporaryRoot = await realpath(os.tmpdir());
  const expectedPrefix = path.join(canonicalTemporaryRoot, "zoom-git-shipping-eval-");
  const resolved = await realpath(fixture.fixtureRoot);
  ensure(resolved.startsWith(expectedPrefix), `refusing to remove unexpected path: ${resolved}`);
  await rm(resolved, { recursive: true, force: true });
}

async function snapshot(fixture) {
  const branchResult = git(fixture.repo, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true,
  });
  const ghState = (await exists(fixture.ghState)) ? await readFile(fixture.ghState, "utf8") : "";
  return {
    head: gitOutput(fixture.repo, ["rev-parse", "HEAD"]),
    branch: branchResult.status === 0 ? branchResult.stdout.trim() : "(detached)",
    status: gitOutput(fixture.repo, ["status", "--porcelain=v1", "--untracked-files=all"]),
    refs: gitOutput(fixture.repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/remotes"]),
    remoteRefs: gitOutput(fixture.fixtureRoot, ["--git-dir", fixture.remote, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]),
    worktrees: gitOutput(fixture.repo, ["worktree", "list", "--porcelain"]),
    cachedDigest: sha256(git(fixture.repo, ["diff", "--cached", "--binary", "--no-ext-diff"]).stdout),
    taskDigest: sha256(await readFile(path.join(fixture.repo, "src/task.txt"))),
    unrelatedDigest: sha256(await readFile(path.join(fixture.repo, "src/unrelated.txt"))),
    ghState,
  };
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fixtureEnvironment(fixture) {
  const environment = Object.fromEntries(
    codexEnvironmentKeys
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  return {
    ...environment,
    PATH: `${fixture.bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    ZDOTDIR: fixture.shellConfig,
    EVAL_GH_STATE: fixture.ghState,
    EVAL_GH_LOG: fixture.ghLog,
    EVAL_GIT_REMOTE: fixture.remote,
    GH_CONFIG_DIR: path.join(fixture.fixtureRoot, "gh-config"),
    GIT_CONFIG_GLOBAL: path.join(fixture.fixtureRoot, "isolated-gitconfig"),
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_SSH_COMMAND: path.join(fixture.bin, "ssh"),
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GIT_TRACE: fixture.gitTrace,
  };
}

function scenarioPrompt(name) {
  const scope = name === "resume-staged-scope"
    ? "Only src/task.txt belongs to the current task; preserve src/unrelated.txt outside the commit."
    : "Only src/task.txt belongs to the current task.";
  return `Use $git-commit-push-pr from .agents/skills/git-commit-push-pr/SKILL.md. ${scope} If a topic branch is needed, use feature/eval-shipping. Complete the authorized workflow through commit, synchronization, non-force push, pull-request creation or minimal update, and final local/remote/PR SHA and mergeability readback. This is an isolated fixture: use only origin and the fixture gh, do not merge or wait for CI.`;
}

async function runCodex(fixture, prompt, suffix) {
  const finalPath = path.join(fixture.fixtureRoot, `final-${suffix}.txt`);
  const result = run(
    "codex",
    [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      // The fixture must write Git metadata and fake-gh state. Every GitHub-shaped
      // remote is rewritten to the local bare repository before Codex starts.
      "--sandbox",
      "danger-full-access",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--cd",
      fixture.repo,
      "--output-last-message",
      finalPath,
      prompt,
    ],
    {
      cwd: fixture.repo,
      env: fixtureEnvironment(fixture),
      timeout: 10 * 60_000,
    },
  );
  ensure(result.status === 0, `Codex failed for ${fixture.name}: ${result.stderr}`);
  ensure(await exists(finalPath), `Codex did not write ${finalPath}`);
  return readFile(finalPath, "utf8");
}

function recoveryPrompts(final) {
  const marker = final.indexOf("次に送るプロンプト");
  ensure(marker !== -1, "stop response omitted 次に送るプロンプト");
  return [...final.slice(marker).matchAll(/```(?:text|markdown)?\s*\n([\s\S]*?)```/gu)]
    .map((match) => match[1].trim())
    .filter((prompt) => prompt.includes("$git-commit-push-pr"));
}

function validateRecoveryPrompt(prompt) {
  for (const pattern of [
    /\$git-commit-push-pr/u,
    /fixture\/repo/u,
    /origin/u,
    /[0-9a-f]{40}/u,
    /base/iu,
    /feature\/eval-shipping/u,
    /src\/task\.txt/u,
    /(?:digest|ダイジェスト|hash|SHA-?256)/iu,
    /(?:commit|コミット)/iu,
    /push/iu,
    /(?:pull request|PR)/iu,
    /(?:readback|読み戻|照合)/iu,
  ]) {
    ensure(pattern.test(prompt), `recovery prompt omitted ${pattern}`);
  }
  ensure(
    !/<(?:base|branch|topic|path|sha|oid|remote|owner|repo)>/iu.test(prompt),
    "recovery prompt retained an unresolved placeholder",
  );
}

function selectRecoveryPrompt(final, selector) {
  const prompts = recoveryPrompts(final);
  ensure(prompts.length > 0, "stop response had no sendable recovery prompt");
  for (const prompt of prompts) validateRecoveryPrompt(prompt);
  const selected = prompts.find((prompt) => selector.test(prompt));
  ensure(selected, `no recovery prompt matched ${selector}`);
  return selected;
}

async function assertStoppedUnchanged(fixture, before, final) {
  ensure(/(?:停止|stopp?ed|blocked)/iu.test(final), "response did not report a stop");
  ensure(recoveryPrompts(final).length > 0, "stop did not include a recovery prompt");
  const after = await snapshot(fixture);
  ensure(sameSnapshot(before, after), "stop mutated branch, index, worktree, refs, remote, or PR state");
}

async function readPrState(fixture) {
  ensure(await exists(fixture.ghState), "fixture PR was not created");
  return JSON.parse(await readFile(fixture.ghState, "utf8"));
}

function expectedOutcome(name) {
  if (name === "resume-base-choice") {
    return { base: "main", branch: "feature/eval-shipping" };
  }
  if (name === "resume-foreign-history") {
    return { base: "source-topic", branch: "feature/eval-shipping" };
  }
  if (["resume-local-name-collision", "resume-worktree-occupied"].includes(name)) {
    return { base: "main", branch: "feature/eval-shipping-2" };
  }
  return { base: "main", branch: "feature/eval-shipping" };
}

async function assertCompleted(
  fixture,
  name,
  { expectedPrCreateCount = 1 } = {},
) {
  const expected = expectedOutcome(name);
  const branch = gitOutput(fixture.repo, ["branch", "--show-current"]);
  ensure(branch === expected.branch, `expected branch ${expected.branch}, found ${branch}`);
  const head = gitOutput(fixture.repo, ["rev-parse", "HEAD"]);
  const remoteHead = gitOutput(fixture.fixtureRoot, [
    "--git-dir",
    fixture.remote,
    "rev-parse",
    `refs/heads/${expected.branch}`,
  ]);
  ensure(head === remoteHead, "local and remote head SHA differ");
  const pr = await readPrState(fixture);
  ensure(pr.baseRefName === expected.base, `expected PR base ${expected.base}, found ${pr.baseRefName}`);
  ensure(pr.headRefName === expected.branch, "PR head branch differs");
  ensure(pr.headRefOid === head, "PR head OID differs from local HEAD");
  ensure(pr.mergeable === "MERGEABLE" && pr.mergeStateStatus === "CLEAN", "PR mergeability was not read back");
  ensure(git(fixture.repo, ["diff", "--cached", "--quiet"]).status === 0, "index is not empty after commit");
  const committedPaths = gitOutput(fixture.repo, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"])
    .split("\n")
    .filter(Boolean);
  ensure(
    JSON.stringify(committedPaths) === JSON.stringify(["src/task.txt"]),
    `unexpected committed paths: ${committedPaths.join(", ")}`,
  );
  if (name === "resume-staged-scope") {
    const status = gitOutput(fixture.repo, ["status", "--short"]);
    ensure(status.includes("src/unrelated.txt"), "unrelated working-tree change was not preserved");
    ensure((await readFile(path.join(fixture.repo, "src/unrelated.txt"), "utf8")) === "preserve me\n", "unrelated contents changed");
  }
  const trace = await readFile(fixture.gitTrace, "utf8");
  for (const forbidden of [
    /git (?:switch|checkout)[^\n]*(?: -C| --force| --discard-changes| --ignore-other-worktrees)/u,
    /git push[^\n]*(?:--force|--force-with-lease)/u,
    /git add (?:\.|-A)(?:\s|$)/u,
    /git commit[^\n]* -a(?:\s|$)/u,
    /git stash/u,
    /git reset --hard/u,
    /git restore[^\n]*--worktree/u,
  ]) {
    ensure(!forbidden.test(trace), `forbidden Git operation was observed: ${forbidden}`);
  }
  const ghCalls = (await readFile(fixture.ghLog, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).args);
  const prCreateCount = ghCalls.filter(
    (args) => args[0] === "pr" && args[1] === "create",
  ).length;
  ensure(
    prCreateCount === expectedPrCreateCount,
    `expected ${expectedPrCreateCount} PR creates, got ${prCreateCount}`,
  );
}

function selectorFor(name) {
  if (["resume-base-choice", "stale-recovery-prompt"].includes(name)) {
    return /(?:base|ベース)[^\n]{0,40}(?:`main`|main)/iu;
  }
  if (name === "resume-foreign-history") return /source-topic/u;
  if (["resume-local-name-collision", "resume-worktree-occupied"].includes(name)) {
    return /feature\/eval-shipping-2/u;
  }
  if (name === "resume-staged-scope") return /(?:git restore --staged|src\/unrelated\.txt)/u;
  return /feature\/eval-shipping/u;
}

async function executeScenario(name, { keepOnFailure = false } = {}) {
  ensure(scenarioNames.includes(name), `unknown scenario: ${name}`);
  const fixture = await createFixture(name);
  let succeeded = false;
  try {
    if (name === "detached-auto-adopt") {
      await runCodex(fixture, scenarioPrompt(name), "initial");
      await assertCompleted(fixture, name);
    } else {
      const before = await snapshot(fixture);
      const firstFinal = await runCodex(fixture, scenarioPrompt(name), "stop");
      await assertStoppedUnchanged(fixture, before, firstFinal);
      const recovery = selectRecoveryPrompt(firstFinal, selectorFor(name));
      if (name === "stale-recovery-prompt") {
        git(fixture.repo, ["branch", "feature/eval-shipping", "HEAD"]);
        const drifted = await snapshot(fixture);
        const secondFinal = await runCodex(fixture, recovery, "stale");
        await assertStoppedUnchanged(fixture, drifted, secondFinal);
        ensure(
          /(?:drift|ドリフト|変化|不一致|stale)/iu.test(secondFinal),
          "stale prompt stop omitted drift evidence",
        );
      } else {
        await runCodex(fixture, recovery, "resume");
        await assertCompleted(fixture, name);
      }
    }
    succeeded = true;
    process.stdout.write(`PASS ${name}\n`);
  } finally {
    if (succeeded || !keepOnFailure) {
      await removeFixture(fixture);
    } else {
      process.stderr.write(`kept failed fixture: ${fixture.fixtureRoot}\n`);
    }
  }
}

function selfTestRecoveryPrompt(fixture, { base = "main", branch = "feature/eval-shipping-2" } = {}) {
  return `$git-commit-push-pr
repository: fixture/repo
remote: origin
expected HEAD: ${gitOutput(fixture.repo, ["rev-parse", "HEAD"])}
base: ${base}
base OID: ${gitOutput(fixture.repo, ["rev-parse", `origin/${base}`])}
topic branch: ${branch}
task paths: src/task.txt
staged patch digest: ${sha256(git(fixture.repo, ["diff", "--cached", "--binary", "--no-ext-diff"]).stdout)}
Continue through commit, push, pull request, and readback.`;
}

async function expectFailure(action, message) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

async function selfTest() {
  const fixture = await createFixture("detached-auto-adopt");
  try {
    git(fixture.repo, ["switch", "-qc", "feature/eval-shipping", "HEAD"]);
    git(fixture.repo, ["add", "--", "src/task.txt"]);
    git(fixture.repo, ["commit", "-qm", "feat: fixture shipping"]);
    git(fixture.repo, ["push", "-q", "-u", "origin", "HEAD:refs/heads/feature/eval-shipping"]);
    run(
      path.join(fixture.bin, "gh"),
      [
        "pr",
        "create",
        "--repo",
        "fixture/repo",
        "--base",
        "main",
        "--head",
        "feature/eval-shipping",
        "--title",
        "feat: fixture",
        "--body",
        "fixture",
      ],
      { cwd: fixture.repo, env: fixtureEnvironment(fixture) },
    );
    await assertCompleted(fixture, "detached-auto-adopt");
    const validPrompt = selfTestRecoveryPrompt(fixture);
    validateRecoveryPrompt(validPrompt);
    await expectFailure(
      async () => validateRecoveryPrompt(validPrompt.replace("main", "<base>")),
      "placeholder negative control was accepted",
    );
    const singleCreateLog = await readFile(fixture.ghLog, "utf8");
    run(
      path.join(fixture.bin, "gh"),
      [
        "pr",
        "create",
        "--repo",
        "fixture/repo",
        "--base",
        "main",
        "--head",
        "feature/eval-shipping",
      ],
      { cwd: fixture.repo, env: fixtureEnvironment(fixture) },
    );
    await expectFailure(
      async () => assertCompleted(fixture, "detached-auto-adopt"),
      "duplicate PR creation was accepted",
    );
    await write(fixture.ghLog, singleCreateLog);
    const state = await readPrState(fixture);
    state.headRefOid = "0".repeat(40);
    await write(fixture.ghState, `${JSON.stringify(state, null, 2)}\n`);
    await expectFailure(
      async () => assertCompleted(fixture, "detached-auto-adopt"),
      "OID mismatch negative control was accepted",
    );
  } finally {
    await removeFixture(fixture);
  }

  const stoppedFixture = await createFixture("resume-base-choice");
  try {
    const before = await snapshot(stoppedFixture);
    const stopOutput = `停止しました。\n\n次に送るプロンプト\n\n\`\`\`text\n${selfTestRecoveryPrompt(stoppedFixture)}\n\`\`\``;
    await assertStoppedUnchanged(stoppedFixture, before, stopOutput);
    git(stoppedFixture.repo, ["branch", "feature/eval-shipping", "HEAD"]);
    await expectFailure(
      async () => assertStoppedUnchanged(stoppedFixture, before, stopOutput),
      "stale fixture mutation was accepted as unchanged",
    );
    const denied = run(path.join(stoppedFixture.bin, "ssh"), ["github.com"], {
      cwd: stoppedFixture.repo,
      env: fixtureEnvironment(stoppedFixture),
      allowFailure: true,
    });
    ensure(denied.status === 97, "external network deny shim did not fail closed");
  } finally {
    await removeFixture(stoppedFixture);
  }
  process.stdout.write(`self-test passed: ${scenarioNames.length} scenarios and grader negative controls\n`);
}

function parseArguments(argv) {
  const selected = [];
  let self = false;
  let list = false;
  let keepOnFailure = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--self-test") self = true;
    else if (argument === "--list") list = true;
    else if (argument === "--keep-on-failure") keepOnFailure = true;
    else if (argument === "--scenario") {
      const name = argv[index + 1];
      ensure(name && scenarioNames.includes(name), `--scenario requires one of: ${scenarioNames.join(", ")}`);
      selected.push(name);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  ensure(!(self && selected.length > 0), "--self-test and --scenario cannot be combined");
  return { selected, self, list, keepOnFailure };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.list) {
    process.stdout.write(`${scenarioNames.join("\n")}\n`);
    return;
  }
  if (options.self) {
    await selfTest();
    return;
  }
  ensure(options.selected.length > 0, "pass --self-test, --list, or at least one --scenario <name>");
  run("codex", ["--version"], { timeout: 10_000 });
  for (const name of options.selected) {
    await executeScenario(name, { keepOnFailure: options.keepOnFailure });
  }
}

await main();
