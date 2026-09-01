import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  ParityRunError,
  createRunContext,
  mergeBatchResults,
  requireLoopbackBaseUrl,
  stableStringify,
} from "./parity-runner-core.mjs";

const workspaceSchemaVersion = 1;
const defaultMaxRows = 4;
const defaultMaxBytes = 128 * 1024;
const maxFragmentBytes = 512 * 1024;
const slugPattern = /^[a-z0-9][a-z0-9-]*$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const sensitiveKeyPattern = /(?:cookie|credential|password|secret|token|rawscreenshot|screenshotbytes)/iu;
const sensitiveValuePatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/u,
  /\b(?:client_secret|access_token|refresh_token|session_cookie)\s*[=:]/iu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];

function fail(code, message, evidence) {
  throw new ParityRunError(code, message, evidence);
}

function ensure(condition, code, message) {
  if (!condition) fail(code, message);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalSha256(value) {
  return sha256(stableStringify(value));
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function validateIdentifier(value, label, pattern = identifierPattern) {
  ensure(typeof value === "string" && pattern.test(value), "PARITY_BATCH_INVALID", `${label} is invalid`);
  return value;
}

function assertSecretFree(value, label = "payload", seen = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    for (const pattern of sensitiveValuePatterns) {
      ensure(!pattern.test(value), "PARITY_BATCH_INVALID", `${label} contains sensitive data`);
    }
    return;
  }
  ensure(typeof value === "object", "PARITY_BATCH_INVALID", `${label} contains an unsupported value`);
  ensure(!seen.has(value), "PARITY_BATCH_INVALID", `${label} contains a cycle`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${label}[${index}]`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) {
      ensure(!sensitiveKeyPattern.test(key), "PARITY_BATCH_INVALID", `${label} contains forbidden key ${key}`);
      assertSecretFree(item, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
}

async function ensureRealDirectory(directory, { create = false, exclusive = false, mode } = {}) {
  try {
    const metadata = await lstat(directory);
    ensure(!exclusive, "PARITY_BATCH_INVALID", `${directory} already exists`);
    ensure(metadata.isDirectory() && !metadata.isSymbolicLink(), "PARITY_BATCH_INVALID", `${directory} must be a real directory`);
  } catch (error) {
    if (!(create && error?.code === "ENOENT")) throw error;
    await mkdir(directory, { mode: mode ?? 0o700 });
  }
  ensure((await realpath(directory)) === directory, "PARITY_BATCH_INVALID", `${directory} must not traverse symlinks`);
  if (mode !== undefined) {
    await stat(directory).then((metadata) => {
      ensure((metadata.mode & 0o777) === mode, "PARITY_BATCH_INVALID", `${directory} must use mode ${mode.toString(8)}`);
    });
  }
}

async function resolveWorkspacePaths(repositoryRootPath, runId, { createRoot = false, createRun = false } = {}) {
  validateIdentifier(runId, "runId");
  const repositoryRoot = await realpath(repositoryRootPath);
  const codexRoot = path.join(repositoryRoot, ".codex");
  await ensureRealDirectory(codexRoot);
  const workspaceRoot = path.join(codexRoot, "parity-runs");
  await ensureRealDirectory(workspaceRoot, { create: createRoot, mode: 0o700 });
  const runRoot = path.join(workspaceRoot, runId);
  ensure(path.dirname(runRoot) === workspaceRoot, "PARITY_BATCH_INVALID", "run workspace escaped its root");
  await ensureRealDirectory(runRoot, { create: createRun, exclusive: createRun, mode: 0o700 });
  return { repositoryRoot, workspaceRoot, runRoot };
}

async function writeJsonExclusive(target, value) {
  assertSecretFree(value);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(target, text, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") fail("PARITY_BATCH_INVALID", `${target} already exists`);
    throw error;
  }
  const metadata = await lstat(target);
  ensure(metadata.isFile() && !metadata.isSymbolicLink(), "PARITY_BATCH_INVALID", `${target} must be a regular file`);
  ensure((metadata.mode & 0o777) === 0o600, "PARITY_BATCH_INVALID", `${target} must use mode 600`);
  return { text, bytes: byteLength(text), sha256: canonicalSha256(value) };
}

async function readJsonFile(target, { limit = maxFragmentBytes } = {}) {
  const metadata = await lstat(target);
  ensure(metadata.isFile() && !metadata.isSymbolicLink(), "PARITY_BATCH_INVALID", `${target} must be a regular file`);
  ensure(metadata.size <= limit, "PARITY_BATCH_INVALID", `${target} exceeds the byte limit`);
  const text = await readFile(target, "utf8");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("PARITY_BATCH_INVALID", `${target} must contain valid data-only JSON`);
  }
  assertSecretFree(value);
  return { value, text, sha256: canonicalSha256(value), bytes: byteLength(text) };
}

function exactKeys(value, keys, label) {
  ensure(value && typeof value === "object" && !Array.isArray(value), "PARITY_BATCH_INVALID", `${label} must be an object`);
  ensure(
    stableStringify(Object.keys(value).sort()) === stableStringify([...keys].sort()),
    "PARITY_BATCH_INVALID",
    `${label} has an invalid shape`,
  );
}

function validateSha256(value, label) {
  ensure(
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value),
    "PARITY_BATCH_INVALID",
    `${label} must be a SHA-256 digest`,
  );
}

function validateDiagnosticId(value, label) {
  ensure(
    typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value),
    "PARITY_BATCH_INVALID",
    `${label} is invalid`,
  );
}

function validateViewportReadback(value, label) {
  exactKeys(value, ["width", "height", "dpr"], label);
  for (const field of ["width", "height"]) {
    ensure(Number.isInteger(value[field]) && value[field] > 0, "PARITY_BATCH_INVALID", `${label}.${field} is invalid`);
  }
  ensure(
    typeof value.dpr === "number" && Number.isFinite(value.dpr) && value.dpr > 0,
    "PARITY_BATCH_INVALID",
    `${label}.dpr is invalid`,
  );
}

function selectedRowsRequireNetwork(manifest) {
  const probes = new Map(manifest.definition.spec.probes.map((probe) => [probe.id, probe]));
  const mappings = new Map(manifest.definition.spec.rowProbeMap.map((mapping) => [mapping.rowId, mapping.probeIds]));
  return manifest.rowIds.some((rowId) =>
    (mappings.get(rowId) ?? []).some((probeId) => probes.get(probeId)?.kind === "network"),
  );
}

function validateCapabilities(value, manifest) {
  exactKeys(value, ["status", "tabId", "viewport", "networkSource", "sessionId", "screenshot"], "capabilities");
  ensure(value.status === "pass", "PARITY_BATCH_INVALID", "capability canary must pass");
  validateDiagnosticId(value.tabId, "capabilities.tabId");
  validateDiagnosticId(value.sessionId, "capabilities.sessionId");
  validateViewportReadback(value.viewport, "capabilities.viewport");
  ensure(
    value.viewport.width === 390 && value.viewport.height === 844,
    "PARITY_VIEWPORT_MISMATCH",
    "capability canary must read back 390x844",
  );
  ensure(
    value.viewport.dpr === 1 && manifest.definition.contract.comparisonConditions.dpr === 1,
    "PARITY_DPR_MISMATCH",
    "capability canary must read back DPR 1",
  );
  validateSha256(value.screenshot, "capabilities.screenshot");
  const networkRequired = selectedRowsRequireNetwork(manifest);
  ensure(
    networkRequired
      ? ["performance-resource-timing", "browser-network-log"].includes(value.networkSource)
      : value.networkSource === "not-required",
    "PARITY_REQUIRED_PROBE_UNAVAILABLE",
    "capability canary network source does not match selected probes",
  );
}

function validateTerminalCleanup(value, capabilities) {
  exactKeys(
    value,
    ["status", "tabId", "cdpCleared", "viewportReset", "baseline", "readback"],
    "terminalCleanup",
  );
  ensure(value.status === "pass", "PARITY_CLEANUP_FAILED", "terminal Browser cleanup must pass");
  ensure(value.tabId === capabilities.tabId, "PARITY_CLEANUP_FAILED", "cleanup tab does not match capability tab");
  ensure(value.cdpCleared === true, "PARITY_CLEANUP_FAILED", "CDP device metrics override was not cleared");
  ensure(value.viewportReset === true, "PARITY_CLEANUP_FAILED", "Browser viewport was not reset");
  validateViewportReadback(value.baseline, "terminalCleanup.baseline");
  validateViewportReadback(value.readback, "terminalCleanup.readback");
  ensure(
    stableStringify(value.readback) === stableStringify(value.baseline),
    "PARITY_CLEANUP_FAILED",
    "cleanup readback did not restore the initial viewport and DPR",
  );
}

function validateMetrics(value, label) {
  exactKeys(
    value,
    ["startedAt", "finishedAt", "durationMs", "shellCommands", "browserOperations", "fullMatrixRuns"],
    label,
  );
  for (const field of ["startedAt", "finishedAt"]) {
    ensure(
      typeof value[field] === "string" && Number.isFinite(Date.parse(value[field])),
      "PARITY_BATCH_INVALID",
      `${label}.${field} is invalid`,
    );
  }
  for (const field of ["durationMs", "shellCommands", "browserOperations", "fullMatrixRuns"]) {
    ensure(
      Number.isInteger(value[field]) && value[field] >= 0,
      "PARITY_BATCH_INVALID",
      `${label}.${field} is invalid`,
    );
  }
}

function validateEvidenceUrls(rows) {
  for (const row of rows) {
    if (row?.actualConditions === null) continue;
    for (const [surface, value] of Object.entries(row?.actualConditions?.urls ?? {})) {
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        fail("PARITY_BATCH_INVALID", `${row?.rowId ?? "unknown"}.${surface} URL is invalid`);
      }
      ensure(
        parsed.username === "" && parsed.password === "" && parsed.search === "" && parsed.hash === "",
        "PARITY_BATCH_INVALID",
        `${row?.rowId ?? "unknown"}.${surface} evidence URL must exclude credentials, query, and fragment`,
      );
    }
  }
}

function validateCompactProbeValue(value, label, { nullable = false } = {}) {
  if (nullable && value?.isNull === true) {
    exactKeys(value, ["isNull"], label);
    return;
  }
  exactKeys(value, ["sha256", "bytes"], label);
  validateSha256(value.sha256, `${label}.sha256`);
  ensure(
    Number.isInteger(value.bytes) && value.bytes >= 0 && value.bytes <= maxFragmentBytes,
    "PARITY_BATCH_INVALID",
    `${label}.bytes is invalid`,
  );
}

function validateCompactProbeResults(rows, manifest) {
  const probeDefinitions = new Map(
    manifest.definition.spec.probes.map((probe) => [probe.id, probe]),
  );
  for (const row of rows) {
    ensure(Array.isArray(row?.probes), "PARITY_BATCH_INVALID", `${row?.rowId ?? "unknown"}.probes is invalid`);
    for (const result of row.probes) {
      const definition = probeDefinitions.get(result?.probeId);
      if (!definition || !["text", "attribute"].includes(definition.kind) || result.status === "skipped") continue;
      ensure(
        result.kind === definition.kind,
        "PARITY_BATCH_INVALID",
        `${row.rowId}.${result.probeId} kind does not match the profile`,
      );
      validateCompactProbeValue(
        result.production,
        `${row.rowId}.${result.probeId}.production`,
        { nullable: definition.kind === "attribute" },
      );
      validateCompactProbeValue(
        result.prototype,
        `${row.rowId}.${result.probeId}.prototype`,
        { nullable: definition.kind === "attribute" },
      );
    }
  }
}

function validateFragmentContract(fragment, manifest, descriptorIndex, priorCapabilities) {
  const isFirst = descriptorIndex === 0;
  const isLast = descriptorIndex === manifest.batches.length - 1;
  ensure(
    (fragment.capabilities !== null) === isFirst,
    "PARITY_BATCH_INVALID",
    "capability canary must appear exactly on the first batch",
  );
  if (fragment.capabilities !== null) validateCapabilities(fragment.capabilities, manifest);
  ensure(
    (fragment.terminalCleanup !== null) === isLast,
    "PARITY_CLEANUP_FAILED",
    "terminal Browser cleanup must appear exactly on the final batch",
  );
  if (fragment.terminalCleanup !== null) {
    const capabilities = isFirst ? fragment.capabilities : priorCapabilities;
    ensure(capabilities, "PARITY_BATCH_INVALID", "capability canary is required before terminal cleanup");
    validateTerminalCleanup(fragment.terminalCleanup, capabilities);
  }
  validateMetrics(fragment.metrics, "batch result metrics");
  validateEvidenceUrls(fragment.rows);
  validateCompactProbeResults(fragment.rows, manifest);
}

function normalizeBaseUrls(baseUrls) {
  exactKeys(baseUrls, ["production", "prototype"], "baseUrls");
  try {
    return {
      production: requireLoopbackBaseUrl(baseUrls.production, "production").toString(),
      prototype: requireLoopbackBaseUrl(baseUrls.prototype, "prototype").toString(),
    };
  } catch (error) {
    fail("PARITY_BATCH_INVALID", error instanceof Error ? error.message : String(error));
  }
}

async function prepareRunWorkspace({
  repositoryRootPath,
  slug,
  runId,
  definition,
  approval,
  current,
  baseUrls,
  changedTargetIds = [],
  changedStates = [],
  changedViewports = [],
  risks = ["normal"],
  matrixScope = "targeted",
  maxRows = defaultMaxRows,
  maxBytes = defaultMaxBytes,
  shellCommands = 0,
  validateApproval,
}) {
  validateIdentifier(slug, "slug", slugPattern);
  validateIdentifier(runId, "runId");
  ensure(typeof validateApproval === "function", "PARITY_BATCH_INVALID", "validateApproval callback is required");
  validateApproval(approval);
  const normalizedBaseUrls = normalizeBaseUrls(baseUrls);
  for (const field of ["goalSha256", "prototypeRevision", "validationProfileDigest"]) {
    ensure(approval[field] === current[field], "PARITY_CURRENT_STATE_DRIFT", `approval ${field} is stale`);
  }
  ensure(approval.runId === runId, "PARITY_CURRENT_STATE_DRIFT", "approval runId does not match");
  const context = createRunContext({
    runId,
    definition,
    phase: "final",
    changedTargetIds,
    changedStates,
    changedViewports,
    risks,
    matrixScope,
    maxRows,
    maxBytes,
  });
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId, {
    createRoot: true,
    createRun: true,
  });
  const batchDescriptors = [];
  try {
    for (const batch of context.batches) {
      const payload = {
        schemaVersion: workspaceSchemaVersion,
        runId,
        batchId: batch.batchId,
        rowIds: batch.rowIds,
        rows: batch.rows,
      };
      const fileName = `${batch.batchId}.json`;
      const written = await writeJsonExclusive(path.join(paths.runRoot, fileName), payload);
      ensure(written.bytes <= maxBytes, "PARITY_BATCH_INVALID", `${batch.batchId} exceeds the configured byte limit`);
      batchDescriptors.push({
        batchId: batch.batchId,
        fileName,
        rowIds: batch.rowIds,
        bytes: written.bytes,
        sha256: written.sha256,
      });
    }
    const manifest = {
      schemaVersion: workspaceSchemaVersion,
      runId,
      slug,
      phase: "final",
      matrixScope,
      selection: context.selection,
      goalSha256: current.goalSha256,
      prototypeRevision: current.prototypeRevision,
      validationProfileDigest: current.validationProfileDigest,
      definition,
      baseUrls: normalizedBaseUrls,
      runtime: current.runtime,
      sources: current.sources,
      shellCommands,
      rowIds: context.rowIds,
      batches: batchDescriptors,
    };
    const writtenManifest = await writeJsonExclusive(path.join(paths.runRoot, "manifest.json"), manifest);
    return {
      schemaVersion: workspaceSchemaVersion,
      runId,
      manifestPath: path.join(paths.runRoot, "manifest.json"),
      manifestSha256: writtenManifest.sha256,
      batches: batchDescriptors.map((batch) => ({
        batchId: batch.batchId,
        path: path.join(paths.runRoot, batch.fileName),
        sha256: batch.sha256,
        bytes: batch.bytes,
      })),
    };
  } catch (error) {
    await rm(paths.runRoot, { recursive: true, force: false }).catch(() => {});
    throw error;
  }
}

async function recordBatchResult({
  repositoryRootPath,
  runId,
  batchId,
  input,
}) {
  validateIdentifier(batchId, "batchId");
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readJsonFile(path.join(paths.runRoot, "manifest.json"));
  const descriptorIndex = manifest.batches.findIndex((batch) => batch.batchId === batchId);
  ensure(descriptorIndex >= 0, "PARITY_BATCH_INVALID", `unknown batch: ${batchId}`);
  const descriptor = manifest.batches[descriptorIndex];
  let priorCapabilities;
  for (let index = 0; index < descriptorIndex; index += 1) {
    let prior;
    try {
      prior = await readJsonFile(path.join(paths.runRoot, `fragment-${manifest.batches[index].batchId}.json`));
    } catch (error) {
      if (error?.code === "ENOENT") fail("PARITY_BATCH_INVALID", "batch results must be recorded in manifest order");
      throw error;
    }
    if (index === 0) priorCapabilities = prior.value.capabilities;
  }
  const batchFile = await readJsonFile(path.join(paths.runRoot, descriptor.fileName), {
    limit: descriptor.bytes,
  });
  ensure(
    batchFile.sha256 === descriptor.sha256 && batchFile.bytes === descriptor.bytes,
    "PARITY_BATCH_INVALID",
    `${batchId} digest or byte length changed`,
  );
  ensure(typeof input === "string", "PARITY_BATCH_INVALID", "batch result must be supplied as stdin JSON text");
  const text = input;
  ensure(byteLength(text) <= maxFragmentBytes, "PARITY_BATCH_INVALID", "batch result exceeds the byte limit");
  let fragment;
  try {
    fragment = JSON.parse(input);
  } catch {
    fail("PARITY_BATCH_INVALID", "batch result must contain valid data-only JSON");
  }
  assertSecretFree(fragment);
  exactKeys(
    fragment,
    ["schemaVersion", "runId", "batchId", "batchSha256", "rowIds", "rows", "capabilities", "metrics", "terminalCleanup"],
    "batch result",
  );
  ensure(fragment.schemaVersion === workspaceSchemaVersion, "PARITY_BATCH_INVALID", "batch result schemaVersion is invalid");
  ensure(fragment.runId === runId && fragment.batchId === batchId, "PARITY_BATCH_INVALID", "batch result identity mismatch");
  ensure(fragment.batchSha256 === descriptor.sha256, "PARITY_BATCH_INVALID", "batch result digest mismatch");
  ensure(
    stableStringify(fragment.rowIds) === stableStringify(descriptor.rowIds),
    "PARITY_BATCH_INVALID",
    "batch result row ownership mismatch",
  );
  ensure(Array.isArray(fragment.rows) && fragment.rows.length === descriptor.rowIds.length, "PARITY_BATCH_INVALID", "batch result row count mismatch");
  fragment.rows.forEach((row, index) => {
    ensure(row?.rowId === descriptor.rowIds[index], "PARITY_BATCH_INVALID", "batch result row order mismatch");
    ensure(row.status === "pass" || row.status === "fail", "PARITY_BATCH_INVALID", "batch result row status is invalid");
  });
  validateFragmentContract(fragment, manifest, descriptorIndex, priorCapabilities);
  const target = path.join(paths.runRoot, `fragment-${batchId}.json`);
  await writeJsonExclusive(target, fragment);
  return { runId, batchId, fragmentPath: target, status: "recorded" };
}

function mergeMetrics(manifest, fragments) {
  const metrics = fragments.map(({ metrics }) => metrics);
  metrics.forEach((value, index) => {
    exactKeys(
      value,
      ["startedAt", "finishedAt", "durationMs", "shellCommands", "browserOperations", "fullMatrixRuns"],
      `fragment metrics[${index}]`,
    );
  });
  return {
    startedAt: metrics[0].startedAt,
    finishedAt: metrics.at(-1).finishedAt,
    durationMs: metrics.reduce((total, metric) => total + metric.durationMs, 0),
    shellCommands: manifest.shellCommands,
    browserOperations: metrics.reduce((total, metric) => total + metric.browserOperations, 0),
    fullMatrixRuns: manifest.matrixScope === "full" ? 1 : 0,
  };
}

async function finalizeRunWorkspace({
  repositoryRootPath,
  slug,
  runId,
  approval,
  current,
  definition,
  validateBundle,
  writeEvidence,
  removeWorkspace = (target) => rm(target, { recursive: true, force: false }),
}) {
  validateIdentifier(slug, "slug", slugPattern);
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readJsonFile(path.join(paths.runRoot, "manifest.json"));
  ensure(manifest.slug === slug && manifest.runId === runId, "PARITY_CURRENT_STATE_DRIFT", "run manifest identity mismatch");
  ensure(
    stableStringify(manifest.definition) === stableStringify(definition),
    "PARITY_CURRENT_STATE_DRIFT",
    "run manifest definition does not match the current contract/profile",
  );
  const fragments = [];
  let validatedCapabilities;
  for (const [descriptorIndex, descriptor] of manifest.batches.entries()) {
    const batchFile = await readJsonFile(path.join(paths.runRoot, descriptor.fileName), {
      limit: descriptor.bytes,
    });
    ensure(
      batchFile.sha256 === descriptor.sha256 && batchFile.bytes === descriptor.bytes,
      "PARITY_BATCH_INVALID",
      `batch changed after prepare: ${descriptor.batchId}`,
    );
    let fragmentFile;
    try {
      fragmentFile = await readJsonFile(path.join(paths.runRoot, `fragment-${descriptor.batchId}.json`));
    } catch (error) {
      if (error?.code === "ENOENT") fail("PARITY_BATCH_INCOMPLETE", `missing batch fragment: ${descriptor.batchId}`);
      throw error;
    }
    const fragment = fragmentFile.value;
    exactKeys(
      fragment,
      ["schemaVersion", "runId", "batchId", "batchSha256", "rowIds", "rows", "capabilities", "metrics", "terminalCleanup"],
      `fragment ${descriptor.batchId}`,
    );
    ensure(
      fragment.schemaVersion === workspaceSchemaVersion &&
        fragment.runId === runId &&
        fragment.batchId === descriptor.batchId,
      "PARITY_BATCH_INVALID",
      `fragment identity mismatch: ${descriptor.batchId}`,
    );
    ensure(fragment.batchSha256 === descriptor.sha256, "PARITY_BATCH_INVALID", `fragment digest mismatch: ${descriptor.batchId}`);
    ensure(
      stableStringify(fragment.rowIds) === stableStringify(descriptor.rowIds),
      "PARITY_BATCH_INVALID",
      `fragment row ownership mismatch: ${descriptor.batchId}`,
    );
    validateFragmentContract(fragment, manifest, descriptorIndex, validatedCapabilities);
    if (fragment.capabilities !== null) validatedCapabilities = fragment.capabilities;
    fragments.push(fragment);
  }
  const rows = mergeBatchResults({
    expectedRowIds: manifest.rowIds,
    fragments: fragments.map(({ batchId, rowIds, rows: fragmentRows }) => ({
      batchId,
      rowIds,
      rows: fragmentRows,
    })),
  });
  ensure(rows.every(({ status }) => status === "pass"), "PARITY_BATCH_INCOMPLETE", "final rows must all pass");
  const cleanupFragments = fragments.filter(({ terminalCleanup }) => terminalCleanup !== null);
  ensure(cleanupFragments.length === 1, "PARITY_CLEANUP_FAILED", "exactly one terminal Browser cleanup result is required");
  ensure(
    cleanupFragments[0] === fragments.at(-1) && cleanupFragments[0].terminalCleanup.status === "pass",
    "PARITY_CLEANUP_FAILED",
    "terminal Browser cleanup must pass on the final batch",
  );
  const capabilities = validatedCapabilities;
  ensure(capabilities?.status === "pass", "PARITY_BATCH_INCOMPLETE", "capability canary must pass");
  const evidence = {
    schemaVersion: 3,
    phase: "final",
    runId,
    generatedAt: new Date().toISOString(),
    goalSha256: manifest.goalSha256,
    prototypeRevision: manifest.prototypeRevision,
    validationProfileDigest: manifest.validationProfileDigest,
    matrixScope: manifest.matrixScope,
    selection: manifest.selection,
    runtime: manifest.runtime,
    sources: manifest.sources,
    capabilities: { ...capabilities, cleanup: cleanupFragments[0].terminalCleanup },
    rows,
    metrics: mergeMetrics(manifest, fragments),
  };
  ensure(typeof validateBundle === "function", "PARITY_BATCH_INVALID", "validateBundle callback is required");
  ensure(typeof writeEvidence === "function", "PARITY_BATCH_INVALID", "writeEvidence callback is required");
  validateBundle({
    approval,
    implementation: evidence,
    contract: manifest.definition.contract,
    spec: manifest.definition.spec,
    current,
  });
  try {
    await removeWorkspace(paths.runRoot);
  } catch (error) {
    fail(
      "PARITY_CLEANUP_FAILED",
      `run workspace cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    await lstat(paths.runRoot);
    fail("PARITY_CLEANUP_FAILED", "run workspace still exists after cleanup");
  } catch (error) {
    if (error instanceof ParityRunError) throw error;
    if (error?.code !== "ENOENT") fail("PARITY_CLEANUP_FAILED", "run workspace cleanup readback failed");
  }
  let evidencePath;
  try {
    evidencePath = await writeEvidence({
      repositoryRootPath: paths.repositoryRoot,
      slug,
      runId,
      name: "implementation-parity.json",
      evidence,
    });
  } catch {
    fail(
      "PARITY_CURRENT_STATE_DRIFT",
      "canonical evidence write failed after workspace cleanup; rerun with a fresh run ID",
    );
  }
  return { runId, evidencePath, status: "pass" };
}

async function abortRunWorkspace({ repositoryRootPath, runId }) {
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  await rm(paths.runRoot, { recursive: true, force: false });
  try {
    await lstat(paths.runRoot);
    fail("PARITY_CLEANUP_FAILED", "run workspace still exists after abort");
  } catch (error) {
    if (error instanceof ParityRunError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }
  return { runId, status: "aborted" };
}

export {
  abortRunWorkspace,
  assertSecretFree,
  finalizeRunWorkspace,
  prepareRunWorkspace,
  recordBatchResult,
  sha256,
};
