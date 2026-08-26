#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validatePlanFile } from "./validate-plan-file.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRealRoot = realpath(repositoryRoot);
const canonicalAssetRelativeRoot = ".agents/skills/implementation-review/assets/review-report";
const canonicalAssets = ["index.html", "styles.css", "app.js", "review-data-schema.js"];
const severities = new Set(["blocker", "major", "minor", "note"]);
const secretValue = /(?:\b(?:api[-_ ]?key|authorization|credential|pass(?:word|wd)?|secret|token|database_url|aws_secret_access_key|google_api_key)\s*[:=]\s*\S+|\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|https?):\/\/[^\s/:@]+:[^\s/@]+@|\bbearer\s+[a-z0-9._~+/=-]{8,}|\b(?:sk|rk|pk)[-_][a-z0-9_-]{12,}|\bgh[pousr]_[a-z0-9_]{12,}|\bgithub_pat_[a-z0-9_]{12,}|\bxox[baprs]-[a-z0-9-]{10,}|\bglpat-[a-z0-9_-]{12,}|\bAIza[0-9a-z_-]{35}\b|\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b|\bAKIA[0-9A-Z]{16}\b|-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----)/iu;

function containsSensitiveText(value) {
  return typeof value === "string" && secretValue.test(value);
}

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: options.binary ? null : "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function nulPaths(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean).sort();
}

function treeFileRecord(revision, relative) {
  const tree = git(["ls-tree", "-z", revision, "--", relative], { binary: true });
  if (tree.length === 0) return { state: "absent" };
  const entry = tree.toString("utf8").replace(/\0$/u, "");
  const separator = entry.indexOf("\t");
  const [mode, type, object] = entry.slice(0, separator).split(" ");
  if (separator < 0 || entry.slice(separator + 1) !== relative || type !== "blob" || !/^(?:100644|100755)$/u.test(mode) || !/^[a-f0-9]{40,64}$/u.test(object)) throw new Error(`tree path is not a regular reviewable file: ${relative}`);
  return { state: "present", mode, blob: object };
}

async function worktreeFileRecord(relative) {
  const absolute = path.resolve(repositoryRoot, relative);
  const inside = path.relative(repositoryRoot, absolute);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) throw new Error(`review path is unsafe: ${relative}`);
  try {
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`review path is not a regular file: ${relative}`);
    const actualRelative = path.relative(await repositoryRealRoot, await realpath(absolute)).split(path.sep).join("/");
    if (actualRelative !== relative) return { state: "absent" };
    const content = await readFile(absolute);
    return { state: "present", fileMode: info.mode & 0o111 ? "100755" : "100644", size: content.length, hash: createHash("sha256").update(content).digest("hex") };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { state: "absent" };
    throw error;
  }
}

function indexFileRecord(relative) {
  const entries = git(["ls-files", "--stage", "-z", "--", relative], { binary: true }).toString("utf8").split("\0").filter(Boolean);
  if (entries.length === 0) return { state: "absent" };
  if (entries.length !== 1) throw new Error(`review path has unresolved index stages: ${relative}`);
  const match = /^(100644|100755) ([a-f0-9]{40,64}) (\d+)\t([\s\S]+)$/u.exec(entries[0]);
  if (!match || match[3] !== "0" || match[4] !== relative) throw new Error(`index path is not a regular reviewable file: ${relative}`);
  return { state: "present", mode: match[1], blob: match[2], stage: Number(match[3]) };
}

async function plannedFileRecord(relative) {
  const worktree = await worktreeFileRecord(relative);
  if (worktree.state === "absent") return worktree;
  const blob = git(["hash-object", `--path=${relative}`, "--", relative]).trim();
  if (!/^[a-f0-9]{40,64}$/u.test(blob)) throw new Error(`planned blob is invalid: ${relative}`);
  const index = indexFileRecord(relative);
  const honorsFileMode = git(["config", "--bool", "core.fileMode"]).trim() !== "false";
  const mode = honorsFileMode || index.state === "absent" ? worktree.fileMode : index.mode;
  return { state: "present", mode, blob, size: worktree.size, hash: worktree.hash };
}

async function committedFileRecord(revision, relative) {
  const tree = treeFileRecord(revision, relative);
  const worktree = await worktreeFileRecord(relative);
  if (tree.state === "absent" && worktree.state === "absent") return tree;
  if (tree.state !== "present" || worktree.state !== "present") throw new Error(`committed path and worktree disagree: ${relative}`);
  return { ...tree, size: worktree.size, hash: worktree.hash };
}

async function canonicalPathRecord(base, relative, currentRevision) {
  const before = treeFileRecord(base, relative);
  const after = currentRevision ? await committedFileRecord(currentRevision, relative) : await plannedFileRecord(relative);
  const index = indexFileRecord(relative);
  return Buffer.from(`${relative}\0${JSON.stringify(before)}\0${JSON.stringify(after)}\0${JSON.stringify(index)}\0`);
}

export async function computeReviewSnapshot(base, selectedPaths, options = {}) {
  const worktreePaths = nulPaths(git(["diff", "--no-renames", "--name-only", "-z", base, "--"], { binary: true }));
  const stagedPaths = nulPaths(git(["diff", "--cached", "--no-renames", "--name-only", "-z", base, "--"], { binary: true }));
  const untrackedPaths = nulPaths(git(["ls-files", "--others", "--exclude-standard", "-z"], { binary: true }));
  const inventory = [...new Set([...worktreePaths, ...stagedPaths, ...untrackedPaths])].sort();
  const paths = selectedPaths ? [...selectedPaths].sort() : inventory;
  if (new Set(paths).size !== paths.length || paths.some((item) => !inventory.includes(item))) throw new Error("snapshot path is not present in the current diff");

  const records = new Map();
  for (const relative of inventory) records.set(relative, await canonicalPathRecord(base, relative, options.currentRevision));
  const hash = createHash("sha256");
  for (const relative of paths) hash.update(records.get(relative));
  const pathHashes = new Map();
  for (const relative of inventory) pathHashes.set(relative, createHash("sha256").update(records.get(relative)).digest("hex"));
  return { diffHash: hash.digest("hex"), paths, inventory, pathHashes };
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function computeReviewInputHashes(base, reviewedPaths, planText, attestation) {
  const diff = git(["diff", "--cached", "--binary", "--no-ext-diff", base, "--", ...reviewedPaths], { binary: true });
  const context = createHash("sha256");
  for (const relative of reviewedPaths) context.update(`${relative}\0${JSON.stringify(indexFileRecord(relative))}\0`);
  const hashes = {
    diff: createHash("sha256").update(diff).digest("hex"),
    context: context.digest("hex"),
  };
  if (planText === undefined) return hashes;
  if (!attestation?.remoteBase || !Array.isArray(attestation.validations)) throw new Error("conformance input requires remote base and validation evidence");
  return {
    ...hashes,
    plan: computePlanHash(planText),
    validations: hashJson(attestation.validations),
    remoteBase: hashJson(attestation.remoteBase),
  };
}

async function pathIsFullyStaged(relative) {
  const planned = await plannedFileRecord(relative);
  const index = indexFileRecord(relative);
  if (planned.state !== index.state) return false;
  if (planned.state === "absent") return true;
  return planned.mode === index.mode && planned.blob === index.blob;
}

function blobContent(record, relative) {
  if (record.state !== "present") throw new Error(`canonical review asset is absent: ${relative}`);
  return git(["cat-file", "blob", record.blob], { binary: true });
}

async function trustedCanonicalAssets(base, snapshot, options = {}) {
  const assets = new Map();
  for (const name of canonicalAssets) {
    const relative = `${canonicalAssetRelativeRoot}/${name}`;
    let content;
    if (snapshot.inventory.includes(relative)) {
      if (options.postCommit === true) content = blobContent(treeFileRecord(options.head, relative), relative);
      else {
        if (!await pathIsFullyStaged(relative)) throw new Error(`changed canonical review asset must be fully staged before validation: ${relative}`);
        content = blobContent(indexFileRecord(relative), relative);
      }
    } else {
      content = blobContent(treeFileRecord(base, relative), relative);
    }
    assets.set(name, content);
  }
  return assets;
}

async function importTrustedSchema(content) {
  const source = `data:text/javascript;base64,${content.toString("base64")}`;
  const schema = await import(source);
  if (typeof schema.normalizeData !== "function") throw new Error("trusted review schema does not export normalizeData");
  return schema;
}

async function readEvidence(reportRoot, relative) {
  const absolute = path.resolve(reportRoot, relative);
  const canonical = await realpath(absolute);
  const inside = path.relative(reportRoot, canonical);
  const info = await lstat(absolute);
  if (canonical !== absolute || !inside || inside.startsWith("..") || path.isAbsolute(inside) || !info.isFile() || info.isSymbolicLink() || info.size === 0) throw new Error(`review output is unsafe: ${relative}`);
  const content = await readFile(canonical);
  return { content, hash: createHash("sha256").update(content).digest("hex") };
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} schema is invalid`);
}

function canonicalFindings(findings) {
  return findings.map((finding) => JSON.stringify([finding.severity, finding.title, finding.body, finding.location, finding.recommendation])).sort();
}

export function computePlanHash(planText) {
  const mutableSections = new Set(["## 進捗管理", "## 実行記録"]);
  let currentSection = "";
  const immutable = [];
  for (const line of planText.replace(/\r\n?/gu, "\n").split("\n")) {
    if (/^## /u.test(line)) currentSection = line;
    if (mutableSections.has(currentSection)) {
      if (line === currentSection) immutable.push(line);
      continue;
    }
    if (/^- status:/u.test(line)) continue;
    immutable.push(line);
  }
  return createHash("sha256").update(immutable.join("\n").trimEnd()).digest("hex");
}

export function validateNormalizedReviewOutput(data, pass, raw) {
  const serialized = JSON.stringify(raw);
  if (serialized.includes("UNREPLACED_TEMPLATE") || containsSensitiveText(serialized)) throw new Error(`review output contains unsafe content: ${pass.source}`);
  const expectedKeys = pass.source === "conformance" ? ["runId", "diffHash", "planHash", "inputHashes", "source", "summary", "findings"] : ["runId", "diffHash", "inputHashes", "source", "summary", "findings"];
  exactKeys(raw, expectedKeys, "review output");
  if (raw.runId !== data.runId || raw.diffHash !== data.diffHash || raw.source !== pass.source || typeof raw.summary !== "string" || !raw.summary.trim() || !Array.isArray(raw.findings)) throw new Error(`review output metadata is invalid: ${pass.source}`);
  if (JSON.stringify(raw.inputHashes) !== JSON.stringify(pass.inputHashes)) throw new Error(`review input artifacts are stale: ${pass.source}`);
  if (pass.source === "conformance" && raw.planHash !== data.planHash) throw new Error("conformance review plan hash is stale");
  for (const finding of raw.findings) {
    exactKeys(finding, ["severity", "title", "body", "location", "recommendation"], "review finding");
    if (!severities.has(finding.severity) || [finding.title, finding.body, finding.location, finding.recommendation].some((item) => typeof item !== "string" || !item.trim())) throw new Error(`review finding is invalid: ${pass.source}`);
  }
  const reported = data.groups.flatMap((group) => group.findings).filter((finding) => finding.source === pass.source).map((finding) => ({
    severity: finding.severity,
    title: finding.title,
    body: finding.body,
    location: finding.location,
    recommendation: finding.recommendation,
  }));
  if (JSON.stringify(canonicalFindings(raw.findings)) !== JSON.stringify(canonicalFindings(reported))) throw new Error(`review findings are incomplete or stale: ${pass.source}`);
}

async function fileLines(base, relative, side) {
  if (side === "base") {
    try {
      const content = git(["show", `${base}:${relative}`]);
      const lines = content.split(/\r?\n/u);
      if (lines.length > 1 && lines.at(-1) === "") lines.pop();
      return content === "" ? [] : lines;
    } catch {
      return [];
    }
  }
  const absolute = path.resolve(repositoryRoot, relative);
  try {
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("not a regular file");
    const content = await readFile(absolute, "utf8");
    const lines = content.split(/\r?\n/u);
    if (lines.length > 1 && lines.at(-1) === "") lines.pop();
    return content === "" ? [] : lines;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    return [];
  }
}

export function parseChangedRanges(diff, untracked, headLineCount) {
  if (untracked) return headLineCount === 0 ? [] : [{ side: "head", start: 1, end: headLineCount }];
  const ranges = [];
  for (const match of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const oldStart = Number(match[1]);
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const newStart = Number(match[3]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);
    if (newCount > 0) ranges.push({ side: "head", start: newStart, end: newStart + newCount - 1 });
    if (oldCount > 0) ranges.push({ side: "base", start: oldStart, end: oldStart + oldCount - 1 });
  }
  return ranges;
}

async function changedRanges(base, relative, headLineCount) {
  const untracked = nulPaths(git(["ls-files", "--others", "--exclude-standard", "-z", "--", relative], { binary: true })).includes(relative);
  if (untracked) return parseChangedRanges("", true, headLineCount);
  const worktree = parseChangedRanges(git(["diff", "--unified=0", "--no-ext-diff", base, "--", relative]), false, headLineCount);
  const staged = parseChangedRanges(git(["diff", "--cached", "--unified=0", "--no-ext-diff", base, "--", relative]), false, headLineCount);
  return [...new Map([...worktree, ...staged].map((range) => [`${range.side}:${range.start}:${range.end}`, range])).values()];
}

async function validateLocations(data) {
  const linesBySide = new Map();
  const ranges = new Map();
  for (const relative of data.reviewedPaths) {
    const headLines = await fileLines(data.base, relative, "head");
    const baseLines = await fileLines(data.base, relative, "base");
    linesBySide.set(`${relative}:head`, headLines);
    linesBySide.set(`${relative}:base`, baseLines);
    ranges.set(relative, await changedRanges(data.base, relative, headLines.length));
  }
  const intersects = (relative, side, start, end) => ranges.get(relative)?.some((range) => range.side === side && start <= range.end && end >= range.start);
  for (const group of data.groups) {
    for (const location of group.locations) {
      if (location.endsWith("@file")) {
        const relative = location.slice(0, -5);
        if (!data.reviewedPaths.includes(relative) || ranges.get(relative)?.length !== 0) throw new Error(`path-level location is invalid: ${location}`);
        continue;
      }
      const match = /^(.*?)(@base)?:(\d+)(?:-(\d+))?$/u.exec(location);
      const side = match?.[2] ? "base" : "head";
      const start = Number(match?.[3]);
      const end = Number(match?.[4] ?? match?.[3]);
      const lines = match ? linesBySide.get(`${match[1]}:${side}`) : undefined;
      if (!match || start > lines?.length || end > lines?.length || !intersects(match[1], side, start, end)) throw new Error(`review location is outside the diff: ${location}`);
    }
    for (const finding of group.findings) {
      if (finding.location.endsWith("@file")) {
        const relative = finding.location.slice(0, -5);
        if (!data.reviewedPaths.includes(relative) || ranges.get(relative)?.length !== 0) throw new Error(`path-level finding location is invalid: ${finding.location}`);
        continue;
      }
      const match = /^(.*?)(@base)?:(\d+)(?::(\d+))?$/u.exec(finding.location);
      const side = match?.[2] ? "base" : "head";
      const line = Number(match?.[3]);
      const column = match?.[4] ? Number(match[4]) : undefined;
      const content = match ? linesBySide.get(`${match[1]}:${side}`)?.[line - 1] : undefined;
      if (!match || !content && content !== "" || !intersects(match[1], side, line, line) || (column !== undefined && (column < 1 || column > Math.max(1, content.length)))) throw new Error(`finding location is outside the diff: ${finding.location}`);
    }
  }
}

export function validateReviewPlanBinding(data, reportRelative, planRelative, planText) {
  const report = /^plans\/tmp\/([a-z0-9][a-z0-9-]*)\/implementation-review$/u.exec(reportRelative);
  const plan = /^plans\/tmp\/([a-z0-9][a-z0-9-]*)\/final\.md$/u.exec(planRelative);
  const planId = /^- plan_id:\s*([^\s]+)$/mu.exec(planText)?.[1];
  const baseCommit = /^- base_commit:\s*([a-f0-9]{40})$/mu.exec(planText)?.[1];
  if (!report || !plan || report[1] !== plan[1] || planId !== plan[1] || data.base !== baseCommit) throw new Error("review report is not bound to the exact final plan base");
}

export function validateFindingResolutions(data, options = {}) {
  const key = (item) => `${item.source}\0${item.severity}\0${item.title}\0${item.body}\0${item.location}\0${item.recommendation}`;
  const critical = data.groups.flatMap((group) => group.findings).filter((finding) => finding.severity === "blocker" || finding.severity === "major");
  const criticalKeys = new Set(critical.map(key));
  const resolutionKeys = new Set(data.findingResolutions.map(key));
  if ([...resolutionKeys].some((item) => !criticalKeys.has(item))) throw new Error("finding resolution does not match the current review");
  if (options.allowUnresolved !== true && (criticalKeys.size !== resolutionKeys.size || [...criticalKeys].some((item) => !resolutionKeys.has(item)))) throw new Error("unresolved blocker or major finding prevents G04");
}

export async function validateReviewDirectory(directory, planPath, options = {}) {
  const requested = path.resolve(repositoryRoot, directory);
  const relative = path.relative(repositoryRoot, requested).split(path.sep).join("/");
  if (!/^plans\/tmp\/[a-z0-9][a-z0-9-]*\/implementation-review$/u.test(relative)) throw new Error("review directory must be plans/tmp/<plan-id>/implementation-review");
  const reportRoot = await realpath(requested);
  if (reportRoot !== requested) throw new Error("review directory cannot be a symlink");

  const planRequested = path.resolve(repositoryRoot, planPath);
  const planRelative = path.relative(repositoryRoot, planRequested).split(path.sep).join("/");
  if (await realpath(planRequested) !== planRequested) throw new Error("final plan cannot be a symlink");
  const planErrors = await validatePlanFile(planRequested);
  if (planErrors.length) throw new Error(`final plan is invalid: ${planErrors.join("; ")}`);
  const planText = await readFile(planRequested, "utf8");
  const planBase = /^- base_commit:\s*([a-f0-9]{40})$/mu.exec(planText)?.[1];
  if (!planBase) throw new Error("final plan base_commit is missing");

  const head = git(["rev-parse", "HEAD"]).trim();
  if (options.postCommit === true) {
    const staged = nulPaths(git(["diff", "--cached", "--name-only", "-z", "--"], { binary: true }));
    const unstaged = nulPaths(git(["diff", "--name-only", "-z", "--"], { binary: true }));
    const untracked = nulPaths(git(["ls-files", "--others", "--exclude-standard", "-z"], { binary: true }));
    if (staged.length || unstaged.length || untracked.length) throw new Error("post-commit review requires a clean tracked and non-ignored worktree");
  }
  const fullSnapshot = await computeReviewSnapshot(planBase, undefined, { currentRevision: options.postCommit === true ? head : undefined });
  const trustedAssets = await trustedCanonicalAssets(planBase, fullSnapshot, { postCommit: options.postCommit, head });
  const { normalizeData } = await importTrustedSchema(trustedAssets.get("review-data-schema.js"));

  const reviewDataEvidence = await readEvidence(reportRoot, "review-data.json");
  const rawText = reviewDataEvidence.content.toString("utf8");
  if (rawText.includes("UNREPLACED_TEMPLATE")) throw new Error("review-data.json contains an unreplaced template value");
  const data = normalizeData(JSON.parse(rawText));
  validateReviewPlanBinding(data, relative, planRelative, planText);
  const remoteRef = `refs/remotes/${data.remoteBase.ref}`;
  if (spawnSync("git", ["check-ref-format", remoteRef], { cwd: repositoryRoot }).status !== 0) throw new Error("review remote base ref is invalid");
  let currentRemoteBase;
  try {
    currentRemoteBase = git(["rev-parse", "--verify", `${remoteRef}^{commit}`]).trim();
    git(["cat-file", "-e", `${data.remoteBase.oid}^{commit}`]);
  } catch {
    throw new Error("review remote base evidence cannot be resolved");
  }
  if (spawnSync("git", ["merge-base", "--is-ancestor", data.remoteBase.oid, currentRemoteBase], { cwd: repositoryRoot }).status !== 0) throw new Error("current remote base is not a linear descendant of the reviewed remote base");
  if (spawnSync("git", ["merge-base", "--is-ancestor", data.remoteBase.oid, data.base], { cwd: repositoryRoot }).status !== 0) throw new Error("reviewed remote base is not contained in the accepted plan base");
  const planHash = computePlanHash(planText);
  if (data.planHash !== planHash) throw new Error("review plan hash is stale");
  if (options.postCommit === true) {
    const lineage = git(["rev-list", "--parents", "-n", "1", head]).trim().split(/\s+/u);
    if (lineage.length !== 2 || lineage[1] !== data.head) throw new Error("post-commit review requires exactly one direct shipping commit after the reviewed HEAD");
    if (containsSensitiveText(git(["show", "-s", "--format=%B", head]))) throw new Error("shipping commit message contains unsafe content");
  } else {
    if (data.head !== head) throw new Error("review head does not match current HEAD");
    if (data.head !== data.base) throw new Error("plan-driven HTML review requires the uncommitted task diff at the exact plan base");
  }
  if (spawnSync("git", ["merge-base", "--is-ancestor", data.base, head], { cwd: repositoryRoot }).status !== 0) throw new Error("review base is not an ancestor of current HEAD");

  const snapshot = await computeReviewSnapshot(data.base, data.reviewedPaths, { currentRevision: options.postCommit === true ? head : undefined });
  const excludedNames = data.excludedPaths.map((item) => item.path);
  const manifest = [...data.reviewedPaths, ...excludedNames].sort();
  if (manifest.length !== snapshot.inventory.length || manifest.some((item, index) => item !== snapshot.inventory[index])) throw new Error("review and exclusion manifests do not cover the current diff");
  if (options.postCommit === true && data.excludedPaths.length > 0) throw new Error("post-commit review cannot exclude paths from the shipped diff");
  for (const asset of canonicalAssets) {
    const relative = `${canonicalAssetRelativeRoot}/${asset}`;
    if (excludedNames.includes(relative)) throw new Error(`canonical review asset cannot be excluded: ${relative}`);
    if (snapshot.inventory.includes(relative) && !data.reviewedPaths.includes(relative)) throw new Error(`changed canonical review asset must be reviewed: ${relative}`);
  }
  for (const relative of data.reviewedPaths) if (!await pathIsFullyStaged(relative)) throw new Error(`reviewed path must be fully staged before strict review: ${relative}`);
  for (const excluded of data.excludedPaths) if (snapshot.pathHashes.get(excluded.path) !== excluded.snapshotHash) throw new Error(`excluded path snapshot is stale: ${excluded.path}`);
  if (snapshot.diffHash !== data.diffHash) throw new Error("review diff hash is stale");

  for (const pass of data.reviewPasses) {
    const expectedInputs = computeReviewInputHashes(
      data.base,
      data.reviewedPaths,
      pass.source === "conformance" ? planText : undefined,
      pass.source === "conformance" ? { remoteBase: data.remoteBase, validations: data.validations } : undefined,
    );
    if (JSON.stringify(pass.inputHashes) !== JSON.stringify(expectedInputs)) throw new Error(`review input artifact hash is stale: ${pass.source}`);
    const evidence = await readEvidence(reportRoot, pass.outputFile);
    if (evidence.hash !== pass.outputHash) throw new Error(`review output hash is stale: ${pass.outputFile}`);
    validateNormalizedReviewOutput(data, pass, JSON.parse(evidence.content.toString("utf8")));
  }
  validateFindingResolutions(data, options);
  for (const asset of canonicalAssets) {
    const copied = await readEvidence(reportRoot, asset);
    const canonicalHash = createHash("sha256").update(trustedAssets.get(asset)).digest("hex");
    if (copied.hash !== canonicalHash || data.assetHashes[asset] !== canonicalHash) throw new Error(`review asset is stale: ${asset}`);
  }
  await validateLocations(data);
  return data;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void (async () => {
    const directory = process.argv[2];
    const planPath = process.argv[3];
    const flags = new Set(process.argv.slice(4));
    const allowedFlags = new Set(["--post-commit", "--allow-unresolved"]);
    if (!directory || !planPath || [...flags].some((flag) => !allowedFlags.has(flag)) || (flags.has("--post-commit") && flags.has("--allow-unresolved"))) throw new Error("usage: node scripts/validate-review-data.mjs plans/tmp/<plan-id>/implementation-review plans/tmp/<plan-id>/final.md [--allow-unresolved|--post-commit]");
    await validateReviewDirectory(directory, planPath, { postCommit: flags.has("--post-commit"), allowUnresolved: flags.has("--allow-unresolved") });
    console.log(`review validation passed: ${directory}`);
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
