import { normalizeData, overallStatus } from "./review-data-schema.js";

const riskOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
const severityOrder = { blocker: 0, major: 1, minor: 2, note: 3 };
const riskLabels = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW", none: "NONE" };
const severityLabels = { blocker: "BLOCKER", major: "MAJOR", minor: "MINOR", note: "NOTE" };
const sourceLabels = { blind: "BLIND DIFF", conformance: "PLAN適合" };
const validationStatusLabels = { passed: "成功", failed: "失敗", skipped: "スキップ", unverified: "未確認" };

const state = {
  comments: new Map(),
  decisions: new Map(),
  data: null,
  filter: "all",
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function setText(id, value) {
  document.getElementById(id).textContent = value || "—";
}

function renderHeader(data) {
  document.title = data.title;
  setText("report-title", data.title);
  setText("report-summary", data.summary);
  setText("base-revision", data.base);
  setText("head-revision", data.head);
  setText("remote-base", `${data.remoteBase.ref} @ ${data.remoteBase.oid}`);
  setText("diff-hash", data.diffHash);
  setText("run-id", data.runId);
  setText("generated-at", data.generatedAt);

  const status = document.getElementById("overall-status");
  const overall = overallStatus(data);
  status.textContent = overall.label;
  status.dataset.tone = overall.tone;
}

function renderMetrics(data) {
  const metrics = document.getElementById("metrics");
  metrics.replaceChildren();
  const entries = [
    [data.stats.files, "レビュー対象ファイル"],
    [data.stats.intentGroups || data.groups.length, "意図グループ"],
    [data.stats.findings, "指摘"],
    [data.stats.validationsPassed, "成功した検証"],
  ];
  for (const [value, label] of entries) {
    const card = element("div", "metric");
    card.append(element("span", "metric__value", value), element("span", "metric__label", label));
    metrics.append(card);
  }
}

function renderValidations(data) {
  const list = document.getElementById("validations");
  list.replaceChildren();
  if (data.validations.length === 0) {
    list.append(element("p", "empty-state", "記録された検証はありません。"));
    return;
  }
  for (const validation of data.validations) {
    const row = element("div", "validation");
    const dot = element("span", "status-dot");
    dot.dataset.status = String(validation.status || "unverified");
    const status = String(validation.status || "unverified");
    dot.setAttribute("aria-hidden", "true");
    row.append(dot, element("span", "validation__status", validationStatusLabels[status] || status), element("code", "", validation.command || "未指定"), element("p", "", validation.summary || ""));
    list.append(row);
  }
}

function renderReviewPasses(data) {
  const list = document.getElementById("review-passes");
  list.replaceChildren();
  for (const pass of data.reviewPasses) {
    const card = element("article", "review-pass");
    const heading = element("div", "review-pass__heading");
    heading.append(
      element("span", "source-badge", sourceLabels[pass.source]),
      element("strong", "", pass.role),
    );
    const route = element("p", "review-pass__route", `${pass.model} / ${pass.reasoningEffort}`);
    const hashes = [
      `diff input sha256: ${pass.inputHashes.diff}`,
      `context input sha256: ${pass.inputHashes.context}`,
      ...(pass.inputHashes.plan ? [`plan input sha256: ${pass.inputHashes.plan}`] : []),
      ...(pass.inputHashes.validations ? [`validations input sha256: ${pass.inputHashes.validations}`] : []),
      ...(pass.inputHashes.remoteBase ? [`remote base input sha256: ${pass.inputHashes.remoteBase}`] : []),
      `output sha256: ${pass.outputHash}`,
    ];
    card.append(heading, route, listBlock("入出力hash", hashes), listBlock("レビュー証拠", pass.evidence));
    list.append(card);
  }
}

function renderExcludedPaths(data) {
  const list = document.getElementById("excluded-paths");
  list.replaceChildren();
  if (data.excludedPaths.length === 0) {
    list.append(element("p", "no-findings", "対象外にしたdirty/untracked差分はありません。"));
    return;
  }
  for (const excluded of data.excludedPaths) {
    const card = element("article", "excluded-path");
    card.append(
      element("code", "excluded-path__name", excluded.path),
      element("p", "", excluded.reason),
      element("code", "excluded-path__hash", `snapshot sha256: ${excluded.snapshotHash}`),
    );
    list.append(card);
  }
}

function listBlock(title, values, listClass = "") {
  const block = element("div", "detail-block");
  block.append(element("h4", "", title));
  if (!Array.isArray(values) || values.length === 0) {
    block.append(element("p", "", "なし"));
    return block;
  }
  const list = element("ul", listClass);
  for (const value of values) list.append(element("li", listClass === "file-list" ? "file-chip" : "", value));
  block.append(list);
  return block;
}

function findingCard(finding, key) {
  const card = element("article", "finding");
  const topline = element("div", "finding__topline");
  const severity = element("span", "finding__severity", severityLabels[finding.severity] || String(finding.severity || "NOTE"));
  severity.dataset.severity = String(finding.severity || "note");
  const source = element("span", "source-badge", sourceLabels[finding.source] || String(finding.source || "REVIEW"));
  topline.append(severity, source, element("h4", "", finding.title || "無題の指摘"));
  card.append(topline);
  if (finding.body) card.append(element("p", "", finding.body));
  if (finding.location) card.append(element("div", "finding__location", finding.location));
  if (finding.recommendation) card.append(element("p", "finding__recommendation", `推奨: ${finding.recommendation}`));
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
      for (const candidate of controls.querySelectorAll("button[data-decision]")) {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      }
      updateDecisionSummary();
    });
    controls.append(button);
  }
  card.append(controls);
  return card;
}

function updateDecisionSummary() {
  if (!state.data) return;
  const counts = { adopted: 0, rejected: 0, unresolved: 0, comments: 0 };
  for (const group of state.data.groups) {
    group.findings.forEach((_, index) => {
      const decision = state.decisions.get(`${group.id}:${index}`) || "unresolved";
      counts[decision] += 1;
    });
    if ((state.comments.get(String(group.id)) || "").trim()) counts.comments += 1;
  }
  for (const [key, value] of Object.entries(counts)) {
    document.querySelector(`[data-decision-count="${key}"]`).textContent = String(value);
  }
}

function matchesFilter(group) {
  if (state.filter === "all") return true;
  if (state.filter === "high") return group.risk === "critical" || group.risk === "high"
    || group.findings.some((finding) => finding.severity === "blocker" || finding.severity === "major");
  if (state.filter === "medium") return group.risk === "medium" || group.risk === "low";
  if (state.filter === "clear") return group.risk === "none" || (group.findings || []).length === 0;
  return true;
}

function sortFindings(findings) {
  return [...findings].map((finding, index) => ({ finding, index })).sort(
    (a, b) => (severityOrder[a.finding.severity] ?? 99) - (severityOrder[b.finding.severity] ?? 99),
  );
}

function renderGroups(data) {
  const container = document.getElementById("intent-groups");
  const empty = document.getElementById("empty-state");
  container.replaceChildren();
  const groups = [...data.groups]
    .filter(matchesFilter)
    .sort((a, b) => (riskOrder[a.risk] ?? 99) - (riskOrder[b.risk] ?? 99));
  empty.hidden = groups.length !== 0;

  for (const group of groups) {
    const id = String(group.id || `group-${container.children.length + 1}`);
    const card = element("article", "intent-card");
    card.dataset.risk = String(group.risk || "none");

    const header = element("div", "intent-card__header");
    const heading = element("div", "");
    heading.append(element("h3", "", group.title || "無題の変更"), element("p", "intent-card__summary", group.summary || ""));
    const risk = element("span", "risk-badge", riskLabels[group.risk] || String(group.risk || "NONE"));
    risk.dataset.risk = String(group.risk || "none");
    header.append(heading, risk);

    const body = element("div", "intent-card__body");
    const details = element("div", "detail-grid");
    const impact = element("div", "detail-block");
    impact.append(element("h4", "", "影響範囲"), element("p", "", group.blastRadius || "未記載"));
    details.append(impact, listBlock("対象ファイル", group.files, "file-list"), listBlock("変更箇所", group.locations));
    body.append(details);

    const findings = element("div", "findings");
    const sortedFindings = sortFindings(group.findings || []);
    if (sortedFindings.length === 0) findings.append(element("p", "no-findings", "この変更意図に対する指摘はありません。"));
    else sortedFindings.forEach(({ finding, index }) => findings.append(findingCard(finding, `${id}:${index}`)));
    body.append(findings);

    const secondary = element("div", "detail-grid");
    secondary.append(listBlock("計画との差異", group.planDeviations), listBlock("確認根拠", group.evidence));
    body.append(secondary);

    const human = element("div", "human-review");
    const label = element("label", "", "人間レビューコメント");
    const textarea = element("textarea", "");
    textarea.id = `comment-${id}`;
    textarea.placeholder = "実装taskへ返したい補足や判断を入力";
    textarea.value = state.comments.get(id) || "";
    textarea.addEventListener("input", () => {
      state.comments.set(id, textarea.value);
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

function feedbackText(data) {
  const lines = [`# ${data.title} フィードバック`, ""];
  for (const group of data.groups) {
    const comments = (state.comments.get(String(group.id)) || "").trim();
    const findings = (group.findings || []).map((finding, index) => ({
      finding,
      decision: state.decisions.get(`${group.id}:${index}`) || "unresolved",
    })).filter(({ decision }) => decision !== "rejected");
    if (findings.length === 0 && !comments) continue;
    lines.push(`## ${group.title}`);
    for (const { finding, decision } of findings) {
      lines.push(`- 判断: ${decision === "adopted" ? "採用" : "未確定"}`);
      lines.push(`- source: ${finding.source} (${sourceLabels[finding.source] || finding.source})`);
      lines.push(`  - severity: ${finding.severity} (${severityLabels[finding.severity] || finding.severity})`);
      lines.push(`  - title: ${finding.title}`);
      lines.push(`  - body: ${finding.body}`);
      lines.push(`  - location: ${finding.location}`);
      lines.push(`  - recommendation: ${finding.recommendation}`);
    }
    if (comments) lines.push(`- 人間コメント: ${comments}`);
    lines.push("");
  }
  if (lines.length === 2) lines.push("指摘・コメントはありません。", "");
  return lines.join("\n");
}

function generateFeedback() {
  const preview = document.getElementById("feedback-preview");
  preview.textContent = feedbackText(state.data);
  document.getElementById("copy-status").textContent = "フィードバックを生成しました。";
}

async function copyFeedback() {
  const status = document.getElementById("copy-status");
  try {
    const text = feedbackText(state.data);
    document.getElementById("feedback-preview").textContent = text;
    await navigator.clipboard.writeText(text);
    status.textContent = "フィードバックをクリップボードへコピーしました。";
  } catch {
    status.textContent = "コピーできませんでした。ブラウザのクリップボード権限を確認してください。";
  }
}

function wireFilters() {
  document.getElementById("filters").addEventListener("click", (event) => {
    if (!state.data) return;
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    for (const candidate of document.querySelectorAll("button[data-filter]")) {
      const active = candidate === button;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    renderGroups(state.data);
  });
}

function renderInvalidData(error) {
  state.data = null;
  document.title = "実装レビュー: データ不正";
  setText("report-title", "実装レビュー: データ不正");
  setText("report-summary", `review-data.jsonを表示できません: ${error.message}`);
  setText("base-revision", "無効");
  setText("head-revision", "無効");
  setText("remote-base", "無効");
  setText("diff-hash", "無効");
  setText("run-id", "無効");
  setText("generated-at", "無効");
  const status = document.getElementById("overall-status");
  status.textContent = "データ不正";
  status.dataset.tone = "danger";
  document.getElementById("metrics").replaceChildren();
  document.getElementById("validations").replaceChildren(element("p", "empty-state", "検証データは信頼できないため表示しません。"));
  document.getElementById("review-passes").replaceChildren(element("p", "empty-state", "レビューpassデータは信頼できないため表示しません。"));
  document.getElementById("excluded-paths").replaceChildren(element("p", "empty-state", "対象外pathデータは信頼できないため表示しません。"));
  document.getElementById("intent-groups").replaceChildren();
  const empty = document.getElementById("empty-state");
  empty.textContent = "不正なreview-data.jsonのため、指摘なしとは判定しません。";
  empty.hidden = false;
  document.getElementById("copy-feedback").disabled = true;
  document.getElementById("generate-feedback").disabled = true;
  document.getElementById("feedback-preview").textContent = "review-data.jsonが不正なため生成できません。";
  for (const button of document.querySelectorAll("button[data-filter]")) button.disabled = true;
}

async function main() {
  wireFilters();
  document.getElementById("generate-feedback").addEventListener("click", generateFeedback);
  document.getElementById("copy-feedback").addEventListener("click", copyFeedback);
  try {
    const response = await fetch("review-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = normalizeData(await response.json());
    renderHeader(state.data);
    renderMetrics(state.data);
    renderReviewPasses(state.data);
    renderExcludedPaths(state.data);
    renderValidations(state.data);
    for (const group of state.data.groups) group.findings.forEach((finding, index) => {
      const rejected = state.data.findingResolutions.some((resolution) => resolution.source === finding.source && resolution.severity === finding.severity && resolution.title === finding.title && resolution.body === finding.body && resolution.location === finding.location && resolution.recommendation === finding.recommendation && resolution.reviewRunId === state.data.runId && resolution.reviewDiffHash === state.data.diffHash);
      if (rejected) state.decisions.set(`${group.id}:${index}`, "rejected");
    });
    renderGroups(state.data);
  } catch (error) {
    renderInvalidData(error);
  }
}

if (typeof document !== "undefined") main();

export { renderInvalidData, sortFindings };
