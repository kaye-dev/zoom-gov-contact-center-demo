#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const STATE_CHANGED = "VALIDATION_DIGEST_STATE_CHANGED";
const LIMIT_EXCEEDED = "VALIDATION_DIGEST_LIMIT_EXCEEDED";
const FILE_HASH_CHUNK_BYTES = 64 * 1024;
const DEFAULT_SNAPSHOT_LIMITS = Object.freeze({
  maxFiles: 4_096,
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
});

function fail(message) {
  throw new Error(message);
}

function failStateChanged() {
  const error = new Error(STATE_CHANGED);
  error.code = STATE_CHANGED;
  throw error;
}

function failLimitExceeded() {
  const error = new Error(LIMIT_EXCEEDED);
  error.code = LIMIT_EXCEEDED;
  throw error;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalScope(value) {
  if (
    typeof value !== "string" || value === "" || value.includes("\\") ||
    path.posix.isAbsolute(value) || path.posix.normalize(value) !== value ||
    value.split("/").some((part) => part === "." || part === "..")
  ) fail("scope must be a canonical repository-relative path");
  return value;
}

function parseArguments(argv) {
  const scopes = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--scope" || !argv[index + 1]) fail("usage: validation-digest.mjs --scope <path> [--scope <path>]");
    scopes.push(canonicalScope(argv[index + 1]));
    index += 1;
  }
  if (scopes.length === 0 || new Set(scopes).size !== scopes.length) fail("at least one unique scope is required");
  return scopes.sort();
}

async function git(repositoryRoot, args, encoding = "buffer") {
  const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...args], {
    encoding,
    maxBuffer: 128 * 1024 * 1024,
  });
  return stdout;
}

function nulPaths(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function metadataFingerprint(metadata) {
  return JSON.stringify({
    dev: metadata.dev.toString(),
    ino: metadata.ino.toString(),
    mode: metadata.mode.toString(),
    nlink: metadata.nlink.toString(),
    size: metadata.size.toString(),
    mtimeNs: metadata.mtimeNs.toString(),
    ctimeNs: metadata.ctimeNs.toString(),
  });
}

async function bigintLstat(absolute) {
  return lstat(absolute, { bigint: true });
}

function resolveSnapshotLimits(overrides = {}) {
  const limits = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_SNAPSHOT_LIMITS)) {
    const value = overrides[key] ?? defaultValue;
    if (!Number.isSafeInteger(value) || value <= 0 || value > defaultValue) fail("invalid validation digest test limit");
    limits[key] = value;
  }
  return limits;
}

function consumeSnapshotBytes(budget, bytes) {
  if (bytes > budget.limits.maxFileBytes || budget.totalBytes + bytes > budget.limits.maxTotalBytes) {
    failLimitExceeded();
  }
  budget.totalBytes += bytes;
}

async function hashFileContents(handle, budget) {
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(FILE_HASH_CHUNK_BYTES);
  let bytes = 0;
  while (true) {
    const fileRemaining = budget.limits.maxFileBytes - bytes;
    const totalRemaining = budget.limits.maxTotalBytes - budget.totalBytes - bytes;
    const readLength = Math.min(chunk.length, Math.max(1, Math.min(fileRemaining, totalRemaining)));
    const { bytesRead } = await handle.read(chunk, 0, readLength, bytes);
    if (bytesRead === 0) break;
    bytes += bytesRead;
    if (bytes > budget.limits.maxFileBytes || budget.totalBytes + bytes > budget.limits.maxTotalBytes) {
      failLimitExceeded();
    }
    hash.update(chunk.subarray(0, bytesRead));
  }
  budget.totalBytes += bytes;
  return { bytes, sha256: `sha256:${hash.digest("hex")}` };
}

async function pathSnapshot(repositoryRoot, relativePath, { afterContentRead, budget } = {}) {
  const absolute = path.join(repositoryRoot, relativePath);
  let metadata;
  try {
    metadata = await bigintLstat(absolute);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      try {
        await bigintLstat(absolute);
      } catch (secondError) {
        if (secondError && typeof secondError === "object" && secondError.code === "ENOENT") {
          return {
            snapshot: { path: relativePath, type: "deleted" },
            stability: { path: relativePath, type: "deleted" },
          };
        }
        throw secondError;
      }
      failStateChanged();
    }
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    const target = await readlink(absolute);
    consumeSnapshotBytes(budget, Buffer.byteLength(target, "utf8"));
    await afterContentRead?.({ path: relativePath, type: "symlink" });
    let afterMetadata;
    let afterTarget;
    try {
      [afterMetadata, afterTarget] = await Promise.all([
        bigintLstat(absolute),
        readlink(absolute),
      ]);
    } catch (error) {
      if (error && typeof error === "object" && (error.code === "ENOENT" || error.code === "EINVAL")) failStateChanged();
      throw error;
    }
    if (
      !afterMetadata.isSymbolicLink() ||
      metadataFingerprint(metadata) !== metadataFingerprint(afterMetadata) ||
      target !== afterTarget
    ) failStateChanged();
    return {
      snapshot: { path: relativePath, type: "symlink", mode: "120000", sha256: sha256(target) },
      stability: {
        path: relativePath,
        type: "symlink",
        metadata: metadataFingerprint(afterMetadata),
        target,
      },
    };
  }
  if (!metadata.isFile()) fail(`changed path must resolve to a file, symlink, or deletion: ${relativePath}`);
  if (
    metadata.size > BigInt(budget.limits.maxFileBytes) ||
    BigInt(budget.totalBytes) + metadata.size > BigInt(budget.limits.maxTotalBytes)
  ) failLimitExceeded();
  let handle;
  try {
    handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error && typeof error === "object" && (error.code === "ENOENT" || error.code === "ELOOP")) failStateChanged();
    throw error;
  }
  try {
    const beforeMetadata = await handle.stat({ bigint: true });
    if (
      !beforeMetadata.isFile() ||
      metadataFingerprint(metadata) !== metadataFingerprint(beforeMetadata)
    ) failStateChanged();
    const content = await hashFileContents(handle, budget);
    await afterContentRead?.({ path: relativePath, type: "file" });
    const afterMetadata = await handle.stat({ bigint: true });
    let afterPathMetadata;
    try {
      afterPathMetadata = await bigintLstat(absolute);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") failStateChanged();
      throw error;
    }
    if (
      !afterMetadata.isFile() || !afterPathMetadata.isFile() ||
      afterMetadata.size !== BigInt(content.bytes) ||
      metadataFingerprint(beforeMetadata) !== metadataFingerprint(afterMetadata) ||
      metadataFingerprint(afterMetadata) !== metadataFingerprint(afterPathMetadata)
    ) failStateChanged();
    return {
      snapshot: {
        path: relativePath,
        type: "file",
        mode: (afterMetadata.mode & 0o111n) === 0n ? "100644" : "100755",
        sha256: content.sha256,
      },
      stability: {
        path: relativePath,
        type: "file",
        metadata: metadataFingerprint(afterPathMetadata),
      },
    };
  } finally {
    await handle.close();
  }
}

async function revalidatePathSnapshot(repositoryRoot, stability) {
  const absolute = path.join(repositoryRoot, stability.path);
  let metadata;
  try {
    metadata = await bigintLstat(absolute);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT" && stability.type === "deleted") return;
    if (error && typeof error === "object" && error.code === "ENOENT") failStateChanged();
    throw error;
  }
  if (stability.type === "deleted") failStateChanged();
  if (metadataFingerprint(metadata) !== stability.metadata) failStateChanged();
  if (stability.type === "file") {
    if (!metadata.isFile()) failStateChanged();
    return;
  }
  if (!metadata.isSymbolicLink()) failStateChanged();
  let target;
  try {
    target = await readlink(absolute);
  } catch (error) {
    if (error && typeof error === "object" && (error.code === "ENOENT" || error.code === "EINVAL")) failStateChanged();
    throw error;
  }
  if (target !== stability.target) failStateChanged();
}

async function readGitState(repositoryRoot, pathspec) {
  const [head, stagedPatch, unstagedPatch, stagedNames, unstagedNames, untrackedNames] = await Promise.all([
    git(repositoryRoot, ["rev-parse", "HEAD"], "utf8"),
    git(repositoryRoot, ["diff", "--cached", "--binary", "--no-ext-diff", ...pathspec]),
    git(repositoryRoot, ["diff", "--binary", "--no-ext-diff", ...pathspec]),
    git(repositoryRoot, ["diff", "--cached", "--name-only", "-z", ...pathspec]),
    git(repositoryRoot, ["diff", "--name-only", "-z", ...pathspec]),
    git(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z", ...pathspec]),
  ]);
  const changedPaths = [...new Set([
    ...nulPaths(stagedNames),
    ...nulPaths(unstagedNames),
    ...nulPaths(untrackedNames),
  ])].sort();
  const stagedPathSet = new Set(nulPaths(stagedNames));
  const unstagedPathSet = new Set(nulPaths(unstagedNames));
  const mixedPaths = changedPaths.filter((changedPath) =>
    stagedPathSet.has(changedPath) && unstagedPathSet.has(changedPath));
  const mixedStagedPatch = mixedPaths.length === 0
    ? Buffer.alloc(0)
    : await git(repositoryRoot, ["diff", "--cached", "--binary", "--no-ext-diff", "--", ...mixedPaths]);
  const normalizedHead = head.trim();
  const stateDigest = sha256(JSON.stringify({
    head: normalizedHead,
    stagedPatchDigest: sha256(stagedPatch),
    unstagedPatchDigest: sha256(unstagedPatch),
    stagedNamesDigest: sha256(stagedNames),
    unstagedNamesDigest: sha256(unstagedNames),
    untrackedNamesDigest: sha256(untrackedNames),
    mixedStagedPatchDigest: sha256(mixedStagedPatch),
  }));
  return {
    normalizedHead,
    stagedPatch,
    unstagedPatch,
    untrackedNames,
    changedPaths,
    mixedPaths,
    mixedStagedPatch,
    stateDigest,
  };
}

async function createValidationDigest({ repository = ".", scopes, testHooks = {} }) {
  const rootOutput = await git(path.resolve(repository), ["rev-parse", "--show-toplevel"], "utf8");
  const repositoryRoot = await realpath(rootOutput.trim());
  const normalizedScopes = scopes.map(canonicalScope).sort();
  if (normalizedScopes.length === 0 || new Set(normalizedScopes).size !== normalizedScopes.length) fail("at least one unique scope is required");
  const pathspec = ["--", ...normalizedScopes];
  const beforeState = await readGitState(repositoryRoot, pathspec);
  const snapshotLimits = resolveSnapshotLimits(testHooks.snapshotLimits);
  if (beforeState.changedPaths.length > snapshotLimits.maxFiles) failLimitExceeded();
  const snapshotBudget = { limits: snapshotLimits, totalBytes: 0 };
  await testHooks.afterInitialGitState?.({ repositoryRoot });
  const snapshotResults = [];
  for (const changedPath of beforeState.changedPaths) {
    snapshotResults.push(await pathSnapshot(repositoryRoot, changedPath, {
      afterContentRead: (event) => testHooks.afterPathContentRead?.(event),
      budget: snapshotBudget,
    }));
  }
  await testHooks.afterPathSnapshots?.({ repositoryRoot });
  const afterState = await readGitState(repositoryRoot, pathspec);
  for (const { stability } of snapshotResults) await revalidatePathSnapshot(repositoryRoot, stability);
  await testHooks.afterFirstPathRevalidation?.({ repositoryRoot });
  for (const { stability } of snapshotResults) await revalidatePathSnapshot(repositoryRoot, stability);
  const finalState = await readGitState(repositoryRoot, pathspec);
  if (
    beforeState.stateDigest !== afterState.stateDigest ||
    afterState.stateDigest !== finalState.stateDigest
  ) failStateChanged();
  const snapshots = snapshotResults.map(({ snapshot }) => snapshot);
  const untracked = new Set(nulPaths(finalState.untrackedNames));
  const untrackedSnapshots = snapshots.filter(({ path: changedPath }) => untracked.has(changedPath));
  const scopeDigest = sha256(JSON.stringify(normalizedScopes));
  const mixedStagedPatchDigest = sha256(finalState.mixedStagedPatch);
  const contentSnapshotDigest = sha256(JSON.stringify({
    head: finalState.normalizedHead,
    scopes: normalizedScopes,
    snapshots,
    mixedPaths: finalState.mixedPaths,
    mixedStagedPatchDigest,
  }));
  return {
    schemaVersion: 2,
    head: finalState.normalizedHead,
    scopes: normalizedScopes,
    changedPaths: finalState.changedPaths,
    mixedPaths: finalState.mixedPaths,
    scopeDigest,
    stagedPatchDigest: sha256(finalState.stagedPatch),
    unstagedPatchDigest: sha256(finalState.unstagedPatch),
    untrackedDigest: sha256(JSON.stringify(untrackedSnapshots)),
    mixedStagedPatchDigest,
    validatedDiffDigest: contentSnapshotDigest,
  };
}

async function runCli({ argv = process.argv.slice(2), stdout = process.stdout } = {}) {
  const scopes = parseArguments(argv);
  const result = await createValidationDigest({ scopes });
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (await isMainModule()) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "validation digest failed"}\n`);
    process.exitCode = 1;
  });
}

export { canonicalScope, createValidationDigest, parseArguments, runCli };
