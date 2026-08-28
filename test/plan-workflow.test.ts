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

test("plans/template.mdは6つのH1とcompactなUI契約を正しい順で持つ", async () => {
  const template = await read("plans/template.md");
  assert.deepEqual(template.match(/^# .+$/gm), headings);
  assert.match(template, /^## UI契約$/m);
  for (const field of [
    "UI変更",
    "prototype",
    "production baseline",
    "comparison conditions",
    "baseline state inventory",
    "theme contract",
    "responsive contract",
    "styling pipeline",
    "視覚的不変条件",
    "意図した差分",
    "stateとinteraction",
    "parity evidence",
    "parity matrix",
    "machine parity",
    "UI承認記録",
  ]) {
    assert.match(template, new RegExp(`^- ${field}:`, "m"));
  }
  assert.match(template, /変更なし。/);
  assert.match(template, /なし。/);
  assert.doesNotMatch(template, /metadata|status|task表|G0[1-6]|進捗|実行記録|draft|final/iu);
});

test("plannerはrepoとproduction baselineを調査しcanonical goalとUI prototypeを生成する", async () => {
  const [planner, quality] = await Promise.all([
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/plan/references/ui-prototype-quality.md"),
  ]);
  assert.match(planner, /Inspect the relevant code, tests, configuration, Git state, and runtime behavior/);
  assert.match(planner, /plans\/<slug>\/goal\.md/);
  assert.match(planner, /If that path already exists, stop before writing/);
  assert.match(planner, /Preserve its six headings and their order exactly/);
  assert.match(planner, /self-contained plan/);
  assert.match(planner, /Describe only the adopted design/);
  assert.match(planner, /Do not invent decisions to close a high-impact unknown/);
  assert.match(planner, /plans\/<slug>\/prototype\//);
  assert.match(planner, /production-parity artifact/);
  assert.match(planner, /Record the baseline, actual comparison conditions, state inventory/);
  assert.match(planner, /parity matrix, machine result, and UI approval/);
  assert.match(planner, /Keep `UI承認記録: 未承認` until the user explicitly approves the rendered prototype/);
  assert.match(quality, /Identify the closest existing route and the shared shell/);
  assert.match(quality, /production stylesheet/);
  assert.match(quality, /Set `machine parity: 合格[^`]*` only when every row passes/);
  assert.match(quality, /Machine parity never becomes user approval automatically/);
  assert.doesNotMatch(planner, /plans\/<slug>\.md|plans\/reviews\/<slug>|validate-plan-file|plan_author|gpt-5\./);
});

test("criticはfresh reviewを基に同一goalを更新しUI契約変更時は再承認へ戻す", async () => {
  const critic = await read(".agents/skills/plan-critic/SKILL.md");
  assert.match(critic, /Use the explicit `plans\/<slug>\/goal\.md` path/);
  assert.match(critic, /plans\/\*\/goal\.md/);
  assert.match(critic, /fresh no-history subagent/);
  assert.match(critic, /Do not pass the parent conversation/);
  assert.match(critic, /exactly one candidate exists; stop when there are zero or multiple candidates/);
  assert.match(critic, /stop and ask the user before changing the plan/);
  assert.match(critic, /prepare the complete replacement, and write the target once/);
  assert.match(critic, /as if the adopted design had been known from the start/);
  assert.match(critic, /material prototype or UI-contract change/);
  assert.match(critic, /set `machine parity: 未確認` and `UI承認記録: 未承認`/);
  assert.match(critic, /`\$plan` must update and revalidate the prototype before implementation/);
  assert.match(critic, /Do not create `critique\.md`/);
  assert.doesNotMatch(critic, /plans\/<slug>\.md|plans\/reviews\/<slug>|plan_critic|plan_rewriter|gpt-5\./);
});

test("implementは未承認UIで停止し、承認済みmatrixでimplementation parityを確認する", async () => {
  const executor = await read(".agents/skills/implement/SKILL.md");
  assert.match(executor, /Use the explicit `plans\/<slug>\/goal\.md` path/);
  assert.match(executor, /plans\/\*\/goal\.md/);
  assert.match(executor, /stop when there are zero or multiple candidates/);
  assert.match(executor, /current agent owns investigation, implementation, verification, and live behavior checks/);
  assert.match(executor, /require `plans\/<slug>\/prototype\/`, a dated `machine parity: 合格[^`]*`, and a dated explicit `UI承認記録:[^`]*` before editing production code/);
  assert.match(executor, /`未確認`, `未承認`, missing evidence, Browser evidence alone, and automated evidence alone all stop implementation/);
  assert.match(executor, /Treat the approved prototype and `UI契約` as the production target/);
  assert.match(executor, /repeat the approved parity matrix against the real application at the same actual viewport, DPR, scroll, locale, theme, fixture, route, and state/);
  assert.doesNotMatch(executor, /plans\/<slug>\.md|plans\/reviews\/<slug>|validate-plan-file|review.*automatically|gpt-5\.|G0[1-6]/);
});

test("reviewはcanonical reportに2種類のreviewを統合し欠落implementation parityをmajorとする", async () => {
  const review = await read(".agents/skills/review/SKILL.md");
  assert.match(review, /Use the explicit `plans\/<slug>\/goal\.md` path/);
  assert.match(review, /plans\/\*\/goal\.md/);
  assert.match(review, /stop for zero or multiple candidates/);
  assert.match(review, /staged, unstaged, deleted, and relevant non-ignored untracked files/);
  assert.match(review, /require the user to state the Git base revision/);
  assert.match(review, /fresh no-history subagent for the blind diff review/);
  assert.match(review, /not the plan, conversation, task rationale, or any prior review/);
  assert.match(review, /not the blind result or conversation/);
  assert.match(review, /approved prototype plus dated implementation-parity evidence when applicable/);
  assert.match(review, /missing[^.]*implementation(?:-| )parity[^.]*major/i);
  assert.match(review, /plans\/<slug>\/review\//);
  assert.match(review, /Group changes by intent rather than file order/);
  assert.match(review, /sort groups by risk/);
  assert.match(review, /Mark any change whose intent cannot be explained as `要改善`/);
  assert.doesNotMatch(review, /plans\/<slug>\.md|plans\/reviews\/<slug>|validate-review-data|remote-base|diffHash|planHash|assetHashes|release gate|gpt-5\./i);
});

test("Tailwind builderとprototype launcherはcanonical artifactを作成・配信する", async () => {
  const builderPath = ".agents/skills/plan/scripts/build-prototype-css.mjs";
  await Promise.all([access(path.join(root, builderPath)), access(path.join(root, "dev-prototype.sh"))]);
  const [builder, launcher] = await Promise.all([read(builderPath), read("dev-prototype.sh")]);
  assert.match(builder, /from "@tailwindcss\/postcss"/);
  assert.match(builder, /plans\/<slug>\/prototype/);
  assert.match(builder, /tailwind\.css/);
  assert.match(builder, /styles\.css/);
  assert.match(launcher, /plans\/\$\{slug\}\/prototype\/index\.html/);
  assert.match(launcher, /No prototype was found under plans\/<slug>\/prototype/);
  assert.match(launcher, /scripts\/serve-plan-artifact\.mjs/);
});

test("全skill metadataは明示呼び出し専用でdefault promptにskill名を含む", async () => {
  for (const name of ["plan", "plan-critic", "implement", "review", "git-commit-push-pr"]) {
    const yaml = await read(`.agents/skills/${name}/agents/openai.yaml`);
    assert.match(yaml, /allow_implicit_invocation: false/);
    assert.match(yaml, new RegExp(`default_prompt: "[^\\n]*\\$${name.replaceAll("-", "\\-")}`));
  }
});

test("旧skill・validator・専用agent・固定model・lifecycleは復元しない", async () => {
  const removed = [
    ".agents/skills/implementation-planner/SKILL.md",
    ".agents/skills/implementation-executor/SKILL.md",
    ".agents/skills/implementation-review/SKILL.md",
    ".agents/skills/final-plan-rewriter/SKILL.md",
    "scripts/validate-plan-file.mjs",
    "scripts/validate-review-data.mjs",
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

  const [planner, critic, executor, review, config, workflow] = await Promise.all([
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/plan-critic/SKILL.md"),
    read(".agents/skills/implement/SKILL.md"),
    read(".agents/skills/review/SKILL.md"),
    read(".codex/config.toml"),
    read("docs/development/codex-development-workflow.md"),
  ]);
  for (const skill of [planner, critic, executor, review]) {
    assert.doesNotMatch(skill, /implementation-(?:planner|executor|review)|final-plan-rewriter|validate-(?:plan-file|review-data)|G0[1-6]|gpt-5\./);
  }
  assert.match(planner, /Do not add global metadata, lifecycle status, task tables, lifecycle gates, progress logs, hashes, or draft\/final files/);
  assert.match(critic, /Do not add global metadata, lifecycle status, task tables, gates, progress logs, hashes, or separate draft\/final files/);
  assert.match(workflow, /独自runtime、専用agent、固定model routing、lifecycle state machineは作らない/);
  assert.doesNotMatch(config, /^\[agents\./m);
  const activeConfig = config.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  assert.doesNotMatch(activeConfig, /^\s*model(?:_reasoning_effort)?\s*=/m);
});

test(".gitignoreはtemplateを追跡可能にしcanonicalと旧top-level planをignoreする", async () => {
  const gitignore = await read(".gitignore");
  assert.match(gitignore, /^\/plans\/\*\.md$/m);
  assert.match(gitignore, /^!\/plans\/template\.md$/m);
  assert.match(gitignore, /^\/plans\/\*\/$/m);
});

test("shippingはstaged diffを正本としplan lifecycleへ結合しない", async () => {
  const shipping = await read(".agents/skills/git-commit-push-pr/SKILL.md");
  assert.match(shipping, /Generate the commit message only from the staged diff/);
  assert.match(shipping, /validations actually executed/);
  assert.match(shipping, /never deletes it automatically/);
  assert.match(shipping, /cleanup is a separate user-authorized operation/);
  assert.doesNotMatch(shipping, /final\.md|G0[1-6]|validate-plan-file|validate-review-data|Plan-driven|plan-driven/);
});
