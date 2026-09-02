#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prototypeRevisionInRepository } from "./prototype-revision.mjs";
import {
  abortRunWorkspace,
  finalizeRunWorkspace,
  invalidateRunWorkspace,
  nextRunBatch,
  prepareRunWorkspace,
  recordBatchFailure,
  recordBatchResult,
  resumeRunWorkspace,
} from "./parity-run-workspace.mjs";
import {
  BrowserParityRunner,
  ParityRunError,
  compareProbe,
  createBatches,
  createCoverageReport,
  createRunContext,
  ensure,
  fullMatrixPhases,
  isPlainObject,
  isVisibleSnapshot,
  matrixScopes,
  mergeBatchResults,
  normalizeDomSnapshot,
  phases,
  probeKinds,
  requireExactKeys,
  requireNonEmptyString,
  requireLoopbackBaseUrl,
  requireUniqueStrings,
  scrollSource,
  selectRows,
  sha256Digest,
  stableNormalize,
  stableStringify,
  runBatch,
  validateParitySpec,
} from "./parity-runner-core.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");
const privateDirectoryMode = 0o700;
const privateFileMode = 0o600;

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function requireSha256(value, label) {
  ensure(/^sha256:[0-9a-f]{64}$/u.test(value), `${label} must be sha256:<64hex>`);
}

function permissionMode(metadata) {
  return metadata.mode & 0o7777;
}

function formatPermissionMode(metadata) {
  return permissionMode(metadata).toString(8).padStart(4, "0");
}

async function validatePrivateDirectory(target, label) {
  const metadata = await lstat(target);
  ensure(metadata.isDirectory() && !metadata.isSymbolicLink(), `${label} must be a real directory`);
  ensure(
    permissionMode(metadata) === privateDirectoryMode,
    `${label} must have mode 0700; found ${formatPermissionMode(metadata)}`,
  );
  ensure((await realpath(target)) === target, `${label} must not traverse symlinks`);
}

async function ensurePrivateDirectory(target, label) {
  let created = false;
  try {
    await mkdir(target, { mode: privateDirectoryMode });
    created = true;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
  }
  if (created) await chmod(target, privateDirectoryMode);
  await validatePrivateDirectory(target, label);
}

async function validatePrivateFile(target, label) {
  const metadata = await lstat(target);
  ensure(metadata.isFile() && !metadata.isSymbolicLink(), `${label} must be a regular file`);
  ensure(
    permissionMode(metadata) === privateFileMode,
    `${label} must have mode 0600; found ${formatPermissionMode(metadata)}`,
  );
  ensure((await realpath(target)) === target, `${label} must not traverse symlinks`);
}

async function writePrivateJsonExclusive(target, evidence, label) {
  const handle = await open(target, "wx", privateFileMode);
  try {
    await handle.chmod(privateFileMode);
    await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    const metadata = await handle.stat();
    ensure(metadata.isFile(), `${label} must be a regular file`);
    ensure(
      permissionMode(metadata) === privateFileMode,
      `${label} must have mode 0600; found ${formatPermissionMode(metadata)}`,
    );
  } finally {
    await handle.close();
  }
  await validatePrivateFile(target, label);
}

async function loadParityDefinition(requestedDirectory, requestedRoot = repositoryRoot) {
  const root = await realpath(requestedRoot);
  ensure(root === requestedRoot, "repository root must not traverse symlinks");
  const match = /^plans\/([a-z0-9][a-z0-9-]*)\/prototype$/u.exec(requestedDirectory);
  ensure(match && !["tmp", "reviews"].includes(match[1]), "target must be plans/<slug>/prototype");
  const prototypeRoot = path.join(root, requestedDirectory);
  const beforeRevision = await prototypeRevisionInRepository(requestedDirectory, root);
  const [contractText, specText] = await Promise.all([
    readFile(path.join(prototypeRoot, "ui-contract.json"), "utf8"),
    readFile(path.join(prototypeRoot, "parity-spec.json"), "utf8"),
  ]);
  let contract;
  let spec;
  try {
    contract = JSON.parse(contractText);
  } catch {
    throw new Error("ui-contract.json must contain valid JSON");
  }
  try {
    spec = JSON.parse(specText);
  } catch {
    throw new Error("parity-spec.json must contain valid JSON");
  }
  validateParitySpec(spec, contract);
  const afterRevision = await prototypeRevisionInRepository(requestedDirectory, root);
  ensure(beforeRevision === afterRevision, "prototype changed while loading parity definition");
  return {
    slug: match[1],
    prototypeRoot,
    contract,
    spec,
    prototypeRevision: afterRevision,
    validationProfileDigest: sha256(specText),
  };
}

function createApprovalEvidence({
  runId,
  goalSha256,
  prototypeRevision,
  validationProfileDigest,
  invokedAt = new Date().toISOString(),
}) {
  requireNonEmptyString(runId, "runId");
  requireSha256(goalSha256, "goalSha256");
  requireSha256(prototypeRevision, "prototypeRevision");
  requireSha256(validationProfileDigest, "validationProfileDigest");
  ensure(!Number.isNaN(Date.parse(invokedAt)), "invokedAt must be an ISO-compatible timestamp");
  return {
    schemaVersion: 1,
    basis: "explicit-$implement-invocation",
    runId,
    invokedAt,
    goalSha256,
    prototypeRevision,
    validationProfileDigest,
  };
}

function validateApprovalEvidence(evidence) {
  requireExactKeys(
    evidence,
    [
      "schemaVersion",
      "basis",
      "runId",
      "invokedAt",
      "goalSha256",
      "prototypeRevision",
      "validationProfileDigest",
    ],
    "approval evidence",
  );
  ensure(evidence.schemaVersion === 1, "approval evidence schemaVersion must be 1");
  ensure(evidence.basis === "explicit-$implement-invocation", "approval evidence basis is invalid");
  requireNonEmptyString(evidence.runId, "approval evidence runId");
  ensure(!Number.isNaN(Date.parse(evidence.invokedAt)), "approval evidence invokedAt must be a timestamp");
  requireSha256(evidence.goalSha256, "approval evidence goalSha256");
  requireSha256(evidence.prototypeRevision, "approval evidence prototypeRevision");
  requireSha256(evidence.validationProfileDigest, "approval evidence validationProfileDigest");
  return evidence;
}

function requireTimestamp(value, label) {
  ensure(typeof value === "string" && !Number.isNaN(Date.parse(value)), `${label} must be a timestamp`);
}

function requireStringArray(value, label) {
  ensure(Array.isArray(value), `${label} must be an array`);
  value.forEach((item, index) => requireNonEmptyString(item, `${label}[${index}]`));
}

function validateMeasuredUrl(value, surface, expectedRoute, label) {
  let actual;
  try {
    actual = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  const parsed = requireLoopbackBaseUrl(actual.origin, surface);
  ensure(actual.origin === parsed.origin, `${label} has an invalid origin`);
  ensure(actual.username === "" && actual.password === "", `${label} must not contain credentials`);
  ensure(actual.hash === "", `${label} must not contain a fragment`);
  ensure(actual.pathname === expectedRoute, `${label} route does not match the manifest row`);
}

function validateArtifactRecord(artifact, label) {
  requireExactKeys(
    artifact,
    ["path", "sha256", "bytes", "kind", "mediaType", "surface", "rowId", "probeId"],
    label,
  );
  requireNonEmptyString(artifact.path, `${label}.path`);
  ensure(!path.isAbsolute(artifact.path) && !artifact.path.split("/").includes(".."), `${label}.path is unsafe`);
  requireSha256(artifact.sha256, `${label}.sha256`);
  ensure(Number.isInteger(artifact.bytes) && artifact.bytes >= 0, `${label}.bytes must be a non-negative integer`);
  ensure(["screenshot", "dom", "accessibility"].includes(artifact.kind), `${label}.kind is invalid`);
  requireNonEmptyString(artifact.mediaType, `${label}.mediaType`);
  ensure(["production", "prototype"].includes(artifact.surface), `${label}.surface is invalid`);
  requireNonEmptyString(artifact.rowId, `${label}.rowId`);
  requireNonEmptyString(artifact.probeId, `${label}.probeId`);
}

function validateRowEvidence(rowEvidence, manifestRow, contract, expectedProbes, schemaVersion = 3) {
  const label = `parity evidence row ${manifestRow.id}`;
  ensure(isPlainObject(rowEvidence), `${label} must be an object`);
  ensure(rowEvidence.rowId === manifestRow.id, `${label} rowId does not match the manifest`);
  ensure(rowEvidence.status === "pass" || rowEvidence.status === "fail", `${label} status must be pass or fail`);
  requireStringArray(rowEvidence.artifactPaths, `${label}.artifactPaths`);
  ensure(Array.isArray(rowEvidence.probes), `${label}.probes must be an array`);

  if (rowEvidence.actualConditions === null) {
    requireExactKeys(
      rowEvidence,
      ["rowId", "status", "actualConditions", "probes", "artifactPaths", "error", ...(schemaVersion === 4 ? ["artifacts"] : [])],
      label,
    );
    ensure(rowEvidence.status === "fail", `${label} without actual conditions must fail`);
    ensure(rowEvidence.probes.length === 0, `${label} without actual conditions must not contain probes`);
    requireNonEmptyString(rowEvidence.error, `${label}.error`);
    return;
  }

  requireExactKeys(
    rowEvidence,
    ["rowId", "status", "actualConditions", "probes", "artifactPaths", ...(schemaVersion === 4 ? ["artifacts"] : [])],
    label,
  );
  if (schemaVersion === 4) {
    ensure(Array.isArray(rowEvidence.artifacts), `${label}.artifacts must be an array`);
    rowEvidence.artifacts.forEach((artifact, index) => validateArtifactRecord(artifact, `${label}.artifacts[${index}]`));
  }
  requireExactKeys(
    rowEvidence.actualConditions,
    ["state", "theme", "viewport", "dpr", "urls", "scroll"],
    `${label}.actualConditions`,
  );
  for (const field of ["state", "theme", "viewport"]) {
    ensure(
      rowEvidence.actualConditions[field] === manifestRow[field],
      `${label}.actualConditions.${field} does not match the manifest`,
    );
  }
  ensure(
    rowEvidence.actualConditions.dpr === contract.comparisonConditions.dpr,
    `${label}.actualConditions.dpr does not match the contract`,
  );
  requireExactKeys(rowEvidence.actualConditions.urls, ["production", "prototype"], `${label}.actualConditions.urls`);
  validateMeasuredUrl(rowEvidence.actualConditions.urls.production, "production", manifestRow.route, `${label}.urls.production`);
  validateMeasuredUrl(rowEvidence.actualConditions.urls.prototype, "prototype", `/${manifestRow.entry}`, `${label}.urls.prototype`);
  requireExactKeys(rowEvidence.actualConditions.scroll, ["production", "prototype"], `${label}.actualConditions.scroll`);
  for (const surface of ["production", "prototype"]) {
    const measured = rowEvidence.actualConditions.scroll[surface];
    requireExactKeys(measured, ["x", "y", "source"], `${label}.scroll.${surface}`);
    ensure(measured.source === scrollSource, `${label}.scroll.${surface} must identify window measurements`);
    ensure(
      measured.x === contract.comparisonConditions.scroll.x &&
        measured.y === contract.comparisonConditions.scroll.y,
      `${label}.scroll.${surface} does not match the contract`,
    );
  }

  const expectedProbeById = expectedProbes
    ? new Map(expectedProbes.map((probe) => [probe.id, probe]))
    : undefined;
  const actualProbeIds = rowEvidence.probes.map((probe, index) => {
    const probeLabel = `${label}.probes[${index}]`;
    ensure(isPlainObject(probe), `${probeLabel} must be an object`);
    const allowedKeys = new Set([
      "probeId",
      "kind",
      "status",
      "production",
      "prototype",
      "reason",
      "artifactPaths",
      ...(schemaVersion === 4 ? ["tier", "artifacts"] : []),
    ]);
    ensure(Object.keys(probe).every((key) => allowedKeys.has(key)), `${probeLabel} contains an unknown field`);
    const probeId = requireNonEmptyString(probe.probeId, `${probeLabel}.probeId`);
    ensure(probeKinds.has(probe.kind), `${probeLabel}.kind is invalid`);
    ensure(["pass", "fail", "skipped"].includes(probe.status), `${probeLabel}.status is invalid`);
    if (expectedProbeById) {
      const expectedProbe = expectedProbeById.get(probeId);
      ensure(expectedProbe, `${probeLabel}.probeId is not mapped to this row`);
      ensure(probe.kind === expectedProbe.kind, `${probeLabel}.kind does not match parity-spec.json`);
      ensure(!(expectedProbe.required && probe.status === "skipped"), `${probeLabel} required probe must not be skipped`);
      if (schemaVersion === 4) ensure(probe.tier === expectedProbe.tier, `${probeLabel}.tier does not match parity-spec.json`);
      if (
        schemaVersion === 4 &&
        expectedProbe.tier === "anchor" &&
        ["screenshot", "dom", "accessibility"].includes(expectedProbe.kind)
      ) {
        ensure(probe.artifacts?.length === 2, `${probeLabel} must contain production and prototype raw artifact records`);
      }
    }
    requireStringArray(probe.artifactPaths, `${probeLabel}.artifactPaths`);
    if (schemaVersion === 4) {
      ensure(Array.isArray(probe.artifacts), `${probeLabel}.artifacts must be an array`);
      probe.artifacts.forEach((artifact, artifactIndex) => validateArtifactRecord(artifact, `${probeLabel}.artifacts[${artifactIndex}]`));
      for (const artifact of probe.artifacts) {
        ensure(artifact.rowId === manifestRow.id && artifact.probeId === probeId, `${probeLabel} artifact ownership is invalid`);
      }
    }
    if (probe.status === "skipped") {
      requireNonEmptyString(probe.reason, `${probeLabel}.reason`);
    } else {
      ensure(Object.hasOwn(probe, "production"), `${probeLabel}.production is required`);
      ensure(Object.hasOwn(probe, "prototype"), `${probeLabel}.prototype is required`);
    }
    return probeId;
  });
  ensure(new Set(actualProbeIds).size === actualProbeIds.length, `${label} probe IDs must be unique`);
  if (expectedProbes) {
    ensure(
      JSON.stringify([...actualProbeIds].sort()) ===
        JSON.stringify(expectedProbes.map(({ id }) => id).sort()),
      `${label} probes do not match parity-spec.json`,
    );
  }
  const probeArtifactPaths = rowEvidence.probes.flatMap(({ artifactPaths }) => artifactPaths).sort();
  ensure(
    JSON.stringify(probeArtifactPaths) === JSON.stringify([...rowEvidence.artifactPaths].sort()),
    `${label} artifact paths do not match its probe results`,
  );
  const hasFailure = rowEvidence.probes.some(({ status }) => status === "fail");
  ensure(rowEvidence.status === (hasFailure ? "fail" : "pass"), `${label} status does not match its probe results`);
}

function validateParityEvidence(evidence, contract, spec) {
  if (spec) validateParitySpec(spec, contract);
  ensure(isPlainObject(evidence), "parity evidence must be an object");
  ensure(
    [1, 2, 3, 4].includes(evidence.schemaVersion),
    "parity evidence schemaVersion must be 1, 2, 3, or 4",
  );
  const legacyFullMatrixEvidence = evidence.schemaVersion === 1;
  const coverageEvidence = evidence.schemaVersion === 4;
  requireExactKeys(
    evidence,
    [
      "schemaVersion",
      "phase",
      "runId",
      "generatedAt",
      "goalSha256",
      "prototypeRevision",
      "validationProfileDigest",
      ...(legacyFullMatrixEvidence ? [] : ["matrixScope", "selection"]),
      "runtime",
      "sources",
      "capabilities",
      "rows",
      "metrics",
      ...(coverageEvidence
        ? [
            "coverage",
            "riskRows",
            "anchorRows",
            "checkpoints",
            "artifactIndex",
            "cleanup",
            "automationCoverageStatus",
            "humanVisualApprovalStatus",
            "fullParityStatus",
          ]
        : []),
    ],
    "parity evidence",
  );
  ensure(phases.has(evidence.phase), "parity evidence phase is invalid");
  if (evidence.schemaVersion === 3 || coverageEvidence) {
    ensure(
      evidence.phase === "smoke" || evidence.phase === "final",
      "parity evidence schemaVersion 3 supports only final-boundary smoke or final runs",
    );
  }
  requireNonEmptyString(evidence.runId, "parity evidence runId");
  requireTimestamp(evidence.generatedAt, "parity evidence generatedAt");
  requireSha256(evidence.goalSha256, "parity evidence goalSha256");
  requireSha256(evidence.prototypeRevision, "parity evidence prototypeRevision");
  requireSha256(evidence.validationProfileDigest, "parity evidence validationProfileDigest");
  let matrixScope = "full";
  let changedTargetIds = [];
  let changedStates = [];
  let changedViewports = [];
  let risks = ["normal"];
  let executionContext;
  if (legacyFullMatrixEvidence) {
    ensure(
      fullMatrixPhases.has(evidence.phase),
      "legacy parity evidence is supported only for pre-edit and final full-matrix runs",
    );
  } else {
    ensure(matrixScopes.has(evidence.matrixScope), "parity evidence matrixScope is invalid");
    matrixScope = evidence.matrixScope;
    if (coverageEvidence) {
      requireExactKeys(
        evidence.selection,
        ["executionContext", "exactRowIds", "riskRowIds", "anchorRowIds"],
        "parity evidence selection",
      );
      executionContext = requireNonEmptyString(evidence.selection.executionContext, "parity evidence selection.executionContext");
      requireUniqueStrings(evidence.selection.exactRowIds, "parity evidence selection.exactRowIds");
      ensure(Array.isArray(evidence.selection.riskRowIds), "parity evidence selection.riskRowIds must be an array");
      ensure(Array.isArray(evidence.selection.anchorRowIds), "parity evidence selection.anchorRowIds must be an array");
    } else {
      requireExactKeys(
        evidence.selection,
        ["changedTargetIds", "changedStates", "changedViewports", "risks"],
        "parity evidence selection",
      );
      changedTargetIds = requireUniqueStrings(
        evidence.selection.changedTargetIds,
        "parity evidence selection.changedTargetIds",
        { allowEmpty: true },
      );
      changedStates = requireUniqueStrings(
        evidence.selection.changedStates,
        "parity evidence selection.changedStates",
        { allowEmpty: true },
      );
      changedViewports = requireUniqueStrings(
        evidence.selection.changedViewports,
        "parity evidence selection.changedViewports",
        { allowEmpty: true },
      );
      risks = requireUniqueStrings(evidence.selection.risks, "parity evidence selection.risks");
    }
  }
  ensure(isPlainObject(evidence.runtime), "parity evidence runtime must be an object");
  ensure(Array.isArray(evidence.sources), "parity evidence sources must be an array");
  ensure(
    evidence.runtime.owner === contract.productionBaseline.runtimeOwner,
    "parity evidence runtime owner does not match ui-contract.json",
  );
  ensure(
    evidence.runtime.checkout === contract.productionBaseline.checkout,
    "parity evidence runtime checkout does not match ui-contract.json",
  );
  const sourcePaths = evidence.sources.map((source, index) => {
    ensure(isPlainObject(source), `parity evidence sources[${index}] must be an object`);
    const sourcePath = requireNonEmptyString(source.path, `parity evidence sources[${index}].path`);
    requireSha256(source.sha256, `parity evidence sources[${index}].sha256`);
    return sourcePath;
  });
  ensure(new Set(sourcePaths).size === sourcePaths.length, "parity evidence source paths must be unique");
  ensure(
    JSON.stringify([...sourcePaths].sort()) ===
      JSON.stringify([...contract.productionBaseline.sources].sort()),
    "parity evidence sources do not match productionBaseline.sources",
  );
  ensure(isPlainObject(evidence.capabilities), "parity evidence capabilities must be an object");
  ensure(evidence.capabilities.status === "pass", "parity evidence capability canary must pass");
  ensure(Array.isArray(evidence.rows), "parity evidence rows must be an array");
  requireExactKeys(
    evidence.metrics,
    ["startedAt", "finishedAt", "durationMs", "shellCommands", "browserOperations", "fullMatrixRuns"],
    "parity evidence metrics",
  );
  requireTimestamp(evidence.metrics.startedAt, "metrics.startedAt");
  requireTimestamp(evidence.metrics.finishedAt, "metrics.finishedAt");
  for (const field of ["durationMs", "shellCommands", "browserOperations", "fullMatrixRuns"]) {
    ensure(
      Number.isInteger(evidence.metrics[field]) && evidence.metrics[field] >= 0,
      `metrics.${field} must be a non-negative integer`,
    );
  }
  ensure(
    evidence.metrics.fullMatrixRuns === (matrixScope === "full" ? 1 : 0),
    "metrics.fullMatrixRuns does not match matrixScope",
  );
  const rowIds = evidence.rows.map(({ rowId }) => rowId);
  ensure(new Set(rowIds).size === rowIds.length, "parity evidence row IDs must be unique");
  const manifestRows = new Map(contract.parityMatrix.map((row) => [row.id, row]));
  ensure(rowIds.every((rowId) => manifestRows.has(rowId)), "parity evidence contains an unknown row ID");
  ensure(
    evidence.rows.every(({ status }) => status === "pass" || status === "fail"),
    "executed parity evidence rows must be pass or fail",
  );
  const expected = selectRows({
    phase: evidence.phase,
    contract,
    spec,
    changedTargetIds,
    changedStates,
    changedViewports,
    risks,
    matrixScope,
    executionContext,
  }).map(({ id }) => id).sort();
  ensure(
    JSON.stringify([...rowIds].sort()) === JSON.stringify(expected),
    "parity evidence rows do not match its declared selection",
  );
  const probesByRow = spec
    ? new Map(
        spec.rowProbeMap.map(({ rowId, probeIds }) => [
          rowId,
          probeIds.map((probeId) => spec.probes.find(({ id }) => id === probeId)),
        ]),
      )
    : undefined;
  for (const row of evidence.rows) {
    validateRowEvidence(row, manifestRows.get(row.rowId), contract, probesByRow?.get(row.rowId), evidence.schemaVersion);
  }
  if (coverageEvidence) {
    ensure(spec?.version === 3, "schemaVersion 4 evidence requires parity-spec.json version 3");
    ensure(
      JSON.stringify([...rowIds].sort()) === JSON.stringify([...evidence.selection.exactRowIds].sort()),
      "schemaVersion 4 exactRowIds do not match executed rows",
    );
    const recomputedCoverage = createCoverageReport(contract, evidence.rows.map(({ rowId }) => manifestRows.get(rowId)));
    ensure(
      stableStringify(evidence.coverage) === stableStringify(recomputedCoverage),
      "schemaVersion 4 coverage summary is not reproducible",
    );
    ensure(evidence.phase === "smoke" || recomputedCoverage.status === "pass", "schemaVersion 4 required coverage is incomplete");
    ensure(Array.isArray(evidence.riskRows), "schemaVersion 4 riskRows must be an array");
    ensure(Array.isArray(evidence.anchorRows), "schemaVersion 4 anchorRows must be an array");
    for (const [index, risk] of evidence.riskRows.entries()) {
      requireExactKeys(risk, ["id", "rowId", "requiredProbeIds", "status"], `schemaVersion 4 riskRows[${index}]`);
      const declared = spec.coverage.riskRows.find(({ id }) => id === risk.id);
      ensure(declared, `schemaVersion 4 riskRows[${index}] is not declared`);
      ensure(risk.status === "pass", `schemaVersion 4 riskRows[${index}] must pass`);
      requireUniqueStrings(risk.requiredProbeIds, `schemaVersion 4 riskRows[${index}].requiredProbeIds`);
      ensure(
        stableStringify(risk.requiredProbeIds) === stableStringify(declared.requiredProbeIds),
        `schemaVersion 4 riskRows[${index}] required probes changed`,
      );
    }
    for (const [index, anchor] of evidence.anchorRows.entries()) {
      requireExactKeys(anchor, ["id", "rowId", "targetId", "status"], `schemaVersion 4 anchorRows[${index}]`);
      const declared = spec.coverage.anchorRows.find(({ id }) => id === anchor.id);
      ensure(
        declared?.rowId === anchor.rowId && declared?.targetId === anchor.targetId,
        `schemaVersion 4 anchorRows[${index}] is not declared`,
      );
      ensure(anchor.status === "pass", `schemaVersion 4 anchorRows[${index}] must pass`);
    }
    ensure(isPlainObject(evidence.checkpoints), "schemaVersion 4 checkpoints must be an object");
    requireExactKeys(evidence.checkpoints, ["resumed", "batches", "invalidations"], "schemaVersion 4 checkpoints");
    ensure(typeof evidence.checkpoints.resumed === "boolean", "schemaVersion 4 checkpoints.resumed must be boolean");
    ensure(Array.isArray(evidence.checkpoints.batches), "schemaVersion 4 checkpoints.batches must be an array");
    ensure(Array.isArray(evidence.checkpoints.invalidations), "schemaVersion 4 checkpoints.invalidations must be an array");
    ensure(Array.isArray(evidence.artifactIndex), "schemaVersion 4 artifactIndex must be an array");
    evidence.artifactIndex.forEach((artifact, index) => validateArtifactRecord(artifact, `artifactIndex[${index}]`));
    ensure(isPlainObject(evidence.cleanup) && evidence.cleanup.status === "pass", "schemaVersion 4 cleanup must pass");
    ensure(["pass", "fail"].includes(evidence.automationCoverageStatus), "schemaVersion 4 automationCoverageStatus is invalid");
    if (evidence.phase === "final") ensure(evidence.automationCoverageStatus === "pass", "schemaVersion 4 automation coverage must pass");
    ensure(
      ["pending", "approved", "rejected"].includes(evidence.humanVisualApprovalStatus),
      "schemaVersion 4 humanVisualApprovalStatus is invalid",
    );
    ensure(["not-run", "pass", "fail"].includes(evidence.fullParityStatus), "schemaVersion 4 fullParityStatus is invalid");
    ensure(
      evidence.fullParityStatus === (matrixScope === "full" ? "pass" : "not-run"),
      "schemaVersion 4 fullParityStatus does not match matrixScope",
    );
  }
  return evidence;
}

function validateEvidenceBundle({ approval, preEdit, implementation, contract, spec, current }) {
  validateApprovalEvidence(approval);
  validateParityEvidence(implementation, contract, spec);
  ensure(implementation.phase === "final", "implementation evidence has the wrong phase");
  if (implementation.schemaVersion === 3 || implementation.schemaVersion === 4) {
    ensure(preEdit === undefined, `schemaVersion ${implementation.schemaVersion} completion evidence must not include pre-edit parity`);
    ensure(
      implementation.rows.every(({ status }) => status === "pass"),
      "final evidence must contain only passing rows",
    );
  } else {
    ensure(preEdit !== undefined, "legacy evidence requires pre-edit parity");
    validateParityEvidence(preEdit, contract, spec);
    ensure(preEdit.phase === "pre-edit", "pre-edit evidence has the wrong phase");
    ensure(preEdit.schemaVersion === implementation.schemaVersion, "pre-edit and final schemaVersion must match");
    const preEditScope = preEdit.schemaVersion === 1 ? "full" : preEdit.matrixScope;
    const implementationScope = implementation.schemaVersion === 1 ? "full" : implementation.matrixScope;
    ensure(preEditScope === implementationScope, "pre-edit and final matrixScope must match");
    const legacySelection = {
      changedTargetIds: [],
      changedStates: [],
      changedViewports: [],
      risks: ["normal"],
    };
    const preEditSelection = preEdit.schemaVersion === 1 ? legacySelection : preEdit.selection;
    const implementationSelection = implementation.schemaVersion === 1 ? legacySelection : implementation.selection;
    ensure(
      JSON.stringify(stableNormalize(preEditSelection)) ===
        JSON.stringify(stableNormalize(implementationSelection)),
      "pre-edit and final selections must match",
    );
    ensure(
      preEdit.rows.every(({ status }) => status === "pass") &&
        implementation.rows.every(({ status }) => status === "pass"),
      "pre-edit and final evidence must contain only passing rows",
    );
  }
  for (const field of ["runId", "goalSha256", "prototypeRevision", "validationProfileDigest"]) {
    if (preEdit) ensure(preEdit[field] === approval[field], `pre-edit ${field} does not match approval`);
    ensure(implementation[field] === approval[field], `final ${field} does not match approval`);
  }
  for (const field of ["goalSha256", "prototypeRevision", "validationProfileDigest"]) {
    ensure(current[field] === approval[field], `final evidence invalidated by current ${field}`);
  }
  ensure(
    JSON.stringify(stableNormalize(implementation.sources)) ===
      JSON.stringify(stableNormalize(current.sources)),
    "final evidence invalidated by current sources",
  );
  ensure(
    JSON.stringify(stableNormalize(implementation.runtime)) ===
      JSON.stringify(stableNormalize(current.runtime)),
    "final evidence invalidated by current runtime conditions",
  );
  return preEdit ? { approval, preEdit, implementation } : { approval, implementation };
}

async function writeRunEvidence({ repositoryRootPath = repositoryRoot, slug, runId, name, evidence }) {
  ensure(/^[a-z0-9][a-z0-9-]*$/u.test(slug) && !["tmp", "reviews"].includes(slug), "invalid plan slug");
  ensure(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId), "invalid run ID");
  ensure(["approval.json", "pre-edit-parity.json", "implementation-parity.json"].includes(name), "invalid evidence file name");
  const root = await realpath(repositoryRootPath);
  const planRoot = path.join(root, "plans", slug);
  const metadata = await lstat(planRoot);
  ensure(metadata.isDirectory() && !metadata.isSymbolicLink(), "plan directory must be a real directory");
  ensure((await realpath(planRoot)) === planRoot, "plan directory must not traverse symlinks");
  const evidenceRoot = path.join(planRoot, "evidence");
  await ensurePrivateDirectory(evidenceRoot, "evidence root");
  const destination = path.join(evidenceRoot, runId);
  await ensurePrivateDirectory(destination, "run evidence directory");
  const target = path.join(destination, name);
  await writePrivateJsonExclusive(target, evidence, name);
  return path.relative(root, target).split(path.sep).join("/");
}

function parseCliArguments(argv) {
  ensure(
    argv.length >= 2,
    "usage: parity-runner.mjs <validate|select|prepare-run|next-batch|resume-run|record-batch|record-failure|invalidate-run|finalize-run|cleanup-run|abort-run> plans/<slug>/prototype [options]",
  );
  const [command, target, ...rest] = argv;
  ensure(
    [
      "validate",
      "select",
      "prepare-run",
      "next-batch",
      "resume-run",
      "record-batch",
      "record-failure",
      "invalidate-run",
      "finalize-run",
      "cleanup-run",
      "abort-run",
    ].includes(command),
    "unknown parity runner command",
  );
  const options = {
    phase: "smoke",
    changedTargetIds: [],
    changedStates: [],
    changedViewports: [],
    risks: ["normal"],
    matrixScope: undefined,
    executionContext: undefined,
    runId: undefined,
    batchId: undefined,
    productionUrl: undefined,
    prototypeUrl: undefined,
    runtimeOwner: undefined,
    runtimeCheckout: undefined,
    maxRows: undefined,
    maxBytes: undefined,
    shellCommands: 0,
    invalidationScope: undefined,
    source: undefined,
    failureCode: undefined,
    diagnostic: undefined,
    transient: undefined,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const value = rest[index + 1];
    ensure(value, `${argument} requires a value`);
    if (argument === "--phase") options.phase = value;
    else if (argument === "--target") options.changedTargetIds.push(value);
    else if (argument === "--state") options.changedStates.push(value);
    else if (argument === "--viewport") options.changedViewports.push(value);
    else if (argument === "--matrix-scope") options.matrixScope = value;
    else if (argument === "--execution-context") options.executionContext = value;
    else if (argument === "--run-id") options.runId = value;
    else if (argument === "--batch-id") options.batchId = value;
    else if (argument === "--production-url") options.productionUrl = value;
    else if (argument === "--prototype-url") options.prototypeUrl = value;
    else if (argument === "--runtime-owner") options.runtimeOwner = value;
    else if (argument === "--runtime-checkout") options.runtimeCheckout = value;
    else if (argument === "--max-rows") options.maxRows = Number(value);
    else if (argument === "--max-bytes") options.maxBytes = Number(value);
    else if (argument === "--shell-commands") options.shellCommands = Number(value);
    else if (argument === "--invalidation-scope") options.invalidationScope = value;
    else if (argument === "--source") options.source = value;
    else if (argument === "--failure-code") options.failureCode = value;
    else if (argument === "--diagnostic") options.diagnostic = value;
    else if (argument === "--transient") {
      ensure(value === "true" || value === "false", "--transient must be true or false");
      options.transient = value === "true";
    }
    else if (argument === "--risk") {
      if (options.risks.length === 1 && options.risks[0] === "normal") options.risks = [];
      options.risks.push(value);
    } else throw new Error(`unknown option: ${argument}`);
    index += 1;
  }
  return { command, target, options };
}

function planSlugFromTarget(target) {
  const match = /^plans\/([a-z0-9][a-z0-9-]*)\/prototype$/u.exec(target);
  ensure(match && !["tmp", "reviews"].includes(match[1]), "target must be plans/<slug>/prototype");
  return match[1];
}

async function readJsonRegular(target, label) {
  await validatePrivateFile(target, label);
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

async function currentSourceDigests(contract, repositoryRootPath = repositoryRoot) {
  const sources = [];
  for (const sourcePath of contract.productionBaseline.sources) {
    ensure(
      typeof sourcePath === "string" &&
        sourcePath !== "" &&
        !path.isAbsolute(sourcePath) &&
        !sourcePath.split("/").includes(".."),
      `invalid production source path: ${sourcePath}`,
    );
    const target = path.join(repositoryRootPath, sourcePath);
    const metadata = await lstat(target);
    ensure(metadata.isFile() && !metadata.isSymbolicLink(), `production source must be a regular file: ${sourcePath}`);
    const resolved = await realpath(target);
    ensure(resolved.startsWith(`${repositoryRootPath}${path.sep}`), `production source escaped the repository: ${sourcePath}`);
    sources.push({ path: sourcePath, sha256: sha256(await readFile(resolved)) });
  }
  return sources;
}

async function loadCurrentRunState({ target, definition, options, repositoryRootPath = repositoryRoot }) {
  const slug = planSlugFromTarget(target);
  ensure(options.runId, "--run-id is required");
  ensure(options.runtimeOwner, "--runtime-owner is required");
  ensure(options.runtimeCheckout, "--runtime-checkout is required");
  const root = await realpath(repositoryRootPath);
  const runtimeCheckout = await realpath(options.runtimeCheckout);
  const contractCheckout = await realpath(definition.contract.productionBaseline.checkout);
  ensure(
    options.runtimeOwner === definition.contract.productionBaseline.runtimeOwner,
    "--runtime-owner must match ui-contract.json; this binds externally read-back metadata and is not live runtime verification",
  );
  ensure(
    runtimeCheckout === root,
    "--runtime-checkout must resolve to the current repository checkout; this is not live runtime verification",
  );
  ensure(
    contractCheckout === root,
    "ui-contract.json productionBaseline.checkout must resolve to the current repository checkout",
  );
  const goalText = await readFile(path.join(repositoryRootPath, "plans", slug, "goal.md"), "utf8");
  const evidenceRoot = path.join(repositoryRootPath, "plans", slug, "evidence");
  const runEvidenceRoot = path.join(evidenceRoot, options.runId);
  await validatePrivateDirectory(evidenceRoot, "evidence root");
  await validatePrivateDirectory(runEvidenceRoot, "run evidence directory");
  const approval = await readJsonRegular(
    path.join(runEvidenceRoot, "approval.json"),
    "approval.json",
  );
  const current = {
    goalSha256: sha256(goalText),
    prototypeRevision: definition.prototypeRevision,
    validationProfileDigest: definition.validationProfileDigest,
    runtime: {
      owner: options.runtimeOwner,
      checkout: runtimeCheckout,
      fixture: definition.contract.comparisonConditions.fixture,
      authorization: definition.contract.comparisonConditions.authorization,
    },
    sources: await currentSourceDigests(definition.contract, repositoryRootPath),
  };
  return { slug, approval, current };
}

async function readStdin(stream = process.stdin, limit = 512 * 1024) {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
    ensure(Buffer.byteLength(text, "utf8") <= limit, "stdin payload exceeds the byte limit");
  }
  ensure(text.trim() !== "", "stdin JSON payload is required");
  return text;
}

async function runCli({
  argv = process.argv.slice(2),
  repositoryRootPath = repositoryRoot,
  stdin = process.stdin,
  stdout = process.stdout,
} = {}) {
  const root = await realpath(repositoryRootPath);
  const { command, target, options } = parseCliArguments(argv);
  if (command === "abort-run" || command === "cleanup-run") {
    planSlugFromTarget(target);
    ensure(options.runId, "--run-id is required");
    stdout.write(`${JSON.stringify(await abortRunWorkspace({
      repositoryRootPath: root,
      runId: options.runId,
    }), null, 2)}\n`);
    return;
  }
  if (command === "next-batch" || command === "resume-run") {
    planSlugFromTarget(target);
    ensure(options.runId, "--run-id is required");
    const operation = command === "next-batch" ? nextRunBatch : resumeRunWorkspace;
    stdout.write(`${JSON.stringify(await operation({ repositoryRootPath: root, runId: options.runId }), null, 2)}\n`);
    return;
  }
  if (command === "record-failure") {
    planSlugFromTarget(target);
    ensure(options.runId, "--run-id is required");
    ensure(options.batchId, "--batch-id is required");
    ensure(options.failureCode, "--failure-code is required");
    ensure(options.transient !== undefined, "--transient is required");
    stdout.write(`${JSON.stringify(await recordBatchFailure({
      repositoryRootPath: root,
      runId: options.runId,
      batchId: options.batchId,
      code: options.failureCode,
      diagnostic: options.diagnostic ?? "",
      transient: options.transient,
    }), null, 2)}\n`);
    return;
  }
  if (command === "invalidate-run") {
    planSlugFromTarget(target);
    ensure(options.runId, "--run-id is required");
    ensure(options.invalidationScope, "--invalidation-scope is required");
    stdout.write(`${JSON.stringify(await invalidateRunWorkspace({
      repositoryRootPath: root,
      runId: options.runId,
      scope: options.invalidationScope,
      targetIds: options.changedTargetIds,
      source: options.source,
    }), null, 2)}\n`);
    return;
  }
  if (command === "record-batch") {
    planSlugFromTarget(target);
    ensure(options.runId, "--run-id is required");
    ensure(options.batchId, "--batch-id is required");
    const output = await recordBatchResult({
      repositoryRootPath: root,
      runId: options.runId,
      batchId: options.batchId,
      input: await readStdin(stdin),
    });
    stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  const definition = await loadParityDefinition(target, root);
  if (command === "prepare-run") {
    ensure(options.productionUrl, "--production-url is required");
    ensure(options.prototypeUrl, "--prototype-url is required");
    const { slug, approval, current } = await loadCurrentRunState({
      target,
      definition,
      options,
      repositoryRootPath: root,
    });
    const output = await prepareRunWorkspace({
      repositoryRootPath: root,
      slug,
      runId: options.runId,
      definition,
      approval,
      current,
      baseUrls: { production: options.productionUrl, prototype: options.prototypeUrl },
      changedTargetIds: options.changedTargetIds,
      changedStates: options.changedStates,
      changedViewports: options.changedViewports,
      risks: options.risks,
      matrixScope: options.matrixScope,
      executionContext: options.executionContext,
      maxRows: options.maxRows,
      maxBytes: options.maxBytes,
      shellCommands: options.shellCommands,
      validateApproval: validateApprovalEvidence,
    });
    stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  if (command === "finalize-run") {
    const { slug, approval, current } = await loadCurrentRunState({
      target,
      definition,
      options,
      repositoryRootPath: root,
    });
    const output = await finalizeRunWorkspace({
      repositoryRootPath: root,
      slug,
      runId: options.runId,
      approval,
      current,
      definition,
      validateBundle: validateEvidenceBundle,
      writeEvidence: writeRunEvidence,
    });
    stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  const output = {
    prototypeRevision: definition.prototypeRevision,
    validationProfileDigest: definition.validationProfileDigest,
    rowCount: definition.contract.parityMatrix.length,
  };
  if (command === "select") {
    output.rows = selectRows({ contract: definition.contract, spec: definition.spec, ...options }).map(({ id }) => id);
  }
  stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return (await realpath(process.argv[1])) === (await realpath(fileURLToPath(import.meta.url)));
  } catch {
    return false;
  }
}

if (await isMainModule()) {
  runCli().catch((error) => {
    const code = typeof error?.code === "string" && error.code.startsWith("PARITY_")
      ? error.code
      : "PARITY_UNEXPECTED_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n${JSON.stringify({ code, message })}\n`);
    process.exitCode = 1;
  });
}

export {
  BrowserParityRunner,
  ParityRunError,
  compareProbe,
  createBatches,
  createCoverageReport,
  createRunContext,
  createApprovalEvidence,
  isVisibleSnapshot,
  loadParityDefinition,
  normalizeDomSnapshot,
  runCli,
  mergeBatchResults,
  runBatch,
  selectRows,
  sha256Digest,
  stableNormalize,
  stableStringify,
  validateApprovalEvidence,
  validateEvidenceBundle,
  validateParityEvidence,
  validateParitySpec,
  writeRunEvidence,
};
