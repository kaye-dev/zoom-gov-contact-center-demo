#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readConfirmationState } from "./confirmation-session.mjs";
import { verifyCommitArchive } from "./plan-commit-archive.mjs";

const TEMPLATE_NAME = "template.md";

function sortByName(left, right) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function relativePath(repositoryRoot, absolutePath, directory = false) {
  const relative = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
  return directory ? `${relative}/` : relative;
}

async function requireDirectory(target, label) {
  let metadata;
  try {
    metadata = await lstat(target);
  } catch (error) {
    throw new Error(`${label} is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} must be a real directory, not a symlink`);
  }
}

async function requireRegularFile(target, label) {
  let metadata;
  try {
    metadata = await lstat(target);
  } catch (error) {
    throw new Error(`${label} is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file, not a symlink`);
  }
}

async function listEntry(repositoryRoot, absolutePath) {
  const metadata = await lstat(absolutePath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    return [relativePath(repositoryRoot, absolutePath)];
  }

  const listed = [relativePath(repositoryRoot, absolutePath, true)];
  const children = (await readdir(absolutePath, { withFileTypes: true })).sort(sortByName);
  for (const child of children) {
    listed.push(...await listEntry(repositoryRoot, path.join(absolutePath, child.name)));
  }
  return listed;
}

async function requireInactiveCleanupCandidates(repositoryRoot, topLevelEntries) {
  const statePath = path.join(repositoryRoot, ".codex/confirmation-session.local.json");
  try {
    await lstat(statePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  const { state } = await readConfirmationState(repositoryRoot, { required: true });
  if (topLevelEntries.some((entry) => entry.name === state.slug)) {
    const activeSurfaces = [
      ...Object.keys(state.artifactServers),
      ...(state.appRuntime ? ["app"] : []),
    ];
    throw new Error(
      `plan cleanup refused before deleting any entry: '${state.slug}' has an active confirmation session (${activeSurfaces.join(", ") || "session"}). Stop it first with ./dev-confirmation.sh stop ${state.slug}`,
    );
  }
}

/**
 * @param {string[]} args
 * @returns {{ apply: boolean }}
 */
export function parsePlanCleanupArgs(args) {
  if (args.length === 0) return { apply: false };
  if (args.length === 1 && args[0] === "--apply") return { apply: true };
  if (
    args.length === 5
    && args[0] === "--apply"
    && args[1] === "--goal"
    && args[3] === "--commit"
  ) {
    return { apply: true, goalPath: args[2], commitSha: args[4] };
  }
  throw new Error("usage: node scripts/cleanup-plan-files.mjs [--apply] [--goal plans/<slug>/goal.md --commit <sha>]");
}

async function verifyTrackedTemplate(repositoryRoot, templatePath, commitSha) {
  const tracked = execFileSync("git", ["ls-files", "--", "plans/template.md"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  if (tracked !== "plans/template.md") throw new Error("plans/template.md must be tracked before cleanup");
  const committed = execFileSync("git", ["show", `${commitSha}:plans/template.md`], { cwd: repositoryRoot, encoding: "buffer" });
  if (!committed.equals(await readFile(templatePath))) throw new Error("plans/template.md does not match the verified commit");
}

/**
 * @param {{
 *   repositoryRoot: string,
 *   apply?: boolean,
 *   remove?: typeof rm,
 *   onCandidates?: (candidates: string[]) => void,
 * }} options
 * @returns {Promise<{ candidates: string[], removed: string[] }>}
 */
export async function cleanupPlanFiles({ repositoryRoot, apply = false, remove = rm, onCandidates }) {
  if (!repositoryRoot) throw new Error("repositoryRoot is required");

  const root = path.resolve(repositoryRoot);
  const planDirectory = path.join(root, "plans");
  const templatePath = path.join(planDirectory, TEMPLATE_NAME);
  await requireDirectory(planDirectory, "plans directory");
  await requireRegularFile(templatePath, "plans/template.md");

  const topLevelEntries = (await readdir(planDirectory, { withFileTypes: true }))
    .filter((entry) => entry.name !== TEMPLATE_NAME)
    .sort(sortByName);
  const candidates = [];
  for (const entry of topLevelEntries) {
    candidates.push(...await listEntry(root, path.join(planDirectory, entry.name)));
  }

  onCandidates?.(candidates);
  if (!apply || topLevelEntries.length === 0) return { candidates, removed: [] };
  await requireInactiveCleanupCandidates(root, topLevelEntries);

  const removed = [];
  for (const entry of topLevelEntries) {
    const absolutePath = path.join(planDirectory, entry.name);
    const relative = relativePath(root, absolutePath, entry.isDirectory() && !entry.isSymbolicLink());
    try {
      await remove(absolutePath, { recursive: true, force: false, maxRetries: 2, retryDelay: 100 });
      removed.push(relative);
    } catch (error) {
      const completed = removed.length > 0 ? removed.join(", ") : "none";
      throw new Error(`plan cleanup partially completed; removed: ${completed}; failed: ${relative}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { candidates, removed };
}

export async function cleanupArchivedPlan({ repositoryRoot, goalPath, commitSha, remove = rm }) {
  if (!repositoryRoot) throw new Error("repositoryRoot is required");
  if (!/^plans\/[a-z0-9][a-z0-9-]*\/goal\.md$/u.test(goalPath ?? "")) {
    throw new Error("goalPath must be plans/<slug>/goal.md");
  }
  if (typeof commitSha !== "string" || commitSha === "" || commitSha.startsWith("-")) throw new Error("commitSha is required");
  const root = path.resolve(repositoryRoot);
  const planDirectory = path.join(root, "plans");
  const templatePath = path.join(planDirectory, TEMPLATE_NAME);
  await requireDirectory(planDirectory, "plans directory");
  await requireRegularFile(templatePath, "plans/template.md");
  const slug = goalPath.split("/")[1];
  const entries = (await readdir(planDirectory, { withFileTypes: true })).sort(sortByName);
  const foreign = entries.filter(({ name }) => name !== TEMPLATE_NAME && name !== slug);
  if (foreign.length > 0) {
    throw new Error(`plan cleanup refused before deleting any entry: unrelated plan entries exist:\n${foreign.map(({ name }) => `- plans/${name}`).join("\n")}`);
  }
  const slugEntry = entries.find(({ name }) => name === slug);
  if (!slugEntry || !slugEntry.isDirectory() || slugEntry.isSymbolicLink()) {
    throw new Error(`plans/${slug} must be a real directory`);
  }
  await verifyCommitArchive({ repositoryRoot: root, commit: commitSha, goalPath });
  await verifyTrackedTemplate(root, templatePath, commitSha);
  await requireInactiveCleanupCandidates(root, [slugEntry]);
  const target = path.join(planDirectory, slug);
  await remove(target, { recursive: true, force: false, maxRetries: 2, retryDelay: 100 });
  const remaining = (await readdir(planDirectory)).sort();
  if (remaining.length !== 1 || remaining[0] !== TEMPLATE_NAME) {
    throw new Error(`plan cleanup completed but plans is not template-only: ${remaining.join(", ")}`);
  }
  return { removed: [`plans/${slug}/`], remaining: ["plans/template.md"], commitSha };
}

function printCandidates(candidates, apply) {
  if (candidates.length === 0) {
    console.log("削除候補はありません。plans/template.mdは保持されています。");
    return;
  }

  console.log(apply ? "削除対象:" : "削除候補 (preview):");
  for (const candidate of candidates) console.log(`- ${candidate}`);
  if (!apply) console.log("削除するには `npm run plans:cleanup -- --apply` を実行してください。");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void (async () => {
    const { apply, goalPath, commitSha } = parsePlanCleanupArgs(process.argv.slice(2));
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    if (goalPath && commitSha) {
      const result = await cleanupArchivedPlan({ repositoryRoot, goalPath, commitSha });
      console.log(`削除完了: ${result.removed.join(", ")}。plans/template.mdは保持されています。`);
      return;
    }
    const result = await cleanupPlanFiles({
      repositoryRoot,
      apply,
      onCandidates: (candidates) => printCandidates(candidates, apply),
    });
    if (apply && result.removed.length > 0) console.log(`削除完了: ${result.removed.length}件のtop-level entryを削除しました。`);
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
