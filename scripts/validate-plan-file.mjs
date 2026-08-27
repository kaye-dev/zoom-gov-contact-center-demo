#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const REQUIRED_HEADINGS = [
  "## メタデータ",
  "## 目的と完了条件",
  "## 現状と根拠",
  "## 対象範囲",
  "## 対象外",
  "## 確定した設計",
  "## UI契約",
  "## インターフェースとデータフロー",
  "## 並列実装計画",
  "## 進捗管理",
  "## 実行記録",
  "## 検証計画",
  "## リスクとロールバック",
  "## 前提と未決事項",
];

const REQUIRED_METADATA = [
  "template_version",
  "plan_id",
  "plan_version",
  "作成日",
  "base_commit",
  "status",
  "UI変更有無",
  "計画モデル",
  "plan承認記録",
  "UI承認記録",
];

const STATUS_VALUES = new Set(["draft", "approved", "implementing", "reviewing", "delivery_ready", "shipped", "blocked"]);
const TABLE_HEADER = "| 並列グループ | タスクID | 実装内容 | 担当agent/model | write_set | 実行環境 | 依存タスク | 完了条件 | 検証 |";
const TABLE_DELIMITER = "|---|---|---|---|---|---|---|---|---|";
export const TEMPLATE_BODY_SENTINELS = [
  "この変更の目的、利用者、完了時に確認できる結果を日本語で記載する。",
  "関連する実装、runtime、既存UI、repo規約、参照した一次資料を記載する。推測と確認済み事実を分ける。",
  "変更する機能、ファイル、運用を記載する。",
  "変更しない機能、外部サービス、本番操作を記載する。",
  "採用する設計、理由、互換性、エラー時の振る舞いを記載する。",
  "UI変更なし。UI変更がある場合は、対象画面と次を記載し、`plans/tmp/<plan-id>/prototype/`の承認記録を残す。",
  "- production baseline: 比較した実画面URL、runtime owner、checkout、commit、関連するshell・component・style・tokenのpath",
  "- comparison conditions: 実画面とprototypeがそれぞれ報告したviewport、devicePixelRatio、scrollX・scrollY、locale、theme、fixture、query state。指定値でなく両画面の実測値を記録する",
  "- baseline state inventory: 影響画面の既存interactionをsourceと実操作から列挙し、rendered、removed、hidden、disabled、inert、active element、entry、exitを記録する",
  "- styling pipeline: 本番と同じTailwind CSS utilityとapp/globals.cssを使用したこと。手書きCSSがある場合は事前のユーザー承認記録と例外理由",
  "- 視覚的不変条件: brand、navigation、layout、DOMの親子関係、grid・flex、typography、color、control、icon、focus、disabled、responsive behaviorのうち既存UIから維持するもの",
  "- 意図した差分: explicitな要件IDに基づき既存UIから変更する箇所と理由。要件に紐付かない差分は失敗として扱う",
  "- stateとinteraction: baseline既存stateと新規normal、empty、loading、error、disabled、saving、conflictの適用範囲、keyboard、focus",
  "- parity evidence: 条件を揃えた同一stateのscreenshot pair、unchanged regionのbounding rect・computed style・DOM・a11y比較、overflow、console、network、未解消差分",
  "- production UI正本: 承認済みprototypeを実装後の完成UI契約とし、実装時に未承認の構造・文言・component・responsive・interaction変更を行わないこと",
  "- parity matrix: 影響するroute・overlay・baseline state・新規stateごとのentry point、両画面の実測条件、screenshot、unchanged region、意図した差分ID、desktop、390×844、keyboard・focus、未決事項",
  "- approval semantics: Browserと自動検証はmachine parityの証拠でありUI承認ではない。ユーザーがrendered prototypeを明示承認するまでUI承認記録とG02を未承認にする",
  "入力、出力、型、永続化、権限境界、エラー処理を記載する。",
  "読み取り・調査・レビューは可能な限り並列化する。書き込みtaskを並列化する場合だけtask専用Git worktreeを使用し、shared worktree上の書き込み、schema、migration、lockfile、共通設定、同一ファイルの変更は直列化する。仕様判断を伴わない限定taskだけ`mechanical_worker / gpt-5.6-luna / medium`へ委譲する。",
  "task表のセル内ではpipe文字、escaped pipe、複数行を使わず、識別子・path・検証はカンマ区切りで記載する。",
  "実行したtask、検証コマンドと結果、修正内容、未完了項目を日本語で追記する。秘密情報、生ログ、環境変数値は記録しない。",
  "変更内容に応じたlint、typecheck、test、build、実画面確認、HTMLレビューを記載する。",
  "主なリスク、失敗時の戻し方、外部権限が必要な操作、停止条件を記載する。",
  "未決事項がない場合は`なし`と記載する。高影響の未決事項が残る間は実装へ進まない。",
];

function sectionMap(text, headings) {
  const sections = new Map();
  const required = new Set(headings);
  let current = null;
  let body = [];
  for (const line of text.replace(/\r\n?/gu, "\n").split("\n")) {
    if (/^## /u.test(line)) {
      if (current !== null) sections.set(current, body.join("\n").trim());
      current = required.has(line) ? line : null;
      body = [];
    } else if (current !== null) {
      body.push(line);
    }
  }
  if (current !== null) sections.set(current, body.join("\n").trim());
  return sections;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validatePlanText(text, options = {}) {
  const allowTemplatePlaceholders = options.allowTemplatePlaceholders === true;
  const errors = [];
  const h1 = /^# (.+)$/m.exec(text)?.[1]?.trim();
  if (!h1) errors.push("計画名のH1が必要です");
  else if (!allowTemplatePlaceholders && /^<.*>$/u.test(h1)) errors.push("計画名のplaceholderを置換してください");

  const headings = text.match(/^## .+$/gm) ?? [];
  if (headings.length !== REQUIRED_HEADINGS.length || headings.some((heading, index) => heading !== REQUIRED_HEADINGS[index])) {
    errors.push("plans/template.mdと同じ見出し・順序が必要です");
  }

  const sections = sectionMap(text, REQUIRED_HEADINGS);
  for (const heading of REQUIRED_HEADINGS) {
    if (!sections.get(heading)?.trim()) errors.push(`${heading} を空にできません`);
  }

  const metadataSection = sections.get("## メタデータ") ?? "";
  const metadataLines = [...metadataSection.matchAll(/^- ([^:\n]+):\s*(.*)$/gm)];
  const metadata = new Map();
  for (const match of metadataLines) {
    const key = match[1].trim();
    const values = metadata.get(key) ?? [];
    values.push(match[2].trim());
    metadata.set(key, values);
  }
  for (const key of REQUIRED_METADATA) {
    const values = metadata.get(key) ?? [];
    if (values.length !== 1 || !values[0]) errors.push(`metadata ${key} はメタデータsection内に1回だけ必要です`);
    const allOccurrences = [...text.matchAll(new RegExp(`^- ${key}:`, "gm"))].length;
    if (allOccurrences !== 1) errors.push(`metadata ${key} を別sectionや重複行へ置けません`);
  }

  const value = (key) => metadata.get(key)?.[0] ?? "";
  if (!/^\d+$/u.test(value("template_version")) || Number(value("template_version")) < 1) errors.push("template_versionは正の整数が必要です");
  if (!/^\d+$/u.test(value("plan_version")) || Number(value("plan_version")) < 1) errors.push("plan_versionは正の整数が必要です");
  if (!(allowTemplatePlaceholders && value("plan_id") === "<英小文字・数字・ハイフン>") && !/^[a-z0-9][a-z0-9-]*$/u.test(value("plan_id"))) errors.push("plan_idは英小文字・数字・ハイフンで記載してください");
  if (!(allowTemplatePlaceholders && value("作成日") === "YYYY-MM-DD") && !validDate(value("作成日"))) errors.push("作成日は実在するYYYY-MM-DDが必要です");
  if (!(allowTemplatePlaceholders && value("base_commit") === "<Git commit SHA>") && !/^[a-f0-9]{40}$/u.test(value("base_commit"))) errors.push("base_commitは40文字のGit SHAが必要です");
  if (!STATUS_VALUES.has(value("status"))) errors.push("statusが許可値ではありません");
  const uiChange = value("UI変更有無");
  const uiChanged = /^UI変更あり: .+/u.test(uiChange);
  if (uiChange !== "UI変更なし" && !uiChanged) errors.push("UI変更有無は`UI変更なし`または`UI変更あり: <対象>`で記載してください");
  const approvalProgress = sections.get("## 進捗管理") ?? "";
  const gateChecked = (gate) => new RegExp(`^- \\[x\\] ${gate}:`, "mu").test(approvalProgress);
  const taskCheckboxes = [...approvalProgress.matchAll(/^- \[([ x])\] (T\d+):/gmu)];
  const allTasksChecked = taskCheckboxes.length > 0 && taskCheckboxes.every((match) => match[1] === "x");
  if (value("status") !== "draft") {
    if (/未承認/u.test(value("plan承認記録")) || !gateChecked("G01")) errors.push("draft以外はplan承認記録とG01完了が必要です");
    if (!gateChecked("G02")) errors.push("draft以外はG02完了が必要です");
    if (uiChanged && /未承認|UI変更なし/u.test(value("UI承認記録"))) errors.push("UI変更ありのplanはUI承認記録が必要です");
    if (!uiChanged && value("UI承認記録") !== "UI変更なし") errors.push("UI変更なしのplanはUI承認記録にもUI変更なしを記載してください");
  }
  if (value("status") === "reviewing" && !gateChecked("G03")) errors.push("reviewingはG03完了が必要です");
  if (value("status") === "delivery_ready" || value("status") === "shipped") {
    if (!allTasksChecked) errors.push(`${value("status")}は全実装taskの完了が必要です`);
    for (const gate of ["G03", "G04", "G05"]) if (!gateChecked(gate)) errors.push(`${value("status")}は${gate}完了が必要です`);
  }
  if (value("status") === "shipped" && !gateChecked("G06")) errors.push("shippedはG06完了が必要です");
  if (!allowTemplatePlaceholders && TEMPLATE_BODY_SENTINELS.some((sentinel) => text.includes(sentinel))) errors.push("plans/template.mdの説明文を実際のplan内容へ置換してください");

  const prose = text.split("\n").filter((line) => line.trim() && !/^#{1,6} /.test(line) && !/^- [^:]+:/.test(line) && !/^\|/.test(line) && !/^- \[[ x]\]/.test(line)).join("\n");
  if (!/[ぁ-んァ-ヶ一-龠]/u.test(prose)) errors.push("plan本文は日本語で記載してください");
  const parallelSection = sections.get("## 並列実装計画") ?? "";
  const progressSection = sections.get("## 進捗管理") ?? "";
  const pipeLines = parallelSection.split("\n").filter((line) => line.trim().startsWith("|"));
  if (pipeLines[0] !== TABLE_HEADER) errors.push("並列実装計画の正規table headerが必要です");
  if (pipeLines[1] !== TABLE_DELIMITER) errors.push("並列実装計画の正規delimiterが必要です");
  const tableRows = pipeLines.slice(2);
  if (tableRows.length === 0) errors.push("並列実装計画にtask rowが必要です");
  const tableTaskIds = [];
  for (const row of tableRows) {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 9 || !/^P\d+$/u.test(cells[0] ?? "") || !/^T\d+$/u.test(cells[1] ?? "") || cells.some((cell) => !cell)) {
      errors.push("並列実装計画のtask rowは非空の9列が必要です");
      continue;
    }
    if (!allowTemplatePlaceholders && cells.some((cell) => /<[^>]+>/u.test(cell))) errors.push("並列実装計画のplaceholderを置換してください");
    tableTaskIds.push(cells[1]);
  }

  const taskIds = [...progressSection.matchAll(/^- \[[ x]\] (T\d+):/gm)].map((match) => match[1]);
  if (taskIds.length === 0) errors.push("進捗管理に実装task checkboxが必要です");
  if (new Set(taskIds).size !== taskIds.length) errors.push("実装task IDは重複できません");
  if ([...text.matchAll(/^- \[[ x]\] T\d+:/gm)].length !== taskIds.length) errors.push("実装task checkboxは進捗管理sectionだけに配置してください");
  if (!allowTemplatePlaceholders && progressSection.split("\n").filter((line) => /^- \[[ x]\] T\d+:/.test(line)).some((line) => /<[^>]+>/u.test(line))) errors.push("進捗管理のplaceholderを置換してください");
  for (const gate of ["G01", "G02", "G03", "G04", "G05", "G06"]) {
    const inProgress = [...progressSection.matchAll(new RegExp(`^- \\[([ x])\\] ${gate}:`, "gm"))].length;
    const all = [...text.matchAll(new RegExp(`^- \\[([ x])\\] ${gate}:`, "gm"))].length;
    if (inProgress !== 1) errors.push(`${gate} checkboxは進捗管理sectionに1回だけ必要です`);
    if (all !== inProgress) errors.push(`${gate} checkboxを別sectionへ配置できません`);
  }
  if (new Set(tableTaskIds).size !== tableTaskIds.length) errors.push("並列実装計画のtask IDは重複できません");
  const progressSet = new Set(taskIds);
  const tableSet = new Set(tableTaskIds);
  if (progressSet.size !== tableSet.size || [...progressSet].some((id) => !tableSet.has(id))) errors.push("並列実装計画と進捗checkboxのtask IDを完全一致させてください");
  return [...new Set(errors)];
}

export async function validatePlanFile(filePath, options = {}) {
  return validatePlanText(await readFile(filePath, "utf8"), options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void (async () => {
    const target = process.argv[2];
    if (!target) throw new Error("usage: node scripts/validate-plan-file.mjs <plan.md>");
    const resolved = path.resolve(target);
    const canonicalTemplate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../plans/template.md");
    const errors = await validatePlanFile(resolved, { allowTemplatePlaceholders: resolved === canonicalTemplate });
    if (errors.length) throw new Error(errors.map((error) => `- ${error}`).join("\n"));
    console.log(`plan validation passed: ${target}`);
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
