import { requireBrowserAdapterRuntime } from "./in-app-browser-parity-adapter.mjs";
import { requireBrowserDocumentation, classifyBrowserError } from "./browser-api-bootstrap.mjs";
import { interactionCoverage, validateFidelityAudit } from "./parity-fidelity.mjs";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  ParityRunError,
  BrowserParityRunner,
  createCoverageReport,
  createRunContext,
  mergeBatchResults,
  requireLoopbackBaseUrl,
  resolveInvalidationTargets,
  stableStringify,
} from "./parity-runner-core.mjs";

const legacyWorkspaceSchemaVersion = 1;
const coverageWorkspaceSchemaVersion = 2;
const defaultMaxRows = 4;
const defaultMaxBytes = 128 * 1024;
const maxManifestBytes = 2 * 1024 * 1024;
const maxLogicalManifestBytes = 32 * 1024 * 1024;
const manifestPartChars = 128 * 1024;
const maxManifestParts = 256;
const maxCheckpointBytes = 512 * 1024;
const maxFragmentBytes = 512 * 1024;
const maxArtifactBytes = 2 * 1024 * 1024;
const maxDiagnosticBytes = 2 * 1024;
const maxSummaryBytes = 4 * 1024;
const slugPattern = /^[a-z0-9][a-z0-9-]*$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const sensitiveKeyPattern = /(?:api[_-]?key|cookie|credential|password|private[_-]?key|secret|token|rawscreenshot|screenshotbytes)/iu;
const authorizationProfilePattern = /^[a-z][a-z0-9]*(?:[._ -][a-z0-9]+)*$/u;
const sensitiveValuePatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\b(?:Authorization\s*:\s*)?(?:Bearer|Basic|Digest|Negotiate|NTLM|Token)\s+[^\s"']+/iu,
  /\b(?:Cookie|Set-Cookie)\s*:/iu,
  /\b(?:client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?(?:token|cookie)|credential)\b["']?\s*[:=]\s*["']?[^\s,"'}]+/iu,
  /\b(?:password|token)\b["']?\s*[:=]\s*["']?[^\s,"'}]+/iu,
  /\b(?:api[_-]?key|x-api-key)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{8,}/iu,
  /\bAKIA[A-Z0-9]{16}\b/u,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s\/:@]+:[^\s\/@]+@/iu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
];
const failureDiagnostics = new Map([
  ["BROWSER_DOCUMENTATION_REQUIRED", "Browser documentation must be read in the current runtime"],
  ["BROWSER_PERMISSION_DENIED", "Browser permission was explicitly denied"],
  ["PARITY_ARTIFACT_SINK_UNAVAILABLE", "artifact capture is unavailable"],
  ["PARITY_AUTHORIZATION_PROFILE_REQUIRED", "authorization profile provenance is unavailable"],
  ["PARITY_BATCH_INCOMPLETE", "batch execution is incomplete"],
  ["PARITY_BATCH_INVALID", "batch execution produced invalid data"],
  ["PARITY_BROWSER_SETUP_REQUIRED", "Browser setup is incomplete"],
  ["PARITY_BROWSER_TRANSIENT", "Browser operation failed and may be retried"],
  ["PARITY_CDP_CAPABILITY_UNAVAILABLE", "required CDP capability is unavailable"],
  ["PARITY_CLEANUP_FAILED", "terminal Browser cleanup failed"],
  ["PARITY_COMPARISON_TAB_REQUIRED", "comparison tab is unavailable"],
  ["PARITY_CURRENT_STATE_DRIFT", "approved current state has drifted"],
  ["PARITY_DPR_MISMATCH", "Browser DPR does not match the contract"],
  ["PARITY_DPR_OVERRIDE_UNAVAILABLE", "required Browser DPR override is unavailable"],
  ["PARITY_NAVIGATION_TIMEOUT", "Browser navigation exceeded its bounded deadline"],
  ["PARITY_ORIGIN_CONTEXT_INVALID", "Browser origin context is invalid"],
  ["PARITY_REQUIRED_PROBE_FAILED", "one or more required probes failed"],
  ["PARITY_REQUIRED_PROBE_UNAVAILABLE", "required probe capability is unavailable"],
  ["PARITY_ROW_FAILED", "one or more parity rows failed"],
  ["PARITY_RUN_FAILED", "parity run failed"],
  ["PARITY_RUN_INTERRUPTED", "batch execution was interrupted before a result was recorded"],
  ["PARITY_SELECTED_TAB_DRIFT", "selected Browser tab changed during execution"],
  ["PARITY_THEME_SETUP_FAILED", "Browser theme setup failed"],
  ["PARITY_UNEXPECTED_ERROR", "parity run failed unexpectedly"],
  ["PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE", "required Browser viewport capability is unavailable"],
  ["PARITY_VIEWPORT_MISMATCH", "Browser viewport does not match the contract"],
]);

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
      if (key === "authorization" || key === "authorizationProfile") {
        ensure(
          (typeof item === "string" && item.length <= 128 && item !== "unknown" && authorizationProfilePattern.test(item)) ||
          (key === "authorization" && item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).sort().join(",") === "profile,role,tenant" && Object.values(item).every((value) => typeof value === "string" && value.length <= 128 && value !== "unknown" && authorizationProfilePattern.test(value))),
          "PARITY_BATCH_INVALID",
          `${label}.${key} must contain a sanitized authorization profile name`,
        );
      }
      assertSecretFree(item, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function sameDirectoryIdentity(identity, metadata, resolved) {
  return metadata.dev === identity.dev &&
    metadata.ino === identity.ino &&
    metadata.mode === identity.mode &&
    resolved === identity.realpath;
}

async function captureDirectoryIdentity(directory) {
  const metadata = await lstat(directory, { bigint: true });
  ensure(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    "PARITY_BATCH_INVALID",
    `${directory} must be a real directory`,
  );
  const resolved = await realpath(directory);
  return {
    path: directory,
    realpath: resolved,
    dev: metadata.dev,
    ino: metadata.ino,
    mode: metadata.mode,
  };
}

async function assertDirectoryIdentity(identity) {
  let metadata;
  let resolved;
  try {
    metadata = await lstat(identity.path, { bigint: true });
    resolved = await realpath(identity.path);
  } catch {
    fail("PARITY_BATCH_INVALID", `${identity.path} directory identity changed`);
  }
  ensure(
    metadata.isDirectory() && !metadata.isSymbolicLink() &&
      sameDirectoryIdentity(identity, metadata, resolved),
    "PARITY_BATCH_INVALID",
    `${identity.path} directory identity changed`,
  );
}

async function assertWorkspaceIdentities(paths) {
  await assertDirectoryIdentity(paths.workspaceIdentity);
  await assertDirectoryIdentity(paths.runIdentity);
}

async function ensureRealDirectory(directory, { create = false, exclusive = false, mode } = {}) {
  let created = false;
  let metadata;
  try {
    metadata = await lstat(directory);
  } catch (error) {
    if (!(create && error?.code === "ENOENT")) throw error;
    try {
      await mkdir(directory, { mode: mode ?? 0o700 });
      created = true;
    } catch (createError) {
      if (exclusive || createError?.code !== "EEXIST") throw createError;
    }
    metadata = await lstat(directory);
  }
  ensure(created || !exclusive, "PARITY_BATCH_INVALID", `${directory} already exists`);
  ensure(metadata.isDirectory() && !metadata.isSymbolicLink(), "PARITY_BATCH_INVALID", `${directory} must be a real directory`);
  if (mode !== undefined) {
    await stat(directory).then((metadata) => {
      ensure((metadata.mode & 0o777) === mode, "PARITY_BATCH_INVALID", `${directory} must use mode ${mode.toString(8)}`);
    });
  }
  return captureDirectoryIdentity(directory);
}

async function resolveWorkspacePaths(repositoryRootPath, runId, { createRoot = false, createRun = false } = {}) {
  validateIdentifier(runId, "runId");
  const repositoryRoot = await realpath(repositoryRootPath);
  const codexRoot = path.join(repositoryRoot, ".codex");
  await ensureRealDirectory(codexRoot);
  const workspaceRoot = path.join(codexRoot, "parity-runs");
  const workspaceIdentity = await ensureRealDirectory(workspaceRoot, { create: createRoot, mode: 0o700 });
  const runRoot = path.join(workspaceRoot, runId);
  ensure(path.dirname(runRoot) === workspaceRoot, "PARITY_BATCH_INVALID", "run workspace escaped its root");
  const runIdentity = await ensureRealDirectory(runRoot, { create: createRun, exclusive: createRun, mode: 0o700 });
  return { repositoryRoot, workspaceRoot, runRoot, workspaceIdentity, runIdentity };
}

function serializeWorkspaceJson(target, value, maxBytes) {
  assertSecretFree(value);
  let text = `${JSON.stringify(value, null, 2)}\n`;
  // Formatting must not make an otherwise readable manifest exceed its reader limit.
  if (byteLength(text) > maxBytes) text = `${JSON.stringify(value)}\n`;
  ensure(byteLength(text) <= maxBytes, "PARITY_BATCH_INVALID", `${target} exceeds the byte limit`);
  return text;
}

async function writeJsonExclusive(target, value, { parentIdentity, maxBytes = Infinity } = {}) {
  const text = serializeWorkspaceJson(target, value, maxBytes);
  const identity = parentIdentity ?? await captureDirectoryIdentity(path.dirname(target));
  await assertDirectoryIdentity(identity);
  try {
    await writeFile(target, text, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") fail("PARITY_BATCH_INVALID", `${target} already exists`);
    throw error;
  }
  const metadata = await lstat(target);
  ensure(metadata.isFile() && !metadata.isSymbolicLink(), "PARITY_BATCH_INVALID", `${target} must be a regular file`);
  ensure((metadata.mode & 0o777) === 0o600, "PARITY_BATCH_INVALID", `${target} must use mode 600`);
  await assertDirectoryIdentity(identity);
  return { text, bytes: byteLength(text), sha256: canonicalSha256(value) };
}

async function writeJsonAtomic(target, value, { parentIdentity, maxBytes = Infinity } = {}) {
  const text = serializeWorkspaceJson(target, value, maxBytes);
  const temporary = `${target}.next`;
  const identity = parentIdentity ?? await captureDirectoryIdentity(path.dirname(target));
  await assertDirectoryIdentity(identity);
  try {
    await writeFile(temporary, text, { flag: "wx", mode: 0o600 });
    await assertDirectoryIdentity(identity);
    await rename(temporary, target);
  } catch (error) {
    const parentStillOwned = await assertDirectoryIdentity(identity).then(
      () => true,
      () => false,
    );
    if (parentStillOwned) await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  const metadata = await lstat(target);
  ensure(metadata.isFile() && !metadata.isSymbolicLink(), "PARITY_BATCH_INVALID", `${target} must be a regular file`);
  ensure((metadata.mode & 0o777) === 0o600, "PARITY_BATCH_INVALID", `${target} must use mode 600`);
  await assertDirectoryIdentity(identity);
  return { text, bytes: byteLength(text), sha256: canonicalSha256(value) };
}

// Storage version is independent of the logical workspace/evidence schema.
async function writeManifest(target, manifest, { parentIdentity, atomic = false } = {}) {
  assertSecretFree(manifest);
  const compact = `${JSON.stringify(manifest)}\n`;
  const bytes = byteLength(compact);
  ensure(bytes <= maxLogicalManifestBytes, "PARITY_BATCH_INVALID", "manifest exceeds the aggregate byte limit");
  const writeIndex = atomic ? writeJsonAtomic : writeJsonExclusive;
  if (bytes <= maxManifestBytes) {
    return writeIndex(target, manifest, { parentIdentity, maxBytes: maxManifestBytes });
  }
  const count = Math.ceil(compact.length / manifestPartChars);
  ensure(count <= maxManifestParts, "PARITY_BATCH_INVALID", "manifest exceeds the part count limit");
  const parts = [];
  for (let offset = 0; offset < compact.length; offset += manifestPartChars) {
    const value = { text: compact.slice(offset, offset + manifestPartChars) };
    const digest = canonicalSha256(value);
    const fileName = `manifest-part-${digest.slice(7)}.json`;
    const partPath = path.join(path.dirname(target), fileName);
    try {
      await writeJsonExclusive(partPath, value, { parentIdentity, maxBytes: maxManifestBytes });
    } catch (error) {
      // Repeated content and source updates reuse only verified immutable parts.
      if (error?.code !== "PARITY_BATCH_INVALID" || !error.message.endsWith(" already exists")) throw error;
    }
    const metadata = await lstat(partPath);
    ensure((metadata.mode & 0o777) === 0o600, "PARITY_BATCH_INVALID", "manifest part must use mode 600");
    const readback = await readJsonFile(partPath, { limit: maxManifestBytes, parentIdentity });
    ensure(readback.sha256 === digest, "PARITY_BATCH_INVALID", "manifest part digest mismatch");
    parts.push({ fileName, sha256: digest });
  }
  const digest = canonicalSha256(manifest);
  const result = await writeIndex(target, {
    storageVersion: 1, kind: "split-manifest", bytes, sha256: digest, parts,
  }, { parentIdentity, maxBytes: maxManifestBytes });
  return { ...result, sha256: digest };
}

async function readManifest(target, options) {
  const stored = await readJsonFile(target, options);
  const index = stored.value;
  if (index?.kind !== "split-manifest") return stored;
  ensure(index.storageVersion === 1 && Object.keys(index).sort().join(",") === "bytes,kind,parts,sha256,storageVersion",
    "PARITY_BATCH_INVALID", "invalid split manifest index");
  ensure(Number.isSafeInteger(index.bytes) && index.bytes > 0 && index.bytes <= maxLogicalManifestBytes &&
    Array.isArray(index.parts) && index.parts.length > 0 && index.parts.length <= maxManifestParts &&
    /^sha256:[a-f0-9]{64}$/u.test(index.sha256), "PARITY_BATCH_INVALID", "invalid split manifest bounds");
  const texts = [];
  let totalChars = 0;
  for (const part of index.parts) {
    ensure(part && Object.keys(part).sort().join(",") === "fileName,sha256" &&
      typeof part.sha256 === "string" && /^sha256:[a-f0-9]{64}$/u.test(part.sha256) &&
      part.fileName === `manifest-part-${part.sha256.slice(7)}.json`,
    "PARITY_BATCH_INVALID", "invalid manifest part reference");
    const partPath = path.join(path.dirname(target), part.fileName);
    const metadata = await lstat(partPath);
    ensure((metadata.mode & 0o777) === 0o600, "PARITY_BATCH_INVALID", "manifest part must use mode 600");
    const readback = await readJsonFile(partPath, options);
    const value = readback.value;
    ensure(readback.sha256 === part.sha256 && value && Object.keys(value).join(",") === "text" &&
      typeof value.text === "string" && value.text.length > 0 && value.text.length <= manifestPartChars,
    "PARITY_BATCH_INVALID", "manifest part digest or content mismatch");
    totalChars += value.text.length;
    ensure(totalChars <= index.bytes, "PARITY_BATCH_INVALID", "manifest exceeds declared size");
    texts.push(value.text);
  }
  const text = texts.join("");
  ensure(byteLength(text) === index.bytes, "PARITY_BATCH_INVALID", "manifest aggregate byte mismatch");
  let value;
  try { value = JSON.parse(text); }
  catch { fail("PARITY_BATCH_INVALID", "invalid reconstructed manifest JSON"); }
  assertSecretFree(value);
  ensure(canonicalSha256(value) === index.sha256 && value?.kind !== "split-manifest",
    "PARITY_BATCH_INVALID", "manifest aggregate digest mismatch");
  return { value, bytes: index.bytes, sha256: index.sha256 };
}

function boundedDiagnostic(value) {
  const bytes = Buffer.from(String(value ?? ""), "utf8");
  if (bytes.length <= maxDiagnosticBytes) return bytes.toString("utf8");
  return bytes.subarray(0, maxDiagnosticBytes).toString("utf8");
}

function compactRunSummary(checkpoint, { cleanup = "pending" } = {}) {
  const passed = checkpoint.batches.filter(({ status }) => status === "passed");
  const failed = checkpoint.batches.find(({ status }) => status === "failed" || status === "terminal");
  const executed = checkpoint.batches.filter(({ status }) => !["pending", "invalidated"].includes(status));
  const summary = {
    plannedRows: checkpoint.plannedRows,
    executedRows: executed.reduce((total, batch) => total + batch.rowIds.length, 0),
    passedRows: passed.reduce((total, batch) => total + batch.rowIds.length, 0),
    failedRowIds: failed?.rowIds ?? [],
    errorCode: failed?.errorCode ?? null,
    diagnostic: boundedDiagnostic(failed?.diagnostic ?? ""),
    checkpoint: checkpoint.batches.find(({ status }) => status !== "passed")?.batchId ?? "complete",
    cleanup,
  };
  ensure(
    byteLength(stableStringify(summary)) <= maxSummaryBytes,
    "PARITY_BATCH_INVALID",
    "compact summary exceeds the byte limit",
  );
  return summary;
}

function createCheckpoint(runId, batchDescriptors) {
  return {
    schemaVersion: coverageWorkspaceSchemaVersion,
    runId,
    resumed: false,
    plannedRows: batchDescriptors.reduce((total, batch) => total + batch.rowIds.length, 0),
    invalidations: [],
    artifactIndex: [],
    batches: batchDescriptors.map((batch) => ({
      batchId: batch.batchId,
      rowIds: batch.rowIds,
      status: "pending",
      attempts: 0,
      errorCode: null,
      diagnostic: null,
      fragmentSha256: null,
    })),
  };
}

async function readCheckpoint(runRoot, parentIdentity) {
  const { value } = await readJsonFile(path.join(runRoot, "checkpoint.json"), {
    limit: maxCheckpointBytes,
    parentIdentity,
  });
  ensure([coverageWorkspaceSchemaVersion, 3].includes(value.schemaVersion), "PARITY_BATCH_INVALID", "checkpoint schemaVersion is invalid");
  ensure(Array.isArray(value.batches), "PARITY_BATCH_INVALID", "checkpoint batches must be an array");
  return value;
}

async function createWorkspaceArtifactSink({ repositoryRootPath, runId, maxBytes = 2 * 1024 * 1024 }) {
  ensure(
    Number.isSafeInteger(maxBytes) && maxBytes >= 0 && maxBytes <= maxArtifactBytes,
    "PARITY_BATCH_INVALID",
    "artifact byte limit is invalid",
  );
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const artifactRoot = path.join(paths.runRoot, "artifacts");
  const artifactIdentity = await ensureRealDirectory(artifactRoot, { create: true, mode: 0o700 });
  return async ({ kind, rowId, probeId, surface, content, mediaType }) => {
    await assertWorkspaceIdentities(paths);
    await assertDirectoryIdentity(artifactIdentity);
    for (const [value, label] of [[kind, "kind"], [rowId, "rowId"], [probeId, "probeId"], [surface, "surface"]]) {
      validateIdentifier(value, `artifact ${label}`);
    }
    ensure(["screenshot", "dom", "accessibility"].includes(kind), "PARITY_BATCH_INVALID", "artifact kind is invalid");
    ensure(["production", "prototype"].includes(surface), "PARITY_BATCH_INVALID", "artifact surface is invalid");
    ensure(typeof mediaType === "string" && mediaType.length > 0, "PARITY_BATCH_INVALID", "artifact mediaType is invalid");
    assertSecretFree(mediaType, "artifact mediaType");
    ensure(
      typeof content === "string" || Buffer.isBuffer(content) || content instanceof Uint8Array,
      "PARITY_BATCH_INVALID",
      "artifact content must be a string or byte array",
    );
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    ensure(bytes.length <= maxBytes, "PARITY_BATCH_INVALID", "artifact exceeds the byte limit");
    assertSecretFree(bytes.toString("utf8"), "artifact content");
    const extension = kind === "screenshot" ? (mediaType === "image/jpeg" ? "jpg" : "png") : "json";
    const fileName = `${rowId}--${probeId}--${surface}.${extension}`;
    const target = path.join(artifactRoot, fileName);
    ensure(path.dirname(target) === artifactRoot, "PARITY_BATCH_INVALID", "artifact escaped its root");
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    const metadata = await lstat(target);
    ensure(metadata.isFile() && !metadata.isSymbolicLink(), "PARITY_BATCH_INVALID", "artifact must be a regular file");
    ensure((metadata.mode & 0o777) === 0o600, "PARITY_BATCH_INVALID", "artifact must use mode 600");
    await assertWorkspaceIdentities(paths);
    await assertDirectoryIdentity(artifactIdentity);
    const record = {
      path: path.relative(paths.repositoryRoot, target).split(path.sep).join("/"),
      sha256: sha256(bytes),
      bytes: bytes.length,
      kind,
      mediaType,
      surface,
      rowId,
      probeId,
    };
    const checkpoint = await readCheckpoint(paths.runRoot, paths.runIdentity);
    checkpoint.artifactIndex.push(record);
    await writeJsonAtomic(path.join(paths.runRoot, "checkpoint.json"), checkpoint, {
      parentIdentity: paths.runIdentity,
    });
    await assertWorkspaceIdentities(paths);
    await assertDirectoryIdentity(artifactIdentity);
    return record;
  };
}

function stableFileMetadata(metadata) {
  return [
    metadata.dev,
    metadata.ino,
    metadata.mode,
    metadata.nlink,
    metadata.size,
    metadata.mtimeNs,
    metadata.ctimeNs,
  ];
}

function sameFileMetadata(left, right) {
  const leftFields = stableFileMetadata(left);
  const rightFields = stableFileMetadata(right);
  return leftFields.every((value, index) => value === rightFields[index]);
}

async function readBoundedFile(fileHandle, limit, target) {
  const buffer = Buffer.alloc(limit + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await fileHandle.read(buffer, offset, buffer.length - offset, null);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  ensure(offset <= limit, "PARITY_BATCH_INVALID", `${target} exceeds the byte limit`);
  return buffer.subarray(0, offset);
}

async function readStableFile(
  target,
  { limit, parentIdentity, beforeMetadataReadback } = {},
) {
  ensure(
    Number.isSafeInteger(limit) && limit >= 0 && limit <= maxManifestBytes,
    "PARITY_BATCH_INVALID",
    "file byte limit is invalid",
  );
  const identity = parentIdentity ?? await captureDirectoryIdentity(path.dirname(target));
  await assertDirectoryIdentity(identity);
  let fileHandle;
  try {
    fileHandle = await open(target, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ELOOP") {
      fail("PARITY_BATCH_INVALID", `${target} must be a regular file`);
    }
    throw error;
  }
  let bytes;
  try {
    const before = await fileHandle.stat({ bigint: true });
    ensure(before.isFile(), "PARITY_BATCH_INVALID", `${target} must be a regular file`);
    ensure(before.size <= BigInt(limit), "PARITY_BATCH_INVALID", `${target} exceeds the byte limit`);
    bytes = await readBoundedFile(fileHandle, limit, target);
    if (beforeMetadataReadback !== undefined) {
      ensure(
        typeof beforeMetadataReadback === "function",
        "PARITY_BATCH_INVALID",
        "beforeMetadataReadback must be a function",
      );
      await beforeMetadataReadback();
    }
    const after = await fileHandle.stat({ bigint: true });
    ensure(
      sameFileMetadata(before, after),
      "PARITY_BATCH_INVALID",
      `${target} changed while it was being read`,
    );
    await assertDirectoryIdentity(identity);
    const pathMetadata = await lstat(target, { bigint: true });
    ensure(
      pathMetadata.isFile() && !pathMetadata.isSymbolicLink() && sameFileMetadata(after, pathMetadata),
      "PARITY_BATCH_INVALID",
      `${target} changed while it was being read`,
    );
  } finally {
    await fileHandle.close();
  }
  return bytes;
}

async function readJsonFile(
  target,
  { limit = maxFragmentBytes, parentIdentity, beforeMetadataReadback } = {},
) {
  const bytes = await readStableFile(target, {
    limit,
    parentIdentity,
    beforeMetadataReadback,
  });
  const text = bytes.toString("utf8");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("PARITY_BATCH_INVALID", `${target} must contain valid data-only JSON`);
  }
  assertSecretFree(value);
  return { value, text, sha256: canonicalSha256(value), bytes: bytes.length };
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
  exactKeys(
    value,
    ["status", "tabId", "viewport", "networkSource", "sessionId", "screenshot", "surfaceContexts"],
    "capabilities",
  );
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
  ensure(
    Array.isArray(value.surfaceContexts) && value.surfaceContexts.length === 2,
    "PARITY_BATCH_INVALID",
    "capabilities.surfaceContexts must contain production and prototype provenance",
  );
  const expectedAuthorizationProfile = manifest.definition.contract.comparisonConditions.authorization;
  const expectedAuthorizationProfileDigest = sha256(
    `parity:authorization-profile:v1\0${expectedAuthorizationProfile}`,
  );
  const expectedOrigins = Object.fromEntries(
    ["production", "prototype"].map((surface) => [surface, new URL(manifest.baseUrls[surface]).origin]),
  );
  const seenSurfaces = new Set();
  const seenTabIds = new Set();
  for (const [index, context] of value.surfaceContexts.entries()) {
    exactKeys(
      context,
      ["sessionId", "tabId", "surface", "origin", "authorizationProfile", "authorizationProfileDigest"],
      `capabilities.surfaceContexts[${index}]`,
    );
    ensure(
      context.surface === "production" || context.surface === "prototype",
      "PARITY_BATCH_INVALID",
      `capabilities.surfaceContexts[${index}].surface is invalid`,
    );
    ensure(!seenSurfaces.has(context.surface), "PARITY_BATCH_INVALID", "surface context provenance is duplicated");
    seenSurfaces.add(context.surface);
    validateDiagnosticId(context.sessionId, `capabilities.surfaceContexts[${index}].sessionId`);
    validateDiagnosticId(context.tabId, `capabilities.surfaceContexts[${index}].tabId`);
    seenTabIds.add(context.tabId);
    ensure(
      context.sessionId === value.sessionId && context.origin === expectedOrigins[context.surface],
      "PARITY_BATCH_INVALID",
      `capabilities.surfaceContexts[${index}] does not match Browser provenance`,
    );
    ensure(
      context.authorizationProfile === expectedAuthorizationProfile &&
        context.authorizationProfileDigest === expectedAuthorizationProfileDigest,
      "PARITY_BATCH_INVALID",
      `capabilities.surfaceContexts[${index}] authorization provenance does not match the contract`,
    );
    validateSha256(
      context.authorizationProfileDigest,
      `capabilities.surfaceContexts[${index}].authorizationProfileDigest`,
    );
  }
  ensure(
    [...seenSurfaces].sort().join(",") === "production,prototype",
    "PARITY_BATCH_INVALID",
    "surface context provenance is incomplete",
  );
  ensure(
    seenTabIds.size === 2,
    "PARITY_BATCH_INVALID",
    "production and prototype surface contexts must use distinct tabs",
  );
}

function validateTerminalCleanup(value, capabilities) {
  if (Array.isArray(value?.tabs)) {
    exactKeys(value, ["status", "tabs"], "terminalCleanup");
    ensure(value.status === "pass", "PARITY_CLEANUP_FAILED", "terminal Browser cleanup must pass");
    const expectedIds = capabilities.surfaceContexts.map(({ tabId }) => tabId).sort();
    ensure(stableStringify(value.tabs.map(({ tabId }) => tabId).sort()) === stableStringify(expectedIds),
      "PARITY_CLEANUP_FAILED", "cleanup must cover both owned surface tabs exactly once");
    for (const cleanup of value.tabs) validateTerminalCleanup(cleanup, { ...capabilities, tabId: cleanup.tabId });
    return;
  }
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
  matrixScope = definition?.spec?.version >= 3 ? "coverage" : "targeted",
  executionContext,
  maxRows,
  maxBytes,
  shellCommands = 0,
  validateApproval,
}) {
  if (definition?.spec?.version === 5) {
    const { prepareModelWorkspace } = await import("./parity-model-workspace.mjs");
    return prepareModelWorkspace({ repositoryRootPath, slug, runId, definition, approval, current, baseUrls, maxRows, maxBytes });
  }
  validateIdentifier(slug, "slug", slugPattern);
  validateIdentifier(runId, "runId");
  ensure(typeof validateApproval === "function", "PARITY_BATCH_INVALID", "validateApproval callback is required");
  validateApproval(approval);
  const normalizedBaseUrls = normalizeBaseUrls(baseUrls);
  for (const field of ["goalSha256", "prototypeRevision", "validationProfileDigest"]) {
    ensure(approval[field] === current[field], "PARITY_CURRENT_STATE_DRIFT", `approval ${field} is stale`);
  }
  ensure(approval.runId === runId, "PARITY_CURRENT_STATE_DRIFT", "approval runId does not match");
  const workspaceSchemaVersion = definition.spec.version >= 3
    ? coverageWorkspaceSchemaVersion
    : legacyWorkspaceSchemaVersion;
  const resolvedMaxRows = maxRows ?? definition.spec.batchPolicy?.maxRows ?? defaultMaxRows;
  const resolvedMaxBytes = maxBytes ?? definition.spec.batchPolicy?.maxBytes ?? defaultMaxBytes;
  const context = createRunContext({
    runId,
    definition,
    phase: "final",
    changedTargetIds,
    changedStates,
    changedViewports,
    risks,
    matrixScope,
    executionContext,
    maxRows: resolvedMaxRows,
    maxBytes: resolvedMaxBytes,
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
      const written = await writeJsonExclusive(path.join(paths.runRoot, fileName), payload, {
        parentIdentity: paths.runIdentity,
      });
      ensure(written.bytes <= resolvedMaxBytes, "PARITY_BATCH_INVALID", `${batch.batchId} exceeds the configured byte limit`);
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
      executionContext: executionContext ?? (definition.spec.version >= 3 ? "feature" : null),
      selection: context.selection,
      goalSha256: current.goalSha256,
      prototypeRevision: current.prototypeRevision,
      validationProfileDigest: current.validationProfileDigest,
      definition,
      baseUrls: normalizedBaseUrls,
      runtime: current.runtime,
      sources: current.sources,
      shellCommands,
      batchPolicy: { maxRows: resolvedMaxRows, maxBytes: resolvedMaxBytes },
      rowIds: context.rowIds,
      batches: batchDescriptors,
    };
    const writtenManifest = await writeManifest(path.join(paths.runRoot, "manifest.json"), manifest, {
      parentIdentity: paths.runIdentity,
      maxBytes: maxManifestBytes,
    });
    if (workspaceSchemaVersion === coverageWorkspaceSchemaVersion) {
      await writeJsonExclusive(
        path.join(paths.runRoot, "checkpoint.json"),
        createCheckpoint(runId, batchDescriptors),
        { parentIdentity: paths.runIdentity },
      );
    }
    return {
      schemaVersion: workspaceSchemaVersion,
      runId,
      manifestPath: path.join(paths.runRoot, "manifest.json"),
      manifestSha256: writtenManifest.sha256,
      ...(workspaceSchemaVersion === coverageWorkspaceSchemaVersion
        ? { summary: compactRunSummary(createCheckpoint(runId, batchDescriptors)) }
        : {}),
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

function requireCurrentRunOrigins(manifest) {
  try {
    requireLoopbackBaseUrl(manifest.baseUrls.production, "production");
    requireLoopbackBaseUrl(manifest.baseUrls.prototype, "prototype");
  } catch {
    ensure(false, "PARITY_CURRENT_STATE_DRIFT", "run uses retired ports; preserve its evidence and prepare a new run after explicit port migration");
  }
}

async function nextRunBatch({ repositoryRootPath, runId }) {
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readManifest(path.join(paths.runRoot, "manifest.json"), {
    limit: maxManifestBytes,
    parentIdentity: paths.runIdentity,
  });
  if (manifest.schemaVersion === 3) { const { nextModelBatch } = await import("./parity-model-workspace.mjs"); return nextModelBatch({ repositoryRootPath, runId }); }
  requireCurrentRunOrigins(manifest);
  ensure(manifest.schemaVersion === coverageWorkspaceSchemaVersion, "PARITY_BATCH_INVALID", "next-batch requires a coverage workspace");
  const checkpoint = await readCheckpoint(paths.runRoot, paths.runIdentity);
  const terminal = checkpoint.batches.find(({ status }) => status === "terminal");
  if (terminal) return { runId, status: "terminal", batch: null, summary: compactRunSummary(checkpoint) };
  const descriptorState = checkpoint.batches.find(({ status, attempts }) =>
    status === "pending" || status === "invalidated" || (status === "failed" && attempts < 2));
  if (!descriptorState) {
    const complete = checkpoint.batches.every(({ status }) => status === "passed");
    return {
      runId,
      status: complete ? "complete" : "blocked",
      batch: null,
      summary: compactRunSummary(checkpoint),
    };
  }
  descriptorState.status = "running";
  descriptorState.attempts += 1;
  descriptorState.errorCode = null;
  descriptorState.diagnostic = null;
  await writeJsonAtomic(path.join(paths.runRoot, "checkpoint.json"), checkpoint, {
    parentIdentity: paths.runIdentity,
  });
  const descriptor = manifest.batches.find(({ batchId }) => batchId === descriptorState.batchId);
  return {
    runId,
    status: "ready",
    batch: {
      batchId: descriptor.batchId,
      path: path.join(paths.runRoot, descriptor.fileName),
      sha256: descriptor.sha256,
      bytes: descriptor.bytes,
      rowIds: descriptor.rowIds,
      attempt: descriptorState.attempts,
    },
    summary: compactRunSummary(checkpoint),
  };
}

// Execute the immutable workspace batch through the common Browser runner.
// Only compact summaries cross the caller boundary; raw artifacts stay in the sink.
async function executeBrowserBatch({ repositoryRootPath, runId, runner, tabs }) {
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readManifest(path.join(paths.runRoot, "manifest.json"), {
    limit: maxManifestBytes, parentIdentity: paths.runIdentity,
  });
  if (manifest.schemaVersion === 3) { const { executeModelBatch } = await import("./parity-model-workspace.mjs"); return executeModelBatch({ repositoryRootPath, runId, runner, tabs }); }
  const next = await nextRunBatch({ repositoryRootPath, runId });
  if (!next.batch) return next;
  const descriptor = manifest.batches.find(({ batchId }) => batchId === next.batch.batchId);
  const batchFile = await readJsonFile(next.batch.path, {
    limit: maxManifestBytes, parentIdentity: paths.runIdentity,
  });
  ensure(batchFile.sha256 === descriptor.sha256 && batchFile.bytes === descriptor.bytes,
    "PARITY_BATCH_INVALID", "execution batch integrity changed");
  const { batchId, rowIds, rows } = batchFile.value;
  const isFirst = batchId === manifest.batches[0].batchId;
  const isLast = batchId === manifest.batches.at(-1).batchId;
  const operationsBefore = runner.operations ?? 0;
  try {
    const result = await runner.runWithoutCleanup({
      definition: manifest.definition, phase: manifest.phase, matrixScope: manifest.matrixScope,
      executionContext: manifest.executionContext, tabs, baseUrls: manifest.baseUrls,
      batch: { batchId, rowIds, rows },
      run: { runId, goalSha256: manifest.goalSha256, runtime: manifest.runtime,
        sources: manifest.sources, shellCommands: manifest.shellCommands },
    });
    const terminalCleanup = isLast ? await runner.adapter.cleanup() : null;
    const fragment = {
      schemaVersion: manifest.schemaVersion, runId, batchId, batchSha256: descriptor.sha256,
      rowIds, rows: result.rows, capabilities: isFirst ? result.capabilities : null,
      metrics: { ...result.metrics, browserOperations: result.metrics.browserOperations - operationsBefore }, terminalCleanup,
    };
    return await recordBatchResult({ repositoryRootPath, runId, batchId, input: JSON.stringify(fragment) });
  } catch (error) {
    let cleanup;
    try { cleanup = await runner.adapter.cleanup(); }
    catch (cleanupError) {
      cleanup = cleanupError instanceof ParityRunError && cleanupError.evidence
        ? cleanupError.evidence : { status: "fail" };
    }
    const access = ["documentation", "permission"].includes(classifyBrowserError(error).category);
    const code = access ? error.code : cleanup.status === "pass"
      ? (error instanceof ParityRunError ? error.code : "PARITY_UNEXPECTED_ERROR")
      : "PARITY_CLEANUP_FAILED";
    const failedProbes = (error?.evidence?.rows ?? []).flatMap((row) =>
      (row.probes ?? []).filter(({ status }) => status === "fail").map(({ probeId }) => `${row.rowId}:${probeId}`));
    const diagnostic = failedProbes.length ? failedProbes.join(", ").slice(0, 1000)
      : (error instanceof ParityRunError ? error.message.slice(0, 1000) : "Browser batch execution failed");
    const detail = JSON.parse(JSON.stringify({ code, diagnostic, cleanup, evidence: error instanceof ParityRunError ? error.evidence ?? null : null }));
    assertSecretFree(detail);
    await writeJsonExclusive(path.join(paths.runRoot, `failure-${batchId}-${Date.now()}.json`), detail, {
      parentIdentity: paths.runIdentity,
    });
    return recordBatchFailure({ repositoryRootPath, runId, batchId, code, diagnostic, transient: false });
  }
}

async function resumeRunWorkspace({ repositoryRootPath, runId }) {
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readManifest(path.join(paths.runRoot, "manifest.json"), { limit: maxManifestBytes, parentIdentity: paths.runIdentity });
  if (manifest.schemaVersion === 3) { const { resumeModelWorkspace } = await import("./parity-model-workspace.mjs"); return resumeModelWorkspace({ repositoryRootPath, runId }); }
  requireCurrentRunOrigins(manifest);
  const checkpoint = await readCheckpoint(paths.runRoot, paths.runIdentity);
  checkpoint.resumed = true;
  for (const batch of checkpoint.batches) {
    if (batch.status === "running") {
      batch.status = batch.attempts < 2 ? "failed" : "terminal";
      batch.errorCode = "PARITY_RUN_INTERRUPTED";
      batch.diagnostic = "batch execution was interrupted before a result was recorded";
    }
  }
  await writeJsonAtomic(path.join(paths.runRoot, "checkpoint.json"), checkpoint, {
    parentIdentity: paths.runIdentity,
  });
  return nextRunBatch({ repositoryRootPath, runId });
}

// Recovery is deliberately an in-process API: a CLI boolean or a serialized
// receipt cannot authorize a Browser. Revalidate the current runtime and run
// the common canary before changing exactly one failed checkpoint entry.
async function recoverDocumentationFailure({ repositoryRootPath, runId, batchId, browser, runner, tabId, legacyDiagnosticFile }) {
  validateIdentifier(batchId, "batchId");
  const documentation = requireBrowserDocumentation(browser);
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readManifest(path.join(paths.runRoot, "manifest.json"), {
    limit: maxManifestBytes, parentIdentity: paths.runIdentity,
  });
  requireCurrentRunOrigins(manifest);
  const checkpoint = await readCheckpoint(paths.runRoot, paths.runIdentity);
  const batch = checkpoint.batches.find((item) => item.batchId === batchId);
  let legacyProof;
  if (legacyDiagnosticFile !== undefined) {
    ensure(typeof legacyDiagnosticFile === "string" &&
      legacyDiagnosticFile.startsWith(`failure-${batchId}-`) &&
      /^[0-9]+\.json$/u.test(legacyDiagnosticFile.slice(`failure-${batchId}-`.length)),
      "PARITY_BATCH_INVALID", "legacy recovery requires a workspace failure record");
    const record = await readJsonFile(path.join(paths.runRoot, legacyDiagnosticFile), {
      limit: maxDiagnosticBytes, parentIdentity: paths.runIdentity,
    });
    const diagnosis = classifyBrowserError({ code: record.value.evidence?.causeCode, message: record.value.diagnostic });
    ensure(["PARITY_DPR_OVERRIDE_UNAVAILABLE", "PARITY_CDP_CAPABILITY_UNAVAILABLE"].includes(batch?.errorCode) &&
      record.value.code === batch.errorCode && diagnosis.category === "documentation",
      "PARITY_BATCH_INVALID", "legacy failure does not prove an unread documentation cause");
    legacyProof = { file: legacyDiagnosticFile, sha256: record.sha256, priorCode: batch.errorCode };
  }
  ensure(batch?.status === "terminal" && (batch.errorCode === "BROWSER_DOCUMENTATION_REQUIRED" || legacyProof),
    "PARITY_BATCH_INVALID", "only a proven documentation failure can be recovered");
  ensure(!batch.documentationRecovery, "PARITY_BATCH_INVALID", "documentation recovery already attempted");
  ensure(runner instanceof BrowserParityRunner && runner.adapter?.sessionId === documentation.sessionId,
    "PARITY_BATCH_INVALID", "recovery requires the current common runner session");
  requireBrowserAdapterRuntime(runner.adapter, browser);
  runner.canary = undefined;
  const canary = await runner.capabilityCanary({ tabId, viewport: { width: 390, height: 844 },
    dpr: manifest.schemaVersion === 3 ? 1 : manifest.definition.contract.comparisonConditions.dpr, requiresNetwork: true,
    url: manifest.baseUrls.production });
  requireBrowserDocumentation(browser);
  ensure(canary?.status === "pass" && canary.sessionId === documentation.sessionId,
    "PARITY_BATCH_INVALID", "recovery canary did not pass in the current session");
  const current = await readCheckpoint(paths.runRoot, paths.runIdentity);
  ensure(stableStringify(current) === stableStringify(checkpoint), "PARITY_CURRENT_STATE_DRIFT", "checkpoint changed during recovery");
  batch.documentationRecovery = { sessionId: documentation.sessionId, generation: documentation.generation,
    documents: documentation.documents, priorAttempts: batch.attempts, canary, ...(legacyProof ? { legacyProof } : {}) };
  batch.status = "pending";
  batch.errorCode = null;
  batch.diagnostic = null;
  await writeJsonAtomic(path.join(paths.runRoot, "checkpoint.json"), checkpoint, { parentIdentity: paths.runIdentity });
  return { runId, batchId, status: "recovered", summary: compactRunSummary(checkpoint) };
}

async function recordBatchFailure({
  repositoryRootPath,
  runId,
  batchId,
  code,
  diagnostic: ignoredDiagnostic,
  transient,
}) {
  validateIdentifier(batchId, "batchId");
  ensure(failureDiagnostics.has(code), "PARITY_BATCH_INVALID", "failure code is not allowlisted");
  ensure(typeof transient === "boolean", "PARITY_BATCH_INVALID", "failure transient flag is invalid");
  void ignoredDiagnostic;
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const checkpoint = await readCheckpoint(paths.runRoot, paths.runIdentity);
  const batch = checkpoint.batches.find((item) => item.batchId === batchId);
  ensure(batch?.status === "running", "PARITY_BATCH_INVALID", "failure batch is not running");
  batch.errorCode = code;
  batch.diagnostic = failureDiagnostics.get(code);
  if (transient && batch.attempts < 2) batch.status = "failed";
  else batch.status = "terminal";
  await writeJsonAtomic(path.join(paths.runRoot, "checkpoint.json"), checkpoint, {
    parentIdentity: paths.runIdentity,
  });
  return {
    runId,
    batchId,
    status: batch.status,
    retryable: batch.status === "failed",
    summary: compactRunSummary(checkpoint),
  };
}

async function invalidateRunWorkspace({
  repositoryRootPath,
  runId,
  scope,
  targetIds = [],
  source,
  currentSources,
}) {
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readManifest(path.join(paths.runRoot, "manifest.json"), {
    limit: maxManifestBytes,
    parentIdentity: paths.runIdentity,
  });
  if (manifest.schemaVersion === 3) { const { invalidateModelWorkspace } = await import("./parity-model-workspace.mjs"); return invalidateModelWorkspace({ repositoryRootPath, runId, changedSources: source ? [source] : [] }); }
  ensure(manifest.schemaVersion === coverageWorkspaceSchemaVersion, "PARITY_BATCH_INVALID", "invalidate-run requires a coverage workspace");
  const resolution = resolveInvalidationTargets({
    spec: manifest.definition.spec,
    contract: manifest.definition.contract,
    scope,
    targetIds,
    source,
  });
  const affectedTargets = new Set(resolution.targetIds);
  if (currentSources !== undefined) {
    ensure(Array.isArray(currentSources) && currentSources.length === manifest.sources.length &&
      new Set(currentSources.map((entry) => entry.path)).size === manifest.sources.length,
    "PARITY_CURRENT_STATE_DRIFT", "invalidation source inventory changed");
    for (const previous of manifest.sources) {
      const current = currentSources.find((entry) => entry.path === previous.path);
      ensure(current && /^sha256:[a-f0-9]{64}$/u.test(current.sha256),
        "PARITY_CURRENT_STATE_DRIFT", "invalidation source inventory changed");
      if (current.sha256 === previous.sha256) continue;
      const impact = resolveInvalidationTargets({ spec: manifest.definition.spec,
        contract: manifest.definition.contract, scope: "shared", source: previous.path });
      ensure(impact.targetIds.every((targetId) => affectedTargets.has(targetId)),
        "PARITY_CURRENT_STATE_DRIFT", "changed source affects a target outside invalidation");
    }
  }
  const rowsById = new Map(manifest.definition.contract.parityMatrix.map((row) => [row.id, row]));
  const checkpoint = await readCheckpoint(paths.runRoot, paths.runIdentity);
  const invalidatedBatchIds = [];
  for (const batch of checkpoint.batches) {
    const batchTargets = new Set(batch.rowIds.map((rowId) => rowsById.get(rowId)?.targetId));
    const affected = [...batchTargets].some((targetId) => affectedTargets.has(targetId));
    if (!affected) continue;
    ensure(
      [...batchTargets].every((targetId) => affectedTargets.has(targetId)),
      "PARITY_BATCH_INVALID",
      "coverage batches must preserve target boundaries before invalidation",
    );
    await assertWorkspaceIdentities(paths);
    await rm(path.join(paths.runRoot, `fragment-${batch.batchId}.json`), { force: true });
    batch.status = "invalidated";
    batch.attempts = 0;
    batch.errorCode = null;
    batch.diagnostic = null;
    batch.fragmentSha256 = null;
    invalidatedBatchIds.push(batch.batchId);
  }
  const invalidatedRows = new Set(checkpoint.batches
    .filter(({ batchId }) => invalidatedBatchIds.includes(batchId)).flatMap(({ rowIds }) => rowIds));
  const artifactRoot = path.join(paths.runRoot, "artifacts");
  const invalidatedArtifacts = checkpoint.artifactIndex.filter(({ rowId }) => invalidatedRows.has(rowId));
  const artifactIdentity = invalidatedArtifacts.length ? await captureDirectoryIdentity(artifactRoot) : undefined;
  for (const artifact of invalidatedArtifacts) {
    const target = path.resolve(paths.repositoryRoot, artifact.path);
    ensure(path.dirname(target) === artifactRoot, "PARITY_BATCH_INVALID", "invalidated artifact escaped its root");
    await assertWorkspaceIdentities(paths);
    const bytes = await readStableFile(target, { limit: artifact.bytes, parentIdentity: artifactIdentity });
    ensure(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256,
      "PARITY_BATCH_INVALID", "invalidated artifact digest changed");
    await rm(target);
  }
  checkpoint.artifactIndex = checkpoint.artifactIndex.filter(({ rowId }) => !invalidatedRows.has(rowId));
  checkpoint.invalidations.push({
    at: new Date().toISOString(),
    scope,
    source: source ?? null,
    targetIds: resolution.targetIds,
    failClosed: resolution.failClosed,
    batchIds: invalidatedBatchIds,
  });
  await writeJsonAtomic(path.join(paths.runRoot, "checkpoint.json"), checkpoint, {
    parentIdentity: paths.runIdentity,
  });
  if (currentSources !== undefined) {
    manifest.sources = currentSources;
    await writeManifest(path.join(paths.runRoot, "manifest.json"), manifest, {
      atomic: true,
      parentIdentity: paths.runIdentity,
      maxBytes: maxManifestBytes,
    });
  }
  return {
    runId,
    status: "invalidated",
    targetIds: resolution.targetIds,
    failClosed: resolution.failClosed,
    batchIds: invalidatedBatchIds,
    summary: compactRunSummary(checkpoint),
  };
}

async function promoteArtifacts({
  paths,
  slug,
  runId,
  artifactIndex,
  rows,
  beforeArtifactAccess,
}) {
  if (artifactIndex.length === 0) return { artifactIndex, rows };
  await assertWorkspaceIdentities(paths);
  const runEvidenceRoot = path.join(paths.repositoryRoot, "plans", slug, "evidence", runId);
  const evidenceIdentity = await ensureRealDirectory(runEvidenceRoot, { mode: 0o700 });
  const canonicalRoot = path.join(runEvidenceRoot, "artifacts");
  const canonicalIdentity = await ensureRealDirectory(canonicalRoot, { create: true, mode: 0o700 });
  const sourceRoot = path.join(paths.runRoot, "artifacts");
  const sourceIdentity = await captureDirectoryIdentity(sourceRoot);
  if (beforeArtifactAccess !== undefined) await beforeArtifactAccess();
  const promoted = [];
  const pathMap = new Map();
  for (const artifact of artifactIndex) {
    ensure(
      Number.isSafeInteger(artifact.bytes) && artifact.bytes >= 0 && artifact.bytes <= maxArtifactBytes,
      "PARITY_BATCH_INVALID",
      "artifact byte length is invalid",
    );
    await assertWorkspaceIdentities(paths);
    await assertDirectoryIdentity(sourceIdentity);
    await assertDirectoryIdentity(evidenceIdentity);
    await assertDirectoryIdentity(canonicalIdentity);
    const source = path.join(paths.repositoryRoot, artifact.path);
    const resolved = await realpath(source);
    ensure(resolved.startsWith(`${sourceRoot}${path.sep}`), "PARITY_BATCH_INVALID", "artifact source escaped run workspace");
    const bytes = await readStableFile(resolved, {
      limit: artifact.bytes,
      parentIdentity: sourceIdentity,
    });
    ensure(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256, "PARITY_BATCH_INVALID", "artifact digest changed");
    const target = path.join(canonicalRoot, path.basename(resolved));
    ensure(path.dirname(target) === canonicalRoot, "PARITY_BATCH_INVALID", "canonical artifact escaped evidence root");
    await assertDirectoryIdentity(evidenceIdentity);
    await assertDirectoryIdentity(canonicalIdentity);
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    await assertDirectoryIdentity(evidenceIdentity);
    await assertDirectoryIdentity(canonicalIdentity);
    const canonicalPath = path.relative(paths.repositoryRoot, target).split(path.sep).join("/");
    pathMap.set(artifact.path, canonicalPath);
    promoted.push({ ...artifact, path: canonicalPath });
  }
  const rewrite = (artifact) => ({ ...artifact, path: pathMap.get(artifact.path) ?? artifact.path });
  const promotedRows = rows.map((row) => ({
    ...row,
    artifactPaths: row.artifactPaths.map((artifactPath) => pathMap.get(artifactPath) ?? artifactPath),
    ...(Array.isArray(row.artifacts) ? { artifacts: row.artifacts.map(rewrite) } : {}),
    probes: row.probes.map((probe) => ({
      ...probe,
      artifactPaths: probe.artifactPaths.map((artifactPath) => pathMap.get(artifactPath) ?? artifactPath),
      ...(Array.isArray(probe.artifacts) ? { artifacts: probe.artifacts.map(rewrite) } : {}),
    })),
  }));
  await assertWorkspaceIdentities(paths);
  await assertDirectoryIdentity(evidenceIdentity);
  await assertDirectoryIdentity(canonicalIdentity);
  return { artifactIndex: promoted, rows: promotedRows, evidenceIdentity, canonicalIdentity };
}

async function recordBatchResult({
  repositoryRootPath,
  runId,
  batchId,
  input,
}) {
  validateIdentifier(batchId, "batchId");
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readManifest(path.join(paths.runRoot, "manifest.json"), {
    limit: maxManifestBytes,
    parentIdentity: paths.runIdentity,
  });
  if (manifest.schemaVersion === 3) { const { recordModelBatch } = await import("./parity-model-workspace.mjs"); return recordModelBatch({ repositoryRootPath, runId, batchId, input }); }
  const workspaceSchemaVersion = manifest.schemaVersion;
  ensure(
    workspaceSchemaVersion === legacyWorkspaceSchemaVersion || workspaceSchemaVersion === coverageWorkspaceSchemaVersion,
    "PARITY_BATCH_INVALID",
    "run manifest schemaVersion is invalid",
  );
  const descriptorIndex = manifest.batches.findIndex((batch) => batch.batchId === batchId);
  ensure(descriptorIndex >= 0, "PARITY_BATCH_INVALID", `unknown batch: ${batchId}`);
  const descriptor = manifest.batches[descriptorIndex];
  let checkpoint;
  let checkpointBatch;
  if (workspaceSchemaVersion === coverageWorkspaceSchemaVersion) {
    checkpoint = await readCheckpoint(paths.runRoot, paths.runIdentity);
    checkpointBatch = checkpoint.batches.find((batch) => batch.batchId === batchId);
    ensure(checkpointBatch?.status === "running", "PARITY_BATCH_INVALID", "coverage batch must be running before record-batch");
  }
  let priorCapabilities;
  for (let index = 0; index < descriptorIndex; index += 1) {
    let prior;
    try {
      prior = await readJsonFile(path.join(paths.runRoot, `fragment-${manifest.batches[index].batchId}.json`), {
        limit: maxFragmentBytes,
        parentIdentity: paths.runIdentity,
      });
    } catch (error) {
      if (error?.code === "ENOENT") fail("PARITY_BATCH_INVALID", "batch results must be recorded in manifest order");
      throw error;
    }
    if (index === 0) priorCapabilities = prior.value.capabilities;
  }
  const batchFile = await readJsonFile(path.join(paths.runRoot, descriptor.fileName), {
    limit: descriptor.bytes,
    parentIdentity: paths.runIdentity,
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
  const written = await writeJsonExclusive(target, fragment, {
    parentIdentity: paths.runIdentity,
  });
  if (workspaceSchemaVersion === coverageWorkspaceSchemaVersion) {
    checkpointBatch.fragmentSha256 = written.sha256;
    const requiredFailure = fragment.rows.some(({ status }) => status === "fail");
    checkpointBatch.status = requiredFailure ? "terminal" : "passed";
    checkpointBatch.errorCode = requiredFailure ? "PARITY_REQUIRED_PROBE_FAILED" : null;
    checkpointBatch.diagnostic = requiredFailure ? "one or more required probes failed" : null;
    await writeJsonAtomic(path.join(paths.runRoot, "checkpoint.json"), checkpoint, {
      parentIdentity: paths.runIdentity,
    });
    return {
      runId,
      batchId,
      fragmentPath: target,
      status: checkpointBatch.status,
      summary: compactRunSummary(checkpoint),
    };
  }
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

async function recordRunAudit({ repositoryRootPath, runId, audit }) {
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readManifest(path.join(paths.runRoot, "manifest.json"), { limit: maxManifestBytes, parentIdentity: paths.runIdentity });
  if (manifest.schemaVersion === 3) { const { recordModelAudit } = await import("./parity-model-workspace.mjs"); return recordModelAudit({ repositoryRootPath, runId, audit }); }
  ensure(manifest.definition.spec.version === 4, "PARITY_BATCH_INVALID", "audit requires profile v4");
  const binding = Object.fromEntries(["goalSha256", "prototypeRevision", "validationProfileDigest", "sources"].map(key => [key, manifest[key]]));
  ensure(stableStringify(audit?.binding) === stableStringify(binding), "PARITY_CURRENT_STATE_DRIFT", "audit binding differs from run");
  assertSecretFree(audit);
  await writeJsonAtomic(path.join(paths.runRoot, "audit.json"), audit, { parentIdentity: paths.runIdentity });
  return { status: "recorded", runId, completionStatus: "pending-finalization" };
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
  beforeArtifactPromotion,
  removeWorkspace = (target) => rm(target, { recursive: true, force: false }),
}) {
  validateIdentifier(slug, "slug", slugPattern);
  const paths = await resolveWorkspacePaths(repositoryRootPath, runId);
  const { value: manifest } = await readManifest(path.join(paths.runRoot, "manifest.json"), {
    limit: maxManifestBytes,
    parentIdentity: paths.runIdentity,
  });
  if (manifest.schemaVersion === 3) { const { finalizeModelWorkspace } = await import("./parity-model-workspace.mjs"); return finalizeModelWorkspace({ repositoryRootPath, runId, slug }); }
  requireCurrentRunOrigins(manifest);
  const workspaceSchemaVersion = manifest.schemaVersion;
  ensure(
    workspaceSchemaVersion === legacyWorkspaceSchemaVersion || workspaceSchemaVersion === coverageWorkspaceSchemaVersion,
    "PARITY_BATCH_INVALID",
    "run manifest schemaVersion is invalid",
  );
  ensure(manifest.slug === slug && manifest.runId === runId, "PARITY_CURRENT_STATE_DRIFT", "run manifest identity mismatch");
  ensure(
    stableStringify(manifest.definition) === stableStringify(definition),
    "PARITY_CURRENT_STATE_DRIFT",
    "run manifest definition does not match the current contract/profile",
  );
  const fragments = [];
  let validatedCapabilities;
  const checkpoint = workspaceSchemaVersion === coverageWorkspaceSchemaVersion
    ? await readCheckpoint(paths.runRoot, paths.runIdentity)
    : undefined;
  if (checkpoint) {
    ensure(
      checkpoint.batches.every(({ status }) => status === "passed"),
      "PARITY_BATCH_INCOMPLETE",
      "coverage checkpoint must contain only passed batches before finalize",
    );
  }
  for (const [descriptorIndex, descriptor] of manifest.batches.entries()) {
    const batchFile = await readJsonFile(path.join(paths.runRoot, descriptor.fileName), {
      limit: descriptor.bytes,
      parentIdentity: paths.runIdentity,
    });
    ensure(
      batchFile.sha256 === descriptor.sha256 && batchFile.bytes === descriptor.bytes,
      "PARITY_BATCH_INVALID",
      `batch changed after prepare: ${descriptor.batchId}`,
    );
    let fragmentFile;
    try {
      fragmentFile = await readJsonFile(path.join(paths.runRoot, `fragment-${descriptor.batchId}.json`), {
        limit: maxFragmentBytes,
        parentIdentity: paths.runIdentity,
      });
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
    if (checkpoint) {
      const batchCheckpoint = checkpoint.batches.find(({ batchId }) => batchId === descriptor.batchId);
      ensure(
        batchCheckpoint?.fragmentSha256 === fragmentFile.sha256,
        "PARITY_BATCH_INVALID",
        `checkpoint fragment digest mismatch: ${descriptor.batchId}`,
      );
    }
    ensure(
      stableStringify(fragment.rowIds) === stableStringify(descriptor.rowIds),
      "PARITY_BATCH_INVALID",
      `fragment row ownership mismatch: ${descriptor.batchId}`,
    );
    validateFragmentContract(fragment, manifest, descriptorIndex, validatedCapabilities);
    if (fragment.capabilities !== null) validatedCapabilities = fragment.capabilities;
    fragments.push(fragment);
  }
  let rows = mergeBatchResults({
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
  let fidelityAudit;
  let fidelityStatus;
  let fidelityCoverage;
  if (definition.spec.version === 4) {
    const recorded = await readJsonFile(path.join(paths.runRoot, "audit.json"), { limit: maxFragmentBytes, parentIdentity: paths.runIdentity });
    fidelityAudit = recorded.value;
    const observed = { ...manifest, rows, artifactIndex: checkpoint.artifactIndex };
    fidelityCoverage = interactionCoverage(definition.contract, definition.spec, rows);
    ensure(fidelityCoverage.every(group => group.status === "pass"), "PARITY_BATCH_INCOMPLETE", "t-way coverage incomplete");
    fidelityStatus = validateFidelityAudit(fidelityAudit, observed, definition.spec);
  }
  let artifactIndex = [];
  let evidenceIdentity;
  let canonicalIdentity;
  if (checkpoint) {
    if (beforeArtifactPromotion !== undefined) {
      ensure(
        typeof beforeArtifactPromotion === "function",
        "PARITY_BATCH_INVALID",
        "beforeArtifactPromotion must be a function",
      );
    }
    const promoted = await promoteArtifacts({
      paths,
      slug,
      runId,
      artifactIndex: checkpoint.artifactIndex,
      rows,
      beforeArtifactAccess: beforeArtifactPromotion,
    });
    rows = promoted.rows;
    artifactIndex = promoted.artifactIndex;
    evidenceIdentity = promoted.evidenceIdentity;
    canonicalIdentity = promoted.canonicalIdentity;
  }
  const coverageMode = workspaceSchemaVersion === coverageWorkspaceSchemaVersion;
  const evidence = {
    schemaVersion: definition.spec.version === 4 ? 5 : coverageMode ? 4 : 3,
    ...(definition.spec.version === 4 ? { audit: fidelityAudit, auditStatus: fidelityStatus, interactionCoverage: fidelityCoverage } : {}),
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
    ...(coverageMode
      ? {
          coverage: createCoverageReport(
            manifest.definition.contract,
            rows.map(({ rowId }) => manifest.definition.contract.parityMatrix.find(({ id }) => id === rowId)),
          ),
          riskRows: manifest.definition.spec.coverage.riskRows.map((risk) => ({
            id: risk.id,
            rowId: manifest.selection.riskRowIds.find(({ id }) => id === risk.id)?.rowId,
            requiredProbeIds: risk.requiredProbeIds,
            status: "pass",
          })),
          anchorRows: manifest.selection.anchorRowIds.map((anchor) => ({ ...anchor, status: "pass" })),
          checkpoints: {
            resumed: checkpoint.resumed,
            batches: checkpoint.batches,
            invalidations: checkpoint.invalidations,
          },
          artifactIndex,
          cleanup: cleanupFragments[0].terminalCleanup,
          automationCoverageStatus: "pass",
          humanVisualApprovalStatus: "pending",
          fullParityStatus: manifest.matrixScope === "full" ? "pass" : "not-run",
        }
      : {}),
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
  if (evidenceIdentity) await assertDirectoryIdentity(evidenceIdentity);
  if (canonicalIdentity) await assertDirectoryIdentity(canonicalIdentity);
  await assertWorkspaceIdentities(paths);
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
    if (evidenceIdentity) await assertDirectoryIdentity(evidenceIdentity);
    if (canonicalIdentity) await assertDirectoryIdentity(canonicalIdentity);
    evidencePath = await writeEvidence({
      repositoryRootPath: paths.repositoryRoot,
      slug,
      runId,
      name: "implementation-parity.json",
      evidence,
    });
    if (evidenceIdentity) await assertDirectoryIdentity(evidenceIdentity);
    if (canonicalIdentity) await assertDirectoryIdentity(canonicalIdentity);
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
  compactRunSummary,
  createWorkspaceArtifactSink,
  finalizeRunWorkspace,
  recordRunAudit,
  executeBrowserBatch,
  invalidateRunWorkspace,
  nextRunBatch,
  prepareRunWorkspace,
  readJsonFile,
  recordBatchFailure,
  recoverDocumentationFailure,
  recordBatchResult,
  resumeRunWorkspace,
  sha256,
};


// Private-file primitives shared by the model workspace. Schema and closure
// checks remain in the public lifecycle entrypoints, not in callers.
export const modelWorkspaceStorage = Object.freeze({
  resolveWorkspacePaths, readManifest, writeManifest, readCheckpoint,
  readJsonFile, readStableFile, writeJsonExclusive, writeJsonAtomic,
  ensureRealDirectory, assertDirectoryIdentity, assertWorkspaceIdentities,
  validateIdentifier, assertSecretFree, canonicalSha256,
  maxManifestBytes, maxFragmentBytes, maxCheckpointBytes, maxArtifactBytes,
});
