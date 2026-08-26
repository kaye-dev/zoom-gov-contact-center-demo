import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { REQUIRED_HEADINGS, TEMPLATE_BODY_SENTINELS, validatePlanText } from "../scripts/validate-plan-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFile(path.join(root, relative), "utf8");
const validateTemplate = (text: string) => validatePlanText(text, { allowTemplatePlaceholders: true });

test("plans/template.mdは日本語の正規見出し・task・checkboxを持つ", async () => {
  const template = await read("plans/template.md");
  assert.deepEqual(template.match(/^## .+$/gm), REQUIRED_HEADINGS);
  assert.deepEqual(validateTemplate(template), []);
  assert.match(template, /\| 並列グループ \| タスクID \|/);
  assert.match(template, /- \[ \] T01:/);
  for (const gate of ["G01", "G02", "G03", "G04", "G05", "G06"]) assert.match(template, new RegExp(`- \\[ \\] ${gate}:`));
});

test("plan validatorはtask tableと進捗checkboxの不一致・重複を拒否する", async () => {
  const template = await read("plans/template.md");
  assert.match(validateTemplate(template.replace("- [ ] T01:", "- [ ] T02:")).join("\n"), /完全一致/);
  const taskRow = template.match(/^\| P1 \| T01 \|.*$/m)?.[0] ?? "";
  assert.match(validateTemplate(template.replace(taskRow, `${taskRow}\n${taskRow.replace("| P1 |", "| P2 |")}`)).join("\n"), /重複/);
  const englishOnly = template.split("\n").map((line) => /^## |^- [^:]+:|^\||^- \[[ x]\]/.test(line) ? line : (line.trim() ? "English only prose." : line)).join("\n");
  assert.match(validateTemplate(englishOnly).join("\n"), /日本語/);
});

test("plan validatorはmetadataの別section配置・重複・不正値・空sectionを拒否する", async () => {
  const template = await read("plans/template.md");
  const moved = template.replace("- status: draft\n", "").replace("## 対象範囲\n", "## 対象範囲\n\n- status: draft\n");
  assert.match(validateTemplate(moved).join("\n"), /metadata status/);
  assert.match(validateTemplate(template.replace("- status: draft", "- status: draft\n- status: approved")).join("\n"), /metadata status/);
  assert.match(validateTemplate(template.replace("- base_commit: <Git commit SHA>", "- base_commit: nope")).join("\n"), /base_commit/);
  assert.match(validateTemplate(template.replace("## 対象外\n\n変更しない機能、外部サービス、本番操作を記載する。", "## 対象外\n")).join("\n"), /対象外.*空/);
  const finalHeading = "## 前提と未決事項";
  assert.match(validateTemplate(`${template.slice(0, template.indexOf(finalHeading))}${finalHeading}`).join("\n"), /前提と未決事項.*空/);
});

test("非draft planはplan・UI承認とG01・G02を機械的に要求する", async () => {
  const template = await read("plans/template.md");
  const actual = template
    .replace("# <計画名>", "# 承認済み計画")
    .replace("- plan_id: <英小文字・数字・ハイフン>", "- plan_id: approved-plan")
    .replace("- 作成日: YYYY-MM-DD", "- 作成日: 2026-08-27")
    .replace("- base_commit: <Git commit SHA>", `- base_commit: ${"a".repeat(40)}`)
    .replace("- status: draft", "- status: approved")
    .replace("- plan承認記録: 未承認", "- plan承認記録: 2026-08-27 ユーザー承認")
    .replace("- UI変更有無: UI変更なし", "- UI変更有無: UI変更あり: 設定画面")
    .replace("- UI承認記録: UI変更なし", "- UI承認記録: 2026-08-27 prototype承認")
    .replace("- [ ] G01:", "- [x] G01:")
    .replace("- [ ] G02:", "- [x] G02:")
    .replace(/<実装内容>|<変更対象パス>|<完了条件>|<検証>|<タスク名>|<条件>/gu, "実装内容");
  const resolved = TEMPLATE_BODY_SENTINELS.reduce((text, sentinel) => text.replace(sentinel, "実装内容を日本語で確定した。"), actual);
  assert.deepEqual(validatePlanText(resolved), []);
  assert.match(validatePlanText(resolved.replace("- [x] G02:", "- [ ] G02:")).join("\n"), /G02完了/);
  assert.match(validatePlanText(resolved.replace("- UI承認記録: 2026-08-27 prototype承認", "- UI承認記録: 未承認")).join("\n"), /UI承認記録/);
  assert.match(validatePlanText(resolved.replace("- UI変更有無: UI変更あり: 設定画面", "- UI変更有無: あり")).join("\n"), /UI変更有無/);
});

test("plan validatorはreviewing・delivery_ready・shippedの完了条件を状態別に要求する", async () => {
  const template = await read("plans/template.md");
  const actual = template
    .replace("# <計画名>", "# 状態遷移計画")
    .replace("- plan_id: <英小文字・数字・ハイフン>", "- plan_id: lifecycle-plan")
    .replace("- 作成日: YYYY-MM-DD", "- 作成日: 2026-08-27")
    .replace("- base_commit: <Git commit SHA>", `- base_commit: ${"a".repeat(40)}`)
    .replace("- status: draft", "- status: reviewing")
    .replace("- plan承認記録: 未承認", "- plan承認記録: 2026-08-27 ユーザー承認")
    .replace("- [ ] G01:", "- [x] G01:")
    .replace("- [ ] G02:", "- [x] G02:")
    .replace("- [ ] G03:", "- [x] G03:")
    .replace(/<実装内容>|<変更対象パス>|<完了条件>|<検証>|<タスク名>|<条件>/gu, "実装内容");
  const reviewing = TEMPLATE_BODY_SENTINELS.reduce((text, sentinel) => text.replace(sentinel, "実装内容を日本語で確定した。"), actual);
  assert.deepEqual(validatePlanText(reviewing), []);
  assert.match(validatePlanText(reviewing.replace("- [x] G03:", "- [ ] G03:")).join("\n"), /reviewingはG03/);

  const deliveryReady = reviewing
    .replace("- status: reviewing", "- status: delivery_ready")
    .replace("- [ ] T01:", "- [x] T01:")
    .replace("- [ ] G04:", "- [x] G04:")
    .replace("- [ ] G05:", "- [x] G05:");
  assert.deepEqual(validatePlanText(deliveryReady), []);
  assert.match(validatePlanText(deliveryReady.replace("- [x] T01:", "- [ ] T01:")).join("\n"), /全実装task/);
  assert.match(validatePlanText(deliveryReady.replace("- [x] G05:", "- [ ] G05:")).join("\n"), /delivery_readyはG05/);

  const shipped = deliveryReady.replace("- status: delivery_ready", "- status: shipped");
  assert.match(validatePlanText(shipped).join("\n"), /shippedはG06/);
  assert.deepEqual(validatePlanText(shipped.replace("- [ ] G06:", "- [x] G06:")), []);
});

test("plan validatorはtask表の列不足・checkboxの別section配置・未置換placeholderを拒否する", async () => {
  const template = await read("plans/template.md");
  assert.match(validateTemplate(template.replace(/^\| P1 \| T01 \|.*$/m, "| P1 | T01 |")).join("\n"), /9列/);
  const moved = template.replace("- [ ] T01: <タスク名> — 完了条件: <条件> — 検証: 未実施\n", "").replace("## 実行記録\n", "## 実行記録\n\n- [ ] T01: 実装 — 完了条件: 成功 — 検証: 未実施\n");
  assert.match(validateTemplate(moved).join("\n"), /進捗管理section/);
  const actual = template.replace("# <計画名>", "# 実装計画").replace("- plan_id: <英小文字・数字・ハイフン>", "- plan_id: implementation-plan").replace("- 作成日: YYYY-MM-DD", "- 作成日: 2026-08-26").replace("- base_commit: <Git commit SHA>", `- base_commit: ${"a".repeat(40)}`);
  assert.match(validatePlanText(actual).join("\n"), /placeholder/);
  const proseOnly = actual.replace(/<実装内容>|<変更対象パス>|<完了条件>|<検証>|<タスク名>|<条件>/gu, "実装内容");
  assert.match(validatePlanText(proseOnly).join("\n"), /説明文/);
  const extraRow = template.replace(/^\| P1 \| T01 \|.*$/m, (row) => `${row}\n| P1| T99 | 実装 | implementer | path | shared | なし | 完了 | test | extra |`);
  assert.match(validateTemplate(extraRow).join("\n"), /9列/);
  assert.match(validateTemplate(template.replace("|---|---|---|---|---|---|---|---|---|", "|---|---|")).join("\n"), /delimiter|9列/);
});

test("plannerとexecutorは明示呼び出しの軽量handoffである", async () => {
  const [planner, executor, plannerUi, executorUi] = await Promise.all([
    read(".agents/skills/implementation-planner/SKILL.md"),
    read(".agents/skills/implementation-executor/SKILL.md"),
    read(".agents/skills/implementation-planner/agents/openai.yaml"),
    read(".agents/skills/implementation-executor/agents/openai.yaml"),
  ]);
  assert.match(planner, /plans\/template\.md/);
  assert.match(planner, /implementation-task and gate checkboxes/);
  assert.match(executor, /not a custom Plan Mode|not create its own runtime/);
  assert.doesNotMatch(executor, /state\.json|fingerprint|execution-contract/);
  assert.match(plannerUi, /allow_implicit_invocation: false/);
  assert.match(executorUi, /allow_implicit_invocation: false/);
});

test("HTML review skillはcatnose式の意図別・リスク順・二段階・copy導線を持つ", async () => {
  const [skill, ui, workflow] = await Promise.all([
    read(".agents/skills/implementation-review/SKILL.md"),
    read(".agents/skills/implementation-review/agents/openai.yaml"),
    read("docs/codex-development-workflow.md"),
  ]);
  for (const pattern of [/Group related edits by intent/, /Sort groups by risk/, /blind_diff_reviewer/, /plan_conformance_reviewer/, /human comments/, /Codex in-app Browser/]) {
    assert.match(skill, pattern);
  }
  assert.match(ui, /allow_implicit_invocation: false/);
  assert.match(workflow, /独自app serverやexecution engineではない/);
  assert.match(workflow, /人間コメント/);
  assert.match(skill, /live parent permission can override/);
  assert.match(skill, /post-pass tamper check/);
  assert.match(workflow, /全差分snapshot/);
  assert.match(workflow, /親task自体をread-only/);
});

test("custom agent routingはSol・Terra・Lunaの役割を固定する", async () => {
  const [author, blind, conformance, implementer, worker, config] = await Promise.all([
    read(".codex/agents/plan_author.toml"),
    read(".codex/agents/blind_diff_reviewer.toml"),
    read(".codex/agents/plan_conformance_reviewer.toml"),
    read(".codex/agents/implementer.toml"),
    read(".codex/agents/mechanical_worker.toml"),
    read(".codex/config.toml"),
  ]);
  for (const agent of [author, blind, conformance]) {
    assert.match(agent, /model = "gpt-5\.6-sol"/);
    assert.match(agent, /model_reasoning_effort = "xhigh"/);
    assert.match(agent, /sandbox_mode = "read-only"/);
  }
  assert.match(implementer, /gpt-5\.6-terra/);
  assert.match(implementer, /model_reasoning_effort = "high"/);
  assert.match(worker, /gpt-5\.6-luna/);
  assert.match(worker, /model_reasoning_effort = "medium"/);
  assert.doesNotMatch(config, /implementation_reviewer/);
});

test("final planとshippingはtemplate・実差分・exact一時directoryをつなぐ", async () => {
  const [rewriter, shipping] = await Promise.all([
    read(".agents/skills/final-plan-rewriter/SKILL.md"),
    read(".agents/skills/git-commit-push-pr/SKILL.md"),
  ]);
  assert.match(rewriter, /plans\/template\.md/);
  assert.match(rewriter, /plans\/tmp\/<plan-id>\/final\.md/);
  assert.match(shipping, /Generate both subject and body independently from the staged diff/);
  assert.doesNotMatch(shipping, /Reuse the final plan's objective|Plan prose may be copied/);
  assert.match(shipping, /delete only the exact `plans\/tmp\/<plan-id>\/` directory/);
  assert.match(shipping, /separately and explicitly authorizes cleanup/);
  assert.match(shipping, /synchronize the remote PR base before accepting the final plan base/);
  assert.match(shipping, /Do not rebase or merge the reviewed HEAD/);
  assert.match(shipping, /reported as `BEHIND`/);
  assert.match(shipping, /git merge-base --is-ancestor <recorded-remote-base-oid> <current-remote-base-oid>/);
  assert.match(shipping, /rewind, force-update, deletion, or unrelated replacement must stop before push/);
  assert.doesNotMatch(shipping, /post-commit review validation still passes after any rebase or merge/);
  assert.doesNotMatch(shipping, /plan-execution-state|state\.json/);
});
