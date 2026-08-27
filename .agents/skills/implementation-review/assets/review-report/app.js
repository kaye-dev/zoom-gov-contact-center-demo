import { normalizeData, overallStatus } from "./review-data-schema.js";

const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
const severityOrder = { blocker: 0, major: 1, minor: 2, note: 3 };
const riskLabels = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW", none: "NONE" };
const severityLabels = { blocker: "BLOCKER", major: "MAJOR", minor: "MINOR", note: "NOTE" };
const sourceLabels = { blind: "BLIND DIFF", conformance: "PLAN適合" };
const validationLabels = { passed: "成功", failed: "失敗", skipped: "スキップ", unverified: "未確認" };

const state = {
  comments: new Map(),
  decisions: new Map(),
  data: null,
  filter: "all",
};

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value || "—";
}

function listBlock(title, values, listClass = "") {
  const block = element("div", "detail-block");
  block.append(element("h4", "", title));
  if (!values.length) {
    block.append(element("p", "", "なし"));
    return block;
  }
  const list = element("ul", listClass);
  for (const value of values) list.append(element("li", listClass === "file-list" ? "file-chip" : "", value));
  block.append(list);
  return block;
}

function renderHeader(data) {
  document.title = data.title;
  setText("report-title", data.title);
  setText("report-summary", data.summary);
  setText("plan-path", data.planPath);
  setText("base-revision", data.base);
  setText("head-revision", data.head);
  setText("generated-at", data.generatedAt);
  const status = document.getElementById("overall-status");
  const overall = overallStatus(data);
  status.textContent = overall.label;
  status.dataset.tone = overall.tone;
}

function renderMetrics(data) {
  const metrics = document.getElementById("metrics");
  metrics.replaceChildren();
  for (const [value, label] of [
    [data.stats.files, "レビュー対象ファイル"],
    [data.stats.intentGroups, "意図グループ"],
    [data.stats.findings, "指摘"],
    [data.stats.validationsPassed, "成功した検証"],
  ]) {
    const card = element("div", "metric");
    card.append(element("span", "metric__value", value), element("span", "metric__label", label));
    metrics.append(card);
  }
}

function renderExcludedPaths(data) {
  const list = document.getElementById("excluded-paths");
  list.replaceChildren();
  if (!data.excludedPaths.length) {
    list.append(element("p", "no-findings", "対象外にした差分はありません。"));
    return;
  }
  for (const excluded of data.excludedPaths) {
    const card = element("article", "excluded-path");
    card.append(element("code", "excluded-path__name", excluded.path), element("p", "", excluded.reason));
    list.append(card);
  }
}

function renderValidations(data) {
  const list = document.getElementById("validations");
  list.replaceChildren();
  if (!data.validations.length) {
    list.append(element("p", "empty-state", "記録された検証はありません。"));
    return;
  }
  for (const validation of data.validations) {
    const row = element("div", "validation");
    const dot = element("span", "status-dot");
    dot.dataset.status = validation.status;
    dot.setAttribute("aria-hidden", "true");
    row.append(dot, element("span", "validation__status", validationLabels[validation.status]), element("code", "", validation.command), element("p", "", validation.summary));
    list.append(row);
  }
}

export function sortFindings(findings) {
  return [...findings]
    .map((finding, index) => ({ finding, index }))
    .sort((left, right) => (severityOrder[left.finding.severity] ?? 99) - (severityOrder[right.finding.severity] ?? 99));
}

export function sortGroups(groups) {
  return [...groups].sort((left, right) => (riskOrder[left.risk] ?? 99) - (riskOrder[right.risk] ?? 99));
}

function updateDecisionSummary() {
  if (!state.data) return;
  const counts = { adopted: 0, rejected: 0, unresolved: 0, comments: 0 };
  for (const group of state.data.groups) {
    group.findings.forEach((_, index) => {
      counts[state.decisions.get(`${group.id}:${index}`) || "unresolved"] += 1;
    });
    if ((state.comments.get(group.id) || "").trim()) counts.comments += 1;
  }
  for (const [key, value] of Object.entries(counts)) {
    const node = document.querySelector(`[data-decision-count="${key}"]`);
    if (node) node.textContent = String(value);
  }
}

function findingCard(finding, key) {
  const card = element("article", "finding");
  const topline = element("div", "finding__topline");
  const severity = element("span", "finding__severity", severityLabels[finding.severity]);
  severity.dataset.severity = finding.severity;
  topline.append(severity, element("span", "source-badge", sourceLabels[finding.source]), element("h4", "", finding.title));
  card.append(
    topline,
    element("p", "", finding.body),
    element("div", "finding__location", finding.location),
    element("p", "finding__recommendation", `推奨: ${finding.recommendation}`),
  );

  const controls = element("div", "decision-controls");
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", `${finding.title}の判断`);
  const current = state.decisions.get(key) || "unresolved";
  for (const [value, label] of [["adopted", "採用"], ["rejected", "却下"], ["unresolved", "未確定"]]) {
    const button = element("button", "decision-button", label);
    button.type = "button";
    button.dataset.decision = value;
    button.setAttribute("aria-pressed", String(current === value));
    button.addEventListener("click", () => {
      state.decisions.set(key, value);
      for (const candidate of controls.querySelectorAll("button")) candidate.setAttribute("aria-pressed", String(candidate === button));
      updateDecisionSummary();
    });
    controls.append(button);
  }
  card.append(controls);
  return card;
}

function matchesFilter(group) {
  if (state.filter === "high") return ["critical", "high"].includes(group.risk);
  if (state.filter === "medium") return ["medium", "low"].includes(group.risk);
  if (state.filter === "clear") return group.risk === "none" && group.findings.length === 0;
  return true;
}

function renderGroups(data) {
  const container = document.getElementById("intent-groups");
  const empty = document.getElementById("empty-state");
  container.replaceChildren();
  const groups = sortGroups(data.groups.filter(matchesFilter));
  empty.hidden = groups.length > 0;

  for (const group of groups) {
    const card = element("article", "intent-card");
    card.dataset.risk = group.risk;
    const header = element("div", "intent-card__header");
    const heading = element("div", "");
    heading.append(element("h3", "", group.title), element("p", "intent-card__summary", group.summary));
    const risk = element("span", "risk-badge", riskLabels[group.risk]);
    risk.dataset.risk = group.risk;
    header.append(heading, risk);

    const body = element("div", "intent-card__body");
    const details = element("div", "detail-grid");
    const impact = element("div", "detail-block");
    impact.append(element("h4", "", "影響範囲"), element("p", "", group.blastRadius));
    details.append(impact, listBlock("対象ファイル", group.files, "file-list"), listBlock("変更箇所", group.locations));
    body.append(details);

    const findings = element("div", "findings");
    const sorted = sortFindings(group.findings);
    if (!sorted.length) findings.append(element("p", "no-findings", "この変更意図に対する指摘はありません。"));
    for (const { finding, index } of sorted) findings.append(findingCard(finding, `${group.id}:${index}`));
    body.append(findings);

    const evidence = element("div", "detail-grid");
    evidence.append(listBlock("計画との差異", group.planDeviations), listBlock("確認根拠", group.evidence));
    body.append(evidence);

    const human = element("div", "human-review");
    const label = element("label", "", "人間レビューコメント");
    const textarea = element("textarea", "");
    textarea.id = `comment-${group.id}`;
    textarea.placeholder = "実装taskへ返す補足や判断を入力";
    textarea.value = state.comments.get(group.id) || "";
    textarea.addEventListener("input", () => {
      state.comments.set(group.id, textarea.value);
      updateDecisionSummary();
    });
    label.htmlFor = textarea.id;
    human.append(label, textarea);
    body.append(human);

    card.append(header, body);
    container.append(card);
  }
  updateDecisionSummary();
}

export function feedbackText(data, decisions = new Map(), comments = new Map()) {
  const lines = [`# ${data.title} フィードバック`, ""];
  let included = 0;
  for (const group of data.groups) {
    const selected = group.findings
      .map((finding, index) => ({ finding, decision: decisions.get(`${group.id}:${index}`) || "unresolved" }))
      .filter(({ decision }) => decision === "adopted" || decision === "unresolved");
    const comment = (comments.get(group.id) || "").trim();
    if (!selected.length && !comment) continue;
    included += 1;
    lines.push(`## ${group.title}`, "");
    if (selected.length) {
      lines.push("### LLM指摘", "");
      for (const { finding, decision } of selected) {
        const label = decision === "adopted" ? "採用" : "未確定";
        lines.push(`- [${label}][${finding.source}][${finding.severity}] ${finding.title} (${finding.location})`, `  - ${finding.body}`, `  - 推奨: ${finding.recommendation}`);
      }
      lines.push("");
    }
    if (comment) lines.push("### 人間コメント", "", comment, "");
  }
  if (!included) lines.push("対応事項なし。", "");
  return lines.join("\n").trimEnd();
}

function renderFeedback() {
  const output = feedbackText(state.data, state.decisions, state.comments);
  setText("feedback-preview", output);
  setText("copy-status", "Markdownを更新しました。");
  return output;
}

async function copyFeedback() {
  const output = renderFeedback();
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard APIを利用できません");
  await navigator.clipboard.writeText(output);
  setText("copy-status", "クリップボードへコピーしました。");
}

function bindControls() {
  for (const button of document.querySelectorAll("[data-filter]")) {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      for (const candidate of document.querySelectorAll("[data-filter]")) {
        const active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      }
      renderGroups(state.data);
    });
  }
  document.getElementById("generate-feedback").addEventListener("click", renderFeedback);
  document.getElementById("copy-feedback").addEventListener("click", () => {
    copyFeedback().catch((error) => setText("copy-status", `コピーできませんでした: ${error.message}`));
  });
}

export function renderInvalidData(error) {
  const message = `review-data.jsonを表示できません: ${error instanceof Error ? error.message : String(error)}`;
  setText("report-summary", message);
  const status = document.getElementById("overall-status");
  if (status) {
    status.textContent = "データ不正";
    status.dataset.tone = "danger";
  }
  for (const id of ["metrics", "excluded-paths", "validations", "intent-groups"]) {
    const target = document.getElementById(id);
    if (target) target.replaceChildren(element("p", "empty-state", message));
  }
  for (const id of ["generate-feedback", "copy-feedback"]) {
    const button = document.getElementById(id);
    if (button) button.disabled = true;
  }
}

async function main() {
  try {
    const response = await fetch("review-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = normalizeData(await response.json());
    bindControls();
    renderHeader(state.data);
    renderMetrics(state.data);
    renderExcludedPaths(state.data);
    renderValidations(state.data);
    renderGroups(state.data);
  } catch (error) {
    renderInvalidData(error);
  }
}

if (typeof document !== "undefined") void main();
