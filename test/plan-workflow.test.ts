import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parseTOML } from "confbox";

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

function parseTomlSource(relative: string, source: string): Record<string, unknown> {
  try {
    return parseTOML(source) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to parse TOML: ${relative}`, { cause: error });
  }
}

function parseToml(relative: string): Record<string, unknown> {
  return parseTomlSource(
    relative,
    readFileSync(path.join(root, relative), "utf8"),
  );
}

test("TOML設定はNode内で解析される", () => {
  const environment = parseToml(".codex/environments/environment.toml");
  const config = parseToml(".codex/config.toml");
  const productAdvisor = parseToml(".codex/agents/product_advisor.toml");
  const projectExplorer = parseToml(".codex/agents/project_explorer.toml");
  const independentReviewer = parseToml(".codex/agents/independent_reviewer.toml");

  assert.equal(environment.name, "zoom-gov-contact-center-demo");
  assert.deepEqual(Object.keys(config.agents as Record<string, unknown>).sort(), [
    "independent_reviewer",
    "product_advisor",
    "project_explorer",
  ]);
  assert.equal(productAdvisor.model, "gpt-5.6-terra");
  assert.equal(projectExplorer.model, "gpt-5.6-luna");
  assert.equal(independentReviewer.model_reasoning_effort, "high");
});

test("TOML parserは直接依存として固定される", async () => {
  const packageJson = JSON.parse(await read("package.json")) as {
    devDependencies: Record<string, string>;
  };
  const packageLock = JSON.parse(await read("package-lock.json")) as {
    packages: Record<
      string,
      { devDependencies?: Record<string, string>; version?: string }
    >;
  };

  assert.equal(packageJson.devDependencies.confbox, "0.2.4");
  assert.equal(packageLock.packages[""].devDependencies?.confbox, "0.2.4");
  assert.equal(packageLock.packages["node_modules/confbox"].version, "0.2.4");
});

test("不正TOMLは対象path付きで失敗する", () => {
  assert.throws(
    () => parseTomlSource("fixtures/invalid.toml", "[invalid"),
    { message: "Failed to parse TOML: fixtures/invalid.toml" },
  );
});

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
    "coverage matrix",
    "risk rows",
    "anchor rows",
    "full parity条件",
    "human UI review",
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
  assert.match(plan, /Do not run the coverage or full matrix/);
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
  assert.match(goalQuality, /missing final file means automated coverage did not complete/);
  assert.match(parityReference, /144 coverage rows and 1,440 full rows/);
  assert.match(parityReference, /risk row/);
  assert.match(parityReference, /anchor/);
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

test("implementはinvocation approval後にcoverage-driven finalを実行する", async () => {
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
  assert.match(implement, /Coverage scope and start gate/);
  assert.match(implement, /Browser availability is not a start gate/);
  assert.match(implement, /Do not probe Browser capability/);
  assert.match(implement, /Final coverage run/);
  assert.match(implement, /schema-version-4/);
  assert.match(implement, /do not create `pre-edit-parity\.json`/i);
  assert.match(implement, /matrixScope: coverage/);
  assert.match(implement, /matrixScope: full/);
  assert.match(implement, /release.*ci.*scheduled.*explicit/s);
  assert.match(implement, /Retry only the failed batch once/);
  assert.match(implement, /There is no run-wide time cutoff/);
  assert.match(implement, /in-app-browser-parity-adapter\.mjs/);
  assert.match(implement, /prepare-run/);
  assert.match(implement, /next-batch/);
  assert.match(implement, /record-batch/);
  assert.match(implement, /record-failure/);
  assert.match(implement, /invalidate-run/);
  assert.match(implement, /resume-run/);
  assert.match(implement, /finalize-run/);
  assert.match(implement, /task-specific adapters.*runtime shims/s);
  assert.match(implement, /Run the full test suite only when/);
  assert.match(implement, /Run a production build only for/);
  assert.match(implement, /sourceImpactMap/);
  assert.match(implement, /Automated coverage, human visual approval, and full parity are independent states/);
  assert.match(implement, /do not delegate implementation to a custom agent/);
  assert.match(workflow, /`coverage`を通常既定/);
  assert.match(workflow, /schema version 4/);
  assert.match(workflow, /task固有adapter、実行可能bundle、runtime shimを新設しない/);
  assert.match(workflow, /全testは.*場合.*production buildは.*場合/s);
  assert.match(workflow, /pre-editとaffectedのBrowser phaseは新規runで実行しない/);
  assert.match(workflow, /全target-state\/viewport\/theme coverage/);
  assert.match(workflow, /LLMには件数、失敗row ID/);
});

test("WF-01 in-app parity lifecycle contract", async () => {
  const [plan, implement, review, workflow, reference, gitignore] = await Promise.all([
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/implement/SKILL.md"),
    read(".agents/skills/review/SKILL.md"),
    read("docs/development/codex-development-workflow.md"),
    read(".agents/skills/plan/references/parity-runner.md"),
    read(".gitignore"),
  ]);
  assert.match(plan, /parity-spec\.json` version 3/u);
  assert.match(plan, /browserSetups/u);
  for (const contract of [implement, workflow, reference]) {
    assert.match(contract, /prepare-run/u);
    assert.match(contract, /next-batch/u);
    assert.match(contract, /record-batch/u);
    assert.match(contract, /resume-run/u);
    assert.match(contract, /finalize-run/u);
    assert.match(contract, /390x844 \/ DPR 1|390×844 \/ DPR 1/u);
  }
  assert.match(review, /terminal cleanup|terminal finalization/u);
  assert.match(review, /parity-runs/u);
  assert.match(review, /schema-version-4/u);
  assert.match(reference, /PARITY_DPR_OVERRIDE_UNAVAILABLE/u);
  assert.match(reference, /PARITY_CLEANUP_FAILED/u);
  assert.match(reference, /one fresh selected in-app Browser tab/u);
  assert.match(reference, /144 coverage rows and 1,440 full rows/u);
  assert.match(gitignore, /^\/\.codex\/parity-runs\/$/mu);
});

test("CS-WF-01/02/03: confirmation handoffはskill別の明示境界とverification分離を持つ", async () => {
  const [plan, implement, review, workflow, devServer, agents] = await Promise.all([
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/implement/SKILL.md"),
    read(".agents/skills/review/SKILL.md"),
    read("docs/development/codex-development-workflow.md"),
    read(".claude/rules/dev-server.md"),
    read("AGENTS.md"),
  ]);
  assert.match(plan, /\.\/dev-prototype\.sh --retain <slug>/u);
  assert.match(plan, /do not create a prototype or confirmation session/u);
  for (const contract of [implement, review, workflow, devServer, agents]) {
    assert.match(contract, /確認セッションを保持/u);
    assert.match(contract, /current (?:user )?invocation|現在のinvocation/u);
  }
  assert.match(implement, /Without that exact opt-in/u);
  assert.match(implement, /availability separately from parity verification/u);
  assert.match(review, /all three live URLs/u);
  assert.match(review, /without upgrading it/u);
  assert.match(devServer, /\.\/dev-confirmation\.sh status <slug>/u);
  assert.match(devServer, /\.\/dev-confirmation\.sh stop <slug>/u);
  assert.match(workflow, /active confirmation sessionのslug/u);
});

test("migrationだけを自動再起動理由としbuildとcleanupの境界を維持する", async () => {
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
    assert.match(contract, /\.\/dev-compose\.sh status --url/);
  }
  assert.match(implement, /may restart only[\s\S]*pending migration/u);
  assert.match(
    implement,
    /wait for the explicit `.\/dev-compose\.sh restart web` \(`Web restart`\) action/u,
  );
  assert.doesNotMatch(implement, /restart web` without asking/u);
  assert.match(implement, /Never stop a user-owned server for a build/);
  assert.match(implement, /Never run broad `docker compose down`/);
  assert.match(devServer, /自動的な`web`再起動はpending migration適用後/u);
  assert.match(devServer, /Local cleanupはno-op/u);
  assert.match(workflow, /wrapperが自動再起動できるのはpending migration適用後/u);
  assert.match(workflow, /baselineとの差分だけをcleanup/);
});

test("Local Environmentはworktree setupとcheckout-scoped actionだけを共有する", async () => {
  const [environmentText, gitignore, parityReference] = await Promise.all([
    read(".codex/environments/environment.toml"),
    read(".gitignore"),
    read(".agents/skills/plan/references/parity-runner.md"),
  ]);
  const environment = parseToml(".codex/environments/environment.toml");
  const setup = environment.setup as { script: string };
  const cleanup = environment.cleanup as { script: string };
  const actions = environment.actions as Array<{ name: string; command: string }>;
  assert.match(environmentText, /^# THIS IS AUTOGENERATED\. DO NOT EDIT MANUALLY$/mu);
  assert.match(setup.script, /npm ci/u);
  assert.match(setup.script, /\.\/dev-compose\.sh prepare/u);
  assert.doesNotMatch(setup.script, /dev-compose\.sh (?:ensure|up)/u);
  assert.match(cleanup.script, /^\n?\.\/dev-compose\.sh cleanup\n?$/u);
  assert.deepEqual(
    actions.map((action) => action.name),
    [
      "Runtime status",
      "App start",
      "Web restart (explicit)",
      "Runtime stop",
      "Runtime contract tests",
    ],
  );
  for (const action of actions) {
    assert.doesNotMatch(action.command, /docker compose/u);
  }
  assert.match(gitignore, /^\/\.codex\/runtime\.local\.env$/mu);
  assert.match(gitignore, /^\/\.codex\/runtime-session\.local\.json$/mu);
  assert.match(gitignore, /^\/\.codex\/confirmation-session\.local\.json$/mu);
  assert.match(parityReference, /status --url/u);
  assert.match(parityReference, /3100-3899/u);
});

test("reviewはstructured evidenceを先に検証して二つのpassを並行実行する", async () => {
  const review = await read(".agents/skills/review/SKILL.md");
  assert.match(review, /approval\.json/);
  assert.match(review, /implementation-parity\.json/);
  assert.match(review, /schema-version-4/);
  assert.match(review, /node \.agents\/skills\/plan\/scripts\/prototype-revision\.mjs plans\/<slug>\/prototype/);
  assert.match(review, /review-data\.json\.validations/);
  assert.match(review, /current `sha256:` revision/);
  assert.match(review, /New runs do not create `pre-edit-parity\.json`/);
  assert.match(review, /target-state\/target-viewport\/target-theme coverage/);
  assert.match(review, /automationCoverageStatus/);
  assert.match(review, /humanVisualApprovalStatus/);
  assert.match(review, /fullParityStatus/);
  assert.match(review, /existing plan with only legacy goal\/Markdown evidence/);
  assert.match(review, /schema versions 1, 2, and 3 as legacy read-only inputs/);
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
  const [runnerFacade, runnerCore, workspace, revision] = await Promise.all([
    read(runnerPath),
    read(".agents/skills/plan/scripts/parity-runner-core.mjs"),
    read(".agents/skills/plan/scripts/parity-run-workspace.mjs"),
    read(revisionPath),
  ]);
  const runner = `${runnerFacade}\n${runnerCore}\n${workspace}`;
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
    "prepare-run",
    "record-batch",
    "finalize-run",
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

test("git shippingのdetached引受けと再開prompt契約はworkflowと一致する", async () => {
  const [shipping, workflow] = await Promise.all([
    read(".agents/skills/git-commit-push-pr/SKILL.md"),
    read("docs/development/codex-development-workflow.md"),
  ]);

  assert.doesNotMatch(shipping, /Stop for a detached HEAD/);
  for (const pattern of [
    /detached HEAD continues to section 2/,
    /git merge-base --is-ancestor HEAD <remote>\/<base>/,
    /git switch -c <topic> HEAD/,
    /次に送るプロンプト/,
    /expected full HEAD SHA/,
    /remote base OID/,
    /current-task path allowlist/,
    /staged binary-patch digest/,
    /do not stop again for the same ambiguity/,
    /git restore --staged -- <explicit excluded paths>/,
    /If any captured value drifted, apply none of the prompt/,
  ]) {
    assert.match(shipping, pattern);
  }
  for (const pattern of [
    /安全条件を満たすdetached HEAD/,
    /repository、full HEAD、baseとOID/,
    /`次に送るプロンプト`/,
    /snapshotが一致すれば同じ停止理由を再質問せず/,
    /`git restore --staged --`/,
    /snapshotが変わっていれば何も部分適用せず/,
  ]) {
    assert.match(workflow, pattern);
  }
});

test("git shippingはdetached引受け後も既存の禁止操作を維持する", async () => {
  const shipping = await read(".agents/skills/git-commit-push-pr/SKILL.md");

  for (const pattern of [
    /Never use `-C`/,
    /`--ignore-other-worktrees`/,
    /Never use `git add \.`/,
    /`git add -A`/,
    /`git commit -a`/,
    /Never use `--force`/,
    /`--force-with-lease`/,
    /does not authorize force pushing, stashing or discarding changes/,
    /does not authorize.*creating a fork, merging the pull request, or waiting for CI/,
    /never authorizes `--worktree`/,
  ]) {
    assert.match(shipping, pattern);
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
