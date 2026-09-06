#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MAX_GOAL_BYTES = 1_048_576;
const ARCHIVE_MARKER = "Codex-Goal-Archive-Version:";
const BEGIN_MARKER = "Codex-Goal-Begin:\n";
const ARCHIVE_BLOCK_PATTERN = /^Codex-Goal-Archive-Version: 1\nCodex-Goal-Path: plans\/[a-z0-9][a-z0-9-]*\/goal\.md\nCodex-Goal-Bytes: (?:0|[1-9][0-9]*)\nCodex-Goal-SHA256: [0-9a-f]{64}\nCodex-Goal-Begin:\n/gmu;
const GOAL_HEADINGS = [
  "# 目的と完了条件",
  "# 現状と根拠",
  "# 実装方針",
  "# インターフェースとデータフロー",
  "# テスト計画",
  "# 前提・対象外・リスク",
];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/iu,
];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

async function resolveGoal(repositoryRoot, requestedGoal) {
  const root = await realpath(repositoryRoot);
  ensure(root === path.resolve(repositoryRoot), "repository root must not traverse symlinks");
  ensure(!path.isAbsolute(requestedGoal), "goal path must be repository-relative");
  const normalized = normalizeRelativePath(path.normalize(requestedGoal));
  const match = /^plans\/([a-z0-9][a-z0-9-]*)\/goal\.md$/u.exec(normalized);
  ensure(match && !["tmp", "reviews"].includes(match[1]), "goal path must be plans/<slug>/goal.md");
  const absolute = path.join(root, ...normalized.split("/"));
  const metadata = await lstat(absolute);
  ensure(metadata.isFile() && !metadata.isSymbolicLink(), "goal must be a regular file, not a symlink");
  ensure((await realpath(absolute)) === absolute, "goal path must not traverse symlinks");
  const bytes = await readFile(absolute);
  validateGoalBytes(bytes);
  return { root, absolute, relative: normalized, slug: match[1], bytes };
}

function validateGoalBytes(bytes) {
  ensure(Buffer.isBuffer(bytes), "goal must be read as bytes");
  ensure(bytes.length > 0 && bytes.length <= MAX_GOAL_BYTES, `goal must be between 1 and ${MAX_GOAL_BYTES} bytes`);
  ensure(!bytes.includes(0), "goal must not contain NUL bytes");
  const text = bytes.toString("utf8");
  ensure(Buffer.from(text, "utf8").equals(bytes), "goal must be valid UTF-8");
  const headings = text.match(/^# .+$/gmu) ?? [];
  ensure(JSON.stringify(headings) === JSON.stringify(GOAL_HEADINGS), "goal must contain exactly the six canonical H1 headings in order");
  ensure(!SECRET_PATTERNS.some((pattern) => pattern.test(text)), "goal contains a credential-like secret and cannot be archived");
  return text;
}

function validateSubject(subject) {
  ensure(typeof subject === "string" && subject.trim() === subject && subject !== "", "commit subject is required");
  ensure(!/[\r\n\0]/u.test(subject), "commit subject must be one line without NUL");
}

function countArchiveBlocks(bytes) {
  const text = bytes.toString("utf8");
  ensure(Buffer.from(text, "utf8").equals(bytes), "commit message must be valid UTF-8");
  return text.match(ARCHIVE_BLOCK_PATTERN)?.length ?? 0;
}

function createArchiveMessage({ subject, goalPath, goalBytes }) {
  validateSubject(subject);
  validateGoalBytes(goalBytes);
  ensure(countArchiveBlocks(goalBytes) === 0, "goal contains a duplicate goal archive block");
  ensure(/^plans\/[a-z0-9][a-z0-9-]*\/goal\.md$/u.test(goalPath), "invalid canonical goal path");
  const header = [
    subject,
    "",
    "Codex-Goal-Archive-Version: 1",
    `Codex-Goal-Path: ${goalPath}`,
    `Codex-Goal-Bytes: ${goalBytes.length}`,
    `Codex-Goal-SHA256: ${sha256(goalBytes)}`,
    "Codex-Goal-Begin:",
    "",
  ].join("\n");
  return Buffer.concat([Buffer.from(header, "utf8"), goalBytes]);
}

function parseArchiveMessage(messageBytes) {
  ensure(Buffer.isBuffer(messageBytes), "commit message must be bytes");
  ensure(countArchiveBlocks(messageBytes) === 1, "commit message contains duplicate goal archive blocks");
  const marker = Buffer.from(BEGIN_MARKER, "utf8");
  const begin = messageBytes.indexOf(marker);
  ensure(begin >= 0, "commit message does not contain a goal archive");
  const prefix = messageBytes.subarray(0, begin).toString("utf8");
  const lines = prefix.split("\n");
  const subject = lines[0];
  validateSubject(subject);
  const metadataLines = lines.slice(1).filter(Boolean);
  ensure(metadataLines.length === 4, "goal archive metadata is malformed");
  const metadata = Object.fromEntries(metadataLines.map((line) => {
    const separator = line.indexOf(": ");
    ensure(separator > 0, "goal archive metadata is malformed");
    return [line.slice(0, separator), line.slice(separator + 2)];
  }));
  ensure(metadata["Codex-Goal-Archive-Version"] === "1", "unsupported goal archive version");
  ensure(/^plans\/[a-z0-9][a-z0-9-]*\/goal\.md$/u.test(metadata["Codex-Goal-Path"] ?? ""), "invalid archived goal path");
  ensure(/^(?:0|[1-9][0-9]*)$/u.test(metadata["Codex-Goal-Bytes"] ?? ""), "invalid archived goal byte length");
  ensure(/^[0-9a-f]{64}$/u.test(metadata["Codex-Goal-SHA256"] ?? ""), "invalid archived goal SHA-256");
  const payload = messageBytes.subarray(begin + marker.length);
  ensure(payload.length === Number(metadata["Codex-Goal-Bytes"]), "archived goal byte length does not match payload");
  ensure(sha256(payload) === metadata["Codex-Goal-SHA256"], "archived goal SHA-256 does not match payload");
  validateGoalBytes(payload);
  return {
    subject,
    goalPath: metadata["Codex-Goal-Path"],
    goalBytes: payload,
    goalSha256: metadata["Codex-Goal-SHA256"],
  };
}

function readRawCommit(repositoryRoot, commit) {
  ensure(typeof commit === "string" && commit !== "" && !commit.startsWith("-"), "commit is required");
  return execFileSync("git", ["cat-file", "commit", commit], { cwd: repositoryRoot, encoding: "buffer" });
}

function commitMessageFromRaw(rawCommit) {
  const separator = Buffer.from("\n\n", "utf8");
  const index = rawCommit.indexOf(separator);
  ensure(index >= 0, "raw commit object is malformed");
  return rawCommit.subarray(index + separator.length);
}

async function verifyCommitArchive({ repositoryRoot, commit, goalPath }) {
  const goal = await resolveGoal(repositoryRoot, goalPath);
  const parsed = parseArchiveMessage(commitMessageFromRaw(readRawCommit(goal.root, commit)));
  ensure(parsed.goalPath === goal.relative, "archived goal path does not match current goal");
  ensure(parsed.goalBytes.equals(goal.bytes), "archived goal payload does not match current goal");
  return { commit, goalPath: goal.relative, goalBytes: goal.bytes.length, goalSha256: parsed.goalSha256 };
}

function commitsInRange(repositoryRoot, base, head) {
  ensure(typeof head === "string" && head !== "" && !head.startsWith("-"), "head is required");
  const range = base && !/^0+$/u.test(base) ? `${base}..${head}` : head;
  return execFileSync("git", ["rev-list", "--reverse", range], { cwd: repositoryRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
}

async function verifyHistory({ repositoryRoot, base, head, requiredGoalSha256 }) {
  const root = await realpath(repositoryRoot);
  const archives = [];
  for (const commit of commitsInRange(root, base, head)) {
    const message = commitMessageFromRaw(readRawCommit(root, commit));
    if (!message.includes(Buffer.from(ARCHIVE_MARKER, "utf8"))) continue;
    const parsed = parseArchiveMessage(message);
    archives.push({ commit, goalPath: parsed.goalPath, goalBytes: parsed.goalBytes.length, goalSha256: parsed.goalSha256 });
  }
  if (requiredGoalSha256) {
    ensure(/^[0-9a-f]{64}$/u.test(requiredGoalSha256), "required goal SHA-256 must be 64 lowercase hex characters");
    ensure(archives.filter(({ goalSha256 }) => goalSha256 === requiredGoalSha256).length === 1, "required goal archive must appear exactly once in history");
  }
  return { status: "pass", archives };
}

async function writeExclusive(target, bytes) {
  const handle = await open(target, "wx", 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}

function parseArgs(argv) {
  ensure(argv.length >= 1, "usage: plan-commit-archive.mjs <prepare|verify-commit|verify-history|extract> [options]");
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    ensure(key?.startsWith("--") && value, `${key ?? "option"} requires a value`);
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function runCli(argv = process.argv.slice(2), repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const { command, options } = parseArgs(argv);
  if (command === "prepare") {
    ensure(options.goal && options.subject && options.output, "prepare requires --goal, --subject, and --output");
    const goal = await resolveGoal(repositoryRoot, options.goal);
    const output = path.resolve(options.output);
    ensure(!output.startsWith(`${goal.root}${path.sep}`), "archive message output must be outside the repository");
    await writeExclusive(output, createArchiveMessage({ subject: options.subject, goalPath: goal.relative, goalBytes: goal.bytes }));
    return { status: "prepared", output, goalPath: goal.relative, goalBytes: goal.bytes.length, goalSha256: sha256(goal.bytes) };
  }
  if (command === "verify-commit") {
    ensure(options.commit && options.goal, "verify-commit requires --commit and --goal");
    return { status: "pass", ...await verifyCommitArchive({ repositoryRoot, commit: options.commit, goalPath: options.goal }) };
  }
  if (command === "verify-history") {
    ensure(options.head, "verify-history requires --head");
    return verifyHistory({ repositoryRoot, base: options.base, head: options.head, requiredGoalSha256: options["require-goal-sha256"] });
  }
  if (command === "extract") {
    ensure(options.commit && options.output, "extract requires --commit and --output");
    const parsed = parseArchiveMessage(commitMessageFromRaw(readRawCommit(repositoryRoot, options.commit)));
    await writeExclusive(path.resolve(options.output), parsed.goalBytes);
    return { status: "extracted", output: path.resolve(options.output), goalPath: parsed.goalPath, goalSha256: parsed.goalSha256 };
  }
  throw new Error(`unknown command: ${command}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export {
  MAX_GOAL_BYTES,
  commitMessageFromRaw,
  createArchiveMessage,
  parseArchiveMessage,
  resolveGoal,
  sha256,
  validateGoalBytes,
  verifyCommitArchive,
  verifyHistory,
};
