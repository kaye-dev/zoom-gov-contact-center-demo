import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

const workflowSkillNames = ["plan", "implement", "review", "workflow-retrospective"];
const allSkillNames = [...workflowSkillNames, "git-commit-push-pr", "kabeuchi"];

function parseToml(relative: string): Record<string, unknown> {
  const result = spawnSync(
    "python3",
    [
      "-c",
      "import json, pathlib, sys, tomllib; print(json.dumps(tomllib.loads(pathlib.Path(sys.argv[1]).read_text())))",
      path.join(root, relative),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

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

test("planはauthoring後の返却直前にsmokeを1回だけ行う", async () => {
  const [plan, quality, goalQuality, parityReference] = await Promise.all([
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/plan/references/ui-prototype-quality.md"),
    read(".agents/skills/plan/references/goal-quality.md"),
    read(".agents/skills/plan/references/parity-runner.md"),
  ]);

  assert.match(plan, /authoritative requirements bundle/);
  assert.match(plan, /plans\/<slug>\/goal\.md/);
  assert.match(plan, /parity-spec\.json/);
  assert.match(plan, /prototype revision/);
  assert.match(plan, /smoke/);
  assert.match(plan, /Do not run the complete matrix/);
  assert.doesNotMatch(plan, /machineParityResults|UI承認記録|<row-id>=pending/);
  assert.match(plan, /user can give feedback|user.*feedback/iu);
  assert.match(plan, /Browser unavailability does not block a reviewable plan/);
  assert.match(plan, /Do not open the Browser while authoring/);
  assert.match(plan, /otherwise ready to return/);
  assert.match(plan, /at most one fresh no-history `project_explorer` custom agent/);
  assert.match(plan, /multiple independent subsystems or a large code\/document inventory/);
  assert.match(plan, /If it is unavailable, continue the investigation locally and report/);
  assert.match(quality, /Prepare iterative review/);
  assert.match(goalQuality, /explicit `\$implement` invocation is the approval/);
  assert.match(goalQuality, /missing file means that phase was not run/);
  assert.match(parityReference, /representative desktop and 390×844/);
  assert.match(parityReference, /theme.*semantic-token.*native-control/);
  assert.match(parityReference, /responsive.*shell.*navigation.*layout/);
});

test("読みにくいplanは同じgoalを履歴なしの最終設計へ再整理する", async () => {
  const [workflow, plan] = await Promise.all([
    read("docs/development/codex-development-workflow.md"),
    read(".agents/skills/plan/SKILL.md"),
  ]);
  const rewritePrompt = `最終設計を、最初からこの結論を採用していたものとして全面的に書き直してください。

読者はこの会話の経緯を一切知らない新規参加者とする。経緯を知らないと意味が通じない文は残さないこと。

過去案、却下理由、変更履歴、以前の設計との比較として書かれた「◯◯はやらない」は削除してください。
ただし、現在の仕様として必要な制約、安全境界、対象外、互換性、移行・ロールバック条件は残してください。`;
  assert.ok(workflow.includes(rewritePrompt));
  assert.match(workflow, /同じ`plans\/<slug>\/goal\.md`/);
  assert.match(workflow, /別skill、custom agent、追加のBrowser確認は起動しない/);
  assert.match(plan, /as if the current conclusion had been selected from the beginning/);
  assert.match(plan, /Preserve every current constraint, safety boundary, exclusion, compatibility requirement, and migration or rollback condition/);
  assert.match(plan, /Do not start another skill or custom agent, and do not run Browser solely for this editorial rewrite/);
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
  assert.match(implement, /do not delegate implementation to a custom agent/);
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
  assert.match(review, /two fresh no-history `independent_reviewer` custom agents/);
  assert.match(review, /Stop if either custom agent or its configured model is unavailable/);
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

test("親モデル既定を持たず3つのread-only custom agentへ限定routingする", async () => {
  const [configText, workflow, evaluator, ...skillFiles] = await Promise.all([
    read(".codex/config.toml"),
    read("docs/development/codex-development-workflow.md"),
    read("scripts/eval-plan-skills.mjs"),
    ...allSkillNames.flatMap((name) => [
      read(`.agents/skills/${name}/SKILL.md`),
      read(`.agents/skills/${name}/agents/openai.yaml`),
    ]),
  ]);

  const config = parseToml(".codex/config.toml");
  assert.equal(config.model, undefined);
  assert.equal(config.model_reasoning_effort, undefined);
  assert.match(configText, /^\[mcp_servers\."openaiDeveloperDocs"\]$/m);
  assert.doesNotMatch(configText, /default_subagent_model|default_subagent_reasoning_effort|max_threads/);

  const agents = config.agents as Record<string, { description: string; config_file: string }>;
  assert.deepEqual(Object.keys(agents).sort(), [
    "independent_reviewer",
    "product_advisor",
    "project_explorer",
  ]);
  const roles = {
    product_advisor: { model: "gpt-5.6-terra", reasoning: "medium" },
    project_explorer: { model: "gpt-5.6-luna", reasoning: "medium" },
    independent_reviewer: { model: "gpt-5.6-terra", reasoning: "high" },
  } as const;
  for (const [name, expected] of Object.entries(roles)) {
    assert.equal(agents[name]?.config_file, `./agents/${name}.toml`);
    assert.ok(agents[name]?.description);
    const agent = parseToml(`.codex/agents/${name}.toml`);
    assert.equal(agent.name, name);
    assert.equal(agent.model, expected.model);
    assert.equal(agent.model_reasoning_effort, expected.reasoning);
    assert.equal(agent.sandbox_mode, "read-only");
    assert.match(String(agent.developer_instructions), /Do not edit files/);
  }

  for (const row of [
    "| `$plan` | `gpt-5.6-sol` | `high` |",
    "| `$implement` | `gpt-5.6-sol` | `high` |",
    "| `$review` | `gpt-5.6-sol` | `high` |",
    "| `$git-commit-push-pr` | `gpt-5.6-luna` | `medium` |",
    "| `$workflow-retrospective` | `gpt-5.6-terra` | `high` |",
  ]) {
    assert.ok(workflow.includes(row), `workflow omitted model recommendation: ${row}`);
  }
  for (const row of [
    "| `$kabeuchi` | `product_advisor` | `gpt-5.6-terra` | `medium` |",
    "| `$plan` | `project_explorer` | `gpt-5.6-luna` | `medium` |",
    "| `$review` | `independent_reviewer` | `gpt-5.6-terra` | `high` |",
  ]) {
    assert.ok(workflow.includes(row), `workflow omitted custom agent routing: ${row}`);
  }
  assert.match(workflow, /親エージェントのproject-local既定モデルは設けない/);
  assert.match(workflow, /composerでユーザーが選択したモデルとreasoningを維持する/);
  assert.match(workflow, /spawn時のmodelまたはreasoning overrideを渡さない/);
  assert.match(workflow, /上表以外の一般subagentは.*親taskで選択した設定を継承する/);
  assert.match(workflow, /`xhigh`、`max`、`ultra`は親エージェントのskill別推奨にもcustom agentの固定設定にも使わない/);
  assert.match(workflow, /品質不足が確認された場合だけ/);
  assert.match(workflow, /skillメタデータとproject-local `profiles`ではmodelを指定しない/);
  assert.match(workflow, /`\$implement`、`\$git-commit-push-pr`、`\$workflow-retrospective`はsubagentへ委譲せず/);

  const modelSelection = workflow.match(/^## モデル選択\n[\s\S]*?(?=^## )/m)?.[0];
  assert.ok(modelSelection, "workflow is missing the model selection section");
  assert.doesNotMatch(modelSelection, /モデル.{0,20}自動(?:選択|切替)|自動routingを(?:行う|使う)/u);
  assert.doesNotMatch(modelSelection, /週次換算率|削減率/u);

  assert.match(evaluator, /"\.codex", "agents"/);
  assert.match(evaluator, /agents\.project_explorer/);
  assert.match(evaluator, /agents\.independent_reviewer/);
  assert.doesNotMatch(evaluator.match(/"\.codex\/config\.toml",[\s\S]*?\n\s*\);/u)?.[0] ?? "", /mcp_servers/);
  for (const skillFile of skillFiles) {
    assert.doesNotMatch(skillFile, /gpt-5\.|^\s*(?:model|model_reasoning_effort|reasoning_effort)\s*[:=]/m);
  }
});

test("kabeuchiは明示呼び出しで1体のadvisorだけをread-only利用する", async () => {
  const [skill, metadata] = await Promise.all([
    read(".agents/skills/kabeuchi/SKILL.md"),
    read(".agents/skills/kabeuchi/agents/openai.yaml"),
  ]);
  assert.match(skill, /exactly one fresh no-history `product_advisor` custom agent/);
  assert.match(skill, /Do not pass a model or reasoning override/);
  assert.match(skill, /only the current question, confirmed decisions, and necessary evidence/);
  assert.match(skill, /If the custom agent or its configured model is unavailable, stop/);
  assert.match(skill, /Do not silently substitute another agent or model/);
  assert.match(skill, /Validate the advice against the available evidence/);
  assert.match(skill, /Do not edit files, create or revise a plan, implement changes, mutate Git state, or perform external writes/);
  assert.match(metadata, /allow_implicit_invocation: false/);
  assert.doesNotMatch(metadata, /gpt-5\.|model|reasoning/);
});

test("実装・shipping・振り返りはcustom agentへ委譲しない", async () => {
  const [implement, shipping, retrospective] = await Promise.all([
    read(".agents/skills/implement/SKILL.md"),
    read(".agents/skills/git-commit-push-pr/SKILL.md"),
    read(".agents/skills/workflow-retrospective/SKILL.md"),
  ]);
  assert.match(implement, /do not delegate implementation to a custom agent/);
  assert.match(shipping, /Do not delegate it to a custom agent/);
  assert.match(retrospective, /Do not delegate the audit to a custom agent/);
  for (const skill of [implement, shipping, retrospective]) {
    assert.doesNotMatch(skill, /`product_advisor`|`project_explorer`|`independent_reviewer`/);
  }
});

test("明示的な6 skill構成を保ち廃止skill・lifecycle・旧implementation agentを復活させない", async () => {
  const removed = [
    ".agents/skills/plan-critic/SKILL.md",
    ".agents/skills/plan-critic/agents/openai.yaml",
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
  assert.match(workflow, /custom agentは、壁打ち、広範な読み取り探索、独立reviewという限定されたread-onlyロールだけに使う/);
  assert.match(config, /^\[agents\.product_advisor\]$/m);
  assert.match(config, /^\[agents\.project_explorer\]$/m);
  assert.match(config, /^\[agents\.independent_reviewer\]$/m);
  assert.doesNotMatch(workflow, /\$plan-critic|plan-critic/);
  for (const skill of skills) {
    assert.doesNotMatch(skill, /implementation-(?:planner|executor|review)|final-plan-rewriter|G0[1-6]|gpt-5\./);
  }
});

test("plan生成物はignoredでshipping skillと自動結合しない", async () => {
  const [gitignore, shipping] = await Promise.all([
    read(".gitignore"),
    read(".agents/skills/git-commit-push-pr/SKILL.md"),
  ]);
  assert.match(gitignore, /^\/plans\/\*$/m);
  assert.match(gitignore, /^!\/plans\/template\.md$/m);
  assert.match(gitignore, /^\/plan\/$/m);
  assert.match(shipping, /Generate the commit message only from the staged diff/);
  assert.match(shipping, /cleanup is a separate user-authorized operation/);
});
