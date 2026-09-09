import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { invalidPlanArtifacts, verifyPlanArtifacts, verifyPlanIndex, verifyPlanTree } from "../scripts/verify-plan-artifacts.mjs";

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

test("template以外のplans生成物と単数形plan pathをindexからの除外対象として拒否する", () => {
  const tracked = [
    "plan/example/goal.md",
    "plans/example/prototype/index.html",
    "plans/example/goal.md",
  ];
  assert.deepEqual(invalidPlanArtifacts(tracked), tracked);
  assert.throws(
    () => verifyPlanArtifacts(tracked),
    /Remove these paths from the index; preserve local files:[\s\S]*plan\/example\/goal\.md[\s\S]*plans\/example\/prototype\/index\.html[\s\S]*plans\/example\/goal\.md/,
  );
});

async function runGuard(root: string) {
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await cp(path.resolve(import.meta.dirname, "../scripts/verify-plan-artifacts.mjs"), path.join(root, "scripts/verify-plan-artifacts.mjs"));
  return execFileAsync(process.execPath, ["scripts/verify-plan-artifacts.mjs"], { cwd: root });
}

test("G-01: CLIは複数planと補助fixtureを保全しtemplateのstaged変更を受け入れる", async (context) => {
  const root = await createTreeFixture(context);
  const files = ["plans/current/goal.md", "plans/other/prototype/index.html", "plans/fixture/input\nwith-space.txt", "plan/local-note.md"];
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), `${file}\n`);
  }
  await writeFile(path.join(root, "plans/template.md"), "revised template\n");
  await execFileAsync("git", ["add", "--", "plans/template.md"], { cwd: root });
  assert.deepEqual(verifyPlanIndex({ repositoryRoot: root }), { status: "pass", entries: ["plans/template.md"] });
  const before = await execFileAsync("git", ["diff", "--cached", "--binary"], { cwd: root });
  assert.match((await runGuard(root)).stdout, /local plans are preserved/u);
  assert.equal((await execFileAsync("git", ["diff", "--cached", "--binary"], { cwd: root })).stdout, before.stdout);
  for (const file of files) assert.equal(await readFile(path.join(root, file), "utf8"), `${file}\n`);
});

test("G-01: CLIはstage済み生成物とlegacy追跡を非0終了で拒否し実ファイルを保持する", async (context) => {
  for (const file of ["plans/current/goal.md", "plan/legacy.md", "plans/new\nline.md"]) {
    const root = await createTreeFixture(context);
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), "preserved\n");
    await execFileAsync("git", ["add", "--", file], { cwd: root });
    await assert.rejects(runGuard(root), (error: { code?: number; stderr?: string }) => error.code === 1 && Boolean(error.stderr?.includes("preserve local files")));
    assert.equal(await readFile(path.join(root, file), "utf8"), "preserved\n");
  }
});

test("index guardはtemplate欠落・symlink・unmerged stageを拒否する", async (context) => {
  const root = await createTreeFixture(context);
  await execFileAsync("git", ["rm", "--cached", "plans/template.md"], { cwd: root });
  assert.throws(() => verifyPlanIndex({ repositoryRoot: root }), /regular, resolved file/u);
  await rm(path.join(root, "plans/template.md"));
  await writeFile(path.join(root, "target.md"), "template\n");
  await symlink("../target.md", path.join(root, "plans/template.md"));
  await execFileAsync("git", ["add", "--", "plans/template.md"], { cwd: root });
  assert.throws(() => verifyPlanIndex({ repositoryRoot: root }), /regular, resolved file/u);

  const conflict = await createTreeFixture(context);
  await execFileAsync("git", ["switch", "-qc", "other"], { cwd: conflict });
  await writeFile(path.join(conflict, "plans/template.md"), "other\n");
  await execFileAsync("git", ["commit", "-qam", "other template"], { cwd: conflict });
  await execFileAsync("git", ["checkout", "-q", "HEAD~1"], { cwd: conflict });
  await writeFile(path.join(conflict, "plans/template.md"), "ours\n");
  await execFileAsync("git", ["commit", "-qam", "our template"], { cwd: conflict });
  await assert.rejects(execFileAsync("git", ["merge", "--no-edit", "other"], { cwd: conflict }));
  assert.throws(() => verifyPlanIndex({ repositoryRoot: conflict }), /regular, resolved file/u);
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
