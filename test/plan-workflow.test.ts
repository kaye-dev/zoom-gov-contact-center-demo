import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFile(path.join(root, relative), "utf8");

const headings = [
  "# 目的と完了条件",
  "# 現状と根拠",
  "# 実装方針",
  "# インターフェースとデータフロー",
  "# テスト計画",
  "# 前提・対象外・リスク",
];

test("plans/template.mdは6見出しだけの最小構成を正しい順で持つ", async () => {
  const template = await read("plans/template.md");
  assert.deepEqual(template.match(/^# .+$/gm), headings);
  assert.match(template, /変更なし。/);
  assert.match(template, /なし。/);
  assert.doesNotMatch(template, /metadata|status|task表|G0[1-6]|進捗|実行記録|prototype|plans\/tmp|draft|final/iu);
});

test("plannerはrepo調査後にtemplateから自己完結planを直接生成する", async () => {
  const planner = await read(".agents/skills/implementation-planner/SKILL.md");
  assert.match(planner, /Inspect the relevant code, tests, configuration, Git state, and runtime behavior/);
  assert.match(planner, /plans\/<slug>\.md/);
  assert.match(planner, /If that path already exists, stop before writing/);
  assert.match(planner, /Preserve its six headings and their order exactly/);
  assert.match(planner, /self-contained plan/);
  assert.match(planner, /Describe only the adopted design/);
  assert.match(planner, /Do not invent decisions to close a high-impact unknown/);
  assert.match(planner, /Do not add metadata, status, task tables, lifecycle gates, progress logs, prototype contracts, hashes, or draft\/final files/);
  assert.doesNotMatch(planner, /plans\/tmp|validate-plan-file|plan_author|gpt-5\./);
});

test("criticはfresh reviewを基に同一planを原子的な自己完結版へ更新する", async () => {
  const critic = await read(".agents/skills/plan-critic/SKILL.md");
  assert.match(critic, /fresh no-history subagent/);
  assert.match(critic, /Do not pass the parent conversation/);
  assert.match(critic, /exactly one candidate exists; stop when there are zero or multiple candidates/);
  assert.match(critic, /stop and ask the user before changing the plan/);
  assert.match(critic, /prepare the complete replacement, and write the target once/);
  assert.match(critic, /as if the adopted design had been known from the start/);
  assert.match(critic, /Do not create `critique\.md`/);
  assert.doesNotMatch(critic, /plans\/tmp|plan_critic|plan_rewriter|gpt-5\./);
});

test("executorとreviewは単一plan自動選択・複数停止・明示pathを共有する", async () => {
  const [executor, review] = await Promise.all([
    read(".agents/skills/implementation-executor/SKILL.md"),
    read(".agents/skills/implementation-review/SKILL.md"),
  ]);
  for (const skill of [executor, review]) {
    assert.match(skill, /Use the explicit `plans\/<slug>\.md` path/);
    assert.match(skill, /plans\/\*\.md/);
    assert.match(skill, /plans\/template\.md/);
    assert.match(skill, /stop[^.]*zero or multiple/i);
  }
  assert.match(executor, /current agent owns investigation, implementation, verification, and live behavior checks/);
  assert.doesNotMatch(executor, /validate-plan-file|implementation-review.*automatically|gpt-5\.|G0[1-6]|plans\/tmp/);
  assert.match(review, /staged, unstaged, deleted, and relevant non-ignored untracked files/);
  assert.match(review, /require the user to state the Git base revision/);
  assert.match(review, /fresh no-history subagent for the blind diff review/);
  assert.match(review, /not the plan, conversation, task rationale, or any prior review/);
  assert.match(review, /not the blind result or conversation/);
  assert.match(review, /plans\/reviews\/<slug>/);
  assert.match(review, /Group changes by intent rather than file order/);
  assert.match(review, /sort groups by risk/);
  assert.match(review, /Mark any change whose intent cannot be explained as `要改善`/);
  assert.doesNotMatch(review, /validate-review-data|remote-base|diffHash|planHash|assetHashes|release gate|gpt-5\.|plans\/tmp/i);
});

test("全skill metadataは明示呼び出し専用でdefault promptにskill名を含む", async () => {
  for (const name of ["implementation-planner", "plan-critic", "implementation-executor", "implementation-review", "git-commit-push-pr"]) {
    const yaml = await read(`.agents/skills/${name}/agents/openai.yaml`);
    assert.match(yaml, /allow_implicit_invocation: false/);
    assert.match(yaml, new RegExp(`default_prompt: "[^\\n]*\\$${name.replaceAll("-", "\\-")}`));
  }
});

test("旧workflow・prototype・validator・専用agentは撤去されている", async () => {
  const removed = [
    ".agents/skills/final-plan-rewriter/SKILL.md",
    "docs/development/codex-development-workflow.md",
    "scripts/validate-plan-file.mjs",
    "scripts/validate-review-data.mjs",
    "dev-prototype.sh",
    "test/review-gate-e2e.test.ts",
    "test/dev-prototype.test.ts",
    ".codex/agents/plan_author.toml",
    ".codex/agents/plan_critic.toml",
    ".codex/agents/plan_rewriter.toml",
    ".codex/agents/blind_diff_reviewer.toml",
    ".codex/agents/plan_conformance_reviewer.toml",
    ".codex/agents/implementer.toml",
    ".codex/agents/mechanical_worker.toml",
    ".codex/agents/git_shipper.toml",
  ];
  for (const relative of removed) await assert.rejects(access(path.join(root, relative)), { code: "ENOENT" });
  const [agents, config, readme, design] = await Promise.all([read("AGENTS.md"), read(".codex/config.toml"), read("README.md"), read("DESIGN.md")]);
  for (const text of [agents, config, readme, design]) assert.doesNotMatch(text, /codex-development-workflow|dev-prototype|plans\/tmp|UIプロトタイプ|静的 HTML プロトタイプ/u);
  assert.doesNotMatch(config, /^\[agents\./m);
});

test("shippingはstaged diffを正本としplan lifecycleへ結合しない", async () => {
  const shipping = await read(".agents/skills/git-commit-push-pr/SKILL.md");
  assert.match(shipping, /Generate the commit message only from the staged diff/);
  assert.match(shipping, /validations actually executed/);
  assert.match(shipping, /never deletes it automatically/);
  assert.match(shipping, /cleanup is a separate user-authorized operation/);
  assert.doesNotMatch(shipping, /final\.md|plans\/tmp|G0[1-6]|validate-plan-file|validate-review-data|Plan-driven|plan-driven/);
});
