/** Read-only model loader. All paths remain inside the checkout; symlinks are rejected. */
import { lstat, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { estimateVerification } from "./parity-estimate.mjs";
import { VerificationModelError } from "./parity-verification-model.mjs";
export async function boundedModelRead(root, relative, json = true) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]/u).some((part) => !part || part === ".." || part === ".")) throw new VerificationModelError("PARITY_MODEL_INVALID", "Unsafe model path");
  let current = root;
  const parts = relative.split("/");
  const snapshots = [];
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = await lstat(current);
    snapshots.push({ path: current, dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs });
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) || (i === parts.length - 1 && stat.size > 16 * 1024 * 1024)) throw new VerificationModelError("PARITY_MODEL_INVALID", "Unsafe/oversized model input");
  }
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    const snapshot = snapshots.at(-1);
    if (!metadata.isFile() || metadata.ino !== snapshot.ino || metadata.dev !== snapshot.dev || metadata.size !== snapshot.size) throw new VerificationModelError("PARITY_MODEL_INVALID", "Model input changed during read");
    const data = await handle.readFile();
    for (const expected of snapshots) {
      const actual = await lstat(expected.path);
      if (actual.isSymbolicLink() || actual.ino !== expected.ino || actual.dev !== expected.dev || actual.size !== expected.size || actual.mtimeMs !== expected.mtimeMs) throw new VerificationModelError("PARITY_MODEL_INVALID", "Model input changed during read");
    }
    return json ? JSON.parse(data.toString("utf8")) : data;
  } finally { await handle.close(); }
}
export async function loadVerificationModel(target, repositoryRoot) {
  const root = await realpath(repositoryRoot);
  const contract = await boundedModelRead(root, `${target}/ui-contract.json`);
  const profile = await boundedModelRead(root, `${target}/parity-spec.json`);
  const requirements = await boundedModelRead(root, `${target}/${contract.requirementsBundle.path}`);
  const sourceDigests = {};
  const sourceIds = new Set(profile.sourceInventory.map(({ id }) => id));
  for (const source of profile.sourceInventory) {
    const data = await boundedModelRead(root, source.id, false);
    const digest = `sha256:${createHash("sha256").update(data).digest("hex")}`;
    sourceDigests[source.id] = digest;
    if (/\.[cm]?[jt]sx?$/u.test(source.id)) {
      const imports = [...data.toString("utf8").matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/gu)].map((match) => match[1]);
      for (const specifier of imports) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source.id), specifier));
        const candidates = [resolved, ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"].map((extension) => resolved + extension)];
        const dependency = candidates.find((candidate) => sourceIds.has(candidate));
        if (!dependency || !source.dependencies.includes(dependency)) throw new VerificationModelError("PARITY_REQUIREMENT_GAP", `Actual import is missing from dependency inventory: ${source.id}`);
      }
    }
  }
  const scriptRoot = await realpath(path.dirname(fileURLToPath(import.meta.url)));
  const engine = {};
  for (const file of ["parity-verification-model.mjs", "parity-estimate.mjs", "parity-runner-core.mjs", "parity-model-execution.mjs", "in-app-browser-parity-adapter.mjs", "browser-api-bootstrap.mjs", "browser-screenshot.mjs", "parity-model-files.mjs", "parity-runner.mjs", "parity-model-workspace.mjs", "parity-run-workspace.mjs"]) {
    const bytes = await boundedModelRead(scriptRoot, file, false);
    engine[file] = createHash("sha256").update(bytes).digest("hex");
  }
  const compilerDigest = `sha256:${createHash("sha256").update(JSON.stringify(engine)).digest("hex")}`;
  return { contract, profile, requirements, sourceDigests, compilerDigest };
}
export async function estimateFromFiles({ target, repositoryRoot, context = "plan", baselineReport, changedSources = [], legacyAnalysis = false }) {
  if (!["plan", "implement"].includes(context)) throw new VerificationModelError("PARITY_MODEL_INVALID", "Estimate context must be plan or implement");
  const root = await realpath(repositoryRoot);
  if (legacyAnalysis) {
    const contract = await boundedModelRead(root, `${target}/ui-contract.json`);
    const profile = await boundedModelRead(root, `${target}/parity-spec.json`);
    if (![1, 2].includes(contract.version) || ![1, 2, 3, 4].includes(profile.version)) throw new VerificationModelError("PARITY_MODEL_INVALID", "Legacy analysis requires legacy schema");
    const rows = contract.parityMatrix;
    if (!Array.isArray(rows)) throw new VerificationModelError("PARITY_MODEL_INVALID", "Legacy matrix missing");
    return { version: 1, mode: "legacy-analysis", contractVersion: contract.version, profileVersion: profile.version, candidateCount: String(rows.length), executionCount: null, applicability: "Legacy selection unchanged; candidates are not execution evidence", imageCandidates: rows.length * 2, safeMergedCount: null, writes: 0 };
  }
  const input = await loadVerificationModel(target, root);
  const baseline = baselineReport ? await boundedModelRead(root, baselineReport) : null;
  return estimateVerification(input, { context, baseline, changedSources });
}
