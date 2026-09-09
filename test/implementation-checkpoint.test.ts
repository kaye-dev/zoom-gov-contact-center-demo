import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import test from "node:test";
import { pathToFileURL } from "node:url";
const exec = promisify(execFile);
const helperPath = path.resolve(import.meta.dirname, "../scripts/implementation-checkpoint.mjs");
const helper = import(pathToFileURL(helperPath).href);
const sha = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const goalPath = "plans/checkpoints/goal.md";
async function fixture(context: { after: (fn: () => Promise<unknown>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), "implementation-checkpoint-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args: string[]) => (await exec("git", ["-C", root, ...args])).stdout.trim();
  await git("init", "-b", "codex/checkpoints"); await git("config", "user.name", "Checkpoint Test"); await git("config", "user.email", "test@example.invalid");
  const definition = {
    schemaVersion: 1, commitPolicy: "local-stage-commits",
    sourceInventory: [{ path: "a.js", dependencies: ["shared.js"] }, { path: "b.js", dependencies: ["shared.js"] }, { path: "shared.js", dependencies: [] }],
    units: ["A", "B"].map((id) => ({ id, purpose: `${id} behavior`, requirementIds: [`REQ-${id}`], scope: [`${id.toLowerCase()}.js`], sourcePaths: [`${id.toLowerCase()}.js`], dependsOn: id === "A" ? [] : ["A"], acceptance: [`${id} computes the declared value`], checks: [{ id: "focused", argv: [process.execPath, "-e", `require('node:assert/strict').match(require('node:fs').readFileSync('${id.toLowerCase()}.js','utf8'), /export const value = 2/)`] }], browser: null })),
  };
  await mkdir(path.join(root, "plans/checkpoints"), { recursive: true });
  const goal = `# Goal\n\n\`\`\`implementation-checkpoints\n${JSON.stringify(definition, null, 2)}\n\`\`\`\n`;
  await writeFile(path.join(root, goalPath), goal);
  for (const file of ["a.js", "b.js"]) await writeFile(path.join(root, file), "import './shared.js';\nexport const value = 1;\n");
  await writeFile(path.join(root, "shared.js"), "export const shared = 1;\n");
  await git("add", "a.js", "b.js", "shared.js"); await git("commit", "-m", "初期状態を追加");
  const messageFile = "message.txt"; await writeFile(path.join(root, messageFile), "feat: 検証済みの計算結果を反映\n");
  const update = (file: string, value = 2) => writeFile(path.join(root, file), `import './shared.js';\nexport const value = ${value};\n`);
  const receiptPath = (id: string) => `plans/checkpoints/evidence/${id}/receipt.json`;
  const capture = async (id: string, extra = {}) => (await helper).createImplementationReceipt({ repository: root, goalPath, unitId: id, receiptPath: receiptPath(id), authorization: { basis: "explicit-$implement-invocation", goalDigest: sha(await readFile(path.join(root, goalPath))) }, ...extra });
  const args = (id: string) => ({ repository: root, goalPath, unitId: id, receiptPath: receiptPath(id), messageFile });
  return { root, git, definition, goal, update, capture, args, receiptPath };
}

test("ISO/COMMIT/DIGEST-01: two passed units create two local commits with unchanged immutable receipts", async (context) => {
  const f = await fixture(context), api = await helper;
  const initial = await f.git("rev-parse", "HEAD");
  await f.update("a.js"); const a = await f.capture("A");
  const original = await readFile(path.join(f.root, f.receiptPath("A")));
  assert.deepEqual(a.sources.map(({ path }: { path: string }) => path), ["a.js", "shared.js"]);
  const first = await api.commitImplementationCheckpoint(f.args("A"));
  assert.equal(first.verifiedHead, initial); assert.equal(first.status, "committed");
  await f.update("b.js"); await f.capture("B", { predecessors: [{ unitId: "A", receiptPath: f.receiptPath("A") }] });
  const second = await api.commitImplementationCheckpoint(f.args("B"));
  assert.equal(second.verifiedHead, first.committedHead); assert.equal(await f.git("rev-list", "--count", `${initial}..HEAD`), "2");
  assert.deepEqual(await readFile(path.join(f.root, f.receiptPath("A"))), original);
  assert.equal((await api.verifyImplementationCheckpoint(f.args("A"))).status, "verified");
  assert.equal((await api.commitImplementationCheckpoint(f.args("A"))).committedHead, first.committedHead);
  assert.equal(await f.git("remote"), "");
});

test("COMMIT-01: failed checks do not produce a receipt or stage changes", async (context) => {
  const f = await fixture(context); await f.update("a.js", 3);
  await assert.rejects(f.capture("A"), { code: "CHECKPOINT_CHECK_FAILED" });
  await assert.rejects(readFile(path.join(f.root, f.receiptPath("A"))), { code: "ENOENT" });
  assert.equal(await f.git("diff", "--cached", "--name-only"), "");
});

test("COMMIT-01: unrelated index and mixed hunks are preserved and rejected", async (context) => {
  const f = await fixture(context), api = await helper;
  await f.update("a.js"); await f.capture("A"); await f.update("b.js"); await f.git("add", "b.js");
  const before = await f.git("diff", "--cached", "--binary");
  await assert.rejects(api.commitImplementationCheckpoint(f.args("A")), { code: "CHECKPOINT_FOREIGN_INDEX" });
  assert.equal(await f.git("diff", "--cached", "--binary"), before);
  const mixed = await fixture(context); await mixed.update("a.js", 3); await mixed.git("add", "a.js"); await mixed.update("a.js", 2); await mixed.capture("A");
  await assert.rejects(api.commitImplementationCheckpoint(mixed.args("A")), { code: "CHECKPOINT_MIXED_HUNKS" });
  assert.match(await mixed.git("show", ":a.js"), /value = 3/u);
});

test("ISO/COMMIT-02: another checkout, branch, unknown source and protected branch cannot commit", async (context) => {
  const f = await fixture(context), api = await helper; await f.update("a.js"); await f.capture("A");
  const other = await fixture(context);
  await mkdir(path.dirname(path.join(other.root, f.receiptPath("A"))), { recursive: true, mode: 0o700 });
  await chmod(path.join(other.root, "plans/checkpoints/evidence"), 0o700);
  await writeFile(path.join(other.root, f.receiptPath("A")), await readFile(path.join(f.root, f.receiptPath("A"))), { mode: 0o600 });
  await assert.rejects(api.verifyImplementationCheckpoint(other.args("A")), { code: "CHECKPOINT_INVALID" });
  await f.git("branch", "other"); await f.git("switch", "other");
  await assert.rejects(api.commitImplementationCheckpoint(f.args("A")), { code: "CHECKPOINT_PROTECTED_BRANCH" });
  await f.git("branch", "main"); await f.git("switch", "main");
  await assert.rejects(f.capture("A"), { code: "CHECKPOINT_PROTECTED_BRANCH" });
  const unknown = await fixture(context); await unknown.update("a.js"); await writeFile(path.join(unknown.root, "a.js"), "import './unknown.js';\nexport const value = 2;\n");
  await assert.rejects(unknown.capture("A"), { code: "CHECKPOINT_DEPENDENCY_UNKNOWN" });
});

test("COMMIT-02: hooks changing index or working content require revalidation", async (context) => {
  const f = await fixture(context), api = await helper; await f.update("a.js"); await f.capture("A");
  const hook = path.join(f.root, ".git/hooks/pre-commit");
  await writeFile(hook, "#!/bin/sh\nprintf 'hook changed\\n' >> a.js\ngit add a.js\n", { mode: 0o755 });
  await assert.rejects(api.commitImplementationCheckpoint(f.args("A")), { code: "CHECKPOINT_CONTENT_CHANGED" });
  assert.match(await f.git("show", "HEAD:a.js"), /hook changed/u);
  await assert.rejects(api.commitImplementationCheckpoint(f.args("A")), { code: "CHECKPOINT_CONTENT_CHANGED" });
  const failing = await fixture(context); await failing.update("a.js"); await failing.capture("A");
  await writeFile(path.join(failing.root, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await assert.rejects(api.commitImplementationCheckpoint(failing.args("A")), { code: "CHECKPOINT_COMMIT_FAILED" });
  await assert.rejects(api.commitImplementationCheckpoint(failing.args("A")), { code: "CHECKPOINT_COMMIT_UNCERTAIN" });
});

test("COMMIT-02: uncertain successful response is read back without issuing a second commit", async (context) => {
  const f = await fixture(context), api = await helper; await f.update("a.js"); await f.capture("A");
  let calls = 0;
  const result = await api.commitImplementationCheckpoint({ ...f.args("A"), commitRunner: async (command: string, args: string[], options: object) => { calls++; await exec(command, args, options); throw new Error("response lost"); } });
  assert.equal(result.status, "committed");
  assert.equal((await api.commitImplementationCheckpoint(f.args("A"))).committedHead, result.committedHead);
  assert.equal(calls, 1); assert.equal(await f.git("rev-list", "--count", "HEAD"), "2");
});

test("REUSE/IMPACT-01: same-content later commits reuse without tests; shared source and mode changes invalidate", async (context) => {
  const f = await fixture(context), api = await helper; await f.update("a.js"); await f.capture("A");
  await api.commitImplementationCheckpoint(f.args("A"));
  await f.git("commit", "--allow-empty", "-m", "同内容の来歴を記録");
  assert.equal((await api.verifyImplementationCheckpoint(f.args("A"))).status, "verified");
  await chmod(path.join(f.root, "shared.js"), 0o755);
  await assert.rejects(api.verifyImplementationCheckpoint(f.args("A")), { code: "CHECKPOINT_CONTENT_CHANGED" });
  await chmod(path.join(f.root, "shared.js"), 0o644); await writeFile(path.join(f.root, "shared.js"), "export const shared = 3;\n");
  await assert.rejects(api.verifyImplementationCheckpoint(f.args("A")), { code: "CHECKPOINT_CONTENT_CHANGED" });
});

test("DIGEST-01: failed snapshot race and symlinked evidence cannot become a pass", async (context) => {
  const f = await fixture(context); await f.update("a.js");
  await assert.rejects(f.capture("A", { commandRunner: async () => { await f.update("a.js", 3); return { stdout: "", stderr: "" }; } }), { code: "CHECKPOINT_CONTENT_CHANGED" });
  await f.update("a.js"); const outside = await mkdtemp(path.join(tmpdir(), "checkpoint-outside-")); context.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, path.join(f.root, "plans/checkpoints/evidence"));
  await assert.rejects(f.capture("A"));
  await assert.rejects(readFile(path.join(outside, "A/receipt.json")), { code: "ENOENT" });
});

test("COMMIT-01 CLI emits verified/committed JSON, rejects traversal and has nonzero failure exit", async (context) => {
  const f = await fixture(context); await f.update("a.js"); await f.capture("A");
  const base = [helperPath, "verify", "--goal", goalPath, "--unit", "A", "--receipt", f.receiptPath("A")];
  const verified = JSON.parse((await exec(process.execPath, base, { cwd: f.root })).stdout);
  assert.equal(verified.status, "verified"); assert.equal(verified.committedHead, null);
  const committed = JSON.parse((await exec(process.execPath, [helperPath, "commit", ...base.slice(2), "--message-file", "message.txt"], { cwd: f.root })).stdout);
  assert.equal(committed.status, "committed"); assert.match(committed.committedHead, /^[a-f0-9]{40}$/u);
  await assert.rejects(exec(process.execPath, [helperPath, "verify", "--goal", "../goal.md", "--unit", "A", "--receipt", f.receiptPath("A")], { cwd: f.root }), (error: unknown) => (error as { code: number }).code === 1);
});

test("REUSE-01: changed declared runtime invalidates a passed receipt", async (context) => {
  const f = await fixture(context), api = await helper; await f.update("a.js"); await f.capture("A", { runtime: { fixture: "fixture-one", library: "version-one" } });
  await assert.rejects(api.verifyImplementationCheckpoint({ ...f.args("A"), runtime: { fixture: "fixture-two", library: "version-one" } }), { code: "CHECKPOINT_CONTENT_CHANGED" });
});

test("ISO-01: Git command spy sees zero remote operations during verification and commit", async (context) => {
  const f = await fixture(context), api = await helper;
  const realGit = (await exec("which", ["git"])).stdout.trim();
  const bin = path.join(f.root, "git-spy"); await mkdir(bin);
  const log = path.join(f.root, "remote-calls.log"); await writeFile(log, "");
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  await writeFile(path.join(bin, "git"), `#!/bin/sh\nfor arg in "$@"; do\n case "$arg" in push|fetch|pull|clone|ls-remote) printf '%s\\n' "$arg" >> ${quote(log)}; exit 99;; esac\ndone\nexec ${quote(realGit)} "$@"\n`, { mode: 0o755 });
  const prior = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${prior}`;
  try { await f.update("a.js"); await f.capture("A"); await api.verifyImplementationCheckpoint(f.args("A")); await api.commitImplementationCheckpoint(f.args("A")); }
  finally { process.env.PATH = prior; }
  assert.equal(await readFile(log, "utf8"), "");
});

test("REPAIR-01/02: immutable explanatory inheritance preserves checks and rejects semantic edits", async (context) => {
  const f = await fixture(context), api = await helper;
  const repair = await import(pathToFileURL(path.resolve(import.meta.dirname, "../scripts/goal-clarification.mjs")).href);
  const before = `既存の計算結果を維持する。\n${f.goal}`;
  await writeFile(path.join(f.root, goalPath), before);
  await f.update("a.js"); const receipt = await f.capture("A", { authorization: { basis: "explicit-$implement-invocation", goalDigest: sha(before), allowExplanatoryRestatement: true } });
  const original = await readFile(path.join(f.root, f.receiptPath("A")));
  const after = `${before}\n## 承認済み要件の説明補足\n\n> 既存の計算結果を維持する。\n`;
  await writeFile(path.join(f.root, goalPath), after);
  await assert.rejects(api.verifyImplementationCheckpoint(f.args("A")));
  const input = { repositoryRoot: f.root, goalPath, before, after, invocation: { basis: "explicit-$implement-invocation", goalDigest: sha(before), allowExplanatoryRestatement: true }, invariantBinding: { acceptanceDigest: receipt.acceptanceDigest } };
  const binding = await repair.recordGoalClarification(input);
  assert.equal((await api.verifyImplementationCheckpoint(f.args("A"))).status, "verified");
  assert.deepEqual(await readFile(path.join(f.root, f.receiptPath("A"))), original);
  await assert.rejects(repair.recordGoalClarification(input));
  assert.throws(() => repair.classifyGoalClarification(before, after.replace("> 既存の計算結果を維持する。", "> 権限を拡張する。")), { code: "GOAL_APPROVAL_CHANGED" });
  assert.throws(() => repair.classifyGoalClarification(before, after.replace('"acceptance":', '"relaxed":')), { code: "GOAL_APPROVAL_CHANGED" });
  await writeFile(path.join(f.root, goalPath), after + "期待値を緩和する。\n");
  await assert.rejects(api.verifyImplementationCheckpoint(f.args("A")), { code: "GOAL_APPROVAL_CHANGED" });
  assert.match(binding.path, /goal-clarifications/u);
});
