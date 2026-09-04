#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const maxDays = 31;
const maxSessions = 200;
const maxSessionBytes = 512 * 1024 * 1024;
const defaultDiscoveryLimits = Object.freeze({
  entries: 10_000,
  depth: 16,
  issues: 100,
});
const defaultProcessingLimits = Object.freeze({
  fileBytes: maxSessionBytes,
  totalSourceBytes: 2 * 1024 * 1024 * 1024,
  recordsPerFile: 100_000,
  bytesPerRecord: 8 * 1024 * 1024,
  trackedToolCalls: 20_000,
  trackedTurns: 20_000,
  distinctCommands: 20_000,
  retainedStringBytes: 1_024,
});
const skillNames = ["plan", "implement", "review", "git-commit-push-pr"];
const deterministicProgressStopCodes = new Set([
  "WORKFLOW_PROGRESS_STOP",
  "WORKFLOW_DETERMINISTIC_PROGRESS_STOP",
]);
const metricCoverageNames = [
  "eventTimestamp",
  "agentTurnBoundary",
  "skillInvocation",
  "toolKind",
  "toolResult",
  "toolDuration",
  "commandCategory",
  "browserCategory",
  "validationCategory",
];
const safeTopLevelTypes = new Set([
  "session_meta",
  "turn_context",
  "response_item",
  "event_msg",
  "world_state",
  "token_usage_record",
  "compacted",
  "inter_agent_communication_metadata",
]);
const knownEventTypes = new Set([
  "task_started",
  "task_complete",
  "task_failed",
  "turn_aborted",
  "item_completed",
  "thread_settings_applied",
  "thread_goal_updated",
  "token_count",
]);
const knownNonMetricItemTypes = new Set([
  "Reasoning",
  "AgentMessage",
  "FileChange",
  "SubAgentActivity",
  "ContextCompaction",
  "ImageView",
  "Plan",
  "CollabAgentToolCall",
]);
const knownResponseItemTypes = new Set([
  "reasoning",
  "custom_tool_call",
  "custom_tool_call_output",
  "message",
  "agent_message",
  "function_call",
  "function_call_output",
]);

class AuditError extends Error {
  constructor(code) {
    super(code);
    this.name = "AuditError";
    this.code = code;
  }
}

class SourceProcessingLimitError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "SourceProcessingLimitError";
    this.reason = reason;
  }
}

function fail(code) {
  throw new AuditError(code);
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseDate(value, label) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value ?? "");
  if (!match) fail(`WPA_INVALID_${label.toUpperCase()}`);
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const checked = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    checked.getUTCFullYear() !== parts.year ||
    checked.getUTCMonth() + 1 !== parts.month ||
    checked.getUTCDate() !== parts.day
  ) fail(`WPA_INVALID_${label.toUpperCase()}`);
  return parts;
}

function formatDate({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarDays(parts, count) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + count));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function localParts(epochMs, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zonedMidnight(parts, timezone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = localParts(candidate, timezone);
    const observedUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    candidate += target - observedUtc;
  }
  const final = localParts(candidate, timezone);
  if (
    final.year !== parts.year || final.month !== parts.month || final.day !== parts.day ||
    final.hour !== 0 || final.minute !== 0 || final.second !== 0
  ) fail("WPA_TIMEZONE_BOUNDARY_UNAVAILABLE");
  return candidate;
}

function validateTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    fail("WPA_INVALID_TIMEZONE");
  }
}

function parseArguments(argv, now = new Date()) {
  const options = {
    repository: ".",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    days: undefined,
    from: undefined,
    to: undefined,
    sessionsRoot: undefined,
    archivedRoot: undefined,
    excludedSessionIds: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!value) fail("WPA_MISSING_OPTION_VALUE");
    if (
      ["--repository", "--sessions-root", "--archived-root"].includes(argument) &&
      value.split(/[\\/]/u).includes("..")
    ) fail("WPA_PATH_TRAVERSAL");
    if (argument === "--repository") options.repository = value;
    else if (argument === "--timezone") options.timezone = value;
    else if (argument === "--days") options.days = Number(value);
    else if (argument === "--from") options.from = value;
    else if (argument === "--to") options.to = value;
    else if (argument === "--sessions-root") options.sessionsRoot = value;
    else if (argument === "--archived-root") options.archivedRoot = value;
    else if (argument === "--exclude-session-id") options.excludedSessionIds.push(value);
    else fail("WPA_UNKNOWN_OPTION");
    index += 1;
  }
  validateTimezone(options.timezone);
  if (options.days !== undefined && (options.from !== undefined || options.to !== undefined)) {
    fail("WPA_CONFLICTING_PERIOD_OPTIONS");
  }
  if ((options.from === undefined) !== (options.to === undefined)) fail("WPA_INCOMPLETE_PERIOD");
  let from;
  let to;
  if (options.from !== undefined) {
    from = parseDate(options.from, "from");
    to = parseDate(options.to, "to");
    if (formatDate(from) > formatDate(to)) fail("WPA_REVERSED_PERIOD");
    const span = Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000) + 1;
    if (span > maxDays) fail("WPA_PERIOD_TOO_LARGE");
  } else {
    const days = options.days ?? 4;
    if (!Number.isInteger(days) || days < 1 || days > maxDays) fail("WPA_INVALID_DAYS");
    const current = localParts(now.getTime(), options.timezone);
    to = { year: current.year, month: current.month, day: current.day };
    from = addCalendarDays(to, -(days - 1));
  }
  const fromMs = zonedMidnight(from, options.timezone);
  const toExclusiveMs = zonedMidnight(addCalendarDays(to, 1), options.timezone);
  return {
    ...options,
    from: formatDate(from),
    to: formatDate(to),
    fromMs,
    toExclusiveMs,
  };
}

async function requireRealDirectory(input, code) {
  const absolute = path.resolve(input);
  let metadata;
  let resolved;
  try {
    [metadata, resolved] = await Promise.all([lstat(absolute), realpath(absolute)]);
  } catch {
    fail(code);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || resolved !== absolute) fail(code);
  return resolved;
}

async function gitCommonDirectory(repository) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repository, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", maxBuffer: 64 * 1024 },
    );
    return await realpath(stdout.trim());
  } catch {
    fail("WPA_REPOSITORY_IDENTITY_UNAVAILABLE");
  }
}

function markDiscoveryLimit(state, reason) {
  state.limitExceeded = true;
  state.limitReasons.add(reason);
}

function validateProcessingLimits(limits) {
  for (const key of Object.keys(defaultProcessingLimits)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1) {
      fail("WPA_INVALID_PROCESSING_LIMITS");
    }
  }
}

async function* readJsonlLines(handle, hash, bytesPerRecord, fileBytes) {
  const chunk = Buffer.allocUnsafe(64 * 1024);
  let fragments = [];
  let fragmentBytes = 0;
  let position = 0;
  for (;;) {
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
    if (bytesRead === 0) break;
    const content = chunk.subarray(0, bytesRead);
    hash.update(content);
    position += bytesRead;
    if (position > fileBytes) {
      throw new SourceProcessingLimitError("file-size-limit");
    }
    let start = 0;
    for (let index = 0; index < bytesRead; index += 1) {
      if (content[index] !== 0x0a) continue;
      const part = content.subarray(start, index);
      const totalBytes = fragmentBytes + part.length;
      if (totalBytes > bytesPerRecord) {
        throw new SourceProcessingLimitError("record-byte-limit");
      }
      const line = fragments.length === 0
        ? part
        : Buffer.concat([...fragments, part], totalBytes);
      const withoutCarriageReturn = line.at(-1) === 0x0d ? line.subarray(0, -1) : line;
      yield withoutCarriageReturn.toString("utf8");
      fragments = [];
      fragmentBytes = 0;
      start = index + 1;
    }
    if (start < bytesRead) {
      const remainder = content.subarray(start, bytesRead);
      fragmentBytes += remainder.length;
      if (fragmentBytes > bytesPerRecord) {
        throw new SourceProcessingLimitError("record-byte-limit");
      }
      fragments.push(Buffer.from(remainder));
    }
  }
  if (fragmentBytes > 0) {
    const line = fragments.length === 1 ? fragments[0] : Buffer.concat(fragments, fragmentBytes);
    const withoutCarriageReturn = line.at(-1) === 0x0d ? line.subarray(0, -1) : line;
    yield withoutCarriageReturn.toString("utf8");
  }
}

function recordSourceIssue(state, reason) {
  state.issueCount += 1;
  if (state.sourceIssues.length < state.limits.issues) {
    state.sourceIssues.push({ reason });
    return;
  }
  markDiscoveryLimit(state, "source-issue-limit");
}

function isInsideSourceRoot(candidate, rootAnchor) {
  const relative = path.relative(rootAnchor, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function sameSourceMetadata(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode &&
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function inspectSourcePath(target, rootAnchor, expectedType, state) {
  try {
    const before = await lstat(target, { bigint: true });
    const typeMatches = expectedType === "directory" ? before.isDirectory() : before.isFile();
    if (before.isSymbolicLink() || !typeMatches) {
      markDiscoveryLimit(state, "source-path-safety-limit");
      return null;
    }
    const resolved = await realpath(target);
    const after = await lstat(target, { bigint: true });
    if (
      resolved !== path.resolve(target) ||
      !isInsideSourceRoot(resolved, rootAnchor) ||
      !sameSourceMetadata(before, after)
    ) {
      markDiscoveryLimit(state, "source-path-safety-limit");
      return null;
    }
    return after;
  } catch {
    markDiscoveryLimit(state, "source-path-safety-limit");
    return null;
  }
}

async function collectJsonlFiles(root, state, depth = 0, rootAnchor = root) {
  if (state.limitExceeded) return;
  if (depth > state.limits.depth) {
    markDiscoveryLimit(state, "source-depth-limit");
    return;
  }
  const directoryBefore = await inspectSourcePath(root, rootAnchor, "directory", state);
  if (!directoryBefore) return;
  await state.hooks?.beforeDirectoryOpen?.({ root, rootAnchor, depth });
  let directory;
  try {
    directory = await opendir(root);
    for await (const entry of directory) {
      if (state.limitExceeded) return;
      state.enumeratedEntries += 1;
      if (state.enumeratedEntries > state.limits.entries) {
        markDiscoveryLimit(state, "source-entry-limit");
        return;
      }
      const target = path.join(root, entry.name);
      if (entry.isSymbolicLink()) {
        recordSourceIssue(state, "symlink-entry");
      } else if (entry.isDirectory()) {
        const child = await inspectSourcePath(target, rootAnchor, "directory", state);
        if (child) await collectJsonlFiles(target, state, depth + 1, rootAnchor);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        state.discoveredFiles += 1;
        await state.hooks?.beforeFileInspect?.({ target, rootAnchor, depth });
        const metadata = await inspectSourcePath(target, rootAnchor, "file", state);
        if (metadata && Number(metadata.mtimeMs) >= state.fromMs) {
          state.candidates.push(target);
          state.candidateSources.set(target, { rootAnchor, metadata });
          state.candidateBytes += Number(metadata.size);
          if (state.candidates.length > maxSessions) {
            markDiscoveryLimit(state, "session-file-limit");
          } else if (state.candidateBytes > state.processingLimits.totalSourceBytes) {
            markDiscoveryLimit(state, "total-source-byte-limit");
          }
        }
      }
    }
  } catch {
    if (!state.limitExceeded) markDiscoveryLimit(state, "source-path-safety-limit");
    return;
  }
  if (!state.limitExceeded) {
    const directoryAfter = await inspectSourcePath(root, rootAnchor, "directory", state);
    if (directoryAfter && !sameSourceMetadata(directoryBefore, directoryAfter)) {
      markDiscoveryLimit(state, "source-path-safety-limit");
    }
  }
}

function durationMs(item, event) {
  if (item?.duration && Number.isFinite(item.duration.secs) && Number.isFinite(item.duration.nanos)) {
    return Math.max(0, Math.round(item.duration.secs * 1000 + item.duration.nanos / 1_000_000));
  }
  if (Number.isFinite(event?.completed_at_ms) && Number.isFinite(event?.started_at_ms)) {
    return Math.max(0, event.completed_at_ms - event.started_at_ms);
  }
  return null;
}

function epochMilliseconds(value) {
  if (Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const canonicalIsoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function isCanonicalUuid(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") === 36 && canonicalUuidPattern.test(value);
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") !== 24) return null;
  if (!canonicalIsoTimestampPattern.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function commandText(command) {
  if (typeof command === "string") return command;
  if (Array.isArray(command) && command.every((value) => typeof value === "string")) return command.join("\n");
  return null;
}

function classifyCommand(text) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const fullTest =
    /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test(?:\s|$)/iu.test(normalized) &&
    !/(?:\btest\/|\.test\.[cm]?[jt]sx?\b|--scenario\b)/u.test(normalized);
  return {
    hash: digest(normalized),
    fullTest,
    build: /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?build(?:\s|$)/iu.test(normalized),
    fullParity: /parity[^\n]*(?:matrix-scope\s+full|full[- ]matrix)|(?:matrix-scope\s+full)[^\n]*parity/iu.test(normalized),
    fixedSleep: /(?:^|[;&|]\s*)sleep\s+\d+(?:\.\d+)?(?:\s|$)/iu.test(normalized),
    polling: /\b(?:while|until)\b[^\n]*(?:sleep|status)|write_stdin/iu.test(normalized),
    followLog: /\b(?:docker\s+(?:compose\s+)?logs|tail)\b[^\n]*(?:\s-f\b|--follow\b)/iu.test(normalized),
  };
}

function locator(record) {
  const timestamp = canonicalIsoTimestamp(record.timestamp);
  return {
    ...(Number.isInteger(record.ordinal) ? { ordinal: record.ordinal } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
}

function addEvidence(session, category, record, duration = 0, successful = null) {
  const current = session.evidence.get(category) ?? {
    category,
    count: 0,
    durationMs: 0,
    successfulCount: 0,
    successfulDurationMs: 0,
    failedCount: 0,
    locators: [],
  };
  current.count += 1;
  current.durationMs += duration ?? 0;
  if (successful === true) {
    current.successfulCount += 1;
    current.successfulDurationMs += duration ?? 0;
  } else if (successful === false) {
    current.failedCount += 1;
  }
  if (current.locators.length < 5) current.locators.push(locator(record));
  session.evidence.set(category, current);
}

function newMetrics() {
  return {
    commands: 0,
    commandFailures: 0,
    duplicateCommands: 0,
    browserOperations: 0,
    mcpOperations: 0,
    contextCompactions: 0,
    fullTests: 0,
    productionBuilds: 0,
    fullParityRuns: 0,
    fixedSleeps: 0,
    pollingOperations: 0,
    followLogs: 0,
    observedDurationMs: 0,
  };
}

function itemText(item) {
  if (!Array.isArray(item?.content)) return "";
  return item.content
    .map((part) => typeof part?.text === "string" ? part.text : typeof part?.input_text === "string" ? part.input_text : "")
    .join("\n");
}

function markUnconfirmed(session, names = metricCoverageNames) {
  session.incompleteTelemetry = true;
  for (const name of names) session.unconfirmedMetrics.add(name);
}

function markSessionLimit(session, reason) {
  session.limitReason ??= reason;
  session.p0EvidenceUnconfirmed = true;
}

function retainedStringIsTooLarge(session, value, reason) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") <= session.processingLimits.retainedStringBytes) {
    return false;
  }
  markSessionLimit(session, reason);
  return true;
}

function trackTurn(session, turnId) {
  if (retainedStringIsTooLarge(session, turnId, "turn-id-string-limit")) return false;
  if (session.trackedTurnIds.has(turnId)) return true;
  if (session.trackedTurnIds.size >= session.processingLimits.trackedTurns) {
    markSessionLimit(session, "turn-retention-limit");
    return false;
  }
  session.trackedTurnIds.add(turnId);
  return true;
}

const toolCorrelationMetrics = [
  "toolKind",
  "toolResult",
  "toolDuration",
  "commandCategory",
  "browserCategory",
  "validationCategory",
];
const correlatedToolItemTypes = new Set([
  "CommandExecution",
  "Extension",
  "McpToolCall",
  "FileChange",
  "ImageView",
  "SubAgentActivity",
  "CollabAgentToolCall",
]);

function responseToolKind(item) {
  if (item?.type === "custom_tool_call") return { family: "custom", name: item.name };
  if (item?.type !== "function_call") return null;
  if (typeof item.namespace === "string" && item.namespace.startsWith("mcp__")) {
    return { family: "mcp", server: item.namespace.slice("mcp__".length), tool: item.name };
  }
  if (item.namespace === "collaboration") return { family: "collaboration", tool: item.name };
  return { family: "function", tool: item.name };
}

function itemMatchesCall(item, call) {
  if (!item || !call) return false;
  if (call.kind.family === "custom") {
    return correlatedToolItemTypes.has(item.type);
  }
  if (call.kind.family === "mcp") {
    return item.type === "McpToolCall" &&
      item.server === call.kind.server && item.tool === call.kind.tool;
  }
  if (call.kind.family === "collaboration") {
    if (call.kind.tool === "wait_agent") {
      return item.type === "CollabAgentToolCall" && item.tool === "wait";
    }
    if (call.kind.tool === "spawn_agent") {
      return item.type === "SubAgentActivity" && item.kind === "started";
    }
    if (call.kind.tool === "send_message" || call.kind.tool === "followup_task") {
      return item.type === "SubAgentActivity" && item.kind === "interacted";
    }
    return false;
  }
  return ["Extension", "McpToolCall"].includes(item.type);
}

function registerResponseToolCall(session, item) {
  const callId = item?.call_id;
  const kind = responseToolKind(item);
  if (typeof callId !== "string" || callId === "" || !kind || session.responseToolCallById.has(callId)) {
    markUnconfirmed(session, toolCorrelationMetrics);
    return;
  }
  if (
    retainedStringIsTooLarge(session, callId, "call-id-string-limit") ||
    Object.values(kind).some((value) => retainedStringIsTooLarge(session, value, "tool-kind-string-limit"))
  ) return;
  if (session.responseToolCallById.size >= session.processingLimits.trackedToolCalls) {
    markSessionLimit(session, "tool-call-retention-limit");
    return;
  }
  const call = { callId, kind, itemCount: 0, outputCount: 0, invalidMatch: false };
  session.responseToolCallById.set(callId, call);
  session.responseToolCalls += 1;
  if (kind.family === "custom") session.openCustomToolCalls.add(callId);
}

function registerResponseToolOutput(session, item) {
  const callId = item?.call_id;
  if (retainedStringIsTooLarge(session, callId, "call-id-string-limit")) return;
  const call = typeof callId === "string" ? session.responseToolCallById.get(callId) : undefined;
  if (!call) {
    markUnconfirmed(session, toolCorrelationMetrics);
    return;
  }
  call.outputCount += 1;
  if (call.kind.family === "custom") session.openCustomToolCalls.delete(callId);
}

function registerCompletedToolItem(session, item) {
  session.completedToolItems += 1;
  if (retainedStringIsTooLarge(session, item?.id, "call-id-string-limit")) return;
  if ([item?.kind, item?.name, item?.server, item?.tool].some(
    (value) => retainedStringIsTooLarge(session, value, "tool-kind-string-limit"),
  )) return;
  const exactCall = typeof item?.id === "string"
    ? session.responseToolCallById.get(item.id)
    : undefined;
  let call = exactCall;
  if (!call && correlatedToolItemTypes.has(item?.type)) {
    const openCalls = [...session.openCustomToolCalls]
      .map((callId) => session.responseToolCallById.get(callId))
      .filter(Boolean);
    if (openCalls.length === 1) call = openCalls[0];
  }
  if (!call) {
    session.unmatchedCompletedToolItems += 1;
    return;
  }
  call.itemCount += 1;
  if (!itemMatchesCall(item, call)) call.invalidMatch = true;
}

function finalizeToolCorrelation(session) {
  const invalidCall = [...session.responseToolCallById.values()].some(
    (call) => call.itemCount !== 1 || call.outputCount !== 1 || call.invalidMatch,
  );
  if (invalidCall || session.unmatchedCompletedToolItems > 0) {
    markUnconfirmed(session, toolCorrelationMetrics);
  }
}

function recordSkillInvocation(session, turnId, item) {
  if (typeof turnId !== "string" || turnId === "") {
    markUnconfirmed(session, ["skillInvocation", "agentTurnBoundary"]);
    return;
  }
  if (!trackTurn(session, turnId)) return;
  session.userMessageTurns.add(turnId);
  if (!Array.isArray(item?.content)) {
    markUnconfirmed(session, ["skillInvocation"]);
    return;
  }
  const invocationText = itemText(item).trimStart();
  const invoked = skillNames.filter((name) =>
    new RegExp(`^(?:\\[)?\\$${name}(?:\\]|\\s|$)`, "iu").test(invocationText),
  );
  if (invoked.length === 0) return;
  const current = session.taskInvocations.get(turnId) ?? new Set();
  for (const name of invoked) current.add(name);
  session.taskInvocations.set(turnId, current);
}

function recordTerminalTurn(session, event, record, { failed = false } = {}) {
  if (typeof event?.turn_id !== "string" || event.turn_id === "") {
    markUnconfirmed(session, ["agentTurnBoundary"]);
    return;
  }
  if (!trackTurn(session, event.turn_id)) return;
  if (event.type === "task_complete") session.completedTurns += 1;
  if (failed) session.failedEvents += 1;
  session.terminalTurns.add(event.turn_id);
  const started = session.taskStarts.get(event.turn_id);
  const completed = epochMilliseconds(event.completed_at ?? record.timestamp);
  const elapsed = Number.isFinite(event.duration_ms)
    ? event.duration_ms
    : Number.isFinite(started) && Number.isFinite(completed) ? completed - started : null;
  for (const name of session.taskInvocations.get(event.turn_id) ?? []) {
    if (Number.isFinite(elapsed) && elapsed >= 0) session.skills[name].push(elapsed);
    else markUnconfirmed(session, ["agentTurnBoundary"]);
  }
  return elapsed;
}

async function scanSessionFile(file, processingLimits = defaultProcessingLimits, sourceContext) {
  validateProcessingLimits(processingLimits);
  if (sourceContext) {
    try {
      const resolved = await realpath(file);
      if (
        resolved !== path.resolve(file) ||
        !isInsideSourceRoot(resolved, sourceContext.rootAnchor)
      ) return { status: "limit", reason: "source-path-safety-limit" };
    } catch {
      return { status: "limit", reason: "source-path-safety-limit" };
    }
  }
  const beforePath = await lstat(file, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) return { status: "excluded", reason: "unsafe-source" };
  if (sourceContext && !sameSourceMetadata(beforePath, sourceContext.metadata)) {
    return { status: "changed", reason: "source-changed-during-scan" };
  }
  if (beforePath.size > BigInt(processingLimits.fileBytes)) return { status: "limit", reason: "file-size-limit" };
  let handle;
  try {
    handle = await open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch {
    return { status: "changed", reason: "source-changed-during-scan" };
  }
  let before;
  let openedPath;
  try {
    before = await handle.stat({ bigint: true });
    openedPath = await lstat(file, { bigint: true });
  } catch {
    await handle.close().catch(() => {});
    return { status: "changed", reason: "source-changed-during-scan" };
  }
  if (before.size > BigInt(processingLimits.fileBytes)) {
    await handle.close();
    return { status: "limit", reason: "file-size-limit" };
  }
  const openedDifferent = !before.isFile() || before.dev !== beforePath.dev || before.ino !== beforePath.ino ||
    before.size !== beforePath.size || openedPath.dev !== before.dev || openedPath.ino !== before.ino ||
    openedPath.size !== before.size;
  if (openedDifferent) {
    await handle.close();
    return { status: "changed", reason: "source-changed-during-scan" };
  }
  const hash = createHash("sha256");
  const session = {
    id: undefined,
    cwd: undefined,
    firstTimestamp: undefined,
    lastTimestamp: undefined,
    taskStarts: new Map(),
    taskInvocations: new Map(),
    terminalTurns: new Set(),
    completedTurns: 0,
    failedEvents: 0,
    skills: Object.fromEntries(skillNames.map((name) => [name, []])),
    metrics: newMetrics(),
    evidence: new Map(),
    commandHashes: new Set(),
    invalidLines: 0,
    unknownRecords: 0,
    incompleteTelemetry: false,
    p0EvidenceUnconfirmed: false,
    compactedRecords: 0,
    compactionItems: 0,
    unconfirmedMetrics: new Set(),
    primaryMetaSeen: false,
    isSubagent: false,
    parentThreadId: undefined,
    historyCutoffOrdinal: -1,
    userMessageTurns: new Set(),
    responseToolCalls: 0,
    completedToolItems: 0,
    responseToolCallById: new Map(),
    openCustomToolCalls: new Set(),
    unmatchedCompletedToolItems: 0,
    trackedTurnIds: new Set(),
    processingLimits,
    limitReason: undefined,
  };
  let recordCount = 0;
  try {
    for await (const line of readJsonlLines(
      handle,
      hash,
      processingLimits.bytesPerRecord,
      processingLimits.fileBytes,
    )) {
    if (line.trim() === "") continue;
    recordCount += 1;
    if (recordCount > processingLimits.recordsPerFile) {
      markSessionLimit(session, "record-count-limit");
      break;
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      session.invalidLines += 1;
      session.incompleteTelemetry = true;
      session.p0EvidenceUnconfirmed = true;
      metricCoverageNames.forEach((name) => session.unconfirmedMetrics.add(name));
      continue;
    }
    const safeRecordTimestamp = canonicalIsoTimestamp(record.timestamp);
    if (typeof record.timestamp === "string" && !safeRecordTimestamp) {
      markSessionLimit(session, "timestamp-format-limit");
      break;
    }
    if (record.type === "session_meta") {
      if (!session.primaryMetaSeen) {
        session.primaryMetaSeen = true;
        const id = record.payload?.id;
        if (!isCanonicalUuid(id)) {
          markSessionLimit(session, "session-id-format-limit");
          break;
        }
        if (retainedStringIsTooLarge(session, record.payload?.cwd, "cwd-string-limit")) break;
        if (retainedStringIsTooLarge(session, record.payload?.parent_thread_id, "parent-thread-id-string-limit")) break;
        session.id = id;
        session.cwd = record.payload?.cwd;
        session.isSubagent = record.payload?.thread_source === "subagent" || Boolean(record.payload?.source?.subagent);
        session.parentThreadId = record.payload?.parent_thread_id;
        session.historyCutoffOrdinal = Number.isInteger(record.payload?.subagent_history_start_ordinal)
          ? record.payload.subagent_history_start_ordinal
          : -1;
      } else {
        continue;
      }
    } else if (
      session.isSubagent &&
      Number.isInteger(record.ordinal) &&
      record.ordinal > 0 &&
      record.ordinal <= session.historyCutoffOrdinal
    ) {
      continue;
    }
    if (safeRecordTimestamp) {
      session.firstTimestamp ??= safeRecordTimestamp;
      session.lastTimestamp = safeRecordTimestamp;
    } else {
      session.incompleteTelemetry = true;
      session.unconfirmedMetrics.add("eventTimestamp");
    }
    if (!safeTopLevelTypes.has(record.type)) {
      session.unknownRecords += 1;
      metricCoverageNames.forEach((name) => session.unconfirmedMetrics.add(name));
    }
    if (record.type === "compacted") {
      session.compactedRecords += 1;
    } else if (record.type === "response_item") {
      const item = record.payload;
      if (!knownResponseItemTypes.has(item?.type)) {
        session.unknownRecords += 1;
        markUnconfirmed(session);
      } else if (item?.type === "message" && item.role === "user") {
        recordSkillInvocation(session, item.internal_chat_message_metadata_passthrough?.turn_id, item);
      } else if (item?.type === "custom_tool_call" || item?.type === "function_call") {
        registerResponseToolCall(session, item);
      } else if (item?.type === "custom_tool_call_output" || item?.type === "function_call_output") {
        registerResponseToolOutput(session, item);
      }
    } else if (record.type === "event_msg") {
      const event = record.payload;
      if (!knownEventTypes.has(event?.type)) {
        session.unknownRecords += 1;
        markUnconfirmed(session);
      } else if (event?.type === "task_started") {
        const started = epochMilliseconds(event.started_at ?? record.timestamp);
        if (typeof event.turn_id !== "string" || event.turn_id === "" || !Number.isFinite(started)) {
          markUnconfirmed(session, ["agentTurnBoundary"]);
        } else if (trackTurn(session, event.turn_id)) {
          session.taskStarts.set(event.turn_id, started);
        }
      } else if (event?.type === "task_complete") {
        recordTerminalTurn(session, event, record);
      } else if (event?.type === "task_failed" && typeof event.code === "string") {
        const elapsed = recordTerminalTurn(session, event, record, { failed: true });
        if (deterministicProgressStopCodes.has(event.code)) {
          if (Number.isFinite(elapsed) && elapsed >= 0) {
            addEvidence(session, "progress-stopping-failure", record, elapsed);
          } else {
            session.p0EvidenceUnconfirmed = true;
          }
        }
      } else if (event?.type === "task_failed") {
        markUnconfirmed(session, ["agentTurnBoundary", "toolResult"]);
      } else if (event?.type === "turn_aborted") {
        recordTerminalTurn(session, event, record, { failed: true });
      } else if (event?.type === "item_completed") {
        const item = event.item;
        const measuredDuration = durationMs(item, event);
        if (item?.type === "UserMessage") {
          recordSkillInvocation(session, event.turn_id, item);
        } else if (item?.type === "CommandExecution") {
          registerCompletedToolItem(session, item);
          const text = commandText(item.command);
          const succeeded = item.exit_code === 0 && item.status === "completed";
          session.metrics.commands += 1;
          if (measuredDuration === null || text === null || typeof item.status !== "string") {
            session.incompleteTelemetry = true;
          }
          if (measuredDuration === null) session.unconfirmedMetrics.add("toolDuration");
          if (text === null) {
            session.unconfirmedMetrics.add("commandCategory");
            session.unconfirmedMetrics.add("validationCategory");
          }
          if (typeof item.status !== "string" || !Number.isInteger(item.exit_code)) {
            session.unconfirmedMetrics.add("toolResult");
          }
          session.metrics.observedDurationMs += measuredDuration ?? 0;
          if (!succeeded) session.metrics.commandFailures += 1;
          if (text !== null) {
            const category = classifyCommand(text);
            if (session.commandHashes.has(category.hash)) {
              session.metrics.duplicateCommands += 1;
              addEvidence(session, "duplicate-command", record, measuredDuration);
            } else if (session.commandHashes.size >= processingLimits.distinctCommands) {
              markSessionLimit(session, "command-retention-limit");
            } else {
              session.commandHashes.add(category.hash);
            }
            for (const [field, matched, evidenceCategory] of [
              ["fullTests", category.fullTest, "full-test"],
              ["productionBuilds", category.build, "production-build"],
              ["fullParityRuns", category.fullParity, "full-parity"],
              ["fixedSleeps", category.fixedSleep, "fixed-sleep"],
              ["pollingOperations", category.polling, "polling"],
              ["followLogs", category.followLog, "follow-log"],
            ]) {
              if (matched) {
                session.metrics[field] += 1;
                addEvidence(session, evidenceCategory, record, measuredDuration, succeeded);
              }
            }
          }
        } else if (item?.type === "Extension" || item?.type === "McpToolCall") {
          registerCompletedToolItem(session, item);
          if (!session.limitReason) {
            const kind = [item.kind, item.server, item.tool]
              .filter((value) => typeof value === "string")
              .join("/");
            session.metrics.mcpOperations += 1;
            if (/browser|playwright|computer|cua/iu.test(kind)) session.metrics.browserOperations += 1;
            session.metrics.observedDurationMs += measuredDuration ?? 0;
            if (measuredDuration === null || (item.type === "McpToolCall" && typeof item.status !== "string")) {
              session.incompleteTelemetry = true;
            }
            if (kind === "") {
              session.unconfirmedMetrics.add("toolKind");
              session.unconfirmedMetrics.add("browserCategory");
            }
            if (measuredDuration === null) session.unconfirmedMetrics.add("toolDuration");
            if (item.type === "McpToolCall" && typeof item.status !== "string") session.unconfirmedMetrics.add("toolResult");
          }
        } else if (item?.type === "ContextCompaction") {
          session.compactionItems += 1;
        } else if (["FileChange", "ImageView", "SubAgentActivity", "CollabAgentToolCall"].includes(item?.type)) {
          registerCompletedToolItem(session, item);
        } else if (!knownNonMetricItemTypes.has(item?.type)) {
          session.unknownRecords += 1;
          markUnconfirmed(session);
        }
      }
    }
    if (session.limitReason) break;
    }
  } catch (error) {
    await handle.close().catch(() => {});
    if (error instanceof SourceProcessingLimitError) {
      return { status: "limit", id: session.id, reason: error.reason };
    }
    return { status: "changed", id: session.id, reason: "source-changed-during-scan" };
  }
  if (session.limitReason) {
    await handle.close().catch(() => {});
    return { status: "limit", id: session.id, reason: session.limitReason };
  }
  finalizeToolCorrelation(session);
  session.responseToolCallById.clear();
  session.openCustomToolCalls.clear();
  if (session.unknownRecords > 0) session.p0EvidenceUnconfirmed = true;
  for (const turnId of session.taskStarts.keys()) {
    if (!session.userMessageTurns.has(turnId)) markUnconfirmed(session, ["skillInvocation"]);
  }
  session.metrics.contextCompactions = session.compactedRecords || session.compactionItems;
  const fullTestEvidence = session.evidence.get("full-test");
  if ((fullTestEvidence?.successfulCount ?? 0) > 1) {
    addEvidence(
      session,
      "repeated-full-test",
      { timestamp: session.lastTimestamp },
      fullTestEvidence.successfulDurationMs,
      true,
    );
  }
  const buildEvidence = session.evidence.get("production-build");
  if ((buildEvidence?.successfulCount ?? 0) > 1) {
    addEvidence(
      session,
      "repeated-production-build",
      { timestamp: session.lastTimestamp },
      buildEvidence.successfulDurationMs,
      true,
    );
  }
  let after;
  let afterPath;
  try {
    after = await handle.stat({ bigint: true });
    afterPath = await lstat(file, { bigint: true });
  } catch {
    await handle.close().catch(() => {});
    return { status: "changed", id: session.id, reason: "source-changed-during-scan" };
  }
  await handle.close();
  const changed = before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
    afterPath.dev !== after.dev || afterPath.ino !== after.ino || afterPath.size !== after.size ||
    afterPath.mtimeNs !== after.mtimeNs || afterPath.ctimeNs !== after.ctimeNs;
  if (changed) return { status: "changed", id: session.id, reason: "source-changed-during-scan" };
  if (typeof session.id !== "string" || session.id === "" || typeof session.cwd !== "string" || session.cwd === "") {
    return { status: "unsupported", id: session.id, reason: "identity-fields-missing" };
  }
  if (session.isSubagent) {
    return { status: "subagent", id: session.id, parentThreadId: session.parentThreadId, reason: "internal-subagent-session" };
  }
  return {
    status: "scanned",
    fileDigest: `sha256:${hash.digest("hex")}`,
    session,
  };
}

function summarizeDurations(values) {
  if (values.length === 0) return { samples: 0, medianMs: null, rangeMs: null };
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return {
    samples: sorted.length,
    medianMs: median,
    rangeMs: [sorted[0], sorted.at(-1)],
    ...(sorted.length >= 10 ? { p90Ms: sorted[Math.ceil(sorted.length * 0.9) - 1] } : {}),
  };
}

function mergeSessionSegments(target, source) {
  const newTurnIds = [...source.trackedTurnIds].filter((turnId) => !target.trackedTurnIds.has(turnId));
  if (target.trackedTurnIds.size + newTurnIds.length > target.processingLimits.trackedTurns) {
    markSessionLimit(target, "turn-retention-limit");
    return target;
  }
  const newCommandHashes = [...source.commandHashes].filter((hash) => !target.commandHashes.has(hash));
  if (target.commandHashes.size + newCommandHashes.length > target.processingLimits.distinctCommands) {
    markSessionLimit(target, "command-retention-limit");
    return target;
  }
  const duplicateAcrossSegments = [...source.commandHashes].filter((hash) => target.commandHashes.has(hash)).length;
  for (const key of Object.keys(target.metrics)) target.metrics[key] += source.metrics[key];
  target.metrics.duplicateCommands += duplicateAcrossSegments;
  for (const name of skillNames) target.skills[name].push(...source.skills[name]);
  for (const [turnId, started] of source.taskStarts) {
    if (target.taskStarts.has(turnId)) fail("WPA_CONFLICTING_SESSION_SOURCES");
    target.taskStarts.set(turnId, started);
  }
  for (const [turnId, invocations] of source.taskInvocations) {
    if (target.taskInvocations.has(turnId)) fail("WPA_CONFLICTING_SESSION_SOURCES");
    target.taskInvocations.set(turnId, invocations);
  }
  for (const turnId of source.terminalTurns) target.terminalTurns.add(turnId);
  for (const turnId of source.userMessageTurns) target.userMessageTurns.add(turnId);
  for (const turnId of newTurnIds) target.trackedTurnIds.add(turnId);
  for (const hash of source.commandHashes) target.commandHashes.add(hash);
  for (const [category, evidence] of source.evidence) {
    const current = target.evidence.get(category);
    if (!current) {
      target.evidence.set(category, evidence);
      continue;
    }
    current.count += evidence.count;
    current.durationMs += evidence.durationMs;
    current.successfulCount += evidence.successfulCount;
    current.successfulDurationMs += evidence.successfulDurationMs;
    current.failedCount += evidence.failedCount;
    current.locators.push(...evidence.locators.slice(0, Math.max(0, 5 - current.locators.length)));
  }
  target.firstTimestamp = target.firstTimestamp < source.firstTimestamp ? target.firstTimestamp : source.firstTimestamp;
  target.lastTimestamp = target.lastTimestamp > source.lastTimestamp ? target.lastTimestamp : source.lastTimestamp;
  target.completedTurns += source.completedTurns;
  target.failedEvents += source.failedEvents;
  target.invalidLines += source.invalidLines;
  target.unknownRecords += source.unknownRecords;
  target.incompleteTelemetry ||= source.incompleteTelemetry;
  target.p0EvidenceUnconfirmed ||= source.p0EvidenceUnconfirmed;
  target.compactedRecords += source.compactedRecords;
  target.compactionItems += source.compactionItems;
  target.responseToolCalls += source.responseToolCalls;
  target.completedToolItems += source.completedToolItems;
  for (const name of source.unconfirmedMetrics) target.unconfirmedMetrics.add(name);
  return target;
}

function candidateFor(category, evidence) {
  const catalog = {
    "repeated-full-test": ["WPA-P1-REPEATED-FULL-TEST", "同一task内のfull test反復", "focused testとvalidated diff digestでfull testを一度に制限する", [".agents/skills/implement/SKILL.md", ".agents/skills/review/SKILL.md"]],
    "repeated-production-build": ["WPA-P1-REPEATED-BUILD", "同一task内のproduction build反復", "build昇格条件とdigest再利用を適用する", [".agents/skills/implement/SKILL.md", ".agents/skills/git-commit-push-pr/SKILL.md"]],
    "fixed-sleep": ["WPA-P1-FIXED-SLEEP", "成功経路の固定待機", "authoritative operationとbounded failure diagnosticへ置き換える", ["dev-compose.sh", ".agents/skills"]],
    "polling": ["WPA-P1-POLLING", "外側の反復polling", "owner検証済みcommandの完了結果を正本にする", ["dev-compose.sh", ".agents/skills"]],
    "follow-log": ["WPA-P1-FOLLOW-LOG", "通常経路の追尾log", "失敗時だけbounded logを取得する", ["dev-compose.sh", ".agents/skills"]],
  };
  const definition = catalog[category];
  if (!definition) return null;
  return {
    id: definition[0],
    priority: "P1",
    rootCause: definition[1],
    sessionLocators: evidence.map(({ sessionId, locators, durationMs }) => ({ sessionId, locators, durationMs })),
    currentContractDelta: definition[2],
    reductionTarget: category,
    qualityInvariant: "required safety and quality gates remain unchanged",
    changePaths: definition[3],
    complexity: "decrease-or-neutral",
    risk: "low-to-medium",
    recommendation: "改善",
  };
}

function assess(included, sourceLimitExceeded) {
  if (sourceLimitExceeded) return { verdict: "判定不能", reasons: ["scan limit exceeded"], candidates: [], rerunCondition: "narrow the period or raise the explicit source limit in a reviewed change" };
  const evidenceByCategory = new Map();
  for (const item of included) {
    for (const evidence of item.evidence) {
      const current = evidenceByCategory.get(evidence.category) ?? [];
      current.push({
        sessionId: item.id,
        locators: evidence.locators,
        count: evidence.count,
        durationMs: evidence.durationMs,
        successfulCount: evidence.successfulCount,
      });
      evidenceByCategory.set(evidence.category, current);
    }
  }
  const p0 = included.filter(({ p0TelemetryComplete }) => p0TelemetryComplete).flatMap((item) => item.evidence
    .filter(({ category }) => category === "progress-stopping-failure")
    .map((evidence) => ({
      id: "WPA-P0-PROGRESS-STOP",
      priority: "P0",
      rootCause: "deterministic progress-stopping workflow failure",
      sessionLocators: [{ sessionId: item.id, locators: evidence.locators }],
      currentContractDelta: "progress cannot complete under the observed workflow contract",
      reductionTarget: "progress-stopping-failure",
      qualityInvariant: "failure remains fail-closed while diagnosis becomes actionable",
      changePaths: [".agents/skills", "docs/development/codex-development-workflow.md"],
      complexity: "requires-review",
      risk: "high",
      recommendation: "改善",
    })));
  if (p0.length > 0) return { verdict: "ボトルネックあり", reasons: ["P0 evidence is present"], candidates: p0.slice(0, 3) };
  if (included.length < 2) return { verdict: "判定不能", reasons: ["fewer than two comparable completed sessions"], candidates: [], rerunCondition: "rerun after at least two completed sessions are available" };
  if (included.some(({ telemetryComplete }) => !telemetryComplete)) {
    return { verdict: "判定不能", reasons: ["required telemetry coverage is incomplete"], candidates: [], rerunCondition: "rerun with complete turn, tool result, duration, and category telemetry" };
  }
  const recurring = [...evidenceByCategory]
    .filter(
      ([category, evidence]) =>
        category !== "progress-stopping-failure" &&
        new Set(evidence.map(({ sessionId }) => sessionId)).size >= 2 &&
        evidence.every(
          ({ durationMs, successfulCount }) =>
            successfulCount > 0 && Number.isFinite(durationMs) && durationMs > 0,
        ),
    )
    .map(([category, evidence]) => candidateFor(category, evidence))
    .filter(Boolean)
    .slice(0, 3);
  if (recurring.length > 0) return { verdict: "ボトルネックあり", reasons: ["the same avoidable root cause recurred in at least two completed sessions"], candidates: recurring };
  return {
    verdict: "ボトルネックなし",
    reasons: ["no confirmed P0 or recurring P1 root cause"],
    candidates: [],
    recommendation: "改善提案なし・現行workflowを変更しない",
  };
}

async function analyzeSessions(options, {
  discoveryLimits = defaultDiscoveryLimits,
  processingLimits = defaultProcessingLimits,
  discoveryHooks,
} = {}) {
  if (
    !Number.isInteger(discoveryLimits.entries) || discoveryLimits.entries < 1 ||
    !Number.isInteger(discoveryLimits.depth) || discoveryLimits.depth < 0 ||
    !Number.isInteger(discoveryLimits.issues) || discoveryLimits.issues < 1
  ) fail("WPA_INVALID_DISCOVERY_LIMITS");
  validateProcessingLimits(processingLimits);
  const repository = await requireRealDirectory(options.repository, "WPA_INVALID_REPOSITORY");
  const commonDirectory = await gitCommonDirectory(repository);
  const defaultBase = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(homedir(), ".codex");
  const rootInputs = [
    [options.sessionsRoot ?? path.join(defaultBase, "sessions"), Boolean(options.sessionsRoot), "sessions"],
    [options.archivedRoot ?? path.join(defaultBase, "archived_sessions"), Boolean(options.archivedRoot), "archived"],
  ];
  const roots = [];
  const sourceIssues = [];
  for (const [input, explicit, kind] of rootInputs) {
    try {
      roots.push({ path: await requireRealDirectory(input, "WPA_INVALID_SOURCE_ROOT"), kind });
    } catch (error) {
      if (explicit) throw error;
      sourceIssues.push({ reason: `${kind}-source-unavailable` });
    }
  }
  if (roots.length === 0) fail("WPA_NO_SOURCE_ROOT");
  const discovery = {
    candidates: [],
    candidateSources: new Map(),
    candidateBytes: 0,
    discoveredFiles: 0,
    enumeratedEntries: 0,
    fromMs: options.fromMs,
    issueCount: sourceIssues.length,
    limits: discoveryLimits,
    processingLimits,
    hooks: discoveryHooks,
    limitExceeded: false,
    limitReasons: new Set(),
    sourceIssues,
  };
  // A rollout may continue across calendar days, so its filename start date is
  // not a safe period filter. The file modification time is a safe lower-bound
  // prefilter for append-only JSONL: a file containing an event in the requested
  // period must have been written no earlier than the start boundary. Do not use
  // an upper-bound filter because a later continuation may still contain events
  // from the requested period.
  for (const root of roots) {
    if (discovery.limitExceeded) break;
    await collectJsonlFiles(root.path, discovery);
  }
  const candidates = discovery.candidates.sort();
  const sourceLimitExceeded = discovery.limitExceeded;
  const files = sourceLimitExceeded ? [] : candidates;
  const scanned = [];
  for (const file of files) {
    scanned.push(await scanSessionFile(file, processingLimits, discovery.candidateSources.get(file)));
  }
  const segmentsById = new Map();
  for (const result of scanned.filter(({ status }) => status === "scanned")) {
    const segments = segmentsById.get(result.session.id) ?? [];
    if (!segments.some(({ fileDigest }) => fileDigest === result.fileDigest)) segments.push(result);
    segmentsById.set(result.session.id, segments);
  }
  const byId = new Map();
  const mergeLimitResults = [];
  for (const [id, segments] of segmentsById) {
    const ordered = segments.sort((left, right) => left.session.firstTimestamp.localeCompare(right.session.firstTimestamp));
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index - 1].session.lastTimestamp >= ordered[index].session.firstTimestamp) {
        fail("WPA_CONFLICTING_SESSION_SOURCES");
      }
    }
    const logical = ordered[0];
    for (const segment of ordered.slice(1)) {
      mergeSessionSegments(logical.session, segment.session);
      if (logical.session.limitReason) break;
    }
    if (logical.session.limitReason) {
      mergeLimitResults.push({ status: "limit", id, reason: logical.session.limitReason });
      continue;
    }
    for (const [sourceCategory, repeatedCategory] of [
      ["full-test", "repeated-full-test"],
      ["production-build", "repeated-production-build"],
    ]) {
      logical.session.evidence.delete(repeatedCategory);
      const evidence = logical.session.evidence.get(sourceCategory);
      if ((evidence?.successfulCount ?? 0) > 1) {
        addEvidence(
          logical.session,
          repeatedCategory,
          { timestamp: logical.session.lastTimestamp },
          evidence.successfulDurationMs,
          true,
        );
      }
    }
    byId.set(id, logical);
  }
  const nonScannedResults = [
    ...scanned.filter(({ status }) => status !== "scanned"),
    ...mergeLimitResults,
  ];
  const processingLimitReasons = nonScannedResults
    .filter(({ status }) => status === "limit")
    .map(({ reason }) => reason);
  const limitExceeded = sourceLimitExceeded || processingLimitReasons.length > 0;
  const excludedIds = new Set(options.excludedSessionIds);
  const included = [];
  const provisional = [];
  const excluded = [];
  const unsupported = [];
  for (const result of nonScannedResults) {
    (result.status === "unsupported" ? unsupported : excluded).push({ ...(result.id ? { id: result.id } : {}), reason: result.reason });
  }
  for (const { session } of byId.values()) {
    if (excludedIds.has(session.id)) {
      provisional.push({ id: session.id, reason: "explicit-active-exclusion", eventRange: [session.firstTimestamp, session.lastTimestamp] });
      continue;
    }
    const first = Date.parse(session.firstTimestamp);
    const last = Date.parse(session.lastTimestamp);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < options.fromMs || first >= options.toExclusiveMs) {
      excluded.push({ id: session.id, reason: "outside-period" });
      continue;
    }
    let sessionPath;
    let sessionCommon;
    try {
      sessionPath = await requireRealDirectory(session.cwd, "WPA_SESSION_PATH_UNAVAILABLE");
      sessionCommon = await gitCommonDirectory(sessionPath);
    } catch {
      excluded.push({ id: session.id, reason: "repository-identity-unavailable" });
      continue;
    }
    if (sessionCommon !== commonDirectory) {
      excluded.push({ id: session.id, reason: "different-repository" });
      continue;
    }
    const completed = session.taskStarts.size > 0 && session.terminalTurns.size >= session.taskStarts.size;
    if (!completed) {
      provisional.push({ id: session.id, reason: "completion-status-unconfirmed", eventRange: [session.firstTimestamp, session.lastTimestamp] });
      continue;
    }
    const metricCoverage = Object.fromEntries(
      metricCoverageNames.map((name) => [
        name,
        session.unconfirmedMetrics.has(name) ? "未確認" : "confirmed",
      ]),
    );
    included.push({
      id: session.id,
      eventRange: [session.firstTimestamp, session.lastTimestamp],
      completedTurns: session.completedTurns,
      telemetryComplete:
        !session.incompleteTelemetry &&
        session.invalidLines === 0 &&
        session.unknownRecords === 0 &&
        session.unconfirmedMetrics.size === 0,
      p0TelemetryComplete: !session.p0EvidenceUnconfirmed,
      skills: session.skills,
      metrics: session.metrics,
      evidence: [...session.evidence.values()],
      metricCoverage,
      dataQuality: {
        invalidLines: session.invalidLines,
        unknownRecords: session.unknownRecords,
        incompleteTelemetry: session.incompleteTelemetry,
        metricCoverage,
      },
    });
  }
  const aggregateMetrics = newMetrics();
  for (const session of included) {
    for (const key of Object.keys(aggregateMetrics)) aggregateMetrics[key] += session.metrics[key];
  }
  const skills = Object.fromEntries(skillNames.map((name) => {
    const durations = included.flatMap((session) => session.skills[name]);
    return [name, { invocations: durations.length, duration: summarizeDurations(durations) }];
  }));
  const assessment = assess(included, limitExceeded);
  return {
    schemaVersion: 1,
    status: "pass",
    repository: {
      realPathDigest: digest(repository),
      commonDirectoryDigest: digest(commonDirectory),
    },
    period: {
      fromInclusive: new Date(options.fromMs).toISOString(),
      toExclusive: new Date(options.toExclusiveMs).toISOString(),
      localFrom: options.from,
      localTo: options.to,
      timezone: options.timezone,
    },
    sourceCoverage: {
      discoveredFiles: discovery.discoveredFiles,
      candidateFiles: candidates.length,
      scannedFiles: files.length,
      includedSessions: included.length,
      sourceLimit: maxSessions,
      fileByteLimit: maxSessionBytes,
      candidateBytes: discovery.candidateBytes,
      enumeratedEntries: discovery.enumeratedEntries,
      sourceIssuesEncountered: discovery.issueCount,
      discoveryLimits: discoveryLimits,
      processingLimits,
      limitReasons: [...new Set([...discovery.limitReasons, ...processingLimitReasons])].sort(),
      sourceIssues,
    },
    sessions: {
      included: included.map(({ id, eventRange, completedTurns, telemetryComplete, dataQuality }) => ({ id, eventRange, completedTurns, telemetryComplete, dataQuality })),
      provisional,
      excluded,
      unsupported,
    },
    skills,
    operations: aggregateMetrics,
    evidence: included.flatMap(({ id, evidence }) => evidence.map((item) => ({ sessionId: id, ...item }))),
    dataQuality: {
      requiredMetricCoverage: included.length > 0 && included.every(({ telemetryComplete }) => telemetryComplete) ? "complete" : "incomplete",
      metricCoverage: Object.fromEntries(
        metricCoverageNames.map((name) => [
          name,
          included.length > 0 && included.every((session) => session.metricCoverage[name] === "confirmed")
            ? "confirmed"
            : "未確認",
        ]),
      ),
      limitExceeded,
    },
    assessment,
  };
}

async function runCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  now = new Date(),
  discoveryLimits,
  processingLimits,
  discoveryHooks,
} = {}) {
  const options = parseArguments(argv, now);
  const result = await analyzeSessions(options, { discoveryLimits, processingLimits, discoveryHooks });
  stdout.write(`${JSON.stringify(result)}\n`);
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
    const code = error instanceof AuditError ? error.code : "WPA_UNEXPECTED_ERROR";
    process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "error", error: { code } })}\n`);
    process.exitCode = 1;
  });
}

export {
  AuditError,
  analyzeSessions,
  classifyCommand,
  parseArguments,
  runCli,
  scanSessionFile,
  zonedMidnight,
};
