#!/usr/bin/env node

import { lstat, readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

/**
 * @param {string[]} args
 * @returns {{ apply: boolean }}
 */
export function parsePlanCleanupArgs(args) {
  if (args.length === 0) return { apply: false };
  if (args.length === 1 && args[0] === "--apply") return { apply: true };
  throw new Error("usage: node scripts/cleanup-plan-files.mjs [--apply]");
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
  const plansDirectory = path.join(root, "plans");
  const templatePath = path.join(plansDirectory, TEMPLATE_NAME);
  await requireDirectory(plansDirectory, "plans directory");
  await requireRegularFile(templatePath, "plans/template.md");

  const topLevelEntries = (await readdir(plansDirectory, { withFileTypes: true }))
    .filter((entry) => entry.name !== TEMPLATE_NAME)
    .sort(sortByName);
  const candidates = [];
  for (const entry of topLevelEntries) {
    candidates.push(...await listEntry(root, path.join(plansDirectory, entry.name)));
  }

  onCandidates?.(candidates);
  if (!apply || topLevelEntries.length === 0) return { candidates, removed: [] };

  const removed = [];
  for (const entry of topLevelEntries) {
    const absolutePath = path.join(plansDirectory, entry.name);
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
    const { apply } = parsePlanCleanupArgs(process.argv.slice(2));
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
