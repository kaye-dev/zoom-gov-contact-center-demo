/** Schema 3 workspace uses the existing bounded, atomic private-file store. */
import path from "node:path";
import { lstat, writeFile, rm, realpath } from "node:fs/promises";
import { modelWorkspaceStorage as store } from "./parity-run-workspace.mjs";
import { prototypeRevisionInRepository } from "./prototype-revision.mjs";
import { boundedModelRead, loadVerificationModel } from "./parity-model-files.mjs";
import { modelPreflight, validateModelEvidence } from "./parity-model-execution.mjs";
import { modelDigest, serialize, invalidationForSources, VerificationModelError } from "./parity-verification-model.mjs";
import { createHash } from "node:crypto";
const ensure = (condition, message, code = "PARITY_BATCH_INVALID") => { if (!condition) throw new VerificationModelError(code, message); };
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const targetFor = (slug) => `plans/${slug}/prototype`;
function summary(checkpoint) { return { passed: checkpoint.batches.filter((item) => item.status === "passed").length, pending: checkpoint.batches.filter((item) => item.status !== "passed").length, total: checkpoint.batches.length }; }
async function assertApprovalFiles(root, slug, approval) {
  ensure(approval?.schemaVersion === 2 && approval.basis === "explicit-$implement-invocation" && !Number.isNaN(Date.parse(approval.invokedAt)), "Model approval receipt is invalid");
  const target = targetFor(slug);
  const goal = await boundedModelRead(root, `plans/${slug}/goal.md`, false);
  const profile = await boundedModelRead(root, `${target}/parity-spec.json`, false);
  ensure(hash(goal) === approval.goalSha256 && hash(profile) === approval.validationProfileDigest && await prototypeRevisionInRepository(target, root) === approval.prototypeRevision, "Goal or prototype/profile approval binding changed", "PARITY_CURRENT_STATE_DRIFT");
}
async function load(repositoryRootPath, runId) {
  const paths = await store.resolveWorkspacePaths(repositoryRootPath, runId);
  const manifestFile = await store.readManifest(path.join(paths.runRoot, "manifest.json"), { limit: store.maxManifestBytes, parentIdentity: paths.runIdentity });
  const manifest = manifestFile.value;
  ensure(manifest.schemaVersion === 3 && manifest.kind === "verification-model" && manifest.runId === runId, "Invalid model workspace identity");
  store.validateIdentifier(manifest.slug, "slug", /^[a-z0-9][a-z0-9-]*$/u);
  await assertApprovalFiles(paths.repositoryRoot, manifest.slug, manifest.approval);
  const modelInput = await loadVerificationModel(targetFor(manifest.slug), paths.repositoryRoot);
  const { compiled, estimate } = await modelPreflight(modelInput, { baseline: manifest.baseline, context: "implement" });
  ensure(compiled.semanticDigest === manifest.approval.semanticDigest, "Model meaning differs from approval", "PARITY_CURRENT_STATE_DRIFT");
  const checkpoint = await store.readCheckpoint(paths.runRoot, paths.runIdentity);
  ensure(checkpoint.schemaVersion === 3 && checkpoint.runId === runId && checkpoint.manifestDigest === manifestFile.sha256, "Model checkpoint binding is invalid");
  ensure(checkpoint.batches.length === manifest.batches.length && checkpoint.batches.every((item, index) => item.batchId === manifest.batches[index].batchId), "Model checkpoint inventory changed");
  return { paths, manifest, modelInput, compiled, estimate, checkpoint };
}
async function checkpointWrite(state) {
  await store.writeJsonAtomic(path.join(state.paths.runRoot, "checkpoint.json"), state.checkpoint, { parentIdentity: state.paths.runIdentity, maxBytes: store.maxCheckpointBytes });
}
export async function prepareModelWorkspace({ repositoryRootPath, slug, runId, definition, approval, current, baseUrls, maxRows = 4, maxBytes = 256 * 1024 }) {
  store.validateIdentifier(slug, "slug", /^[a-z0-9][a-z0-9-]*$/u); store.validateIdentifier(runId, "runId");
  ensure(Number.isSafeInteger(maxRows) && maxRows > 0 && maxRows <= 100 && Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= store.maxFragmentBytes, "Invalid model batch limits");
  const root = await realpath(repositoryRootPath);
  await assertApprovalFiles(root, slug, approval);
  const modelInput = await loadVerificationModel(targetFor(slug), root);
  const { compiled, estimate } = await modelPreflight(modelInput, { context: "implement" });
  ensure(approval?.runId === runId && approval.semanticDigest === compiled.semanticDigest, "Model approval does not match", "PARITY_CURRENT_STATE_DRIFT");
  for (const key of ["goalSha256", "prototypeRevision", "validationProfileDigest"]) ensure(approval[key] && approval[key] === current?.[key], `Approval ${key} is stale`, "PARITY_CURRENT_STATE_DRIFT");
  ensure(definition.spec.version === 5 && serialize(definition.contract) === serialize(modelInput.contract) && serialize(definition.spec) === serialize(modelInput.profile), "Model definition differs from files");
  const paths = await store.resolveWorkspacePaths(root, runId, { createRoot: true, createRun: true });
  const batches = []; let cases = [];
  const flush = async () => {
    if (!cases.length) return;
    const batchId = `model-${(await modelDigest(cases.map(({ caseKey }) => caseKey))).slice(7, 31)}`;
    const payload = { schemaVersion: 3, runId, batchId, caseIds: cases.map(({ id }) => id), caseKeys: cases.map(({ caseKey, reuseKey }) => ({ caseKey, reuseKey })) };
    const fileName = `${batchId}.json`;
    const written = await store.writeJsonExclusive(path.join(paths.runRoot, fileName), payload, { parentIdentity: paths.runIdentity, maxBytes });
    batches.push({ batchId, fileName, caseIds: payload.caseIds, sha256: written.sha256, bytes: written.bytes }); cases = [];
  };
  try {
    for (const item of compiled.cases) {
      if (cases.length && (cases.length >= maxRows || serialize(cases[0].unitIds) !== serialize(item.unitIds))) await flush();
      cases.push(item);
    }
    await flush();
    const manifest = { schemaVersion: 3, kind: "verification-model", runId, slug, definition, approval, current, baseUrls, baseline: estimate, semanticDigest: compiled.semanticDigest, executionPlanDigest: compiled.executionPlanDigest, batches };
    const written = await store.writeManifest(path.join(paths.runRoot, "manifest.json"), manifest, { parentIdentity: paths.runIdentity, maxBytes: store.maxManifestBytes });
    const checkpoint = { schemaVersion: 3, runId, manifestDigest: written.sha256, artifactIndex: [], visualAudit: [], batches: batches.map(({ batchId }) => ({ batchId, status: "pending", attempts: 0, fragment: null, errorCode: null })) };
    await store.writeJsonExclusive(path.join(paths.runRoot, "checkpoint.json"), checkpoint, { parentIdentity: paths.runIdentity, maxBytes: store.maxCheckpointBytes });
    return { runId, schemaVersion: 3, status: "prepared", estimate, summary: summary(checkpoint) };
  } catch (error) { await store.assertWorkspaceIdentities(paths); await rm(paths.runRoot, { recursive: true, force: false }); throw error; }
}
export async function nextModelBatch({ repositoryRootPath, runId }) {
  const state = await load(repositoryRootPath, runId);
  const terminal = state.checkpoint.batches.find((item) => item.status === "terminal");
  if (terminal) return { runId, status: "terminal", batch: null, summary: summary(state.checkpoint) };
  ensure(!state.checkpoint.batches.some((item) => item.status === "running"), "A model batch is already running");
  const entry = state.checkpoint.batches.find((item) => ["pending", "invalidated"].includes(item.status));
  if (!entry) return { runId, status: "complete", batch: null, summary: summary(state.checkpoint) };
  const descriptor = state.manifest.batches.find((item) => item.batchId === entry.batchId);
  const payload = await store.readJsonFile(path.join(state.paths.runRoot, descriptor.fileName), { limit: store.maxFragmentBytes, parentIdentity: state.paths.runIdentity });
  ensure(payload.sha256 === descriptor.sha256 && payload.bytes === descriptor.bytes, "Immutable model batch changed");
  entry.status = "running"; entry.attempts++; await checkpointWrite(state);
  return { runId, status: "running", batch: { batchId: entry.batchId, caseIds: descriptor.caseIds, sha256: descriptor.sha256 }, summary: summary(state.checkpoint) };
}
export async function recordModelBatch({ repositoryRootPath, runId, batchId, input }) {
  const state = await load(repositoryRootPath, runId);
  const entry = state.checkpoint.batches.find((item) => item.batchId === batchId);
  ensure(entry?.status === "running", "Model batch is not running");
  const fragment = typeof input === "string" ? JSON.parse(input) : input;
  ensure(Buffer.byteLength(JSON.stringify(fragment)) <= store.maxFragmentBytes, "Model fragment exceeds byte limit");
  const descriptor = state.manifest.batches.find((item) => item.batchId === batchId);
  ensure(fragment.schemaVersion === 3 && fragment.runId === runId && fragment.batchId === batchId && fragment.batchSha256 === descriptor.sha256, "Model fragment binding differs");
  ensure(serialize(fragment.evidence.caseResults.map(({ caseId }) => caseId).sort()) === serialize([...descriptor.caseIds].sort()), "Model fragment case inventory differs");
  await validateModelEvidence(state.modelInput, fragment.evidence, { partial: true, allowPendingVisual: true });
  const fileName = `fragment-${batchId}-${entry.attempts}.json`;
  const written = await store.writeJsonExclusive(path.join(state.paths.runRoot, fileName), fragment, { parentIdentity: state.paths.runIdentity, maxBytes: store.maxFragmentBytes });
  entry.fragment = { fileName, sha256: written.sha256, bytes: written.bytes }; entry.status = "passed";
  await checkpointWrite(state);
  return { runId, batchId, status: "passed", summary: summary(state.checkpoint) };
}
export async function executeModelBatch({ repositoryRootPath, runId, runner, tabs, layerResults = [] }) {
  const state = await load(repositoryRootPath, runId);
  const next = await nextModelBatch({ repositoryRootPath, runId });
  if (!next.batch) return next;
  try {
    const evidence = await runner.runModel({ modelInput: state.modelInput, tabs, caseIds: next.batch.caseIds, layerResults, baseline: state.manifest.baseline, run: { runId } });
    return await recordModelBatch({ repositoryRootPath, runId, batchId: next.batch.batchId, input: { schemaVersion: 3, runId, batchId: next.batch.batchId, batchSha256: next.batch.sha256, evidence } });
  } catch (error) {
    const current = await load(repositoryRootPath, runId);
    const entry = current.checkpoint.batches.find((item) => item.batchId === next.batch.batchId);
    entry.status = "terminal";
    entry.errorCode = /^(?:PARITY_|BROWSER_)[A-Z_]+$/u.test(error.code ?? "") ? error.code : "PARITY_UNEXPECTED_ERROR";
    await checkpointWrite(current); throw error;
  }
}
export async function resumeModelWorkspace({ repositoryRootPath, runId }) {
  const state = await load(repositoryRootPath, runId);
  for (const entry of state.checkpoint.batches) if (entry.status === "running") { entry.status = "terminal"; entry.errorCode = "PARITY_RUN_INTERRUPTED"; }
  await checkpointWrite(state);
  return { runId, status: "resumed", summary: summary(state.checkpoint) };
}
export async function invalidateModelWorkspace({ repositoryRootPath, runId, changedSources }) {
  const state = await load(repositoryRootPath, runId);
  const impact = invalidationForSources(state.compiled, changedSources);
  const cases = new Set(impact.flatMap((item) => item.caseIds));
  for (const entry of state.checkpoint.batches) if (state.manifest.batches.find((item) => item.batchId === entry.batchId).caseIds.some((id) => cases.has(id))) { entry.status = "invalidated"; entry.errorCode = null; }
  await checkpointWrite(state);
  return { runId, impact, summary: summary(state.checkpoint) };
}
export async function recordModelAudit({ repositoryRootPath, runId, audit }) {
  const state = await load(repositoryRootPath, runId);
  ensure(Array.isArray(audit), "Model visual audit must enumerate criteria");
  store.assertSecretFree(audit);
  state.checkpoint.visualAudit = audit;
  const combined = await combine(state, { allowPendingVisual: false, partial: true });
  await validateModelEvidence(state.modelInput, combined, { partial: true });
  await checkpointWrite(state);
  return { runId, status: "recorded", visualCriteria: audit.length };
}
async function combine(state, { allowPendingVisual = false, partial = false } = {}) {
  const fragments = [];
  for (const entry of state.checkpoint.batches) {
    if (entry.status !== "passed") { ensure(partial, "Required model batch has not passed", "PARITY_REQUIREMENT_GAP"); continue; }
    ensure(entry.fragment && !entry.fragment.fileName.includes("/"), "Missing fragment reference");
    const file = await store.readJsonFile(path.join(state.paths.runRoot, entry.fragment.fileName), { limit: store.maxFragmentBytes, parentIdentity: state.paths.runIdentity });
    ensure(file.sha256 === entry.fragment.sha256 && file.bytes === entry.fragment.bytes, "Model fragment digest changed");
    const evidence = file.value.evidence;
    await validateModelEvidence(state.modelInput, { ...evidence, visualAudit: state.checkpoint.visualAudit }, { partial: true, allowPendingVisual });
    fragments.push(evidence);
  }
  ensure(fragments.length > 0, "No valid model fragments", "PARITY_REQUIREMENT_GAP");
  const combined = { ...fragments[0], caseResults: fragments.flatMap((item) => item.caseResults), layerResults: fragments.flatMap((item) => item.layerResults), artifacts: fragments.flatMap((item) => item.artifacts), visualAudit: state.checkpoint.visualAudit, cleanup: { status: fragments.every((item) => item.cleanup?.status === "pass") ? "pass" : "fail" }, status: "pass", generationCanaries: fragments.map((item) => item.capabilities).filter(Boolean), fragmentDigests: state.checkpoint.batches.filter((item) => item.status === "passed").map((item) => item.fragment.sha256) };
  await validateModelEvidence(state.modelInput, combined, { partial, allowPendingVisual });
  return combined;
}
async function validateArtifactFile(root, artifact, allowedRoot) {
  ensure(typeof artifact.path === "string" && !path.isAbsolute(artifact.path), "Invalid artifact path");
  const target = path.resolve(root, artifact.path);
  ensure(path.dirname(target) === allowedRoot, "Model artifact escaped its owned directory");
  const stat = await lstat(target);
  ensure(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600, "Model artifact must be a private regular file");
  const bytes = await store.readStableFile(target, { limit: store.maxArtifactBytes });
  ensure(bytes.length === artifact.bytes && hash(bytes) === artifact.sha256, "Model artifact content changed");
  return bytes;
}
export async function finalizeModelWorkspace({ repositoryRootPath, runId, slug }) {
  const state = await load(repositoryRootPath, runId);
  ensure(state.manifest.slug === slug, "Model finalization slug differs");
  const evidence = await combine(state);
  const evidenceRoot = path.join(state.paths.repositoryRoot, "plans", slug, "evidence");
  await store.ensureRealDirectory(evidenceRoot, { create: true, mode: 0o700 });
  const runRoot = path.join(evidenceRoot, runId);
  const destination = await store.ensureRealDirectory(runRoot, { create: true, mode: 0o700 });
  const artifactRoot = path.join(runRoot, "artifacts");
  await store.ensureRealDirectory(artifactRoot, { create: true, mode: 0o700 });
  const promoted = new Map();
  for (const artifact of evidence.artifacts) {
    if (promoted.has(artifact.path)) continue;
    const bytes = await validateArtifactFile(state.paths.repositoryRoot, artifact, path.join(state.paths.runRoot, "artifacts"));
    const target = path.join(artifactRoot, path.basename(artifact.path));
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    promoted.set(artifact.path, path.relative(state.paths.repositoryRoot, target).split(path.sep).join("/"));
  }
  const rewrite = (artifact) => ({ ...artifact, path: promoted.get(artifact.path) ?? artifact.path });
  evidence.artifacts = evidence.artifacts.map(rewrite);
  evidence.caseResults = evidence.caseResults.map((item) => ({ ...item, artifacts: item.artifacts.map(rewrite) }));
  evidence.approval = state.manifest.approval;
  evidence.current = state.manifest.current;
  evidence.automationCoverageStatus = "pass"; evidence.humanVisualApprovalStatus = "not-requested";
  evidence.fullParityStatus = "not-run"; evidence.matrixScope = "coverage";
  await validateModelEvidence(state.modelInput, evidence);
  const evidencePath = path.join(runRoot, "implementation-parity.json");
  // Keep the workspace until immutable evidence and all artifacts are safely written.
  await store.writeManifest(evidencePath, evidence, { parentIdentity: destination, maxBytes: store.maxManifestBytes });
  await store.assertWorkspaceIdentities(state.paths);
  await rm(state.paths.runRoot, { recursive: true, force: false });
  return { runId, status: "pass", schemaVersion: 6, evidencePath: path.relative(state.paths.repositoryRoot, evidencePath).split(path.sep).join("/") };
}
export async function verifyModelRun({ repositoryRootPath, slug, runId }) {
  store.validateIdentifier(slug, "slug", /^[a-z0-9][a-z0-9-]*$/u); store.validateIdentifier(runId, "runId");
  const root = await realpath(repositoryRootPath);
  const modelInput = await loadVerificationModel(targetFor(slug), root);
  const runRoot = path.join(root, "plans", slug, "evidence", runId);
  await store.ensureRealDirectory(runRoot, { mode: 0o700 });
  const { value: evidence } = await store.readManifest(path.join(runRoot, "implementation-parity.json"), { limit: store.maxManifestBytes });
  await assertApprovalFiles(root, slug, evidence.approval);
  ensure(evidence.approval?.semanticDigest === evidence.semanticDigest, "Final approval binding differs", "PARITY_CURRENT_STATE_DRIFT");
  await validateModelEvidence(modelInput, evidence);
  for (const artifact of evidence.artifacts) await validateArtifactFile(root, artifact, path.join(runRoot, "artifacts"));
  try { await lstat(path.join(root, ".codex", "parity-runs", runId)); ensure(false, "Model workspace cleanup is incomplete", "PARITY_CLEANUP_FAILED"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return { status: "pass", schemaVersion: 6, matrixScope: "coverage", automationCoverageStatus: "pass", currentBindingStatus: "pass", evidencePath: `plans/${slug}/evidence/${runId}/implementation-parity.json` };
}
