import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { computePlanHash } from "../scripts/validate-review-data.mjs";

const sourceRoot = path.resolve(import.meta.dirname, "..");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function git(root: string, args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function finalPlan(base: string) {
  return `# 隔離fixture実装計画

## メタデータ

- template_version: 1
- plan_id: e2e-review
- plan_version: 1
- 作成日: 2026-08-27
- base_commit: ${base}
- status: reviewing
- UI変更有無: UI変更なし
- 計画モデル: gpt-5.6-sol / xhigh
- plan承認記録: 2026-08-27 テストfixture承認
- UI承認記録: UI変更なし

## 目的と完了条件

隔離したGit repositoryでreview gateの実動作を確認する。

## 現状と根拠

単体helperだけではrelease gate全体の退行を検出できない。

## 対象範囲

fixture内のfeature fileとreview成果物を対象にする。

## 対象外

外部API、production環境、共有repositoryは変更しない。

## 確定した設計

一時Git repositoryを作り、strict検証とpost-commit検証を実行する。

## UI契約

UI変更なし。review HTML assetのhash一致だけを確認する。

## インターフェースとデータフロー

実diff、review出力、review-dataをvalidatorへ渡す。

## 並列実装計画

| 並列グループ | タスクID | 実装内容 | 担当agent/model | write_set | 実行環境 | 依存タスク | 完了条件 | 検証 |
|---|---|---|---|---|---|---|---|---|
| P1 | T01 | fixture変更 | implementer / gpt-5.6-terra / high | feature.txt | shared | なし | validator成功 | node test |

書き込みは隔離fixture内で直列実行する。

## 進捗管理

### 実装タスク

- [x] T01: fixture変更 — 完了条件: validator成功 — 検証: node test成功

### ゲート

- [x] G01: plan内容の確認・承認完了
- [x] G02: UI prototypeの承認完了、または「UI変更なし」を確認
- [x] G03: 実装コードと自動検証完了
- [ ] G04: 二段階HTMLレビュー完了、または非該当理由確認
- [ ] G05: 必要な実画面・動作確認完了
- [ ] G06: commit・push・PR反映確認完了

## 実行記録

隔離fixture内で実行する。

## 検証計画

strict検証とpost-commit検証を実行する。

## リスクとロールバック

一時directoryだけを削除して戻す。

## 前提と未決事項

なし。
`;
}

async function createFixture(options: { caseRenamed?: boolean; excluded?: boolean; filtered?: boolean; secondReviewed?: boolean; untracked?: boolean; renamed?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "codex-review-gate-"));
  const canonical = path.join(root, ".agents/skills/implementation-review/assets/review-report");
  const report = path.join(root, "plans/tmp/e2e-review/implementation-review");
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(canonical, { recursive: true });
  await mkdir(report, { recursive: true });
  await Promise.all([
    cp(path.join(sourceRoot, "scripts/validate-plan-file.mjs"), path.join(root, "scripts/validate-plan-file.mjs")),
    cp(path.join(sourceRoot, "scripts/validate-review-data.mjs"), path.join(root, "scripts/validate-review-data.mjs")),
    ...["app.js", "index.html", "styles.css", "review-data-schema.js"].map((name) => cp(path.join(sourceRoot, ".agents/skills/implementation-review/assets/review-report", name), path.join(canonical, name))),
  ]);
  await Promise.all([
    writeFile(path.join(root, "package.json"), '{"type":"module"}\n'),
    writeFile(path.join(root, ".gitignore"), "/plans/tmp/\n"),
    writeFile(path.join(root, ".gitattributes"), "normalized.txt text eol=lf\n"),
    writeFile(path.join(root, "feature.txt"), "before\n"),
    writeFile(path.join(root, "excluded.txt"), "before\n"),
    writeFile(path.join(root, "normalized.txt"), "before\n"),
    writeFile(path.join(root, "rename-old.txt"), "renamed content\n"),
  ]);
  git(root, ["init", "-b", "review-fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  git(root, ["config", "user.name", "Review Fixture"]);
  git(root, ["add", "--", ".agents", ".gitattributes", ".gitignore", "excluded.txt", "feature.txt", "normalized.txt", "package.json", "rename-old.txt", "scripts"]);
  git(root, ["commit", "-m", "fixture baseline"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  git(root, ["update-ref", "refs/remotes/origin/main", base]);
  await writeFile(path.join(root, "feature.txt"), "after\n");
  if (options.excluded || options.secondReviewed) await writeFile(path.join(root, "excluded.txt"), "excluded after\n");
  if (options.filtered) await writeFile(path.join(root, "normalized.txt"), "after\r\n");
  if (options.untracked) {
    await writeFile(path.join(root, "new-file.txt"), "new content\n");
    await writeFile(path.join(root, "new-executable.sh"), "#!/bin/sh\nexit 0\n");
    await chmod(path.join(root, "new-executable.sh"), 0o755);
  }
  if (options.renamed) await rename(path.join(root, "rename-old.txt"), path.join(root, "rename-new.txt"));
  if (options.caseRenamed) git(root, ["mv", "-f", "--", "rename-old.txt", "RENAME-OLD.txt"]);

  const plan = finalPlan(base);
  await writeFile(path.join(root, "plans/tmp/e2e-review/final.md"), plan);
  await Promise.all(["app.js", "index.html", "styles.css", "review-data-schema.js"].map((name) => cp(path.join(canonical, name), path.join(report, name))));

  const reviewedPaths = [
    ...(options.secondReviewed ? ["excluded.txt"] : []),
    "feature.txt",
    ...(options.filtered ? ["normalized.txt"] : []),
    ...(options.untracked ? ["new-executable.sh", "new-file.txt"] : []),
    ...(options.renamed ? ["rename-new.txt", "rename-old.txt"] : []),
    ...(options.caseRenamed ? ["RENAME-OLD.txt", "rename-old.txt"] : []),
  ].sort();
  git(root, ["add", "--", ...reviewedPaths]);
  const remoteBase = { ref: "origin/main", oid: base };
  const validations = [{ command: "fixture validation", status: "passed", summary: "成功" }];
  const snapshotProgram = "import { readFile } from 'node:fs/promises'; import { computeReviewInputHashes, computeReviewSnapshot } from './scripts/validate-review-data.mjs'; const paths=JSON.parse(process.argv[2]); const attestation=JSON.parse(process.argv[4]); const value=await computeReviewSnapshot(process.argv[1],paths); const inputs=computeReviewInputHashes(process.argv[1],paths,await readFile(process.argv[3],'utf8'),attestation); process.stdout.write(JSON.stringify({ diffHash:value.diffHash,pathHashes:Object.fromEntries(value.pathHashes),inputs }));";
  const snapshot = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", snapshotProgram, base, JSON.stringify(reviewedPaths), "plans/tmp/e2e-review/final.md", JSON.stringify({ remoteBase, validations })], { cwd: root, encoding: "utf8" })) as { diffHash: string; pathHashes: Record<string, string>; inputs: { diff: string; context: string; plan: string; validations: string; remoteBase: string } };
  const diffHash = snapshot.diffHash;
  const planHash = computePlanHash(plan);
  const runId = randomUUID();
  const blindInputs = { diff: snapshot.inputs.diff, context: snapshot.inputs.context };
  const blind = { runId, diffHash, inputHashes: blindInputs, source: "blind", summary: "指摘なし", findings: [] };
  const conformance = { runId, diffHash, planHash, inputHashes: snapshot.inputs, source: "conformance", summary: "適合", findings: [] };
  const blindText = `${JSON.stringify(blind, null, 2)}\n`;
  const conformanceText = `${JSON.stringify(conformance, null, 2)}\n`;
  await Promise.all([
    writeFile(path.join(report, "blind-review.json"), blindText),
    writeFile(path.join(report, "plan-conformance-review.json"), conformanceText),
  ]);
  const assetHashes = Object.fromEntries(await Promise.all(["index.html", "styles.css", "app.js", "review-data-schema.js"].map(async (name) => [name, sha256(await readFile(path.join(canonical, name)))])));
  const excludedHash = options.excluded ? snapshot.pathHashes["excluded.txt"] : null;
  const data = {
    title: "隔離fixture実装レビュー",
    generatedAt: "2026-08-27T12:00:00+09:00",
    runId,
    base,
    head: base,
    remoteBase,
    diffHash,
    planHash,
    assetHashes,
    summary: "release gateを隔離fixtureで確認",
    stats: { files: reviewedPaths.length, intentGroups: 1, findings: 0, validationsPassed: 1 },
    reviewedPaths,
    excludedPaths: excludedHash ? [{ path: "excluded.txt", reason: "fixtureの対象外変更", snapshotHash: excludedHash }] : [],
    findingResolutions: [],
    reviewPasses: [
      { source: "blind", role: "blind_diff_reviewer", model: "gpt-5.6-sol", reasoningEffort: "xhigh", inputHashes: blindInputs, outputFile: "blind-review.json", outputHash: sha256(blindText), evidence: ["隔離fixtureのblind review"] },
      { source: "conformance", role: "plan_conformance_reviewer", model: "gpt-5.6-sol", reasoningEffort: "xhigh", inputHashes: snapshot.inputs, outputFile: "plan-conformance-review.json", outputHash: sha256(conformanceText), evidence: ["隔離fixtureのplan照合"] },
    ],
    validations,
    groups: [{ id: "fixture-change", title: "fixture変更", summary: "review gateを確認", risk: "none", blastRadius: "隔離fixtureのみ", files: reviewedPaths, locations: reviewedPaths.map((relative) => relative === "rename-old.txt" ? `${relative}@base:1` : `${relative}:1`), findings: [], planDeviations: [], evidence: ["Git diff"] }],
  };
  await writeFile(path.join(report, "review-data.json"), `${JSON.stringify(data, null, 2)}\n`);
  return { root, report };
}

function validate(root: string, postCommit = false) {
  return spawnSync(process.execPath, ["scripts/validate-review-data.mjs", "plans/tmp/e2e-review/implementation-review", "plans/tmp/e2e-review/final.md", ...(postCommit ? ["--post-commit"] : [])], { cwd: root, encoding: "utf8" });
}

test("review release gateは隔離Git fixtureでstrict・post-commitを通す", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  const planPath = path.join(fixture.root, "plans/tmp/e2e-review/final.md");
  const progressedPlan = (await readFile(planPath, "utf8"))
    .replace("- status: reviewing", "- status: delivery_ready")
    .replace("- [ ] G04:", "- [x] G04:")
    .replace("- [ ] G05:", "- [x] G05:")
    .replace("隔離fixture内で実行する。", "隔離fixture内で実行する。G04のreview証拠を記録した。");
  await writeFile(planPath, progressedPlan);
  git(fixture.root, ["add", "--", "feature.txt"]);
  git(fixture.root, ["commit", "-m", "reviewed change"]);
  assert.equal(validate(fixture.root, true).status, 0);
  await writeFile(path.join(fixture.report, "blind-review.json"), "{}\n");
  assert.notEqual(validate(fixture.root, true).status, 0);
});

test("post-commit gateは対象外pathのshippingを拒否する", async (context) => {
  const fixture = await createFixture({ excluded: true });
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  git(fixture.root, ["add", "--", "excluded.txt", "feature.txt"]);
  git(fixture.root, ["commit", "-m", "mixed change"]);
  const result = validate(fixture.root, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot exclude paths/);
});

test("strict gateはcanonical Browser assetを対象外差分として扱わない", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const relative = ".agents/skills/implementation-review/assets/review-report/app.js";
  const canonicalPath = path.join(fixture.root, relative);
  const reportPath = path.join(fixture.report, "app.js");
  const changed = `${await readFile(canonicalPath, "utf8")}\n// unreviewed fixture change\n`;
  await Promise.all([writeFile(canonicalPath, changed), writeFile(reportPath, changed)]);
  git(fixture.root, ["add", "--", relative]);

  const dataPath = path.join(fixture.report, "review-data.json");
  const data = JSON.parse(await readFile(dataPath, "utf8")) as { base: string; excludedPaths: Array<{ path: string; reason: string; snapshotHash: string }> };
  const snapshotProgram = "import { computeReviewSnapshot } from './scripts/validate-review-data.mjs'; const value=await computeReviewSnapshot(process.argv[1]); process.stdout.write(JSON.stringify(Object.fromEntries(value.pathHashes)));";
  const pathHashes = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", snapshotProgram, data.base], { cwd: fixture.root, encoding: "utf8" })) as Record<string, string>;
  data.excludedPaths = [{ path: relative, reason: "canonical assetを対象外にする試行", snapshotHash: pathHashes[relative] }];
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);

  const result = validate(fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical review asset cannot be excluded/);
});

test("post-commit gateはreview済み変更のpartial commitを拒否する", async (context) => {
  const fixture = await createFixture({ secondReviewed: true });
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  git(fixture.root, ["restore", "--staged", "--", "excluded.txt"]);
  git(fixture.root, ["commit", "-m", "partial change"]);
  const result = validate(fixture.root, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires a clean/);
});

test("canonical snapshotはstaged-only pathとindex blobの変更を検出する", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const base = git(fixture.root, ["rev-parse", "HEAD"]);
  await writeFile(path.join(fixture.root, "feature.txt"), "before\n");
  const snapshotProgram = "import { computeReviewSnapshot } from './scripts/validate-review-data.mjs'; const value = await computeReviewSnapshot(process.argv[1]); process.stdout.write(JSON.stringify({ diffHash: value.diffHash, inventory: value.inventory }));";
  const first = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", snapshotProgram, base], { cwd: fixture.root, encoding: "utf8" })) as { diffHash: string; inventory: string[] };
  assert.deepEqual(first.inventory, ["feature.txt"]);

  await writeFile(path.join(fixture.root, "feature.txt"), "different staged content\n");
  git(fixture.root, ["add", "--", "feature.txt"]);
  await writeFile(path.join(fixture.root, "feature.txt"), "before\n");
  const second = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", snapshotProgram, base], { cwd: fixture.root, encoding: "utf8" })) as { diffHash: string; inventory: string[] };
  assert.deepEqual(second.inventory, ["feature.txt"]);
  assert.notEqual(second.diffHash, first.diffHash);
  const result = validate(fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fully staged/);
});

test("release gateはreviewerへ渡すinput artifact hashの改変を拒否する", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const dataPath = path.join(fixture.report, "review-data.json");
  const data = JSON.parse(await readFile(dataPath, "utf8")) as { reviewPasses: Array<{ inputHashes: { diff: string } }> };
  data.reviewPasses[0].inputHashes.diff = "f".repeat(64);
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  const result = validate(fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /input artifact hash is stale/);
});

test("release gateはreview後の検証証拠改変を拒否する", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const dataPath = path.join(fixture.report, "review-data.json");
  const data = JSON.parse(await readFile(dataPath, "utf8")) as { validations: Array<{ summary: string }> };
  data.validations[0].summary = "review後に成功扱いへ改変";
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  const result = validate(fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /input artifact hash is stale/);
});

test("release gateはrecord済みremote baseの改変を拒否する", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const dataPath = path.join(fixture.report, "review-data.json");
  const data = JSON.parse(await readFile(dataPath, "utf8")) as { remoteBase: { oid: string } };
  data.remoteBase.oid = "f".repeat(40);
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  const result = validate(fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /remote base evidence/);
});

test("canonical snapshotは新規・実行bit・renameをcommit前後で同一視する", async (context) => {
  const fixture = await createFixture({ untracked: true, renamed: true });
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  git(fixture.root, ["commit", "-m", "new and renamed files"]);
  const result = validate(fixture.root, true);
  assert.equal(result.status, 0, result.stderr);
});

test("post-commit gateはreview後の複数commitと途中だけの変更を拒否する", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  git(fixture.root, ["add", "--", "feature.txt"]);
  git(fixture.root, ["commit", "-m", "reviewed change"]);
  await writeFile(path.join(fixture.root, "transient.txt"), "temporary\n");
  git(fixture.root, ["add", "--", "transient.txt"]);
  git(fixture.root, ["commit", "-m", "temporary add"]);
  await rm(path.join(fixture.root, "transient.txt"));
  git(fixture.root, ["add", "--", "transient.txt"]);
  git(fixture.root, ["commit", "-m", "temporary delete"]);
  const result = validate(fixture.root, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exactly one direct shipping commit/);
});

test("post-commit gateは秘密情報らしいcommit messageを拒否する", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  git(fixture.root, ["add", "--", "feature.txt"]);
  git(fixture.root, ["commit", "-m", "reviewed change", "-m", "token=fixture-secret-value"]);
  const result = validate(fixture.root, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /commit message contains unsafe content/);
});

test("canonical snapshotはEOL filter後の予定blobとHEAD blobを照合する", async (context) => {
  const fixture = await createFixture({ filtered: true });
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  git(fixture.root, ["add", "--", "feature.txt", "normalized.txt"]);
  git(fixture.root, ["commit", "-m", "filtered change"]);
  const result = validate(fixture.root, true);
  assert.equal(result.status, 0, result.stderr);
});

test("strict gateは既にcommit済みのtask差分をplan-driven経路で受理しない", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  git(fixture.root, ["add", "--", "feature.txt"]);
  git(fixture.root, ["commit", "-m", "already committed"]);
  const dataPath = path.join(fixture.report, "review-data.json");
  const data = JSON.parse(await readFile(dataPath, "utf8")) as { head: string };
  data.head = git(fixture.root, ["rev-parse", "HEAD"]);
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  const result = validate(fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /uncommitted task diff/);
});

test("canonical snapshotはcase-only renameを正確なGit path名で扱う", async (context) => {
  const fixture = await createFixture({ caseRenamed: true });
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(validate(fixture.root).status, 0);
  git(fixture.root, ["add", "--", "RENAME-OLD.txt", "feature.txt", "rename-old.txt"]);
  git(fixture.root, ["commit", "-m", "case-only rename"]);
  const result = validate(fixture.root, true);
  assert.equal(result.status, 0, result.stderr);
});
