import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  MAX_GOAL_BYTES,
  commitMessageFromRaw,
  createArchiveMessage,
  parseArchiveMessage,
  resolveGoal,
  sha256,
  verifyCommitArchive,
  verifyHistory,
} from "../scripts/plan-commit-archive.mjs";

const execFileAsync = promisify(execFile);
const goal = `# 目的と完了条件

日本語の目的です。

# 現状と根拠

# 実装方針

# インターフェースとデータフロー

# テスト計画

# 前提・対象外・リスク
`;

async function fixture(context: test.TestContext) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "plan-archive-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "plans/example"), { recursive: true });
  await writeFile(path.join(root, "plans/template.md"), "template\n");
  await writeFile(path.join(root, "plans/example/goal.md"), goal);
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Plan Archive Test"], { cwd: root });
  await execFileAsync("git", ["add", "plans/template.md"], { cwd: root });
  await execFileAsync("git", ["commit", "-qm", "chore: fixture"], { cwd: root });
  return root;
}

test("GOAL-ARCHIVE-01: goalのUTF-8 bytesと最終改行をraw commitへそのまま保存する", async (context) => {
  const root = await fixture(context);
  const source = await readFile(path.join(root, "plans/example/goal.md"));
  const message = createArchiveMessage({
    subject: "feat: goalを保存する",
    goalPath: "plans/example/goal.md",
    goalBytes: source,
  });
  const messagePath = path.join(root, "..", `${path.basename(root)}-message.txt`);
  context.after(() => rm(messagePath, { force: true }));
  await writeFile(messagePath, message, { mode: 0o600 });
  await execFileAsync("git", ["commit", "--allow-empty", "--cleanup=verbatim", "-F", messagePath], { cwd: root });

  const commit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const result = await verifyCommitArchive({ repositoryRoot: root, commit, goalPath: "plans/example/goal.md" });
  assert.equal(result.goalSha256, sha256(source));
  const raw = execFileSync("git", ["cat-file", "commit", commit], { cwd: root, encoding: "buffer" });
  const parsed = parseArchiveMessage(commitMessageFromRaw(raw));
  assert.deepEqual(parsed.goalBytes, source);
  assert.equal(parsed.goalBytes.at(-1), 10);
  assert.deepEqual((await verifyHistory({ repositoryRoot: root, base: "HEAD^", head: "HEAD", requiredGoalSha256: sha256(source) })).archives.length, 1);
});

test("GOAL-ARCHIVE-02: metadata改変、payload切詰め、上限超過、secret、symlinkを拒否する", async (context) => {
  const bytes = Buffer.from(goal);
  const message = createArchiveMessage({ subject: "feat: fixture", goalPath: "plans/example/goal.md", goalBytes: bytes });
  assert.throws(() => parseArchiveMessage(message.subarray(0, message.length - 1)), /byte length/u);
  assert.throws(
    () => parseArchiveMessage(Buffer.from(message.toString("utf8").replace(`Codex-Goal-SHA256: ${sha256(bytes)}`, `Codex-Goal-SHA256: ${"0".repeat(64)}`))),
    /SHA-256/u,
  );
  assert.throws(
    () => createArchiveMessage({ subject: "feat: fixture", goalPath: "plans/example/goal.md", goalBytes: Buffer.concat([bytes, Buffer.alloc(MAX_GOAL_BYTES)]) }),
    /1048576/u,
  );
  assert.throws(
    () => createArchiveMessage({ subject: "feat: fixture", goalPath: "plans/example/goal.md", goalBytes: Buffer.from(goal.replace("日本語の目的です。", "api_key = abcdefghijklmnopqrstuvwxyz")) }),
    /secret/u,
  );

  const root = await fixture(context);
  const outside = path.join(root, "outside.md");
  await writeFile(outside, goal);
  await rm(path.join(root, "plans/example/goal.md"));
  await symlink(outside, path.join(root, "plans/example/goal.md"));
  await assert.rejects(resolveGoal(root, "plans/example/goal.md"), /symlink/u);
  await assert.rejects(resolveGoal(root, "../outside.md"), /repository-relative|plans/u);
});
