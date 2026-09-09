#!/usr/bin/env node
/** Local, content-bound stage commits. No remote, reset, amend, or hook bypass. */
import path from "node:path";
import { verifyGoalClarification } from "./goal-clarification.mjs";
import { lstat, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { canonicalScope } from "./validation-digest.mjs";
import { modelWorkspaceStorage as storage } from "../.agents/skills/plan/scripts/parity-run-workspace.mjs";
import { serialize } from "../.agents/skills/plan/scripts/parity-verification-model.mjs";
const execute = promisify(execFile);
const MAX_RECEIPT = 2 * 1024 * 1024;
const MAX_SOURCE = 64 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const jsonDigest = (value) => digest(serialize(value));
const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
export class CheckpointError extends Error {
  constructor(code, message) { super(message); this.name = "CheckpointError"; this.code = code; }
}
const ensure = (condition, message, code = "CHECKPOINT_INVALID") => { if (!condition) throw new CheckpointError(code, message); };
const list = (values) => Array.isArray(values) && values.length > 0 && new Set(values).size === values.length;
const protectedBranch = (branch) => ["main", "master", "develop"].includes(branch);
const systemRuntime = () => ({ node: process.versions.node, platform: process.platform, architecture: process.arch });
const generated = (file) => file.startsWith("plans/") && file !== "plans/template.md";
async function git(root, args) {
  const { stdout } = await execute("git", ["-C", root, ...args], { encoding: "buffer", maxBuffer: MAX_TOTAL });
  return stdout;
}
const gitText = async (root, args) => (await git(root, args)).toString("utf8").trim();
const pathsFrom = (bytes) => bytes.toString("utf8").split("\0").filter(Boolean).sort();
async function repositoryRoot(repository) {
  const root = await realpath(repository);
  ensure(await realpath(await gitText(root, ["rev-parse", "--show-toplevel"])) === root, "Use the exact checkout root");
  return root;
}
async function safePath(root, relative, { missing = false } = {}) {
  canonicalScope(relative);
  let cursor = root;
  const parts = relative.split("/");
  for (let index = 0; index < parts.length; index++) {
    cursor = path.join(cursor, parts[index]);
    try {
      const stat = await lstat(cursor);
      ensure(!stat.isSymbolicLink(), "Checkpoint paths must not traverse symlinks");
      ensure(index === parts.length - 1 || stat.isDirectory(), "Checkpoint parent is not a directory");
    } catch (error) {
      if (missing && error.code === "ENOENT") return cursor;
      throw error;
    }
  }
  return path.join(root, relative);
}
async function readSource(root, relative) {
  const absolute = await safePath(root, relative, { missing: true });
  let handle;
  try { handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
  catch (error) { if (error.code === "ENOENT") return { snapshot: { path: relative, type: "deleted" }, bytes: null }; throw error; }
  try {
    const before = await handle.stat({ bigint: true });
    ensure(before.isFile() && before.size <= MAX_SOURCE, "Source exceeds the bounded regular-file contract");
    const chunks = []; let count = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_SOURCE + 1 - count));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, count);
      if (!bytesRead) break;
      count += bytesRead; ensure(count <= MAX_SOURCE, "Source exceeds the bounded regular-file contract");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const bytes = Buffer.concat(chunks);
    await safePath(root, relative);
    const after = await handle.stat({ bigint: true });
    const named = await lstat(absolute, { bigint: true });
    const key = (stat) => [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
    ensure(key(before) === key(after) && key(after) === key(named) && bytes.length === Number(before.size), "Source changed during snapshot", "CHECKPOINT_CONTENT_CHANGED");
    return { snapshot: { path: relative, type: "file", mode: (before.mode & 0o111n) ? "100755" : "100644", sha256: digest(bytes) }, bytes };
  } finally { await handle.close(); }
}
export function parseImplementationUnits(goalText) {
  const matches = [...goalText.matchAll(/^```implementation-checkpoints\r?\n([\s\S]*?)^```\s*$/gmu)];
  ensure(matches.length === 1, "Goal requires exactly one implementation-checkpoints definition");
  let definition;
  try { definition = JSON.parse(matches[0][1]); } catch { throw new CheckpointError("CHECKPOINT_INVALID", "Invalid implementation-checkpoints JSON"); }
  ensure(definition.schemaVersion === 1 && definition.commitPolicy === "local-stage-commits", "Goal does not authorize local stage commits");
  ensure(Array.isArray(definition.units) && definition.units.length > 0 && definition.units.length <= 256, "Invalid implementation unit inventory");
  ensure(Array.isArray(definition.sourceInventory) && definition.sourceInventory.length <= 4096, "Invalid source inventory");
  const units = new Map(), sources = new Map();
  for (const source of definition.sourceInventory) {
    canonicalScope(source.path);
    ensure(!generated(source.path) && !sources.has(source.path) && Array.isArray(source.dependencies), "Invalid/duplicate source inventory entry");
    sources.set(source.path, source);
  }
  for (const source of sources.values()) for (const dependency of source.dependencies) ensure(sources.has(dependency), "Unregistered dependency source");
  for (const unit of definition.units) {
    ensure(identifier.test(unit.id) && !units.has(unit.id) && typeof unit.purpose === "string" && unit.purpose.trim(), "Invalid/duplicate unit ID or purpose");
    ensure(list(unit.requirementIds) && list(unit.scope) && list(unit.sourcePaths) && list(unit.acceptance) && Array.isArray(unit.dependsOn), "Unit requires requirements, scope, sources, acceptance and dependencies");
    for (const file of unit.scope) { canonicalScope(file); ensure(!generated(file), "Generated plans/evidence cannot be committed"); }
    for (const file of unit.sourcePaths) ensure(sources.has(file), "Unit depends on an unregistered source");
    ensure(Array.isArray(unit.checks) && unit.checks.length > 0 && new Set(unit.checks.map(({ id }) => id)).size === unit.checks.length, "Unit requires unique checks");
    for (const check of unit.checks) ensure(identifier.test(check.id) && Array.isArray(check.argv) && check.argv.length > 0 && check.argv.every((arg) => typeof arg === "string" && arg.length > 0 && !arg.includes("\0")), "Invalid check command");
    ensure(unit.browser === null || (unit.browser && list(unit.browser.unitIds) && list(unit.browser.caseIds)), "Browser scope must be explicit or null");
    units.set(unit.id, unit);
  }
  const active = new Set(), visited = new Set();
  const visit = (id) => {
    ensure(units.has(id) && !active.has(id), "Unknown/cyclic unit dependency");
    if (visited.has(id)) return;
    active.add(id); for (const other of units.get(id).dependsOn) visit(other); active.delete(id); visited.add(id);
  };
  for (const id of units.keys()) visit(id);
  return definition;
}
function dependencyPaths(definition, unit) {
  const inventory = new Map(definition.sourceInventory.map((source) => [source.path, source]));
  const visited = new Set();
  const visit = (id) => { if (visited.has(id)) return; visited.add(id); for (const other of inventory.get(id).dependencies) visit(other); };
  for (const file of unit.sourcePaths) visit(file);
  return [...visited].sort();
}
async function sourceSnapshots(root, definition, unit) {
  const snapshots = []; let total = 0;
  const inventory = new Map(definition.sourceInventory.map((source) => [source.path, source]));
  const closure = dependencyPaths(definition, unit);
  for (const manifest of ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]) {
    try { await lstat(path.join(root, manifest)); ensure(closure.includes(manifest), "Validation dependency inventory must include existing package manifests/lockfiles", "CHECKPOINT_DEPENDENCY_UNKNOWN"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const relative of closure) {
    const { snapshot, bytes } = await readSource(root, relative);
    total += bytes?.length ?? 0;
    ensure(total <= MAX_TOTAL, "Source snapshot exceeds total byte limit");
    if (bytes && /\.[cm]?[jt]sx?$/u.test(relative)) {
      for (const match of bytes.toString("utf8").matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/gu)) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
        const dependency = [resolved, ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"].map((suffix) => resolved + suffix)].find((file) => inventory.has(file));
        ensure(dependency && inventory.get(relative).dependencies.includes(dependency), "Actual import is absent from the dependency inventory", "CHECKPOINT_DEPENDENCY_UNKNOWN");
      }
    }
    snapshots.push(snapshot);
  }
  return snapshots;
}
async function verifierDigest() {
  const sourceRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const files = new Map();
  const visit = async (relative) => {
    if (files.has(relative)) return;
    const { snapshot, bytes } = await readSource(sourceRoot, relative);
    ensure(bytes, "Verifier dependency is missing"); files.set(relative, snapshot);
    for (const match of bytes.toString("utf8").matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/gu)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
      await visit(resolved);
    }
  };
  await visit("scripts/implementation-checkpoint.mjs");
  return jsonDigest([...files.values()].sort((a, b) => a.path.localeCompare(b.path)));
}
async function goalState(root, goalPath, unitId) {
  ensure(/^plans\/[a-z0-9][a-z0-9-]*\/goal\.md$/u.test(goalPath), "Goal must be plans/<slug>/goal.md");
  const { bytes } = await readSource(root, goalPath);
  ensure(bytes && bytes.length <= MAX_RECEIPT, "Missing/oversized goal");
  const definition = parseImplementationUnits(bytes.toString("utf8"));
  const unit = definition.units.find(({ id }) => id === unitId);
  ensure(unit, "Unknown implementation unit");
  const closure = dependencyPaths(definition, unit);
  return { definition, unit, goalBytes: bytes, goalDigest: digest(bytes), acceptanceDigest: jsonDigest({ unit, sources: definition.sourceInventory.filter(({ path }) => closure.includes(path)) }) };
}
const scoped = (file, scope) => scope.some((entry) => file === entry || file.startsWith(`${entry}/`));
async function changedPaths(root) {
  const values = await Promise.all([["diff", "HEAD", "--name-only", "-z"], ["ls-files", "--others", "--exclude-standard", "-z"]].map((args) => git(root, args)));
  return [...new Set(values.flatMap(pathsFrom))].sort();
}
async function receiptLocation(root, goalPath, receiptPath, create = false) {
  canonicalScope(receiptPath);
  const parent = path.posix.dirname(goalPath);
  ensure(receiptPath.startsWith(`${parent}/evidence/`) && receiptPath.endsWith(".json"), "Receipt must be owned by this goal's evidence directory");
  const segments = path.posix.dirname(receiptPath).split("/"); let current = root; let identity;
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]);
    identity = await storage.ensureRealDirectory(current, { create: create && index >= 2, ...(index >= 2 ? { mode: 0o700 } : {}) });
  }
  await safePath(root, receiptPath, { missing: create });
  return { target: path.join(root, receiptPath), identity };
}
async function readReceipt(root, goalPath, receiptPath) {
  const location = await receiptLocation(root, goalPath, receiptPath);
  const file = await storage.readJsonFile(location.target, { parentIdentity: location.identity, limit: MAX_RECEIPT });
  return { ...location, receipt: file.value, receiptDigest: file.sha256 };
}
async function readOptionalPrivate(target, identity) {
  try { return (await storage.readJsonFile(target, { parentIdentity: identity, limit: MAX_RECEIPT })).value; }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function validateReceiptShape(receipt, { root, goalPath, unitId, state }) {
  await verifyGoalClarification({ repositoryRoot: root, goalPath, originalDigest: receipt.goal?.digest, currentBytes: state.goalBytes, invocation: receipt.invocation, invariantBinding: { acceptanceDigest: state.acceptanceDigest } });
  ensure(receipt.schemaVersion === 1 && receipt.kind === "implementation-checkpoint" && receipt.unitId === unitId && receipt.status === "pass", "Receipt is not a passed implementation checkpoint");
  ensure(receipt.checkout === root && receipt.goal.path === goalPath, "Receipt belongs to another checkout/goal");
  ensure(receipt.acceptanceDigest === state.acceptanceDigest, "Goal or acceptance contract changed", "CHECKPOINT_APPROVAL_CHANGED");
  ensure(receipt.invocation?.basis === "explicit-$implement-invocation" && receipt.invocation.goalDigest === receipt.goal.digest, "Receipt lacks explicit invocation provenance");
  ensure(list(receipt.selectedPaths) && receipt.selectedPaths.every((file) => scoped(file, state.unit.scope) && !generated(file)), "Receipt has invalid commit paths");
  ensure(Array.isArray(receipt.checks) && receipt.checks.length === state.unit.checks.length, "Check inventory differs");
  for (const expected of state.unit.checks) {
    const observed = receipt.checks.filter(({ id }) => id === expected.id);
    ensure(observed.length === 1 && serialize(observed[0].argv) === serialize(expected.argv) && observed[0].exitCode === 0 && /^sha256:[a-f0-9]{64}$/u.test(observed[0].outputDigest), "Required check did not pass", "CHECKPOINT_CHECK_FAILED");
  }
  ensure(serialize(receipt.rowIds) === serialize(state.unit.browser?.caseIds ?? []) && receipt.runtime && typeof receipt.runtime === "object", "Row/runtime binding is missing");
}
async function validateBrowserReceipt(root, unit, receipt) {
  if (!unit.browser) { ensure(receipt.browser === null, "Unexpected Browser receipt"); return; }
  ensure(receipt.browser?.path && receipt.browser.sha256, "Missing stage Browser evidence", "CHECKPOINT_CHECK_FAILED");
  const absolute = await safePath(root, receipt.browser.path);
  const file = await storage.readJsonFile(absolute, { limit: MAX_RECEIPT });
  ensure(file.sha256 === receipt.browser.sha256 && file.value.kind === "checkpoint-verification", "Browser receipt must be current stage evidence");
  const { verifyModelStage } = await import("../.agents/skills/plan/scripts/parity-model-workspace.mjs");
  const verified = await verifyModelStage({ repositoryRootPath: root, slug: file.value.slug, runId: file.value.runId });
  ensure(serialize([...verified.unitIds].sort()) === serialize([...unit.browser.unitIds].sort()) && serialize([...verified.caseIds].sort()) === serialize([...unit.browser.caseIds].sort()), "Browser stage scope differs");
}
/** Creates an immutable receipt only after actually running the declared checks. */
export async function createImplementationReceipt({ repository = ".", goalPath, unitId, receiptPath, authorization, runtime = {}, browser = null, predecessors = [], commandRunner = execute }) {
  const root = await repositoryRoot(repository), state = await goalState(root, goalPath, unitId);
  ensure(authorization?.basis === "explicit-$implement-invocation" && authorization.goalDigest === state.goalDigest, "Explicit goal invocation is required");
  const branch = await gitText(root, ["symbolic-ref", "--short", "HEAD"]);
  ensure(!protectedBranch(branch), "Stage commits are not allowed on this branch", "CHECKPOINT_PROTECTED_BRANCH");
  const verifiedHead = await gitText(root, ["rev-parse", "HEAD"]);
  const selectedPaths = (await changedPaths(root)).filter((file) => scoped(file, state.unit.scope));
  ensure(selectedPaths.length > 0 && selectedPaths.every((file) => dependencyPaths(state.definition, state.unit).includes(file) && !generated(file)), "Changed scope has unregistered sources");
  const sourceBefore = await sourceSnapshots(root, state.definition, state.unit);
  for (const dependency of state.unit.dependsOn) {
    const previous = predecessors.find(({ unitId }) => unitId === dependency);
    ensure(previous, "Required predecessor receipt is missing");
    const verified = await verifyImplementationCheckpoint({ repository: root, goalPath, unitId: dependency, receiptPath: previous.receiptPath });
    ensure(verified.committedHead, "Predecessor is not committed");
  }
  const checks = [];
  for (const check of state.unit.checks) {
    let stdout = "", stderr = "", exitCode = 0;
    try { ({ stdout = "", stderr = "" } = await commandRunner(check.argv[0], check.argv.slice(1), { cwd: root, encoding: "buffer", maxBuffer: MAX_RECEIPT })); }
    catch (error) { exitCode = Number.isInteger(error.code) ? error.code : 1; stdout = error.stdout ?? ""; stderr = error.stderr ?? ""; }
    checks.push({ id: check.id, argv: check.argv, exitCode, outputDigest: digest(Buffer.concat([Buffer.from(stdout), Buffer.from(stderr)])) });
    ensure(exitCode === 0, `Required check failed: ${check.id}`, "CHECKPOINT_CHECK_FAILED");
  }
  const sources = await sourceSnapshots(root, state.definition, state.unit);
  ensure(serialize(sourceBefore) === serialize(sources) && verifiedHead === await gitText(root, ["rev-parse", "HEAD"]) && (await goalState(root, goalPath, unitId)).goalDigest === state.goalDigest, "Validation inputs changed while checks ran", "CHECKPOINT_CONTENT_CHANGED");
  ensure(serialize(selectedPaths) === serialize((await changedPaths(root)).filter((file) => scoped(file, state.unit.scope))), "Validation changed the selected path inventory", "CHECKPOINT_CONTENT_CHANGED");
  runtime = { system: systemRuntime(), declared: runtime };
  const receipt = { schemaVersion: 1, kind: "implementation-checkpoint", status: "pass", unitId, checkout: root, branch, verifiedHead, goal: { path: goalPath, digest: state.goalDigest }, acceptanceDigest: state.acceptanceDigest, invocation: authorization, selectedPaths, sources, verifierDigest: await verifierDigest(), checks, rowIds: state.unit.browser?.caseIds ?? [], runtime, runtimeDigest: jsonDigest(runtime), browser, predecessors, verifiedAt: new Date().toISOString() };
  await validateBrowserReceipt(root, state.unit, receipt);
  const location = await receiptLocation(root, goalPath, receiptPath, true);
  await storage.writeJsonExclusive(location.target, receipt, { parentIdentity: location.identity, maxBytes: MAX_RECEIPT });
  return receipt;
}
async function treeSnapshot(root, tree, file) {
  const records = pathsFrom(await git(root, ["ls-tree", "-z", tree, "--", file]));
  if (records.length === 0) return { path: file, type: "deleted" };
  ensure(records.length === 1, "Ambiguous tree source");
  const [metadata, actualPath] = records[0].split("\t");
  const [mode, type, objectId] = metadata.split(" ");
  ensure(actualPath === file && type === "blob" && ["100644", "100755"].includes(mode), "Tree source is not a regular file");
  return { path: file, type: "file", mode, sha256: digest(await git(root, ["cat-file", "blob", objectId])) };
}
async function validateCommitTree(root, head, receipt, parent) {
  const parents = (await gitText(root, ["show", "-s", "--format=%P", head])).split(" ");
  ensure(parents.length === 1 && parents[0] === parent, "Commit parent differs", "CHECKPOINT_COMMIT_MISMATCH");
  const changed = pathsFrom(await git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", head]));
  ensure(serialize(changed) === serialize([...receipt.selectedPaths].sort()), "Commit includes unexpected changes", "CHECKPOINT_COMMIT_MISMATCH");
  for (const snapshot of receipt.sources) ensure(serialize(await treeSnapshot(root, head, snapshot.path)) === serialize(snapshot), "Committed contents differ from validation", "CHECKPOINT_CONTENT_CHANGED");
}
export async function verifyImplementationCheckpoint({ repository = ".", goalPath, unitId, receiptPath, runtime }) {
  const root = await repositoryRoot(repository), state = await goalState(root, goalPath, unitId);
  const file = await readReceipt(root, goalPath, receiptPath), receipt = file.receipt;
  await validateReceiptShape(receipt, { root, goalPath, unitId, state });
  ensure(receipt.verifierDigest === await verifierDigest(), "Verifier dependencies changed", "CHECKPOINT_CONTENT_CHANGED");
  ensure(receipt.runtimeDigest === jsonDigest(receipt.runtime) && serialize(receipt.runtime.system) === serialize(systemRuntime()), "Runtime binding differs", "CHECKPOINT_CONTENT_CHANGED");
  if (runtime !== undefined) ensure(serialize(receipt.runtime.declared) === serialize(runtime), "Declared runtime conditions changed", "CHECKPOINT_CONTENT_CHANGED");
  const branch = await gitText(root, ["symbolic-ref", "--short", "HEAD"]);
  ensure(branch === receipt.branch && !protectedBranch(branch), "Branch changed or is protected", "CHECKPOINT_PROTECTED_BRANCH");
  ensure(!dependencyPaths(state.definition, state.unit).some((file) => state.definition.sourceInventory.find((source) => source.path === file).unresolved === true), "Unresolved dependencies cannot be reused", "CHECKPOINT_DEPENDENCY_UNKNOWN");
  ensure(serialize(await sourceSnapshots(root, state.definition, state.unit)) === serialize(receipt.sources), "Validation sources or modes changed", "CHECKPOINT_CONTENT_CHANGED");
  await validateBrowserReceipt(root, state.unit, receipt);
  const binding = await readOptionalPrivate(`${file.target}.commit.json`, file.identity);
  let committedHead = null;
  if (binding) {
    ensure(binding.schemaVersion === 1 && binding.receiptDigest === file.receiptDigest && binding.status === "committed", "Invalid commit binding");
    await validateCommitTree(root, binding.committedHead, receipt, binding.verifiedHead);
    await git(root, ["merge-base", "--is-ancestor", binding.committedHead, "HEAD"]);
    committedHead = binding.committedHead;
  } else ensure(await gitText(root, ["rev-parse", "HEAD"]) === receipt.verifiedHead, "HEAD changed without a verified binding", "CHECKPOINT_HEAD_CHANGED");
  return { unitId, verifiedHead: receipt.verifiedHead, committedHead, status: "verified" };
}
async function finishBinding(root, file, head) {
  await validateCommitTree(root, head, file.receipt, file.receipt.verifiedHead);
  const binding = { schemaVersion: 1, status: "committed", unitId: file.receipt.unitId, verifiedHead: file.receipt.verifiedHead, committedHead: head, receiptDigest: file.receiptDigest, contentDigest: jsonDigest(file.receipt.sources), committedAt: new Date().toISOString() };
  await storage.writeJsonExclusive(`${file.target}.commit.json`, binding, { parentIdentity: file.identity, maxBytes: MAX_RECEIPT });
  return { unitId: binding.unitId, verifiedHead: binding.verifiedHead, committedHead: head, status: "committed" };
}
export async function commitImplementationCheckpoint({ repository = ".", goalPath, unitId, receiptPath, messageFile, commitRunner = execute }) {
  const root = await repositoryRoot(repository);
  const file = await readReceipt(root, goalPath, receiptPath);
  const attempt = await readOptionalPrivate(`${file.target}.attempt.json`, file.identity);
  const binding = await readOptionalPrivate(`${file.target}.commit.json`, file.identity);
  if (binding) { const result = await verifyImplementationCheckpoint({ repository: root, goalPath, unitId, receiptPath }); return { ...result, status: "committed" }; }
  if (attempt) {
    const state = await goalState(root, goalPath, unitId);
    await validateReceiptShape(file.receipt, { root, goalPath, unitId, state });
    ensure(await gitText(root, ["symbolic-ref", "--short", "HEAD"]) === file.receipt.branch && !protectedBranch(file.receipt.branch), "Commit attempt belongs to another branch", "CHECKPOINT_PROTECTED_BRANCH");
    ensure(serialize(await sourceSnapshots(root, state.definition, state.unit)) === serialize(file.receipt.sources), "Commit attempt contents changed", "CHECKPOINT_CONTENT_CHANGED");
    ensure(attempt.receiptDigest === file.receiptDigest, "Commit attempt receipt differs");
    const head = await gitText(root, ["rev-parse", "HEAD"]);
    ensure(head !== attempt.verifiedHead && await gitText(root, ["rev-parse", `${head}^{tree}`]) === attempt.tree, "Previous commit attempt needs inspection and fresh validation", "CHECKPOINT_COMMIT_UNCERTAIN");
    return finishBinding(root, file, head);
  }
  await verifyImplementationCheckpoint({ repository: root, goalPath, unitId, receiptPath });
  const state = await goalState(root, goalPath, unitId);
  const selected = [...file.receipt.selectedPaths].sort();
  ensure(serialize((await changedPaths(root)).filter((name) => scoped(name, state.unit.scope))) === serialize(selected), "Selected changes changed since validation", "CHECKPOINT_CONTENT_CHANGED");
  const staged = pathsFrom(await git(root, ["diff", "--cached", "--name-only", "-z"]));
  ensure(staged.every((name) => selected.includes(name)), "Unrelated staged changes must be preserved", "CHECKPOINT_FOREIGN_INDEX");
  const unstaged = pathsFrom(await git(root, ["diff", "--name-only", "-z"]));
  ensure(!staged.some((name) => unstaged.includes(name)), "Mixed staged/unstaged hunks require isolation before committing", "CHECKPOINT_MIXED_HUNKS");
  canonicalScope(messageFile);
  const { bytes: message } = await readSource(root, messageFile);
  ensure(message && message.length <= 16 * 1024 && !selected.includes(messageFile), "Invalid message file");
  const subject = message.toString("utf8").split(/\r?\n/u)[0];
  ensure(/[ぁ-んァ-ヶ一-龠]/u.test(subject) && !/[。.]$/u.test(subject) && !/Co-authored-by|WIP|TODO/iu.test(message.toString("utf8")), "Commit message must be concrete Japanese without an AI signature or temporary marker");
  await git(root, ["add", "--", ...selected]);
  const tree = await gitText(root, ["write-tree"]);
  ensure(serialize(pathsFrom(await git(root, ["diff", "--cached", "--name-only", "-z"]))) === serialize(selected), "Index includes unexpected changes", "CHECKPOINT_FOREIGN_INDEX");
  for (const snapshot of file.receipt.sources) ensure(serialize(await treeSnapshot(root, tree, snapshot.path)) === serialize(snapshot), "Index differs from tested contents", "CHECKPOINT_CONTENT_CHANGED");
  await verifyImplementationCheckpoint({ repository: root, goalPath, unitId, receiptPath });
  await storage.writeJsonExclusive(`${file.target}.attempt.json`, { schemaVersion: 1, receiptDigest: file.receiptDigest, verifiedHead: file.receipt.verifiedHead, tree }, { parentIdentity: file.identity, maxBytes: MAX_RECEIPT });
  let error;
  try { await commitRunner("git", ["-C", root, "commit", "--file", path.join(root, messageFile)], { encoding: "buffer", maxBuffer: MAX_RECEIPT }); }
  catch (caught) { error = caught; }
  const head = await gitText(root, ["rev-parse", "HEAD"]);
  ensure(head !== file.receipt.verifiedHead, error ? "Commit failed; inspect hooks and revalidate before a new attempt" : "Commit did not create a revision", "CHECKPOINT_COMMIT_FAILED");
  ensure(await gitText(root, ["rev-parse", `${head}^{tree}`]) === tree, "Hook changed the committed tree", "CHECKPOINT_CONTENT_CHANGED");
  ensure(serialize(await sourceSnapshots(root, state.definition, state.unit)) === serialize(file.receipt.sources), "Hook changed the working tree; revalidation required", "CHECKPOINT_CONTENT_CHANGED");
  return finishBinding(root, file, head);
}
export async function runCheckpointCli({ argv = process.argv.slice(2), repository = process.cwd(), stdout = process.stdout } = {}) {
  const [command, ...rest] = argv; ensure(["verify", "commit"].includes(command), "Usage: implementation-checkpoint.mjs <verify|commit> --goal <path> --unit <id> --receipt <path> [--message-file <path>]");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) { ensure(["--goal", "--unit", "--receipt", "--message-file"].includes(rest[index]) && rest[index + 1] && options[rest[index]] === undefined, "Invalid checkpoint arguments"); options[rest[index]] = rest[index + 1]; }
  ensure(options["--goal"] && options["--unit"] && options["--receipt"] && (command !== "commit" || options["--message-file"]), "Missing checkpoint arguments");
  const args = { repository, goalPath: options["--goal"], unitId: options["--unit"], receiptPath: options["--receipt"], messageFile: options["--message-file"] };
  const result = command === "verify" ? await verifyImplementationCheckpoint(args) : await commitImplementationCheckpoint(args);
  stdout.write(`${JSON.stringify(result)}\n`); return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCheckpointCli().catch((error) => { process.stderr.write(`${JSON.stringify({ status: "failed", code: error.code ?? "CHECKPOINT_UNEXPECTED_ERROR", message: error instanceof CheckpointError ? error.message : "Checkpoint operation failed" })}\n`); process.exitCode = 1; });
