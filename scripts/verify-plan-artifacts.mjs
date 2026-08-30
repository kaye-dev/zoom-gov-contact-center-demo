#!/usr/bin/env node

import { execFileSync } from "node:child_process";

export function invalidPlanArtifacts(trackedPaths) {
  return trackedPaths.filter((trackedPath) => (
    trackedPath.startsWith("plan/")
    || (trackedPath.startsWith("plans/") && trackedPath !== "plans/template.md")
  ));
}

export function verifyPlanArtifacts(trackedPaths) {
  const invalid = invalidPlanArtifacts(trackedPaths);
  if (invalid.length === 0) return invalid;
  throw new Error(`Only plans/template.md may be tracked. Delete these plan artifacts:\n${invalid.map((item) => `- ${item}`).join("\n")}`);
}

if (import.meta.filename === process.argv[1]) {
  try {
    const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    verifyPlanArtifacts(tracked);
    console.log("Plan artifact guard passed: only plans/template.md is tracked.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
