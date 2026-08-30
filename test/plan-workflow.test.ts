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

const workflowSkillNames = ["plan", "plan-critic", "implement", "review", "workflow-retrospective"];
const allSkillNames = [...workflowSkillNames, "git-commit-push-pr"];

test("templateはgoal設計とinvocation approvalだけを持ちmutable parityを重複しない", async () => {
  const template = await read("plans/template.md");
  assert.deepEqual(template.match(/^# .+$/gm), headings);
  assert.match(template, /^## 要件クロージャ$/m);
  assert.match(template, /^## UI契約$/m);
  for (const field of [
    "UI変更",
    "prototype",
    "approval contract",
    "validation profile",
    "prototype revision",
    "UI承認方式",
    "production baseline",
    "comparison conditions",
    "baseline state inventory",
    "theme contract",
    "responsive contract",
    "styling pipeline",
    "視覚的不変条件",
    "意図した差分",
    "stateとinteraction",
    "comparison targets",
    "parity matrix",
  ]) {
    assert.match(template, new RegExp(`^- ${field}:`, "m"));
  }
  assert.doesNotMatch(template, /^- (?:parity evidence|machine parity|UI承認記録):/m);
  assert.doesNotMatch(template, /metadata|lifecycle status|task表|G0[1-6]|進捗|実行記録|draft|final/iu);
});

test("planとcriticはauthoring後の返却直前にsmokeを1回だけ行う", async () => {
  const [plan, critic, quality, goalQuality, parityReference] = await Promise.all([
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/plan-critic/SKILL.md"),
    read(".agents/skills/plan/references/ui-prototype-quality.md"),
    read(".agents/skills/plan/references/goal-quality.md"),
    read(".agents/skills/plan/references/parity-runner.md"),
  ]);

  for (const contract of [plan, critic]) {
    assert.match(contract, /authoritative requirements bundle/);
    assert.match(contract, /plans\/<slug>\/goal\.md/);
    assert.match(contract, /parity-spec\.json/);
    assert.match(contract, /prototype revision/);
    assert.match(contract, /smoke/);
    assert.match(contract, /Do not run the (?:complete|full) matrix|Do not run the full matrix/);
    assert.doesNotMatch(contract, /machineParityResults|UI承認記録|<row-id>=pending/);
  }
  assert.match(plan, /user can give feedback|user.*feedback/iu);
  assert.match(plan, /Browser unavailability does not block a reviewable plan/);
  assert.match(plan, /Do not open the Browser while authoring/);
  assert.match(plan, /otherwise ready to return/);
  assert.match(critic, /run one final smoke immediately before returning/);
  assert.match(critic, /fresh no-history subagent/);
  assert.match(critic, /There is no plan-time approval state to reset/);
  assert.match(quality, /Prepare iterative review/);
  assert.match(goalQuality, /explicit `\$implement` invocation is the approval/);
  assert.match(goalQuality, /missing file means that phase was not run/);
  assert.match(parityReference, /representative desktop and 390×844/);
  assert.match(parityReference, /theme.*semantic-token.*native-control/);
  assert.match(parityReference, /responsive.*shell.*navigation.*layout/);
});

test("implementはinvocation approval後にBrowserを使わず実装し完了直前のfinalだけを要求する", async () => {
  const [implement, workflow, devServer, agents] = await Promise.all([
    read(".agents/skills/implement/SKILL.md"),
    read("docs/development/codex-development-workflow.md"),
    read(".claude/rules/dev-server.md"),
    read("AGENTS.md"),
  ]);
  for (const contract of [implement, workflow, devServer, agents]) {
    assert.match(contract, /\$implement/);
    assert.match(contract, /parity-spec\.json|validation profile/);
    assert.match(contract, /final|最終/);
  }
  assert.match(implement, /explicit `\$implement` invocation is the approval basis/);
  assert.match(implement, /approval\.json/);
  assert.match(implement, /implementation-parity\.json/);
  assert.match(implement, /one capability canary/);
  assert.match(implement, /Start gate without Browser/);
  assert.match(implement, /Browser availability is not a start gate/);
  assert.match(implement, /Do not probe Browser capability/);
  assert.match(implement, /Final Browser review/);
  assert.match(implement, /schema version 3/);
  assert.match(implement, /do not create `pre-edit-parity\.json`/);
  assert.match(implement, /Do not run `affected` Browser rows/);
  assert.match(implement, /Use `targeted` by default/);
  assert.match(implement, /Use `full` only when/);
  assert.match(implement, /one setup attempt plus one retry/);
  assert.match(implement, /Do not create a substantial task-specific adapter or runtime shim/);
  assert.match(implement, /Run the full test suite only when/);
  assert.match(implement, /Run a production build only for/);
  assert.match(implement, /Any later related change invalidates it/);
  assert.match(implement, /Do not require a prior machine-parity field/);
  assert.match(implement, /do not request an extra approval message/);
  assert.match(workflow, /final parityを1回/);
  assert.match(workflow, /`targeted`を既定/);
  assert.match(workflow, /大規模なadapterやruntime shimを新設・debugしない/);
  assert.match(workflow, /不要な全test・buildを実行しない/);
  assert.match(workflow, /pre-editとaffectedのBrowser実行が0回/);
  assert.match(workflow, /完了直前のtargeted finalが1回/);
  assert.match(workflow, /巨大なpending一覧を作らない/);
});

test("verified Compose webだけを確認なしで再起動しbuildとcleanupの境界を維持する", async () => {
  const [implement, workflow, devServer] = await Promise.all([
    read(".agents/skills/implement/SKILL.md"),
    read("docs/development/codex-development-workflow.md"),
    read(".claude/rules/dev-server.md"),
  ]);
  for (const contract of [implement, workflow, devServer]) {
    assert.match(contract, /\.\/dev-compose\.sh restart web/);
    assert.match(contract, /checkout mount/);
    assert.match(contract, /container ID/);
    assert.match(contract, /fixture/);
    assert.match(contract, /authorization/);
  }
  assert.match(implement, /without asking/);
  assert.match(implement, /Never stop a user-owned server for a build/);
  assert.match(implement, /Never run broad `docker compose down`/);
  assert.match(devServer, /他service、project全体、volumeは停止・削除しない/);
  assert.match(workflow, /baselineとの差分だけをcleanup/);
});

test("reviewはstructured evidenceを先に検証して二つのpassを並行実行する", async () => {
  const review = await read(".agents/skills/review/SKILL.md");
  assert.match(review, /approval\.json/);
  assert.match(review, /implementation-parity\.json/);
  assert.match(review, /schema-version-3/);
  assert.match(review, /New runs do not require or create `pre-edit-parity\.json`/);
  assert.match(review, /structured scroll provenance/);
  assert.doesNotMatch(review, /natural-language scroll|自然言語.*scroll/iu);
  assert.match(review, /existing plan with only legacy goal\/Markdown evidence/);
  assert.match(review, /schema version 1 and 2 as legacy read-only pre-edit\/final pairs/);
  assert.match(review, /Run both passes in parallel/);
  assert.match(review, /concurrently/);
  assert.match(review, /not the plan, conversation, evidence verdict, or prior review/);
  assert.match(review, /not the blind result or conversation/);
  assert.match(review, /source[\s\S]*severity[\s\S]*title[\s\S]*body[\s\S]*location[\s\S]*recommendation/);
  assert.match(review, /plans\/<slug>\/review\//);
});

test("parity runnerとprototype helperはcanonical artifactsを検証する", async () => {
  const runnerPath = ".agents/skills/plan/scripts/parity-runner.mjs";
  const revisionPath = ".agents/skills/plan/scripts/prototype-revision.mjs";
  await Promise.all([
    access(path.join(root, runnerPath)),
    access(path.join(root, revisionPath)),
    access(path.join(root, ".agents/skills/plan/references/parity-runner.md")),
    access(path.join(root, "dev-prototype.sh")),
  ]);
  const [runner, revision] = await Promise.all([read(runnerPath), read(revisionPath)]);
  for (const token of [
    "stateSetups",
    "rowProbeMap",
    "waitForVisible",
    "waitForHidden",
    "BrowserParityRunner",
    "performance-resource-timing",
    "browser-network-log",
    "window.scrollX/window.scrollY",
    "explicit-$implement-invocation",
    "validateEvidenceBundle",
  ]) {
    assert.ok(runner.includes(token), `parity runner omitted ${token}`);
  }
  assert.match(revision, /createHash\("sha256"\)/);
  assert.match(revision, /ui-contract\.json/);
  assert.match(revision, /productionBaseline\.sources/);
});

test("skill metadataは明示呼び出しを維持しUI説明の長さとpromptを満たす", async () => {
  for (const name of allSkillNames) {
    const yaml = await read(`.agents/skills/${name}/agents/openai.yaml`);
    assert.match(yaml, /allow_implicit_invocation: false/);
    assert.match(yaml, new RegExp(`default_prompt: "[^\\n]*\\$${name.replaceAll("-", "\\-")}`));
    const description = /^\s*short_description:\s*"([^"]+)"$/mu.exec(yaml)?.[1];
    assert.ok(description, `${name} is missing short_description`);
    assert.ok(description.length >= 25 && description.length <= 64, `${name} short_description length is invalid`);
  }
});

test("skill別モデル推奨は通常既定と手動切替を定義し固定routingを追加しない", async () => {
  const [config, workflow, ...skillFiles] = await Promise.all([
    read(".codex/config.toml"),
    read("docs/development/codex-development-workflow.md"),
    ...allSkillNames.flatMap((name) => [
      read(`.agents/skills/${name}/SKILL.md`),
      read(`.agents/skills/${name}/agents/openai.yaml`),
    ]),
  ]);

  const firstTableOffset = config.search(/^\s*\[/m);
  assert.notEqual(firstTableOffset, -1);
  const topLevelConfig = config.slice(0, firstTableOffset);
  assert.match(topLevelConfig, /^model = "gpt-5\.6-terra"$/m);
  assert.match(topLevelConfig, /^model_reasoning_effort = "medium"$/m);
  assert.equal(config.match(/^model\s*=/gm)?.length, 1);
  assert.equal(config.match(/^model_reasoning_effort\s*=/gm)?.length, 1);
  assert.match(config, /^\[mcp_servers\."openaiDeveloperDocs"\]$/m);

  for (const row of [
    "| `$plan` | `gpt-5.6-sol` | `high` |",
    "| `$plan-critic` | `gpt-5.6-terra` | `high` |",
    "| `$implement` | `gpt-5.6-sol` | `high` |",
    "| `$review` | `gpt-5.6-sol` | `high` |",
    "| `$git-commit-push-pr` | `gpt-5.6-luna` | `medium` |",
    "| `$workflow-retrospective` | `gpt-5.6-terra` | `high` |",
  ]) {
    assert.ok(workflow.includes(row), `workflow omitted model recommendation: ${row}`);
  }
  assert.match(workflow, /composerで次のモデルとreasoningを手動選択する/);
  assert.match(workflow, /`\$plan-critic`と`\$review`の履歴なしsubagent/);
  assert.match(workflow, /spawn時のmodelまたはreasoning overrideを渡さない/);
  assert.match(workflow, /親taskで選択したmodelとreasoningを継承する/);
  assert.match(workflow, /`xhigh`、`max`、`ultra`は通常既定にもskill別推奨にも使わない/);
  assert.match(workflow, /品質不足が確認された場合だけ/);
  assert.match(workflow, /project-local `profiles`はこの手動切替の適用対象外/);

  const modelSelection = workflow.match(/^## モデル選択\n[\s\S]*?(?=^## )/m)?.[0];
  assert.ok(modelSelection, "workflow is missing the model selection section");
  assert.doesNotMatch(modelSelection, /モデル.{0,20}自動(?:選択|切替)|自動routingを(?:行う|使う)/u);
  assert.doesNotMatch(modelSelection, /週次換算率|削減率/u);

  assert.doesNotMatch(config, /^\s*\[agents(?:\.|\])/m);
  assert.doesNotMatch(config, /^\s*\[profiles(?:\.|\])/m);
  assert.doesNotMatch(config, /^\s*agents\.default_subagent_/m);
  assert.doesNotMatch(config, /^\s*(?:agents|profiles)\s*=/m);
  await assert.rejects(access(path.join(root, ".codex/agents")), { code: "ENOENT" });
  for (const skillFile of skillFiles) {
    assert.doesNotMatch(skillFile, /gpt-5\.|^\s*(?:model|model_reasoning_effort|reasoning_effort)\s*[:=]/m);
  }
});

test("明示的な6 skill構成を保ちlifecycle・固定model・旧agentを復活させない", async () => {
  const removed = [
    ".agents/skills/implementation-planner/SKILL.md",
    ".agents/skills/implementation-executor/SKILL.md",
    ".agents/skills/implementation-review/SKILL.md",
    ".agents/skills/final-plan-rewriter/SKILL.md",
    "scripts/validate-plan-file.mjs",
    "scripts/validate-review-data.mjs",
    ".codex/agents/implementer.toml",
    ".codex/agents/plan_author.toml",
  ];
  for (const relative of removed) {
    await assert.rejects(access(path.join(root, relative)), { code: "ENOENT" });
  }
  const [config, workflow, ...skills] = await Promise.all([
    read(".codex/config.toml"),
    read("docs/development/codex-development-workflow.md"),
    ...allSkillNames.map((name) => read(`.agents/skills/${name}/SKILL.md`)),
  ]);
  assert.match(workflow, /独自runtime、専用agent、固定model routing、lifecycle state machineは作らない/);
  assert.doesNotMatch(config, /^\[agents\./m);
  for (const skill of skills) {
    assert.doesNotMatch(skill, /implementation-(?:planner|executor|review)|final-plan-rewriter|G0[1-6]|gpt-5\./);
  }
});

test("plan生成物はignoredでshipping skillと自動結合しない", async () => {
  const [gitignore, shipping] = await Promise.all([
    read(".gitignore"),
    read(".agents/skills/git-commit-push-pr/SKILL.md"),
  ]);
  assert.match(gitignore, /^\/plans\/\*\.md$/m);
  assert.match(gitignore, /^!\/plans\/template\.md$/m);
  assert.match(gitignore, /^\/plans\/\*\/$/m);
  assert.match(shipping, /Generate the commit message only from the staged diff/);
  assert.match(shipping, /cleanup is a separate user-authorized operation/);
});
