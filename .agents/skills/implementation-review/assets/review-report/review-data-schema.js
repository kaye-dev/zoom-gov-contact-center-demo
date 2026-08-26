const severityOrder = { blocker: 0, major: 1, minor: 2, note: 3 };
const allowedRisks = new Set(["critical", "high", "medium", "low", "none"]);
const allowedSeverities = new Set(Object.keys(severityOrder));
const allowedSources = new Set(["blind", "conformance"]);
const allowedStatuses = new Set(["passed", "failed", "skipped", "unverified"]);
const requiredRootKeys = ["title", "generatedAt", "runId", "base", "head", "remoteBase", "diffHash", "planHash", "assetHashes", "summary", "stats", "reviewedPaths", "excludedPaths", "findingResolutions", "reviewPasses", "validations", "groups"];
const secretKey = /(?:api[-_ ]?key|authorization|credential|pass(?:word|wd)|private[-_ ]?key|secret|token)/iu;
const secretValue = /(?:\b(?:api[-_ ]?key|authorization|credential|pass(?:word|wd)?|secret|token|database_url|aws_secret_access_key|google_api_key)\s*[:=]\s*\S+|\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|https?):\/\/[^\s/:@]+:[^\s/@]+@|\bbearer\s+[a-z0-9._~+/=-]{8,}|\b(?:sk|rk|pk)[-_][a-z0-9_-]{12,}|\bgh[pousr]_[a-z0-9_]{12,}|\bgithub_pat_[a-z0-9_]{12,}|\bxox[baprs]-[a-z0-9-]{10,}|\bglpat-[a-z0-9_-]{12,}|\bAIza[0-9a-z_-]{35}\b|\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b|\bAKIA[0-9A-Z]{16}\b|-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----)/iu;
const fullSha = /^[a-f0-9]{40}$/u;
const sha256 = /^[a-f0-9]{64}$/u;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const unreplacedSentinel = "UNREPLACED_TEMPLATE";
const expectedPassRoute = {
  blind: { role: "blind_diff_reviewer", model: "gpt-5.6-sol", reasoningEffort: "xhigh", outputFile: "blind-review.json" },
  conformance: { role: "plan_conformance_reviewer", model: "gpt-5.6-sol", reasoningEffort: "xhigh", outputFile: "plan-conformance-review.json" },
};
const minimumRiskBySeverity = { blocker: "critical", major: "high", minor: "medium", note: "low" };
const riskRank = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function containsSensitiveText(value) {
  return typeof value === "string" && secretValue.test(value);
}

export function overallStatus(data) {
  if (data.validations.some((validation) => validation.status === "failed")) return { label: "検証失敗", tone: "danger" };
  const findings = data.groups.flatMap((group) => group.findings || []);
  const key = (item) => `${item.source}\0${item.severity}\0${item.title}\0${item.body}\0${item.location}\0${item.recommendation}`;
  const resolved = new Set((data.findingResolutions || []).map(key));
  const unresolved = findings.filter((finding) => !resolved.has(key(finding)));
  const highest = unresolved.sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99))[0];
  if (highest?.severity === "blocker" || highest?.severity === "major") return { label: "要対応", tone: "danger" };
  if (data.validations.length === 0 || data.validations.some((validation) => validation.status === "unverified" || validation.status === "skipped")) return { label: "検証未完了", tone: "warning" };
  if (highest) return { label: "確認推奨", tone: "warning" };
  if (findings.some((finding) => resolved.has(key(finding)))) return { label: "却下承認済み", tone: "warning" };
  return { label: "指摘なし", tone: "success" };
}

export function normalizeData(raw) {
  const error = (message) => { throw new Error(message); };
  const text = (value, label) => {
    if (typeof value !== "string" || value.trim() === "") error(`${label}が空です`);
    return value;
  };
  const exactKeys = (value, keys, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) error(`${label}がobjectではありません`);
    if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) error(`${label}のschemaが不正です`);
  };
  const noSecrets = (value, label = "review-data") => {
    if (Array.isArray(value)) value.forEach((item, index) => noSecrets(item, `${label}[${index}]`));
    else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
      if (secretKey.test(key)) error(`${label}に秘密情報らしいキーがあります`);
      noSecrets(item, `${label}.${key}`);
    } else if (containsSensitiveText(value)) error(`${label}に秘密情報らしい値があります`);
  };
  const noSentinels = (value, label = "review-data") => {
    if (Array.isArray(value)) value.forEach((item, index) => noSentinels(item, `${label}[${index}]`));
    else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) noSentinels(item, `${label}.${key}`);
    else if (value === unreplacedSentinel) error(`${label}が未置換template sentinelです`);
  };
  const safePath = (value) => typeof value === "string" && value.trim() !== "" && value === value.trim()
    && !value.startsWith("/") && !value.startsWith("~") && !value.includes("\\") && !value.includes("..")
    && !value.includes("://") && !/^[a-z][a-z0-9+.-]*:/iu.test(value);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) error("review-data.jsonはobjectである必要があります");
  exactKeys(raw, requiredRootKeys, "review-data.json");
  noSecrets(raw);
  noSentinels(raw);
  if (!Array.isArray(raw.groups) || raw.groups.length === 0) error("変更意図グループがありません");
  if (!Array.isArray(raw.reviewedPaths) || raw.reviewedPaths.length === 0 || raw.reviewedPaths.some((item) => !safePath(item)) || new Set(raw.reviewedPaths).size !== raw.reviewedPaths.length) error("review対象path一覧が不正です");
  if ([...raw.reviewedPaths].sort().some((item, index) => item !== raw.reviewedPaths[index])) error("review対象path一覧はsort済みである必要があります");
  if (!Array.isArray(raw.excludedPaths)) error("review対象外path一覧が不正です");
  const excludedNames = new Set();
  for (const excluded of raw.excludedPaths) {
    exactKeys(excluded, ["path", "reason", "snapshotHash"], "review対象外path");
    if (!safePath(excluded.path) || excludedNames.has(excluded.path) || raw.reviewedPaths.includes(excluded.path) || !sha256.test(excluded.snapshotHash)) error("review対象外pathが不正です");
    text(excluded.reason, "review対象外理由");
    excludedNames.add(excluded.path);
  }
  if ([...raw.excludedPaths].sort((a, b) => a.path.localeCompare(b.path)).some((item, index) => item.path !== raw.excludedPaths[index].path)) error("review対象外path一覧はsort済みである必要があります");
  if (!Array.isArray(raw.findingResolutions)) error("finding resolution一覧が不正です");
  const resolutionKeys = new Set();
  for (const resolution of raw.findingResolutions) {
    exactKeys(resolution, ["source", "severity", "title", "body", "location", "recommendation", "reviewRunId", "reviewDiffHash", "decision", "rationale", "evidence", "userApproved"], "finding resolution");
    const key = `${resolution.source}\0${resolution.severity}\0${resolution.title}\0${resolution.body}\0${resolution.location}\0${resolution.recommendation}`;
    if (!allowedSources.has(resolution.source) || !["blocker", "major"].includes(resolution.severity) || resolution.reviewRunId !== raw.runId || resolution.reviewDiffHash !== raw.diffHash || resolution.decision !== "rejected" || resolution.userApproved !== true || resolutionKeys.has(key) || !Array.isArray(resolution.evidence) || resolution.evidence.length === 0 || resolution.evidence.some((item) => typeof item !== "string" || !item.trim())) error("finding resolutionが不正です");
    text(resolution.rationale, "finding却下理由");
    resolutionKeys.add(key);
  }
  if (!Array.isArray(raw.reviewPasses) || raw.reviewPasses.length !== 2) error("blind/conformanceの両レビュー証拠がありません");
  const passSources = new Set();
  for (const pass of raw.reviewPasses) {
    exactKeys(pass, ["source", "role", "model", "reasoningEffort", "inputHashes", "outputFile", "outputHash", "evidence"], "レビューpass");
    if (!pass || !allowedSources.has(pass.source) || passSources.has(pass.source) || !safePath(pass.outputFile) || !Array.isArray(pass.evidence) || pass.evidence.length === 0 || pass.evidence.some((item) => typeof item !== "string" || item.trim() === "")) error("レビュー証拠が不正です");
    const expected = expectedPassRoute[pass.source];
    if (!expected || Object.entries(expected).some(([key, value]) => pass[key] !== value) || !sha256.test(pass.outputHash)) error("レビューpassのrole/model/hashが不正です");
    const inputKeys = pass.source === "conformance" ? ["diff", "context", "plan", "validations", "remoteBase"] : ["diff", "context"];
    exactKeys(pass.inputHashes, inputKeys, "レビュー入力hash");
    if (Object.values(pass.inputHashes).some((value) => !sha256.test(value))) error("レビュー入力hashが不正です");
    passSources.add(pass.source);
  }
  if (passSources.size !== 2) error("blind/conformanceの両レビュー証拠がありません");
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u.test(raw.generatedAt) || Number.isNaN(Date.parse(raw.generatedAt))) error("generatedAtが不正です");
  if (!uuid.test(raw.runId) || !fullSha.test(raw.base) || !fullSha.test(raw.head) || !sha256.test(raw.diffHash) || !sha256.test(raw.planHash)) error("runIdまたはrevision fingerprintが不正です");
  exactKeys(raw.remoteBase, ["ref", "oid"], "remoteBase");
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/iu.test(raw.remoteBase.ref) || raw.remoteBase.ref.includes("..") || !fullSha.test(raw.remoteBase.oid)) error("remoteBaseが不正です");
  exactKeys(raw.assetHashes, ["index.html", "styles.css", "app.js", "review-data-schema.js"], "assetHashes");
  if (Object.values(raw.assetHashes).some((value) => !sha256.test(value))) error("assetHashesが不正です");
  if (!Array.isArray(raw.validations)) error("検証記録が不正です");
  const groupIds = new Set();
  const files = new Set();
  let findings = 0;
  for (const group of raw.groups) {
    exactKeys(group, ["id", "title", "summary", "risk", "blastRadius", "files", "locations", "findings", "planDeviations", "evidence"], "変更意図グループ");
    if (!group || typeof group !== "object" || !/^[a-z0-9][a-z0-9-]*$/u.test(group.id || "") || groupIds.has(group.id)) error("変更意図グループIDが不正です");
    groupIds.add(group.id);
    if (!allowedRisks.has(group.risk) || !Array.isArray(group.files) || group.files.length === 0 || !Array.isArray(group.locations) || group.locations.length === 0 || !Array.isArray(group.findings)) error("変更意図グループが不正です");
    text(group.title, "グループtitle"); text(group.summary, "グループsummary"); text(group.blastRadius, "グループblastRadius");
    if (!Array.isArray(group.planDeviations) || !Array.isArray(group.evidence) || group.evidence.length === 0 || group.planDeviations.some((item) => typeof item !== "string") || group.evidence.some((item) => typeof item !== "string" || item.trim() === "")) error("グループ証拠が不正です");
    for (const file of group.files) {
      if (!safePath(file)) error("対象ファイルが不正です");
      files.add(file);
    }
    for (const location of group.locations) {
      const fileLevel = typeof location === "string" && location.endsWith("@file") ? location.slice(0, -5) : null;
      const parsed = typeof location === "string" ? /^(.*?)(?:@base)?:(\d+)(?:-(\d+))?$/u.exec(location) : null;
      if (fileLevel ? !group.files.includes(fileLevel) : (!parsed || !group.files.includes(parsed[1]) || Number(parsed[2]) < 1 || (parsed[3] && Number(parsed[3]) < Number(parsed[2])))) error("変更位置が不正です");
    }
    for (const finding of group.findings) {
      exactKeys(finding, ["source", "severity", "title", "body", "location", "recommendation"], "指摘");
      const fileLevel = typeof finding?.location === "string" && finding.location.endsWith("@file") ? finding.location.slice(0, -5) : null;
      const location = typeof finding?.location === "string" ? /^(.*?)(?:@base)?:(\d+)(?::\d+)?$/u.exec(finding.location) : null;
      if (!finding || !allowedSources.has(finding.source) || !allowedSeverities.has(finding.severity) || (fileLevel ? !group.files.includes(fileLevel) : (!location || Number(location[2]) < 1 || !group.files.includes(location[1])))) error("指摘が不正です");
      text(finding.title, "指摘title"); text(finding.body, "指摘body"); text(finding.recommendation, "指摘recommendation");
      findings += 1;
    }
    for (const finding of group.findings) {
      const minimum = minimumRiskBySeverity[finding.severity];
      if (minimum && riskRank[group.risk] < riskRank[minimum]) error("finding severityに対してgroup riskが低すぎます");
    }
  }
  for (const validation of raw.validations) {
    exactKeys(validation, ["command", "status", "summary"], "検証記録");
    if (!allowedStatuses.has(validation.status)) error("検証statusが不正です");
    text(validation.command, "検証command"); text(validation.summary, "検証summary");
  }
  const reviewedSet = new Set(raw.reviewedPaths);
  if (files.size !== reviewedSet.size || [...files].some((file) => !reviewedSet.has(file))) error("review対象path一覧と変更意図groupのfile集合が一致しません");
  const stats = {
    files: reviewedSet.size,
    intentGroups: raw.groups.length,
    findings,
    validationsPassed: raw.validations.filter((validation) => validation.status === "passed").length,
  };
  exactKeys(raw.stats, ["files", "intentGroups", "findings", "validationsPassed"], "stats");
  for (const [key, value] of Object.entries(stats)) if (!Number.isSafeInteger(raw.stats[key]) || raw.stats[key] < 0 || raw.stats[key] !== value) error("statsが実データと一致しません");
  return {
    title: text(raw.title, "title"),
    generatedAt: text(raw.generatedAt, "generatedAt"),
    runId: text(raw.runId, "runId"),
    base: text(raw.base, "base"),
    head: text(raw.head, "head"),
    remoteBase: raw.remoteBase,
    diffHash: text(raw.diffHash, "diffHash"),
    planHash: text(raw.planHash, "planHash"),
    assetHashes: raw.assetHashes,
    summary: text(raw.summary, "summary"),
    stats,
    reviewedPaths: raw.reviewedPaths,
    excludedPaths: raw.excludedPaths,
    findingResolutions: raw.findingResolutions,
    reviewPasses: raw.reviewPasses,
    validations: raw.validations,
    groups: raw.groups,
  };
}
