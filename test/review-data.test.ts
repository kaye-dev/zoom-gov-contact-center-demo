import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { containsSensitiveText, normalizeData, overallStatus } from "../.agents/skills/implementation-review/assets/review-report/review-data-schema.js";
import { sortFindings } from "../.agents/skills/implementation-review/assets/review-report/app.js";
import { computePlanHash, computeReviewSnapshot, parseChangedRanges, validateFindingResolutions, validateNormalizedReviewOutput, validateReviewPlanBinding } from "../scripts/validate-review-data.mjs";

const root = path.resolve(import.meta.dirname, "..");
const asset = (name: string) => readFile(path.join(root, ".agents/skills/implementation-review/assets/review-report", name), "utf8");

test("HTML review templateはrisk filter・人間コメント・まとめてcopyを備える", async () => {
  const [html, app] = await Promise.all([asset("index.html"), asset("app.js")]);
  assert.match(html, /data-filter="high"/);
  assert.match(html, /data-filter="medium"/);
  assert.match(html, /data-decision-count="adopted"/);
  assert.match(html, /id="generate-feedback"/);
  assert.match(html, /id="copy-feedback"/);
  assert.match(html, /id="excluded-paths"/);
  assert.match(app, /element\("textarea"/);
  assert.match(app, /\["adopted", "採用"\]/);
  assert.match(app, /\["rejected", "却下"\]/);
  assert.match(app, /\["unresolved", "未確定"\]/);
  assert.match(app, /人間コメント/);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.match(app, /aria-pressed/);
  assert.match(app, /snapshot sha256/);
});

test("review UIはuntrusted dataをDOM textとして扱い、invalid dataをfail closedにする", async () => {
  const app = await asset("app.js");
  assert.match(app, /textContent/);
  assert.doesNotMatch(app, /innerHTML|eval\(|new Function/);
  assert.match(app, /データ不正/);
  assert.match(app, /不正なreview-data\.jsonのため、指摘なしとは判定しません/);
});

test("Browserとvalidatorで共有するsecret検査は現行token prefixを拒否する", () => {
  const slackToken = ["xoxb", "1234567890", "abcdefghijklmnopqrstuvwxyz"].join("-");
  for (const token of [
    "sk-proj-abcdefghijklmnopqrstuvwxyz",
    "sk-abcdefghijklmnopqrstuvwxyz",
    "github_pat_abcdefghijklmnopqrstuvwxyz",
    slackToken,
    "glpat-abcdefghijklmnopqrstuvwxyz",
    "DATABASE_URL=postgresql://demo:example-password@db.invalid/app",
    "AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz1234567890ABCD",
    "AIzaabcdefghijklmnopqrstuvwxyz123456789",
    "eyJabcdefghijk.abcdefghijklmnop.qrstuvwxyz012345",
  ]) assert.equal(containsSensitiveText(token), true, token);
  assert.equal(containsSensitiveText("通常のreview本文"), false);
});

test("tracked review-dataは二段階reviewを要求する未置換templateである", async () => {
  const raw = await asset("review-data.json");
  const data = JSON.parse(raw) as { runId: string; stats: { files: number }; reviewPasses: unknown[]; groups: unknown[] };
  assert.equal(data.runId, "UNREPLACED_TEMPLATE");
  assert.equal(data.stats.files, -1);
  assert.deepEqual(data.reviewPasses, []);
  assert.deepEqual(data.groups, []);
});

test("overall statusはfindingなしでも失敗・未確認の検証を優先する", () => {
  const base = { groups: [{ findings: [] }], validations: [{ status: "passed" }], findingResolutions: [] };
  assert.deepEqual(overallStatus(base), { label: "指摘なし", tone: "success" });
  assert.deepEqual(overallStatus({ ...base, validations: [] }), { label: "検証未完了", tone: "warning" });
  assert.deepEqual(overallStatus({ ...base, validations: [{ status: "unverified" }] }), { label: "検証未完了", tone: "warning" });
  assert.deepEqual(overallStatus({ ...base, validations: [{ status: "failed" }] }), { label: "検証失敗", tone: "danger" });
  const finding = { source: "blind", severity: "major", title: "指摘", body: "本文", location: "path:1", recommendation: "修正" };
  assert.deepEqual(overallStatus({ ...base, groups: [{ findings: [finding] }], findingResolutions: [finding] }), { label: "却下承認済み", tone: "warning" });
});

test("review UIは同一groupの複数findingをseverity順に描画できる順序へ整える", () => {
  const findings = [
    { severity: "minor", title: "軽微" },
    { severity: "blocker", title: "停止" },
    { severity: "major", title: "重大" },
  ];
  assert.deepEqual(sortFindings(findings).map(({ finding, index }) => [finding.title, index]), [["停止", 1], ["重大", 2], ["軽微", 0]]);
});

test("review schemaは完全なpath manifestとraw reviewer outputを要求する", () => {
  const sha = "a".repeat(40);
  const hash = "b".repeat(64);
  const data = {
    title: "実装レビュー", generatedAt: "2026-08-26T12:00:00+09:00", runId: "01234567-89ab-4cde-8fab-0123456789ab",
    base: sha, head: sha, remoteBase: { ref: "origin/main", oid: sha }, diffHash: hash, planHash: hash, assetHashes: { "index.html": hash, "styles.css": hash, "app.js": hash, "review-data-schema.js": hash }, summary: "確認済み", stats: { files: 1, intentGroups: 1, findings: 0, validationsPassed: 1 },
    reviewedPaths: ["path/to/file"],
    excludedPaths: [],
    findingResolutions: [],
    reviewPasses: ["blind", "conformance"].map((source) => ({
      source,
      role: source === "blind" ? "blind_diff_reviewer" : "plan_conformance_reviewer",
      model: "gpt-5.6-sol", reasoningEffort: "xhigh",
      inputHashes: source === "blind" ? { diff: hash, context: hash } : { diff: hash, context: hash, plan: hash, validations: hash, remoteBase: hash },
      outputFile: source === "blind" ? "blind-review.json" : "plan-conformance-review.json",
      outputHash: hash, evidence: ["fresh review"],
    })),
    validations: [{ command: "npm test", status: "passed", summary: "成功" }],
    groups: [{ id: "intent", title: "意図", summary: "変更理由", risk: "none", blastRadius: "限定", files: ["path/to/file"], locations: ["path/to/file:1"], findings: [], planDeviations: [], evidence: ["diff"] }],
  };
  assert.deepEqual(normalizeData(data).reviewedPaths, ["path/to/file"]);
  assert.throws(() => normalizeData({ ...data, reviewedPaths: ["other/file"] }), /一致/);
  assert.throws(() => normalizeData({ ...data, reviewPasses: data.reviewPasses.map((pass) => Object.fromEntries(Object.entries(pass).filter(([key]) => key !== "outputFile"))) }), /schema/);
  assert.throws(() => normalizeData({ ...data, reviewPasses: [data.reviewPasses[0], { ...data.reviewPasses[1], outputFile: "blind-review.json" }] }), /role\/model\/hash/);
  assert.throws(() => normalizeData({ ...data, findingResolutions: [{ source: "blind", severity: "major", title: "指摘", body: "本文", location: "path/to/file:1", recommendation: "修正", reviewRunId: data.runId, reviewDiffHash: data.diffHash, decision: "rejected", rationale: "却下理由", evidence: ["確認済み"], userApproved: false }] }), /finding resolution/);
  const raw = { runId: data.runId, diffHash: data.diffHash, inputHashes: data.reviewPasses[0].inputHashes, source: "blind", summary: "指摘なし", findings: [] };
  assert.doesNotThrow(() => validateNormalizedReviewOutput(data, data.reviewPasses[0], raw));
  assert.throws(() => validateNormalizedReviewOutput(data, data.reviewPasses[0], { ...raw, summary: "token=super-secret-value" }), /unsafe content/);
  for (const token of ["sk-proj-abcdefghijklmnopqrstuvwxyz", "github_pat_abcdefghijklmnopqrstuvwxyz", ["xoxb", "1234567890", "abcdefghijklmnopqrstuvwxyz"].join("-")]) {
    assert.throws(() => validateNormalizedReviewOutput(data, data.reviewPasses[0], { ...raw, summary: token }), /unsafe content/);
  }
  assert.throws(() => validateNormalizedReviewOutput(data, data.reviewPasses[0], { ...raw, findings: [{ severity: "major", title: "欠落", body: "本文", location: "path/to/file:1", recommendation: "修正" }] }), /incomplete/);
  const planText = `- plan_id: demo\n- base_commit: ${sha}\n`;
  assert.doesNotThrow(() => validateReviewPlanBinding(data, "plans/tmp/demo/implementation-review", "plans/tmp/demo/final.md", planText));
  assert.throws(() => validateReviewPlanBinding({ ...data, base: "c".repeat(40) }, "plans/tmp/demo/implementation-review", "plans/tmp/demo/final.md", planText), /exact final plan base/);
  const conformance = { ...raw, source: "conformance", inputHashes: data.reviewPasses[1].inputHashes, planHash: data.planHash };
  assert.doesNotThrow(() => validateNormalizedReviewOutput(data, data.reviewPasses[1], conformance));
  assert.throws(() => validateNormalizedReviewOutput(data, data.reviewPasses[1], { ...conformance, planHash: "c".repeat(64) }), /plan hash/);
  assert.doesNotThrow(() => normalizeData({ ...data, groups: [{ ...data.groups[0], locations: ["path/to/file@file"] }] }));
  assert.doesNotThrow(() => normalizeData({ ...data, groups: [{ ...data.groups[0], risk: "high" }] }));
  assert.throws(() => validateNormalizedReviewOutput(data, data.reviewPasses[0], { ...raw, inputHashes: { diff: "c".repeat(64), context: hash } }), /input artifacts/);
});

test("blocker・majorは明示的な却下証拠がなければG04を通さない", () => {
  const finding = { source: "blind", severity: "major", title: "重大指摘", body: "本文", location: "path/to/file:1", recommendation: "修正" };
  const unresolved = {
    groups: [{ findings: [finding] }],
    findingResolutions: [],
  };
  assert.throws(() => validateFindingResolutions(unresolved), /prevents G04/);
  assert.doesNotThrow(() => validateFindingResolutions(unresolved, { allowUnresolved: true }));
  const resolved = {
    ...unresolved,
    findingResolutions: [{ source: "blind", severity: "major", title: "重大指摘", body: "本文", location: "path/to/file:1", recommendation: "修正", reviewRunId: "01234567-89ab-4cde-8fab-0123456789ab", reviewDiffHash: "b".repeat(64), decision: "rejected", rationale: "再現しないことを確認", evidence: ["targeted test passed"], userApproved: true }],
  };
  assert.doesNotThrow(() => validateFindingResolutions(resolved));
  assert.throws(() => validateFindingResolutions({ ...resolved, groups: [{ findings: [{ ...finding, body: "別内容" }] }] }), /does not match/);
});

test("plan hashは進捗・実行記録だけの更新を許し、設計変更を検出する", () => {
  const original = "# 計画\n\n## メタデータ\n\n- status: reviewing\n\n## 確定した設計\n\n設計A\n\n## 進捗管理\n\n- [ ] T01\n\n## 実行記録\n\n未実施\n\n## 検証計画\n\n検証A\n";
  const progress = original.replace("reviewing", "delivery_ready").replace("- [ ] T01", "- [x] T01").replace("未実施", "成功");
  assert.equal(computePlanHash(original), computePlanHash(progress));
  assert.notEqual(computePlanHash(original), computePlanHash(original.replace("設計A", "設計B")));
});

test("diff hunk parserは追加をhead側、削除をbase側へ保持する", () => {
  assert.deepEqual(parseChangedRanges("@@ -0,0 +1,3 @@\n", false, 3), [{ side: "head", start: 1, end: 3 }]);
  assert.deepEqual(parseChangedRanges("@@ -1,3 +0,0 @@\n", false, 0), [{ side: "base", start: 1, end: 3 }]);
  assert.deepEqual(parseChangedRanges("@@ -5,2 +4,0 @@\n", false, 8), [{ side: "base", start: 5, end: 6 }]);
  assert.deepEqual(parseChangedRanges("old mode 100644\nnew mode 100755\n", false, 1), []);
  assert.deepEqual(parseChangedRanges("", true, 0), []);
});

test("review snapshotはtask pathを限定し、対象外を個別hashできる", async (context) => {
  const relative = `review-validator-${process.pid}-${Date.now()}.tmp`;
  const excluded = `review-validator-excluded-${process.pid}-${Date.now()}.tmp`;
  const absolute = path.join(root, relative);
  const excludedAbsolute = path.join(root, excluded);
  context.after(async () => Promise.all([rm(absolute, { force: true }), rm(excludedAbsolute, { force: true })]));
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  await writeFile(absolute, "first");
  await writeFile(excludedAbsolute, "unrelated");
  const first = await computeReviewSnapshot(base, [relative]);
  await writeFile(absolute, "second");
  const second = await computeReviewSnapshot(base, [relative]);
  assert.ok(first.paths.includes(relative));
  assert.ok(!first.paths.includes(excluded));
  assert.ok(first.inventory.includes(excluded));
  assert.match(first.pathHashes.get(excluded) ?? "", /^[a-f0-9]{64}$/u);
  assert.notEqual(first.diffHash, second.diffHash);
});
