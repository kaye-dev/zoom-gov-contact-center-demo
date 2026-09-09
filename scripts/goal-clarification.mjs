/** Immutable approval inheritance for mechanically provable explanatory additions. */
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { boundedModelRead } from "../.agents/skills/plan/scripts/parity-model-files.mjs";
import { modelWorkspaceStorage as storage } from "../.agents/skills/plan/scripts/parity-run-workspace.mjs";
const MAX_BYTES = 2 * 1024 * 1024;
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function ensure(condition) {
  if (!condition) { const error = new Error("Goal clarification is not a provable explanatory addition; a new invocation is required"); error.code = "GOAL_APPROVAL_CHANGED"; throw error; }
}
/** Only verbatim restatements of complete existing lines can inherit automatically.
 * New prose, deletions, reordered requirements and changed acceptance remain ambiguous.
 */
export function classifyGoalClarification(before, after) {
  ensure(typeof before === "string" && typeof after === "string" && Buffer.byteLength(before) + Buffer.byteLength(after) < MAX_BYTES / 2);
  const marker = "\n## 承認済み要件の説明補足\n\n";
  ensure(!before.includes(marker) && after.startsWith(before + marker));
  const addition = after.slice(before.length + marker.length);
  const quotes = addition.trimEnd().split("\n");
  ensure(quotes.length > 0 && quotes.length <= 32 && addition.endsWith("\n"));
  const originalLines = before.split("\n");
  for (const line of quotes) {
    ensure(line.startsWith("> ") && line.length > 4);
    const original = line.slice(2);
    ensure(originalLines.includes(original) && !/^(?:[>#`]|\s*$)/u.test(original));
  }
  return { classification: "verbatim-explanatory-restatement", diff: { offset: before.length, removed: "", added: after.slice(before.length) } };
}
const relativePath = (goalPath, oldDigest) => `${path.posix.dirname(goalPath)}/evidence/goal-clarifications/${oldDigest.slice(7)}.json`;
async function clarificationLocation(repositoryRoot, goalPath, originalDigest, create = false) {
  ensure(/^plans\/[a-z0-9][a-z0-9-]*\/goal\.md$/u.test(goalPath));
  const relative = relativePath(goalPath, originalDigest);
  let cursor = repositoryRoot, identity;
  for (const [index, part] of path.posix.dirname(relative).split("/").entries()) {
    cursor = path.join(cursor, part);
    identity = await storage.ensureRealDirectory(cursor, { create: create && index >= 2, ...(index >= 2 ? { mode: 0o700 } : {}) });
  }
  return { relative, target: path.join(repositoryRoot, relative), identity };
}
export async function recordGoalClarification({ repositoryRoot, goalPath, before, after, invocation, invariantBinding }) {
  ensure(/^plans\/[a-z0-9][a-z0-9-]*\/goal\.md$/u.test(goalPath));
  const classified = classifyGoalClarification(before, after);
  ensure(invocation?.basis === "explicit-$implement-invocation" && (invocation.goalDigest ?? invocation.goalSha256) === hash(before) && invocation.allowExplanatoryRestatement === true);
  ensure(invariantBinding && typeof invariantBinding === "object");
  const current = await boundedModelRead(repositoryRoot, goalPath, false);
  ensure(hash(current) === hash(after));
  const location = await clarificationLocation(repositoryRoot, goalPath, hash(before), true);
  const receipt = { schemaVersion: 1, kind: "goal-clarification", before, after, beforeDigest: hash(before), afterDigest: hash(after), invocation, invariantBinding, ...classified };
  await storage.writeJsonExclusive(location.target, receipt, { parentIdentity: location.identity, maxBytes: MAX_BYTES });
  return { path: location.relative, beforeDigest: receipt.beforeDigest, afterDigest: receipt.afterDigest };
}
export async function verifyGoalClarification({ repositoryRoot, goalPath, originalDigest, currentBytes, invariantBinding, invocation }) {
  if (hash(currentBytes) === originalDigest) return true;
  ensure(/^sha256:[a-f0-9]{64}$/u.test(originalDigest));
  ensure(invocation?.allowExplanatoryRestatement === true && invocation.basis === "explicit-$implement-invocation" && (invocation.goalDigest ?? invocation.goalSha256) === originalDigest);
  const location = await clarificationLocation(repositoryRoot, goalPath, originalDigest);
  const receipt = (await storage.readJsonFile(location.target, { parentIdentity: location.identity, limit: MAX_BYTES })).value;
  ensure(Buffer.byteLength(JSON.stringify(receipt)) <= MAX_BYTES && receipt.schemaVersion === 1 && receipt.kind === "goal-clarification");
  const classified = classifyGoalClarification(receipt.before, receipt.after);
  ensure(receipt.beforeDigest === originalDigest && hash(receipt.before) === originalDigest && hash(receipt.after) === receipt.afterDigest && receipt.afterDigest === hash(currentBytes));
  ensure(JSON.stringify(classified.diff) === JSON.stringify(receipt.diff) && classified.classification === receipt.classification);
  ensure(receipt.invocation?.basis === "explicit-$implement-invocation" && (receipt.invocation.goalDigest ?? receipt.invocation.goalSha256) === originalDigest && receipt.invocation.allowExplanatoryRestatement === true);
  ensure(isDeepStrictEqual(receipt.invocation, invocation) && isDeepStrictEqual(receipt.invariantBinding, invariantBinding));
  return true;
}
