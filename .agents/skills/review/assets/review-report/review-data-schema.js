const risks = new Set(["critical", "high", "medium", "low", "none"]);
const severities = new Set(["blocker", "major", "minor", "note"]);
const sources = new Set(["blind", "conformance"]);
const validationStatuses = new Set(["passed", "failed", "skipped", "unverified"]);
const riskRank = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
const minimumRisk = { blocker: "critical", major: "high", minor: "low" };

function invalid(message) {
  throw new Error(message);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label}が不正です`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) invalid(`${label}の項目が不正です`);
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) invalid(`${label}が不正です`);
  if (value.includes("UNREPLACED_TEMPLATE")) invalid(`${label}が未置換です`);
  return value.trim();
}

function safePath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 500
    && value === value.trim()
    && !value.startsWith("/")
    && !value.startsWith("~")
    && !value.includes("\\")
    && !value.includes("://")
    && !/^[a-z][a-z0-9+.-]*:/iu.test(value)
    && !value.split("/").some((part) => !part || part === "." || part === "..")
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function stringList(value, label, { allowEmpty = true, paths = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) invalid(`${label}が不正です`);
  const seen = new Set();
  for (const item of value) {
    if ((paths ? !safePath(item) : typeof item !== "string" || !item.trim()) || seen.has(item)) invalid(`${label}が不正です`);
    seen.add(item);
  }
  return value;
}

function isLocation(value, files) {
  if (typeof value !== "string") return false;
  if (value.endsWith("@file")) return files.includes(value.slice(0, -5));
  const match = /^(.*?):(\d+)(?:-(\d+))?$/u.exec(value);
  return Boolean(match && files.includes(match[1]) && Number(match[2]) > 0 && (!match[3] || Number(match[3]) >= Number(match[2])));
}

export function containsSensitiveText(value) {
  const text = JSON.stringify(value);
  if (!text) return false;
  return /(?:\b(?:api[-_ ]?key|authorization|credential|pass(?:word|wd)?|secret|token|database_url|aws_secret_access_key|google_api_key)\s*[:=]\s*\S+|\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|https?):\/\/[^\s/:@]+:[^\s/@]+@|\bbearer\s+[a-z0-9._~+/=-]{8,}|\b(?:sk|rk|pk)[-_][a-z0-9_-]{12,}|\bgh[pousr]_[a-z0-9_]{12,}|\bgithub_pat_[a-z0-9_]{12,}|\bxox[baprs]-[a-z0-9-]{10,}|\bglpat-[a-z0-9_-]{12,}|\bAIza[0-9a-z_-]{35}\b|\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b|\bAKIA[0-9A-Z]{16}\b|-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----)/iu.test(text);
}

export function normalizeData(raw) {
  exactKeys(raw, ["title", "generatedAt", "planPath", "base", "head", "summary", "reviewedPaths", "excludedPaths", "validations", "groups"], "review data");
  if (containsSensitiveText(raw)) invalid("機密らしい値をreview dataへ保存できません");

  const title = requiredText(raw.title, "title");
  const summary = requiredText(raw.summary, "summary");
  const generatedAt = requiredText(raw.generatedAt, "generatedAt");
  if (Number.isNaN(Date.parse(generatedAt))) invalid("generatedAtが不正です");
  if (!/^plans\/(?!tmp\/|reviews\/)[a-z0-9][a-z0-9-]*\/goal\.md$/u.test(raw.planPath)) invalid("planPathが不正です");
  const planPath = requiredText(raw.planPath, "planPath");
  const base = requiredText(raw.base, "base");
  const head = requiredText(raw.head, "head");

  stringList(raw.reviewedPaths, "review対象path", { allowEmpty: false, paths: true });
  if ([...raw.reviewedPaths].sort().some((item, index) => item !== raw.reviewedPaths[index])) invalid("review対象pathはsort済みである必要があります");
  const reviewed = new Set(raw.reviewedPaths);

  if (!Array.isArray(raw.excludedPaths)) invalid("review対象外pathが不正です");
  const excluded = new Set();
  for (const item of raw.excludedPaths) {
    exactKeys(item, ["path", "reason"], "review対象外path");
    if (!safePath(item.path) || reviewed.has(item.path) || excluded.has(item.path)) invalid("review対象外pathが不正です");
    requiredText(item.reason, "review対象外理由");
    excluded.add(item.path);
  }
  if ([...raw.excludedPaths].sort((a, b) => a.path.localeCompare(b.path)).some((item, index) => item.path !== raw.excludedPaths[index].path)) invalid("review対象外pathはsort済みである必要があります");

  if (!Array.isArray(raw.validations)) invalid("検証記録が不正です");
  for (const validation of raw.validations) {
    exactKeys(validation, ["command", "status", "summary"], "検証記録");
    if (!validationStatuses.has(validation.status)) invalid("検証statusが不正です");
    requiredText(validation.command, "検証command");
    requiredText(validation.summary, "検証summary");
  }

  if (!Array.isArray(raw.groups) || raw.groups.length === 0) invalid("変更意図groupがありません");
  const groupIds = new Set();
  const groupedFiles = new Set();
  let findings = 0;
  for (const group of raw.groups) {
    exactKeys(group, ["id", "title", "summary", "risk", "blastRadius", "files", "locations", "findings", "planDeviations", "evidence"], "変更意図group");
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(group.id || "") || groupIds.has(group.id)) invalid("変更意図group IDが不正です");
    groupIds.add(group.id);
    requiredText(group.title, "group title");
    requiredText(group.summary, "group summary");
    requiredText(group.blastRadius, "影響範囲");
    if (!risks.has(group.risk)) invalid("group riskが不正です");
    stringList(group.files, "group files", { allowEmpty: false, paths: true });
    stringList(group.locations, "group locations", { allowEmpty: false });
    stringList(group.planDeviations, "plan deviations");
    stringList(group.evidence, "確認根拠", { allowEmpty: false });
    for (const file of group.files) {
      if (!reviewed.has(file)) invalid("group fileがreview対象外です");
      groupedFiles.add(file);
    }
    if (group.locations.some((location) => !isLocation(location, group.files))) invalid("変更位置が不正です");
    if (!Array.isArray(group.findings)) invalid("指摘一覧が不正です");
    for (const finding of group.findings) {
      exactKeys(finding, ["source", "severity", "title", "body", "location", "recommendation"], "指摘");
      if (!sources.has(finding.source) || !severities.has(finding.severity) || !isLocation(finding.location, group.files)) invalid("指摘が不正です");
      requiredText(finding.title, "指摘title");
      requiredText(finding.body, "指摘body");
      requiredText(finding.recommendation, "推奨対応");
      const minimum = minimumRisk[finding.severity];
      if (minimum && riskRank[group.risk] < riskRank[minimum]) invalid("指摘severityに対してgroup riskが低すぎます");
      findings += 1;
    }
  }
  if (groupedFiles.size !== reviewed.size || [...reviewed].some((file) => !groupedFiles.has(file))) invalid("review対象pathとgroup fileが一致しません");

  return {
    title,
    generatedAt,
    planPath,
    base,
    head,
    summary,
    reviewedPaths: raw.reviewedPaths,
    excludedPaths: raw.excludedPaths,
    validations: raw.validations,
    groups: raw.groups,
    stats: {
      files: reviewed.size,
      intentGroups: raw.groups.length,
      findings,
      validationsPassed: raw.validations.filter((item) => item.status === "passed").length,
    },
  };
}

export function overallStatus(data) {
  if (data.validations.some((item) => item.status === "failed")) return { label: "検証失敗", tone: "danger" };
  if (data.groups.some((group) => group.findings.some((item) => item.severity === "blocker" || item.severity === "major"))) return { label: "要対応", tone: "danger" };
  if (data.validations.length === 0 || data.validations.some((item) => item.status === "skipped" || item.status === "unverified")) return { label: "検証未完了", tone: "warning" };
  if (data.groups.some((group) => group.findings.length > 0)) return { label: "確認推奨", tone: "warning" };
  return { label: "指摘なし", tone: "success" };
}
