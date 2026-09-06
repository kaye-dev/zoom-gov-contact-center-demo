import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { invalidPlanArtifacts, verifyPlanArtifacts, verifyPlanTree } from "../scripts/verify-plan-artifacts.mjs";

const execFileAsync = promisify(execFile);

async function createTreeFixture(context: test.TestContext) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "plan-tree-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "plans"));
  await writeFile(path.join(root, "plans/template.md"), "template\n");
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Plan Tree Test"], { cwd: root });
  await execFileAsync("git", ["add", "plans/template.md"], { cwd: root });
  await execFileAsync("git", ["commit", "-qm", "chore: fixture"], { cwd: root });
  return root;
}

test("plans/template.mdだけを追跡可能なplan pathとして受け入れる", () => {
  const tracked = ["README.md", "plans/template.md", "src/example.ts"];
  assert.deepEqual(invalidPlanArtifacts(tracked), []);
  assert.deepEqual(verifyPlanArtifacts(tracked), []);
});

test("template以外のplans生成物と単数形plan pathを削除対象として拒否する", () => {
  const tracked = [
    "plan/example/goal.md",
    "plans/example/prototype/index.html",
    "plans/example/goal.md",
  ];
  assert.deepEqual(invalidPlanArtifacts(tracked), tracked);
  assert.throws(
    () => verifyPlanArtifacts(tracked),
    /Delete these plan artifacts:[\s\S]*plan\/example\/goal\.md[\s\S]*plans\/example\/prototype\/index\.html[\s\S]*plans\/example\/goal\.md/,
  );
});

test("PLAN-TREE-01: regular tracked plans/template.mdだけのtreeを受け入れる", async (context) => {
  const root = await createTreeFixture(context);
  assert.deepEqual(await verifyPlanTree({ repositoryRoot: root }), { status: "pass", entries: ["plans/template.md"] });
});

test("PLAN-TREE-02/03: extra fileと空directoryを追跡状態によらず拒否する", async (context) => {
  const fileRoot = await createTreeFixture(context);
  await writeFile(path.join(fileRoot, "plans/goal.md"), "temporary\n");
  await assert.rejects(verifyPlanTree({ repositoryRoot: fileRoot }), /plans\/goal\.md \(file\)/u);

  const directoryRoot = await createTreeFixture(context);
  await mkdir(path.join(directoryRoot, "plans/empty"));
  await assert.rejects(verifyPlanTree({ repositoryRoot: directoryRoot }), /plans\/empty \(directory\)/u);
});

test("PLAN-TREE-04/05: symlink、template欠落、legacy planを拒否する", async (context) => {
  const symlinkRoot = await createTreeFixture(context);
  await symlink(path.join(symlinkRoot, "plans/template.md"), path.join(symlinkRoot, "plans/link"));
  await assert.rejects(verifyPlanTree({ repositoryRoot: symlinkRoot }), /plans\/link \(symlink\)/u);

  const missingRoot = await createTreeFixture(context);
  await rm(path.join(missingRoot, "plans/template.md"));
  await assert.rejects(verifyPlanTree({ repositoryRoot: missingRoot }), /template\.md is required/u);

  const legacyRoot = await createTreeFixture(context);
  await mkdir(path.join(legacyRoot, "plan"));
  await assert.rejects(verifyPlanTree({ repositoryRoot: legacyRoot }), /legacy plan\//u);
});
