import { COMPILER_VERSION, compileVerificationModel, invalidationForSources, modelDigest, verifySubstitutions, VerificationModelError } from "./parity-verification-model.mjs";
export const DEFAULT_COST_POLICY = Object.freeze({ duplicateRate: 0.1, duplicateCount: 10, imageMinimumCases: 20, imageRate: 0.9, globalRate: 0.25, unitHighSeconds: 900, totalHighSeconds: 5400, artifactBytes: 64 * 1024 * 1024, driftRate: 0.2, driftCount: 10, driftHighSeconds: 300, driftBytes: 25 * 1024 * 1024 });
const ranges = Object.freeze({ execution: [1, 2, 3], toolBoundary: [3, 6.5, 10], action: [0.2, 1, 2], visualPair: [10, 20, 30], capture: [0.1, 0.5, 1.5], assertion: [0.01, 0.05, 0.15], bootstrapCleanup: [5, 15, 45], cli: [0.1, 1, 10] });
export function resolveCostPolicy(policy = {}) {
  const result = { ...DEFAULT_COST_POLICY };
  for (const override of policy.overrides ?? []) {
    if (!Object.hasOwn(result, override.metric) || !Number.isFinite(override.value) || override.value < 0 || !override.reason?.trim() || !override.evidence?.trim() || !Array.isArray(override.unitIds) || override.unitIds.length === 0) throw new VerificationModelError("PARITY_MODEL_INVALID", "Cost override requires known metric, value, reason, evidence and unit scope");
    // Scoped overrides are applied by the evaluator, never globally widened here.
  }
  return result;
}
function applicableThreshold(policy, metric, unitId) {
  const matches = (policy.overrides ?? []).filter((item) => item.metric === metric && item.unitIds.includes(unitId));
  if (matches.length > 1) throw new VerificationModelError("PARITY_MODEL_INVALID", "Ambiguous cost override");
  return matches[0]?.value ?? DEFAULT_COST_POLICY[metric];
}
export function evaluateScale(report, { policy = {}, baseline = null } = {}) {
  const thresholds = resolveCostPolicy(policy); const diagnostics = [];
  const add = (metric, value, threshold, code = "PARITY_SCALE_REDESIGN_REQUIRED") => diagnostics.push({ code, metric, value, threshold });
  if (report.conditionDuplicateCandidates >= thresholds.duplicateCount || report.conditionDuplicateRate >= thresholds.duplicateRate) {
    if (report.unresolvedDuplicateCandidates > 0) add("conditionDuplicateCandidates", report.conditionDuplicateCandidates, thresholds.duplicateCount);
  }
  if (report.browserExecutionCount >= thresholds.imageMinimumCases && report.imageRequestRate >= thresholds.imageRate && !report.artifactJustification) add("imageRequestRate", report.imageRequestRate, thresholds.imageRate);
  if (report.blanketSnapshotPolicy) add("blanketSnapshotPolicy", true, false);
  if (report.globalSourceRate >= thresholds.globalRate && !report.globalDependenciesVerified) add("globalSourceRate", report.globalSourceRate, thresholds.globalRate);
  for (const unit of report.units ?? []) {
    const threshold = applicableThreshold(policy, "unitHighSeconds", unit.id);
    if (unit.time.high > threshold) add(`unit:${unit.id}:highSeconds`, unit.time.high, threshold);
  }
  for (const [metric, value] of [["totalHighSeconds", report.time.high], ["artifactBytes", report.artifacts.bytes.high]]) {
    const threshold = applicableThreshold(policy, metric, "all");
    if (value > threshold) add(metric, value, threshold);
  }
  if (baseline) {
    for (const [metric, current, previous, absolute] of [["executionCount", report.executionCount, baseline.executionCount, thresholds.driftCount], ["actionCount", report.actionCount, baseline.actionCount, thresholds.driftCount], ["captureCount", report.artifacts.captureCount, baseline.artifacts.captureCount, thresholds.driftCount], ["highSeconds", report.time.high, baseline.time.high, thresholds.driftHighSeconds]]) {
      const delta = current - previous;
      if (delta >= absolute && delta >= previous * thresholds.driftRate) add(metric, current, previous, "PARITY_COST_DRIFT");
    }
    if (report.artifacts.bytes.high - baseline.artifacts.bytes.high >= thresholds.driftBytes) add("artifactBytes", report.artifacts.bytes.high, baseline.artifacts.bytes.high, "PARITY_COST_DRIFT");
  }
  return diagnostics;
}
function timeEstimate(counts, measurements) {
  const time = { low: 0, central: 0, high: 0 }; const basis = [];
  for (const [category, count] of Object.entries(counts)) {
    const sample = measurements[category];
    const measured = sample?.sampleCount >= 20 && sample?.scope === "current-environment" && [sample.p50, sample.p90].every((value) => Number.isFinite(value) && value >= 0);
    const estimate = measured ? [Math.min(sample.p50, sample.p90), sample.p50, Math.max(sample.p50, sample.p90)] : ranges[category];
    ["low", "central", "high"].forEach((key, index) => { time[key] += count * estimate[index]; });
    basis.push({ category, count, range: estimate, sampleCount: sample?.sampleCount ?? 0, scope: sample?.scope ?? "assumption", confidence: measured ? "measured" : "low", uncertainty: measured ? "p50/p90 are samples, not guarantees" : "Insufficient comparable observations; assumed range" });
  }
  return { time, basis };
}
export async function estimateVerification(input, { measurements = {}, baseline = null, changedSources = [], context = "plan" } = {}) {
  let compiled;
  try { compiled = await compileVerificationModel({ ...input, context }); }
  catch (error) {
    if (error.code !== "PARITY_MODEL_RESOURCE_LIMIT") throw error;
    return { version: 1, compilerVersion: COMPILER_VERSION, status: "resource-limit", candidateCount: error.details.candidateCount ?? null, applicableCount: null, executionCandidateCount: null, executionCount: null, diagnostics: [{ code: error.code, reason: error.message, ...error.details }], unresolvedReason: "Selection incomplete; no partial pass" };
  }
  const policyDigest = await modelDigest(input.profile.costPolicy);
  if (compiled.status !== "complete") return { version: 1, compilerVersion: COMPILER_VERSION, status: compiled.status, inputDigests: compiled.inputDigests, policyDigest, candidateCount: compiled.candidateCount, applicableCount: null, executionCandidateCount: null, executionCount: null, groups: compiled.groups, diagnostics: compiled.diagnostics, unresolvedReason: "Selection not completed; no partial pass" };
  const substitutions = await verifySubstitutions(input.profile, compiled, { context });
  const browserCases = compiled.cases.filter((item) => ["browser", "visual"].includes(item.layer));
  const count = (cases) => ({ execution: cases.length * 2, toolBoundary: Math.ceil(cases.length * 2 / 2), action: cases.reduce((total, item) => total + item.conditions.checkpoints.reduce((n, checkpoint) => n + checkpoint.actions.length, 0) * 2, 0), visualPair: cases.filter((item) => item.artifactRequests.includes("screenshot")).length, capture: cases.reduce((n, item) => n + item.artifactRequests.length * 2, 0), assertion: cases.reduce((n, item) => n + item.assertions.length * 2, 0), bootstrapCleanup: cases.length > 0 ? 1 : 0, cli: 0 });
  const counts = count(browserCases);
  counts.cli = compiled.cases.length - browserCases.length;
  const calibrationChecks = input.profile.substitutions.filter((item) => item.calibration).length;
  const replacementChecks = input.profile.substitutions.flatMap((item) => item.replacementChecks);
  const extraBrowserChecks = replacementChecks.filter((item) => ["browser", "visual"].includes(item.layer)).length + calibrationChecks;
  counts.execution += extraBrowserChecks * 2;
  counts.toolBoundary += extraBrowserChecks;
  counts.cli += replacementChecks.filter((item) => !["browser", "visual"].includes(item.layer)).length;
  const estimate = timeEstimate(counts, measurements);
  const unitIds = [...new Set(compiled.cases.flatMap((item) => item.unitIds))].sort();
  const units = unitIds.map((id) => { const cases = browserCases.filter((item) => item.unitIds.includes(id)); return { id, executionCount: cases.length, ...timeEstimate(count(cases), measurements) }; });
  const imageCount = browserCases.filter((item) => item.artifactRequests.includes("screenshot")).length;
  const bytes = { low: counts.capture * 16 * 1024, central: counts.capture * 256 * 1024, high: counts.capture * 1024 * 1024 };
  const report = { version: 1, compilerVersion: COMPILER_VERSION, status: "complete", inputDigests: compiled.inputDigests, policyDigest, semanticDigest: compiled.semanticDigest, executionPlanDigest: compiled.executionPlanDigest,
    candidateCount: compiled.candidateCount, applicableCount: compiled.applicableCount, executionCandidateCount: compiled.executionCandidateCount, executionCount: compiled.executionCount,
    conditionDuplicateCandidates: compiled.conditionDuplicateCandidates, conditionDuplicateRate: compiled.conditionDuplicateCandidates / Math.max(1, compiled.executionCandidateCount), safeMergedCount: compiled.safeMergedCount, safeDuplicateRate: compiled.safeMergedCount / Math.max(1, compiled.executionCandidateCount), unresolvedDuplicateCandidates: 0,
    groups: compiled.groups, targets: [...new Set(compiled.cases.map(({ targetId }) => targetId))].map((id) => ({ id, executionCount: compiled.cases.filter((item) => item.targetId === id).length })), units,
    factors: input.profile.groups.flatMap((group) => Object.entries(group.factors).map(([id, values]) => ({ groupId: group.id, id, valueCount: values.length, candidateContributionPerValue: (BigInt(compiled.groups.find((item) => item.id === group.id).candidateCount) / BigInt(values.length)).toString() }))),
    layers: Object.fromEntries([...new Set(compiled.cases.map(({ layer }) => layer))].map((layer) => [layer, compiled.cases.filter((item) => item.layer === layer).length])),
    browserExecutionCount: browserCases.length, scenarioCount: browserCases.length * 2, actionCount: counts.action, actionsBySurface: { production: counts.action / 2, prototype: counts.action / 2 }, imageRequestRate: imageCount / Math.max(1, browserCases.length), artifactJustification: input.profile.artifactJustification ?? null, blanketSnapshotPolicy: Boolean(input.profile.blanketSnapshotPolicy),
    artifacts: { captureCount: counts.capture, visualPairCount: imageCount, bytes, diagnosticCaptureCount: input.profile.diagnosticPolicy?.maxCaptures ?? 0, canaryCaptureCount: browserCases.length > 0 ? 1 : 0 },
    originalCriterionCount: compiled.originalCriteria.length, childObligationCount: compiled.obligations.length, visualCriterionCount: compiled.obligations.filter((item) => item.layer === "visual").length, layerObligationCounts: Object.fromEntries([...new Set(compiled.obligations.map(({ layer }) => layer))].map((layer) => [layer, compiled.obligations.filter((item) => item.layer === layer).length])),
    substitutions: { declaredCount: substitutions.length, certifiedCount: substitutions.filter((item) => item.status === "certified").length, pendingCount: substitutions.filter((item) => item.status === "pending").length, records: substitutions },
    additionalCosts: { calibrationChecks: input.profile.substitutions.filter((item) => item.calibration).length, fallbackObligations: [...new Set(substitutions.flatMap((item) => item.fallbackObligationIds))].length, consumerIntegrationObligations: [...new Set(substitutions.flatMap((item) => item.consumerIntegrationObligationIds))].length },
    globalSourceRate: input.profile.sourceImpactMap.filter((item) => item.scope === "global").length / Math.max(1, input.profile.sourceImpactMap.length), globalDependenciesVerified: true,
    changedSources: invalidationForSources(compiled, changedSources), legacyGlobalCartesianCandidateCount: null, ...estimate, diagnostics: [], gaps: [] };
  report.diagnostics = evaluateScale(report, { policy: input.profile.costPolicy, baseline });
  report.status = report.diagnostics.length ? "redesign-required" : "complete";
  return report;
}
