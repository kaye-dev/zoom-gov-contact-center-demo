import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { containsSensitiveText, normalizeData, overallStatus } from "../.agents/skills/review/assets/review-report/review-data-schema.js";
import { feedbackText, sortFindings, sortGroups } from "../.agents/skills/review/assets/review-report/app.js";

const root = path.resolve(import.meta.dirname, "..");
const asset = (name: string) => readFile(path.join(root, ".agents/skills/review/assets/review-report", name), "utf8");

function validData() {
  return {
    title: "実装レビュー",
    generatedAt: "2026-08-27T12:00:00+09:00",
    planPath: "plans/example-change.md",
    base: "HEAD",
    head: "working tree",
    summary: "変更を確認した",
    reviewedPaths: ["app/example.ts", "test/example.test.ts"],
    excludedPaths: [{ path: "README.md", reason: "別作業の変更" }],
    validations: [{ command: "npm test", status: "passed", summary: "成功" }],
    groups: [
      {
        id: "implementation",
        title: "機能実装",
        summary: "要求された処理を追加",
        risk: "high",
        blastRadius: "対象APIと利用画面",
        files: ["app/example.ts"],
        locations: ["app/example.ts:10-24"],
        findings: [
          { source: "blind", severity: "major", title: "境界値不足", body: "空入力を扱えない", location: "app/example.ts:18", recommendation: "空入力を検証する" },
          { source: "conformance", severity: "minor", title: "planとの差異", body: "完了条件の一部が未確認", location: "app/example.ts:20", recommendation: "確認結果を追加する" },
        ],
        planDeviations: ["完了条件の一部が未確認"],
        evidence: ["差分とテストを確認"],
      },
      {
        id: "tests",
        title: "回帰テスト",
        summary: "主要ケースを固定",
        risk: "none",
        blastRadius: "テストのみ",
        files: ["test/example.test.ts"],
        locations: ["test/example.test.ts@file"],
        findings: [],
        planDeviations: [],
        evidence: ["npm test成功"],
      },
    ],
  };
}

test("HTML templateはrisk filter・判断・コメント・Markdown copyを備える", async () => {
  const [html, app] = await Promise.all([asset("index.html"), asset("app.js")]);
  for (const marker of ["data-filter=\"high\"", "data-decision-count=\"adopted\"", "id=\"generate-feedback\"", "id=\"copy-feedback\"", "id=\"excluded-paths\""]) assert.match(html, new RegExp(marker));
  for (const pattern of [/element\("textarea"/, /\["adopted", "採用"\]/, /\["rejected", "却下"\]/, /\["unresolved", "未確定"\]/, /navigator\.clipboard\.writeText/, /aria-pressed/]) assert.match(app, pattern);
  assert.match(app, /textContent/);
  assert.doesNotMatch(app, /innerHTML|eval\(|new Function/);
  assert.match(app, /データ不正/);
});

test("schemaは最小dataを正規化しpath集合・source・severityを検証する", () => {
  const data = validData();
  const normalized = normalizeData(data);
  assert.deepEqual(normalized.stats, { files: 2, intentGroups: 2, findings: 2, validationsPassed: 1 });
  assert.throws(() => normalizeData({ ...data, reviewedPaths: ["app/example.ts"] }), /review対象外|一致/);
  assert.throws(() => normalizeData({ ...data, excludedPaths: [{ path: "app/example.ts", reason: "重複" }] }), /対象外path/);
  assert.throws(() => normalizeData({ ...data, groups: [{ ...data.groups[0], risk: "low" }, data.groups[1]] }), /riskが低すぎます/);
  assert.throws(() => normalizeData({ ...data, extra: true }), /項目/);
});

test("tracked review-dataは未置換templateとしてfail closedになる", async () => {
  const raw = await asset("review-data.json");
  assert.match(raw, /UNREPLACED_TEMPLATE/);
  assert.throws(() => normalizeData(JSON.parse(raw)), /未置換/);
  assert.throws(() => JSON.parse("{"));
});

test("secret検査は代表的なtoken・接続文字列を拒否する", () => {
  for (const value of [
    "sk-proj-abcdefghijklmnopqrstuvwxyz",
    "github_pat_abcdefghijklmnopqrstuvwxyz",
    ["xoxb", "1234567890", "abcdefghijklmnopqrstuvwxyz"].join("-"),
    "DATABASE_URL=postgresql://demo:example-password@db.invalid/app",
    "AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz1234567890ABCD",
    "eyJabcdefghijk.abcdefghijklmnop.qrstuvwxyz012345",
  ]) assert.equal(containsSensitiveText(value), true, value);
  assert.equal(containsSensitiveText("通常のreview本文"), false);
  assert.throws(() => normalizeData({ ...validData(), summary: "token=super-secret-value" }), /機密/);
});

test("riskとfindingは高い順に表示される", () => {
  assert.deepEqual(sortGroups([{ risk: "low" }, { risk: "critical" }, { risk: "medium" }]).map((item) => item.risk), ["critical", "medium", "low"]);
  const findings = [{ severity: "minor", title: "軽微" }, { severity: "blocker", title: "停止" }, { severity: "major", title: "重大" }];
  assert.deepEqual(sortFindings(findings).map(({ finding, index }) => [finding.title, index]), [["停止", 1], ["重大", 2], ["軽微", 0]]);
});

test("overall statusは検証失敗・重大finding・未確認を優先する", () => {
  const clear = { groups: [{ findings: [] }], validations: [{ status: "passed" }] };
  assert.deepEqual(overallStatus(clear), { label: "指摘なし", tone: "success" });
  assert.deepEqual(overallStatus({ ...clear, validations: [] }), { label: "検証未完了", tone: "warning" });
  assert.deepEqual(overallStatus({ ...clear, validations: [{ status: "failed" }] }), { label: "検証失敗", tone: "danger" });
  assert.deepEqual(overallStatus({ ...clear, groups: [{ findings: [{ severity: "major" }] }] }), { label: "要対応", tone: "danger" });
});

test("Markdownは採用・未確定のsource付き指摘と人間コメントだけをまとめる", () => {
  const data = normalizeData(validData());
  const decisions = new Map([
    ["implementation:0", "adopted"],
    ["implementation:1", "rejected"],
  ]);
  const comments = new Map([["implementation", "境界値修正後に再確認する"]]);
  const markdown = feedbackText(data, decisions, comments);
  assert.match(markdown, /\[採用\]\[blind\]\[major\] 境界値不足/);
  assert.doesNotMatch(markdown, /planとの差異/);
  assert.match(markdown, /### 人間コメント\n\n境界値修正後に再確認する/);

  const unresolved = feedbackText(data);
  assert.match(unresolved, /\[未確定\]\[blind\]/);
  assert.match(unresolved, /\[未確定\]\[conformance\]/);
});
