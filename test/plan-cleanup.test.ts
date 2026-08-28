import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { cleanupPlanFiles, parsePlanCleanupArgs } from "../scripts/cleanup-plan-files.mjs";

async function createFixture(context: test.TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "plan-cleanup-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(path.join(root, "plans/example/prototype"), { recursive: true }),
    mkdir(path.join(root, "plans/example/review"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, "plans/template.md"), "canonical template\n"),
    writeFile(path.join(root, "plans/example/goal.md"), "canonical goal\n"),
    writeFile(path.join(root, "plans/example/prototype/index.html"), "<!doctype html>\n"),
    writeFile(path.join(root, "plans/example/review/review-data.json"), "{}\n"),
    writeFile(path.join(root, "plans/top-level-plan.md"), "top-level plan\n"),
  ]);
  return root;
}

test("previewはcanonical goal・prototype・reviewとtop-level planを安定順で列挙し、変更しない", async (context) => {
  const root = await createFixture(context);
  const observed: string[][] = [];
  const result = await cleanupPlanFiles({ repositoryRoot: root, onCandidates: (items) => observed.push(items) });

  const expected = [
    "plans/example/",
    "plans/example/goal.md",
    "plans/example/prototype/",
    "plans/example/prototype/index.html",
    "plans/example/review/",
    "plans/example/review/review-data.json",
    "plans/top-level-plan.md",
  ];
  assert.deepEqual(result, { candidates: expected, removed: [] });
  assert.deepEqual(observed, [expected]);
  assert.equal(await readFile(path.join(root, "plans/template.md"), "utf8"), "canonical template\n");
  assert.equal(await readFile(path.join(root, "plans/example/goal.md"), "utf8"), "canonical goal\n");
  assert.equal(await readFile(path.join(root, "plans/example/prototype/index.html"), "utf8"), "<!doctype html>\n");
  assert.equal(await readFile(path.join(root, "plans/example/review/review-data.json"), "utf8"), "{}\n");
  assert.equal(await readFile(path.join(root, "plans/top-level-plan.md"), "utf8"), "top-level plan\n");
});

test("applyはtemplateだけを保持し、symlinkの参照先を変更しない", async (context) => {
  const root = await createFixture(context);
  const outside = path.join(root, "outside.txt");
  await writeFile(outside, "outside target\n");
  await symlink(outside, path.join(root, "plans/outside-link"));

  const result = await cleanupPlanFiles({ repositoryRoot: root, apply: true });

  assert.deepEqual(await readdir(path.join(root, "plans")), ["template.md"]);
  assert.equal(await readFile(path.join(root, "plans/template.md"), "utf8"), "canonical template\n");
  assert.equal(await readFile(outside, "utf8"), "outside target\n");
  assert.deepEqual(result.removed, [
    "plans/example/",
    "plans/outside-link",
    "plans/top-level-plan.md",
  ]);
});

test("template欠落時は候補を一切削除しない", async (context) => {
  const root = await createFixture(context);
  await rm(path.join(root, "plans/template.md"));

  await assert.rejects(cleanupPlanFiles({ repositoryRoot: root, apply: true }), /plans\/template\.md is unavailable/);
  assert.equal(await readFile(path.join(root, "plans/example/goal.md"), "utf8"), "canonical goal\n");
  assert.equal(await readFile(path.join(root, "plans/top-level-plan.md"), "utf8"), "top-level plan\n");
});

test("templateまたはplans directoryのsymlinkを拒否する", async (context) => {
  const templateRoot = await createFixture(context);
  const outsideTemplate = path.join(templateRoot, "outside-template.md");
  await writeFile(outsideTemplate, "outside template\n");
  await rm(path.join(templateRoot, "plans/template.md"));
  await symlink(outsideTemplate, path.join(templateRoot, "plans/template.md"));

  await assert.rejects(cleanupPlanFiles({ repositoryRoot: templateRoot, apply: true }), /plans\/template\.md must be a regular file, not a symlink/);
  assert.equal(await readFile(path.join(templateRoot, "plans/example/goal.md"), "utf8"), "canonical goal\n");
  assert.equal(await readFile(path.join(templateRoot, "plans/top-level-plan.md"), "utf8"), "top-level plan\n");
  assert.equal(await readFile(outsideTemplate, "utf8"), "outside template\n");

  const plansRoot = await mkdtemp(path.join(tmpdir(), "plan-cleanup-symlink-"));
  context.after(() => rm(plansRoot, { recursive: true, force: true }));
  const outsidePlans = path.join(plansRoot, "outside-plans");
  await mkdir(outsidePlans);
  await writeFile(path.join(outsidePlans, "template.md"), "outside plans template\n");
  await symlink(outsidePlans, path.join(plansRoot, "plans"));

  await assert.rejects(cleanupPlanFiles({ repositoryRoot: plansRoot, apply: true }), /plans directory must be a real directory, not a symlink/);
  assert.equal(await readFile(path.join(outsidePlans, "template.md"), "utf8"), "outside plans template\n");
});

test("候補なしのapplyは成功し、再実行できる", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "plan-cleanup-empty-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "plans"));
  await writeFile(path.join(root, "plans/template.md"), "canonical template\n");

  assert.deepEqual(await cleanupPlanFiles({ repositoryRoot: root, apply: true }), { candidates: [], removed: [] });
  assert.deepEqual(await cleanupPlanFiles({ repositoryRoot: root, apply: true }), { candidates: [], removed: [] });
});

test("不明な引数を拒否し、部分完了時は削除済みentryと失敗entryを報告する", async (context) => {
  assert.deepEqual(parsePlanCleanupArgs([]), { apply: false });
  assert.deepEqual(parsePlanCleanupArgs(["--apply"]), { apply: true });
  assert.throws(() => parsePlanCleanupArgs(["--yes"]), /usage:/);
  assert.throws(() => parsePlanCleanupArgs(["--apply", "plans\/reviews"]), /usage:/);

  const root = await mkdtemp(path.join(tmpdir(), "plan-cleanup-partial-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "plans"));
  await Promise.all([
    writeFile(path.join(root, "plans/template.md"), "canonical template\n"),
    writeFile(path.join(root, "plans/a.md"), "first\n"),
    writeFile(path.join(root, "plans/b.md"), "second\n"),
  ]);
  let calls = 0;
  const remove: typeof rm = async (target, options) => {
    calls += 1;
    if (calls === 2) throw new Error("fixture failure");
    await rm(target, options);
  };

  await assert.rejects(
    cleanupPlanFiles({ repositoryRoot: root, apply: true, remove }),
    /removed: plans\/a\.md; failed: plans\/b\.md: fixture failure/,
  );
  await assert.rejects(lstat(path.join(root, "plans/a.md")), { code: "ENOENT" });
  assert.equal(await readFile(path.join(root, "plans/b.md"), "utf8"), "second\n");
  assert.equal(await readFile(path.join(root, "plans/template.md"), "utf8"), "canonical template\n");
});
