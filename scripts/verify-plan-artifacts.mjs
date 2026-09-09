#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function invalidPlanArtifacts(trackedPaths) {
  return trackedPaths.filter((trackedPath) => (
    trackedPath.startsWith("plan/")
    || (trackedPath.startsWith("plans/") && trackedPath !== "plans/template.md")
  ));
}

export function verifyPlanArtifacts(trackedPaths) {
  const invalid = invalidPlanArtifacts(trackedPaths);
  if (invalid.length === 0) return invalid;
  throw new Error(`Only plans/template.md may be tracked. Remove these paths from the index; preserve local files:\n${invalid.map((item) => `- ${item}`).join("\n")}`);
}

// Shipping/CI inspect the proposed Git contents. Untracked plans are local
// working material and a changed template is a legitimate source change.
export function verifyPlanIndex({ repositoryRoot }) {
  if (!repositoryRoot) throw new Error("repositoryRoot is required");
  const records = execFileSync("git", ["ls-files", "--stage", "-z", "--", "plans", "plan"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).split("\0").filter(Boolean).map((record) => {
    const separator = record.indexOf("\t");
    if (separator < 0) throw new Error("Malformed Git index record");
    const [mode, , stage] = record.slice(0, separator).split(" ");
    return { mode, stage, path: record.slice(separator + 1) };
  });
  verifyPlanArtifacts(records.map((record) => record.path));
  if (records.length !== 1 || records[0].path !== "plans/template.md"
      || records[0].stage !== "0" || !["100644", "100755"].includes(records[0].mode)) {
    throw new Error("plans/template.md must be a regular, resolved file in the index");
  }
  return { status: "pass", entries: ["plans/template.md"] };
}

function entryType(entry) {
  if (entry.isSymbolicLink()) return "symlink";
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  return "other";
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function verifyPlanTree({ repositoryRoot }) {
  if (!repositoryRoot) throw new Error("repositoryRoot is required");
  const requestedRoot = path.resolve(repositoryRoot);
  const root = await realpath(requestedRoot);
  if (root !== requestedRoot) throw new Error("repository root must not traverse symlinks");
  const plansRoot = path.join(root, "plans");
  const plansMetadata = await lstat(plansRoot);
  if (!plansMetadata.isDirectory() || plansMetadata.isSymbolicLink()) {
    throw new Error("plans must be a real directory, not a symlink");
  }

  const entries = (await readdir(plansRoot, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  const invalidEntries = entries
    .filter((entry) => entry.name !== "template.md")
    .map((entry) => `plans/${entry.name} (${entryType(entry)})`);
  if (invalidEntries.length > 0) {
    throw new Error(`Only plans/template.md may exist. Delete these plan artifacts:\n${invalidEntries.map((item) => `- ${item}`).join("\n")}`);
  }
  if (entries.length !== 1 || entries[0].name !== "template.md") {
    throw new Error("plans/template.md is required and must be the only plans entry");
  }

  const templatePath = path.join(plansRoot, "template.md");
  const templateMetadata = await lstat(templatePath);
  if (!templateMetadata.isFile() || templateMetadata.isSymbolicLink()) {
    throw new Error("plans/template.md must be a regular file, not a symlink");
  }
  if (await exists(path.join(root, "plan"))) throw new Error("legacy plan/ must not exist");

  const tracked = execFileSync("git", ["ls-files", "-z", "--", "plans", "plan"], { cwd: root, encoding: "buffer" })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  verifyPlanArtifacts(tracked);
  if (tracked.length !== 1 || tracked[0] !== "plans/template.md") {
    throw new Error("plans/template.md must be the only tracked plan path");
  }
  const headTemplate = execFileSync("git", ["show", "HEAD:plans/template.md"], { cwd: root, encoding: "buffer" });
  if (!headTemplate.equals(await readFile(templatePath))) {
    throw new Error("plans/template.md does not match the HEAD blob");
  }
  return { status: "pass", entries: ["plans/template.md"] };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const args = process.argv.slice(2);
    if (args.length > 0) throw new Error("Usage: node scripts/verify-plan-artifacts.mjs");
    verifyPlanIndex({ repositoryRoot });
    console.log("Plan artifact guard passed: only plans/template.md is tracked; local plans are preserved.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
