import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, open as openFile, readFile, readdir, realpath, rename, rm, stat, symlink, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const analyzerPromise = import(pathToFileURL(path.resolve(
  import.meta.dirname,
  "../.agents/skills/workflow-performance-audit/scripts/analyze-sessions.mjs",
)).href);

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function fixtureSessionId(label: string) {
  if (canonicalUuidPattern.test(label)) return label;
  const value = createHash("sha256").update(label).digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-7${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function canonicalizeSessionMeta(record: Record<string, unknown>) {
  if (record.type !== "session_meta") return record;
  const payload = record.payload as Record<string, unknown> | undefined;
  if (!payload) return record;
  const nextPayload = { ...payload };
  if (typeof nextPayload.id === "string") nextPayload.id = fixtureSessionId(nextPayload.id);
  if (typeof nextPayload.session_id === "string") nextPayload.session_id = fixtureSessionId(nextPayload.session_id);
  if (typeof nextPayload.parent_thread_id === "string") {
    nextPayload.parent_thread_id = fixtureSessionId(nextPayload.parent_thread_id);
  }
  return { ...record, payload: nextPayload };
}

async function createFixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "workflow-performance-audit-")));
  const repository = path.join(root, "repository");
  const sessions = path.join(root, "sessions");
  const archived = path.join(root, "archived");
  await Promise.all([
    mkdir(repository),
    mkdir(sessions),
    mkdir(archived),
  ]);
  await execFileAsync("git", ["init", "-q", repository]);
  await writeFile(path.join(repository, "README.md"), "fixture\n");
  await execFileAsync("git", ["-C", repository, "add", "README.md"]);
  await execFileAsync("git", ["-C", repository, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  return { root, repository, sessions, archived };
}

function sessionRecords({
  id,
  cwd,
  timestamp,
  skill = "plan",
  commands = [],
  complete = true,
  invalidSchema = false,
  p0 = false,
  failureCode,
  mcpCalls = [],
  omitCommandDuration = false,
  userText,
}: {
  id: string;
  cwd: string;
  timestamp: string;
  skill?: string;
  commands?: Array<string | { text: string; status?: string; exitCode?: number }>;
  complete?: boolean;
  invalidSchema?: boolean;
  p0?: boolean;
  failureCode?: string;
  mcpCalls?: Array<{ server: string; tool: string }>;
  omitCommandDuration?: boolean;
  userText?: string;
}) {
  let ordinal = 0;
  const at = (offset: number) => new Date(Date.parse(timestamp) + offset).toISOString();
  const records: Array<Record<string, unknown>> = [
    { timestamp: at(0), ordinal: ordinal++, type: "session_meta", payload: { id: fixtureSessionId(id), cwd } },
    { timestamp: at(1_000), ordinal: ordinal++, type: "event_msg", payload: { type: "task_started", turn_id: "turn-1", started_at: at(1_000) } },
    {
      timestamp: at(2_000),
      ordinal: ordinal++,
      type: "event_msg",
      payload: {
        type: "item_completed",
        turn_id: "turn-1",
        started_at_ms: Date.parse(at(2_000)),
        completed_at_ms: Date.parse(at(2_001)),
        item: { type: "UserMessage", content: [{ text: userText ?? `$${skill}` }] },
      },
    },
  ];
  commands.forEach((commandInput, index) => {
    const command = typeof commandInput === "string" ? commandInput : commandInput.text;
    const status = typeof commandInput === "string" ? "completed" : commandInput.status ?? "completed";
    const exitCode = typeof commandInput === "string" ? 0 : commandInput.exitCode ?? 0;
    const start = 3_000 + index * 1_000;
    const callId = `call-command-${index}`;
    records.push({
      timestamp: at(start),
      ordinal: ordinal++,
      type: "response_item",
      payload: { type: "custom_tool_call", call_id: callId, id: `ctc-command-${index}`, name: "exec" },
    });
    records.push({
      timestamp: at(start + 100),
      ordinal: ordinal++,
      type: "event_msg",
      payload: {
        type: "item_completed",
        turn_id: "turn-1",
        ...(!omitCommandDuration ? {
          started_at_ms: Date.parse(at(start + 100)),
          completed_at_ms: Date.parse(at(start + 350)),
        } : {}),
        item: {
          type: "CommandExecution",
          id: `exec-command-${index}`,
          command,
          status,
          exit_code: exitCode,
          ...(!omitCommandDuration ? { duration: { secs: 0, nanos: 250_000_000 } } : {}),
        },
      },
    });
    records.push({
      timestamp: at(start + 400),
      ordinal: ordinal++,
      type: "response_item",
      payload: { type: "custom_tool_call_output", call_id: callId, id: `ctco-command-${index}`, output: "redacted" },
    });
  });
  mcpCalls.forEach(({ server, tool }, index) => {
    const start = 6_000 + index * 500;
    const callId = `call-mcp-${index}`;
    records.push({
      timestamp: at(start),
      ordinal: ordinal++,
      type: "response_item",
      payload: { type: "function_call", call_id: callId, id: `fc-mcp-${index}`, namespace: `mcp__${server}`, name: tool },
    });
    records.push({
      timestamp: at(start + 100),
      ordinal: ordinal++,
      type: "event_msg",
      payload: {
        type: "item_completed",
        turn_id: "turn-1",
        started_at_ms: Date.parse(at(start + 100)),
        completed_at_ms: Date.parse(at(start + 300)),
        item: {
          type: "McpToolCall",
          id: callId,
          server,
          tool,
          status: "completed",
          duration: { secs: 0, nanos: 200_000_000 },
        },
      },
    });
    records.push({
      timestamp: at(start + 350),
      ordinal: ordinal++,
      type: "response_item",
      payload: { type: "function_call_output", call_id: callId, id: `fco-mcp-${index}`, output: "redacted" },
    });
  });
  if (p0 || failureCode) {
    records.push({
      timestamp: at(8_000),
      ordinal: ordinal++,
      type: "event_msg",
      payload: {
        type: "task_failed",
        turn_id: "turn-1",
        code: failureCode ?? "WORKFLOW_PROGRESS_STOP",
        started_at: at(1_000),
        completed_at: at(8_000),
        duration_ms: 7_000,
      },
    });
  }
  if (invalidSchema) records.push({ timestamp: at(8_500), ordinal: ordinal++, type: "future_record", payload: {} });
  if (complete && !p0 && !failureCode) {
    records.push({
      timestamp: at(10_000),
      ordinal: ordinal++,
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn-1",
        started_at: at(1_000),
        completed_at: at(10_000),
        duration_ms: 9_000,
      },
    });
  }
  return records;
}

async function writeSession(root: string, input: Parameters<typeof sessionRecords>[0], { truncated = false } = {}) {
  const file = path.join(root, `rollout-2026-09-02T00-00-00-${input.id}.jsonl`);
  const body = sessionRecords(input).map((record) => JSON.stringify(record)).join("\n");
  await writeFile(file, `${body}\n${truncated ? "{truncated\n" : ""}`);
}

async function writeRecords(
  root: string,
  id: string,
  records: Array<Record<string, unknown>>,
  fileId = id,
  filenameDate = "2026-09-02",
) {
  const file = path.join(root, `rollout-${filenameDate}T00-00-00-${fileId}.jsonl`);
  await writeFile(file, `${records.map((record) => JSON.stringify(canonicalizeSessionMeta(record))).join("\n")}\n`);
  return file;
}

async function writeRawRecords(root: string, fileId: string, records: Array<Record<string, unknown>>) {
  const file = path.join(root, `rollout-2026-09-02T00-00-00-${fileId}.jsonl`);
  await writeFile(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return file;
}

async function audit(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  excludedIds: string[] = [],
  discoveryLimits?: { entries: number; depth: number; issues: number },
  processingLimits?: {
    fileBytes: number;
    totalSourceBytes: number;
    recordsPerFile: number;
    bytesPerRecord: number;
    trackedToolCalls: number;
    trackedTurns: number;
    distinctCommands: number;
    retainedStringBytes: number;
  },
  discoveryHooks?: {
    beforeDirectoryOpen?(input: { root: string; rootAnchor: string; depth: number }): Promise<void>;
    beforeFileInspect?(input: { target: string; rootAnchor: string; depth: number }): Promise<void>;
  },
) {
  const { runCli } = await analyzerPromise;
  let stdout = "";
  const argv = [
    "--repository", fixture.repository,
    "--from", "2026-09-01",
    "--to", "2026-09-04",
    "--timezone", "Asia/Tokyo",
    "--sessions-root", fixture.sessions,
    "--archived-root", fixture.archived,
    ...excludedIds.flatMap((id) => ["--exclude-session-id", fixtureSessionId(id)]),
  ];
  const result = await runCli({
    argv,
    stdout: { write(value: string) { stdout += value; } } as NodeJS.WriteStream,
    now: new Date("2026-09-04T03:00:00.000Z"),
    discoveryLimits,
    processingLimits,
    discoveryHooks,
  });
  return { result, stdout };
}

function processingLimits(overrides: Partial<{
  fileBytes: number;
  totalSourceBytes: number;
  recordsPerFile: number;
  bytesPerRecord: number;
  trackedToolCalls: number;
  trackedTurns: number;
  distinctCommands: number;
  retainedStringBytes: number;
}> = {}) {
  return {
    fileBytes: 512 * 1024 * 1024,
    totalSourceBytes: 100 * 1024 * 1024,
    recordsPerFile: 1_000,
    bytesPerRecord: 1024 * 1024,
    trackedToolCalls: 1_000,
    trackedTurns: 1_000,
    distinctCommands: 1_000,
    retainedStringBytes: 1_024,
    ...overrides,
  };
}

test("WPA-00 実rolloutのresponse_item・item_completed schemaを解析する", async () => {
  const fixture = await createFixture();
  for (const [index, id] of ["real-schema-a", "real-schema-b"].entries()) {
    const turnId = `turn-${index}`;
    const start = 1_788_400_000 + index * 60;
    await writeRecords(fixture.sessions, id, [
      { timestamp: `2026-09-02T0${index + 1}:00:00.000Z`, ordinal: 0, type: "session_meta", payload: { id, cwd: fixture.repository, thread_source: "root" } },
      { timestamp: `2026-09-02T0${index + 1}:00:01.000Z`, ordinal: 1, type: "event_msg", payload: { type: "task_started", turn_id: turnId, started_at: start } },
      {
        timestamp: `2026-09-02T0${index + 1}:00:02.000Z`, ordinal: 2, type: "response_item",
        payload: {
          type: "message", role: "user", content: [{ type: "input_text", text: "[$plan](/fixture/plan/SKILL.md)" }],
          internal_chat_message_metadata_passthrough: { turn_id: turnId },
        },
      },
      {
        timestamp: `2026-09-02T0${index + 1}:00:02.500Z`, ordinal: 3, type: "response_item",
        payload: { type: "custom_tool_call", id: `ctc-real-${index}`, call_id: `call-real-${index}`, name: "exec" },
      },
      {
        timestamp: `2026-09-02T0${index + 1}:00:03.000Z`, ordinal: 4, type: "event_msg",
        payload: {
          type: "item_completed", turn_id: turnId, started_at_ms: start * 1000 + 2_000, completed_at_ms: start * 1000 + 2_250,
          item: { type: "CommandExecution", id: `exec-real-${index}`, command: `node --test test/real-${index}.test.ts`, status: "completed", exit_code: 0 },
        },
      },
      {
        timestamp: `2026-09-02T0${index + 1}:00:03.500Z`, ordinal: 5, type: "response_item",
        payload: { type: "custom_tool_call_output", id: `ctco-real-${index}`, call_id: `call-real-${index}`, output: "redacted" },
      },
      {
        timestamp: `2026-09-02T0${index + 1}:00:03.750Z`, ordinal: 6, type: "response_item",
        payload: { type: "custom_tool_call", id: `ctc-web-${index}`, call_id: `call-web-${index}`, name: "exec" },
      },
      {
        timestamp: `2026-09-02T0${index + 1}:00:04.000Z`, ordinal: 7, type: "event_msg",
        payload: {
          type: "item_completed", turn_id: turnId, started_at_ms: start * 1000 + 3_000, completed_at_ms: start * 1000 + 3_200,
          item: { type: "Extension", id: `exec-web-${index}`, kind: "web.search", action: "search", results: [] },
        },
      },
      {
        timestamp: `2026-09-02T0${index + 1}:00:04.500Z`, ordinal: 8, type: "response_item",
        payload: { type: "custom_tool_call_output", id: `ctco-web-${index}`, call_id: `call-web-${index}`, output: "redacted" },
      },
      { timestamp: `2026-09-02T0${index + 1}:00:10.000Z`, ordinal: 9, type: "event_msg", payload: { type: "task_complete", turn_id: turnId, started_at: start, completed_at: start + 10, duration_ms: 10_000 } },
    ]);
  }
  const { result, stdout } = await audit(fixture);
  assert.equal(stdout.trim().split("\n").length, 1, "stdout is compact one-line JSON");
  assert.equal(result.assessment.verdict, "ボトルネックなし");
  assert.equal(result.skills.plan.invocations, 2);
  assert.deepEqual(result.skills.plan.duration.rangeMs, [10_000, 10_000]);
  assert.equal(result.operations.commands, 2);
  assert.equal(result.operations.mcpOperations, 2);
  assert.equal(result.dataQuality.requiredMetricCoverage, "complete");
  for (const evidence of result.evidence) {
    for (const locator of evidence.locators) {
      if (locator.timestamp !== undefined) {
        assert.match(locator.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
      }
    }
  }
});

test("WPA-00e skill名への文中言及を明示呼び出しとして数えない", async () => {
  const fixture = await createFixture();
  await writeSession(fixture.sessions, {
    id: "explicit-skill",
    cwd: fixture.repository,
    timestamp: "2026-09-02T02:05:00.000Z",
    userText: "[$plan](/fixture/plan/SKILL.md) 計画してください",
  });
  await writeSession(fixture.sessions, {
    id: "mentioned-skill",
    cwd: fixture.repository,
    timestamp: "2026-09-02T02:10:00.000Z",
    userText: "この説明は $implement に言及するだけです",
  });
  const { result } = await audit(fixture);
  assert.equal(result.skills.plan.invocations, 1);
  assert.equal(result.skills.implement.invocations, 0);
});

test("WPA-00a response tool callとcompleted itemの不足・余剰を判定不能にする", async () => {
  const fixture = await createFixture();
  const missing = sessionRecords({
    id: "tool-item-missing",
    cwd: fixture.repository,
    timestamp: "2026-09-02T02:15:00.000Z",
    commands: ["git status --short", "npm test"],
  }).filter((record) => {
    const item = (record.payload as { item?: { id?: string } } | undefined)?.item;
    return item?.id !== "exec-command-1";
  });
  const surplus = sessionRecords({
    id: "tool-item-surplus",
    cwd: fixture.repository,
    timestamp: "2026-09-02T02:20:00.000Z",
    commands: ["git status --short"],
  });
  surplus.splice(-1, 0, {
    timestamp: "2026-09-02T02:20:08.000Z",
    ordinal: 999,
    type: "event_msg",
    payload: {
      type: "item_completed",
      turn_id: "turn-1",
      item: {
        type: "CommandExecution",
        id: "exec-unmatched",
        command: "npm test",
        status: "completed",
        exit_code: 0,
        duration: { secs: 1, nanos: 0 },
      },
    },
  });
  await writeRecords(fixture.sessions, "tool-item-missing", missing);
  await writeRecords(fixture.sessions, "tool-item-surplus", surplus);

  const { result } = await audit(fixture);
  assert.equal(result.sessions.included.length, 2);
  assert.equal(result.assessment.verdict, "判定不能");
  assert.equal(result.dataQuality.requiredMetricCoverage, "incomplete");
  for (const name of ["toolKind", "toolResult", "toolDuration", "commandCategory", "browserCategory", "validationCategory"]) {
    assert.equal(result.dataQuality.metricCoverage[name], "未確認");
  }
});

test("WPA-00aa 古い開始日filenameでも期間内eventを持つsegmentを解析する", async () => {
  const fixture = await createFixture();
  for (const id of ["continued-a", "continued-b"]) {
    await writeRecords(
      fixture.sessions,
      id,
      sessionRecords({
        id,
        cwd: fixture.repository,
        timestamp: "2026-09-02T02:25:00.000Z",
        commands: [`node --test test/${id}.test.ts`],
      }),
      id,
      "2026-08-20",
    );
  }
  const { result } = await audit(fixture);
  assert.equal(result.sourceCoverage.candidateFiles, 2);
  assert.equal(result.sessions.included.length, 2);
  assert.equal(result.assessment.verdict, "ボトルネックなし");
});

test("WPA-00ab 一回のrecord stream中にsourceが変化したら除外する", async () => {
  const fixture = await createFixture();
  const records = sessionRecords({
    id: "changing-source",
    cwd: fixture.repository,
    timestamp: "2026-09-02T02:30:00.000Z",
    commands: ["git status --short"],
  });
  const filler = Array.from({ length: 40_000 }, (_, index) => ({
    timestamp: "2026-09-02T02:30:05.000Z",
    ordinal: 10_000 + index,
    type: "event_msg",
    payload: { type: "token_count", marker: "A" },
  }));
  const file = await writeRecords(fixture.sessions, "changing-source", [...records, ...filler]);
  const { scanSessionFile } = await analyzerPromise;
  const originalMetadata = await stat(file);
  const body = await readFile(file, "utf8");
  const markerOffset = body.indexOf('"marker":"A"') + '"marker":"'.length;
  assert.ok(markerOffset > 0);
  const writer = await openFile(file, "r+");
  let completed = false;
  const scan = scanSessionFile(file).finally(() => { completed = true; });
  const mutate = (async () => {
    for (let attempt = 0; attempt < 100 && !completed; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      await writer.write(attempt % 2 === 0 ? "B" : "A", markerOffset);
      await utimes(file, originalMetadata.atime, originalMetadata.mtime);
    }
    await writer.close();
  })();
  const result = await scan;
  await mutate;
  assert.equal(result.status, "changed");
  assert.equal(result.reason, "source-changed-during-scan");
});

test("WPA-00aba stable snapshotのcontent digestを一回のstreamから再現する", async () => {
  const fixture = await createFixture();
  const file = await writeRecords(fixture.sessions, "stable-digest", sessionRecords({
    id: "stable-digest",
    cwd: fixture.repository,
    timestamp: "2026-09-02T02:32:00.000Z",
    commands: ["git status --short"],
  }));
  const { scanSessionFile } = await analyzerPromise;
  const first = await scanSessionFile(file);
  const second = await scanSessionFile(file);
  assert.equal(first.status, "scanned");
  assert.equal(second.status, "scanned");
  assert.equal(first.fileDigest, second.fileDigest);

  await appendFile(file, "\n");
  const modified = await scanSessionFile(file);
  assert.equal(modified.status, "scanned");
  assert.notEqual(modified.fileDigest, first.fileDigest);
});

test("WPA-00ac tool照合が未確認でも独立した確定P0を優先する", async () => {
  const fixture = await createFixture();
  const records = sessionRecords({
    id: "confirmed-p0-with-tool-gap",
    cwd: fixture.repository,
    timestamp: "2026-09-02T02:35:00.000Z",
    commands: ["git status --short"],
    p0: true,
  }).filter((record) => {
    const item = (record.payload as { item?: { id?: string } } | undefined)?.item;
    return item?.id !== "exec-command-0";
  });
  await writeRecords(fixture.sessions, "confirmed-p0-with-tool-gap", records);
  const { result } = await audit(fixture);
  assert.equal(result.dataQuality.metricCoverage.toolKind, "未確認");
  assert.equal(result.assessment.verdict, "ボトルネックあり");
  assert.equal(result.assessment.candidates[0].priority, "P0");
});

test("WPA-00b 未対応のmetric-bearing event schemaをボトルネックなしにしない", async () => {
  const fixture = await createFixture();
  for (const id of ["unsupported-a", "unsupported-b"]) {
    const records = sessionRecords({
      id,
      cwd: fixture.repository,
      timestamp: "2026-09-02T03:00:00.000Z",
      commands: [`node --test test/${id}.test.ts`],
    });
    records.splice(-1, 0, {
      timestamp: "2026-09-02T03:00:09.000Z",
      ordinal: 99,
      type: "event_msg",
      payload: { type: id.endsWith("a") ? "user_message" : "exec_command_end" },
    });
    await writeRecords(fixture.sessions, id, records);
  }
  const { result } = await audit(fixture);
  assert.equal(result.assessment.verdict, "判定不能");
  assert.equal(result.dataQuality.requiredMetricCoverage, "incomplete");
});

test("WPA-00c subagentのfork履歴をroot session競合として扱わない", async () => {
  const fixture = await createFixture();
  for (const id of ["root-a", "root-b"]) {
    await writeSession(fixture.sessions, {
      id,
      cwd: fixture.repository,
      timestamp: "2026-09-02T04:00:00.000Z",
      commands: [`node --test test/${id}.test.ts`],
    });
  }
  await writeRecords(fixture.sessions, "child", [
    {
      timestamp: "2026-09-02T04:10:00.000Z", ordinal: 0, type: "session_meta",
      payload: {
        id: "child", cwd: fixture.repository, thread_source: "subagent", parent_thread_id: "root-a",
        subagent_history_start_ordinal: 2, source: { subagent: { thread_spawn: { parent_thread_id: "root-a" } } },
      },
    },
    { timestamp: "2026-09-02T04:00:00.000Z", ordinal: 1, type: "session_meta", payload: { id: "root-a", cwd: fixture.repository } },
    { timestamp: "2026-09-02T04:00:01.000Z", ordinal: 2, type: "event_msg", payload: { type: "task_started", turn_id: "inherited", started_at: 1_788_400_000 } },
    { timestamp: "2026-09-02T04:10:01.000Z", ordinal: 3, type: "event_msg", payload: { type: "task_started", turn_id: "child-turn", started_at: 1_788_400_600 } },
    { timestamp: "2026-09-02T04:10:02.000Z", ordinal: 4, type: "event_msg", payload: { type: "item_completed", turn_id: "child-turn", item: { type: "UserMessage", content: [{ text: "delegated task" }] } } },
    { timestamp: "2026-09-02T04:10:10.000Z", ordinal: 5, type: "event_msg", payload: { type: "task_complete", turn_id: "child-turn", duration_ms: 9_000 } },
  ]);
  const { result } = await audit(fixture);
  assert.equal(result.assessment.verdict, "ボトルネックなし");
  assert.ok(result.sessions.excluded.some(({ id, reason }: { id?: string; reason: string }) => id === fixtureSessionId("child") && reason === "internal-subagent-session"));
});

test("WPA-00d 同一root taskの非重複rollout segmentを一つのsessionへ統合する", async () => {
  const fixture = await createFixture();
  const first = sessionRecords({
    id: "segmented-root",
    cwd: fixture.repository,
    timestamp: "2026-09-02T05:00:00.000Z",
    skill: "plan",
    commands: ["npm test"],
  });
  const second = sessionRecords({
    id: "segmented-root",
    cwd: fixture.repository,
    timestamp: "2026-09-02T06:00:00.000Z",
    skill: "implement",
    commands: ["npm test"],
  });
  for (const record of second) {
    const payload = record.payload as { turn_id?: string } | undefined;
    if (payload?.turn_id === "turn-1") payload.turn_id = "turn-2";
  }
  await writeRecords(fixture.sessions, "segmented-root", first, "segmented-root-part-1");
  await writeRecords(fixture.sessions, "segmented-root", second, "segmented-root-part-2");
  const { result } = await audit(fixture);
  assert.equal(result.sessions.included.length, 1);
  assert.equal(result.operations.fullTests, 2);
  assert.equal(result.skills.plan.invocations, 1);
  assert.equal(result.skills.implement.invocations, 1);
  assert.ok(result.evidence.some(({ category }: { category: string }) => category === "repeated-full-test"));
});

test("WPA-01 複数sessionの再発operationだけをボトルネック候補にする", async () => {
  const fixture = await createFixture();
  for (const [id, skill] of [["session-a", "plan"], ["session-b", "implement"]]) {
    await writeSession(fixture.sessions, {
      id,
      cwd: fixture.repository,
      timestamp: "2026-09-02T01:00:00.000Z",
      skill,
      commands: ["npm test", "npm test", "sleep 30"],
      mcpCalls: [{ server: "cua_repl", tool: "js" }],
    });
  }
  const { result } = await audit(fixture);
  assert.equal(result.assessment.verdict, "ボトルネックあり");
  assert.ok(result.assessment.candidates.length >= 1 && result.assessment.candidates.length <= 3);
  assert.equal(result.sessions.included.length, 2);
  assert.equal(result.operations.fullTests, 4);
  assert.equal(result.operations.fixedSleeps, 2);
  assert.equal(result.operations.mcpOperations, 2);
  assert.equal(result.operations.browserOperations, 2);
  assert.equal(result.skills.plan.invocations, 1);
  assert.equal(result.skills.implement.invocations, 1);
  assert.deepEqual(result.skills.plan.duration.rangeMs, [9_000, 9_000]);
});

test("WPA-02 必要な検証だけの比較可能sessionでは改善案を捏造しない", async () => {
  const fixture = await createFixture();
  for (const id of ["session-clean-a", "session-clean-b"]) {
    await writeSession(fixture.sessions, {
      id,
      cwd: fixture.repository,
      timestamp: "2026-09-02T02:00:00.000Z",
      commands: [`node --test test/${id}.test.ts`],
    });
  }
  const { result } = await audit(fixture);
  assert.equal(result.assessment.verdict, "ボトルネックなし");
  assert.deepEqual(result.assessment.candidates, []);
  assert.equal(result.assessment.recommendation, "改善提案なし・現行workflowを変更しない");

  const duplicateFixture = await createFixture();
  for (const id of ["duplicate-clean-a", "duplicate-clean-b"]) {
    await writeSession(duplicateFixture.sessions, {
      id,
      cwd: duplicateFixture.repository,
      timestamp: "2026-09-02T02:30:00.000Z",
      commands: ["git status --short", "git status --short"],
    });
  }
  const duplicateResult = await audit(duplicateFixture);
  assert.equal(duplicateResult.result.operations.duplicateCommands, 2);
  assert.equal(duplicateResult.result.assessment.verdict, "ボトルネックなし");
  assert.deepEqual(duplicateResult.result.assessment.candidates, []);

  const requiredRetryFixture = await createFixture();
  for (const id of ["required-retry-a", "required-retry-b"]) {
    await writeSession(requiredRetryFixture.sessions, {
      id,
      cwd: requiredRetryFixture.repository,
      timestamp: "2026-09-02T02:40:00.000Z",
      commands: [
        { text: "npm test", status: "failed", exitCode: 1 },
        { text: "npm test" },
      ],
    });
  }
  const requiredRetry = await audit(requiredRetryFixture);
  assert.equal(requiredRetry.result.operations.fullTests, 4);
  assert.equal(requiredRetry.result.operations.commandFailures, 2);
  assert.equal(requiredRetry.result.assessment.verdict, "ボトルネックなし");
  assert.deepEqual(requiredRetry.result.assessment.candidates, []);
});

test("WPA-03 証拠不足・active除外・unknown schema・P0優先を区別する", async (context) => {
  await context.test("対象0件は判定不能", async () => {
    const fixture = await createFixture();
    const { result } = await audit(fixture);
    assert.equal(result.assessment.verdict, "判定不能");
  });
  await context.test("activeを除外しても完了2件があれば判定できる", async () => {
    const fixture = await createFixture();
    for (const id of ["complete-a", "complete-b"]) {
      await writeSession(fixture.sessions, { id, cwd: fixture.repository, timestamp: "2026-09-02T03:00:00.000Z", commands: [`node --test test/${id}.test.ts`] });
    }
    await writeSession(fixture.sessions, { id: "active", cwd: fixture.repository, timestamp: "2026-09-02T03:00:00.000Z", complete: false });
    const { result } = await audit(fixture, ["active"]);
    assert.equal(result.assessment.verdict, "ボトルネックなし");
    assert.equal(result.sessions.provisional[0].id, fixtureSessionId("active"));
  });
  await context.test("truncatedまたはunknown schemaは判定不能", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessions, { id: "truncated", cwd: fixture.repository, timestamp: "2026-09-02T04:00:00.000Z" }, { truncated: true });
    await writeSession(fixture.sessions, { id: "unknown", cwd: fixture.repository, timestamp: "2026-09-02T04:00:00.000Z", invalidSchema: true });
    const { result } = await audit(fixture);
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.requiredMetricCoverage, "incomplete");
  });
  await context.test("明示的なprogress-stop P0は単一sessionでも優先する", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessions, { id: "p0", cwd: fixture.repository, timestamp: "2026-09-02T05:00:00.000Z", p0: true });
    const { result } = await audit(fixture);
    assert.equal(result.assessment.verdict, "ボトルネックあり");
    assert.equal(result.assessment.candidates[0].priority, "P0");
  });
  await context.test("generic failureや不完全telemetryをP0へ昇格しない", async () => {
    const generic = await createFixture();
    await writeSession(generic.sessions, {
      id: "generic-failure",
      cwd: generic.repository,
      timestamp: "2026-09-02T05:10:00.000Z",
      failureCode: "UNRELATED_FAILURE",
    });
    assert.equal((await audit(generic)).result.assessment.verdict, "判定不能");

    const incomplete = await createFixture();
    await writeSession(incomplete.sessions, {
      id: "incomplete-p0",
      cwd: incomplete.repository,
      timestamp: "2026-09-02T05:20:00.000Z",
      p0: true,
      invalidSchema: true,
    });
    assert.equal((await audit(incomplete)).result.assessment.verdict, "判定不能");
  });
  await context.test("欠落telemetryをmetric単位の未確認として返す", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessions, {
      id: "missing-command-duration",
      cwd: fixture.repository,
      timestamp: "2026-09-02T05:30:00.000Z",
      commands: ["npm test"],
      omitCommandDuration: true,
    });
    const { result } = await audit(fixture);
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.metricCoverage.toolDuration, "未確認");
    assert.equal(result.dataQuality.metricCoverage.commandCategory, "confirmed");
    assert.equal(result.sessions.included[0].dataQuality.metricCoverage.toolDuration, "未確認");
  });
});

test("WPA-04 raw transcript・command・secretを出力せずrepositoryを変更しない", async () => {
  const fixture = await createFixture();
  const secrets = ["Bearer-SUPER-SECRET", "resident@example.invalid"];
  await writeSession(fixture.sessions, {
    id: "private-a",
    cwd: fixture.repository,
    timestamp: "2026-09-02T06:00:00.000Z",
    commands: [`node --test test/a.test.ts --token=${secrets[0]}`],
  });
  await writeSession(fixture.sessions, {
    id: "private-b",
    cwd: fixture.repository,
    timestamp: "2026-09-02T07:00:00.000Z",
    commands: [`node --test test/b.test.ts --email=${secrets[1]}`],
  });
  const before = await execFileAsync("git", ["-C", fixture.repository, "status", "--porcelain=v1"]);
  const { stdout } = await audit(fixture);
  const after = await execFileAsync("git", ["-C", fixture.repository, "status", "--porcelain=v1"]);
  assert.equal(after.stdout, before.stdout);
  for (const secret of secrets) assert.doesNotMatch(stdout, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  assert.doesNotMatch(stdout, /node --test|--token|--email/u);
  const parsed = JSON.parse(stdout);
  assert.match(parsed.repository.realPathDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(parsed.repository.commonDirectoryDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("WPA-04a 不正session IDと過長retained stringをraw出力せず拒否する", async (context) => {
  const cases = [
    {
      name: "secret-like session ID",
      reason: "session-id-format-limit",
      rawValue: "Bearer-SESSION-ID-SECRET@example.invalid",
      records: (fixture: Awaited<ReturnType<typeof createFixture>>, rawValue: string) => [
        { timestamp: "2026-09-02T06:10:00.000Z", ordinal: 0, type: "session_meta", payload: { id: rawValue, cwd: fixture.repository } },
      ],
    },
    {
      name: "cwd",
      reason: "cwd-string-limit",
      rawValue: `CWD_SECRET_${"x".repeat(512)}`,
      records: (_fixture: Awaited<ReturnType<typeof createFixture>>, rawValue: string) => [
        { timestamp: "2026-09-02T06:20:00.000Z", ordinal: 0, type: "session_meta", payload: { id: fixtureSessionId("long-cwd"), cwd: rawValue } },
      ],
    },
    {
      name: "parent_thread_id",
      reason: "parent-thread-id-string-limit",
      rawValue: `PARENT_SECRET_${"x".repeat(512)}`,
      records: (fixture: Awaited<ReturnType<typeof createFixture>>, rawValue: string) => [
        { timestamp: "2026-09-02T06:30:00.000Z", ordinal: 0, type: "session_meta", payload: { id: fixtureSessionId("long-parent"), cwd: fixture.repository, parent_thread_id: rawValue } },
      ],
    },
    {
      name: "turn_id",
      reason: "turn-id-string-limit",
      rawValue: `TURN_SECRET_${"x".repeat(512)}`,
      records: (fixture: Awaited<ReturnType<typeof createFixture>>, rawValue: string) => [
        { timestamp: "2026-09-02T06:40:00.000Z", ordinal: 0, type: "session_meta", payload: { id: fixtureSessionId("long-turn"), cwd: fixture.repository } },
        { timestamp: "2026-09-02T06:40:01.000Z", ordinal: 1, type: "event_msg", payload: { type: "task_started", turn_id: rawValue, started_at: "2026-09-02T06:40:01.000Z" } },
      ],
    },
    {
      name: "call_id",
      reason: "call-id-string-limit",
      rawValue: `CALL_SECRET_${"x".repeat(512)}`,
      records: (fixture: Awaited<ReturnType<typeof createFixture>>, rawValue: string) => [
        { timestamp: "2026-09-02T06:50:00.000Z", ordinal: 0, type: "session_meta", payload: { id: fixtureSessionId("long-call"), cwd: fixture.repository } },
        { timestamp: "2026-09-02T06:50:01.000Z", ordinal: 1, type: "response_item", payload: { type: "custom_tool_call", call_id: rawValue, name: "exec" } },
      ],
    },
    {
      name: "tool kind/name/server",
      reason: "tool-kind-string-limit",
      rawValue: `TOOL_SECRET_${"x".repeat(512)}`,
      records: (fixture: Awaited<ReturnType<typeof createFixture>>, rawValue: string) => [
        { timestamp: "2026-09-02T07:00:00.000Z", ordinal: 0, type: "session_meta", payload: { id: fixtureSessionId("long-tool-kind"), cwd: fixture.repository } },
        { timestamp: "2026-09-02T07:00:01.000Z", ordinal: 1, type: "response_item", payload: { type: "custom_tool_call", call_id: "bounded-call", name: rawValue } },
      ],
    },
    {
      name: "timestamp",
      reason: "timestamp-format-limit",
      rawValue: `2026-09-02T07:10:01.000Z_TIMESTAMP_SECRET_${"x".repeat(512)}`,
      records: (fixture: Awaited<ReturnType<typeof createFixture>>, rawValue: string) => [
        { timestamp: "2026-09-02T07:10:00.000Z", ordinal: 0, type: "session_meta", payload: { id: fixtureSessionId("long-timestamp"), cwd: fixture.repository } },
        { timestamp: rawValue, ordinal: 1, type: "event_msg", payload: { type: "task_failed", turn_id: "turn-1", code: "WORKFLOW_PROGRESS_STOP", duration_ms: 1 } },
      ],
    },
  ];

  for (const fixtureCase of cases) {
    await context.test(fixtureCase.name, async () => {
      const fixture = await createFixture();
      await writeRawRecords(fixture.sessions, `privacy-${fixtureCase.name.replace(/[^a-z]+/giu, "-")}`, fixtureCase.records(fixture, fixtureCase.rawValue));
      const { result, stdout } = await audit(
        fixture,
        [],
        undefined,
        processingLimits({ retainedStringBytes: 128 }),
      );
      assert.equal(result.assessment.verdict, "判定不能");
      assert.deepEqual(result.assessment.candidates, []);
      assert.equal(result.dataQuality.limitExceeded, true);
      assert.deepEqual(result.sourceCoverage.limitReasons, [fixtureCase.reason]);
      assert.equal(stdout.includes(fixtureCase.rawValue), false);
    });
  }
});

test("WPA-05 retrospective契約を維持し、期間監査を標準flowへ自動追加しない", async () => {
  const skillRoot = path.resolve(import.meta.dirname, "../.agents/skills/workflow-performance-audit");
  const entries: string[] = [];
  const visit = async (directory: string, relative = "") => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), next);
      else entries.push(next);
    }
  };
  await visit(skillRoot);
  assert.deepEqual(entries.sort(), ["SKILL.md", "agents/openai.yaml", "scripts/analyze-sessions.mjs"]);
  const retrospective = await readFile(path.resolve(import.meta.dirname, "../.agents/skills/workflow-retrospective/SKILL.md"), "utf8");
  assert.match(retrospective, /## Audit mode/u);
  assert.match(retrospective, /## Apply mode/u);
  assert.match(retrospective, /Do not apply a candidate in the initial audit/u);
  const workflow = await readFile(path.resolve(import.meta.dirname, "../docs/development/codex-development-workflow.md"), "utf8");
  assert.match(workflow, /\$workflow-performance-audit.*明示実行/u);
  assert.match(workflow, /この監査も標準フローへ自動追加せず/u);
});

test("WPA-06 invalid option・source上限・矛盾sourceをstableに拒否する", async () => {
  const { parseArguments, runCli } = await analyzerPromise;
  const now = new Date("2026-09-04T03:00:00.000Z");
  assert.throws(
    () => parseArguments(["--days", "4", "--from", "2026-09-01", "--to", "2026-09-04"], now),
    /WPA_CONFLICTING_PERIOD_OPTIONS/u,
  );
  assert.throws(() => parseArguments(["--repository", "../other"], now), /WPA_PATH_TRAVERSAL/u);
  assert.throws(() => parseArguments(["--timezone", "Not\/A_Zone"], now), /WPA_INVALID_TIMEZONE/u);
  assert.throws(() => parseArguments(["--from", "2026-02-30", "--to", "2026-03-01"], now), /WPA_INVALID_FROM/u);
  assert.throws(() => parseArguments(["--days", "32"], now), /WPA_INVALID_DAYS/u);

  const fixture = await createFixture();
  const nonDirectory = path.join(fixture.root, "not-a-directory");
  await writeFile(nonDirectory, "file\n");
  await assert.rejects(
    runCli({
      argv: ["--repository", fixture.repository, "--days", "4", "--sessions-root", nonDirectory, "--archived-root", fixture.archived],
      stdout: { write() {} } as unknown as NodeJS.WriteStream,
      now,
    }),
    /WPA_INVALID_SOURCE_ROOT/u,
  );

  const oversized = path.join(fixture.sessions, "rollout-2026-09-02-oversized.jsonl");
  await writeFile(oversized, "");
  await truncate(oversized, 512 * 1024 * 1024 + 1);
  const oversizedResult = await audit(fixture);
  assert.equal(oversizedResult.result.assessment.verdict, "判定不能");
  assert.equal(oversizedResult.result.sessions.excluded[0].reason, "file-size-limit");

  await rm(oversized);
  await Promise.all(Array.from({ length: 201 }, (_, index) =>
    writeFile(path.join(fixture.sessions, `rollout-2026-09-02-limit-${index}.jsonl`), ""),
  ));
  const limited = await audit(fixture);
  assert.equal(limited.result.assessment.verdict, "判定不能");
  assert.equal(limited.result.sourceCoverage.scannedFiles, 0);
  assert.equal(limited.result.dataQuality.limitExceeded, true);

  const conflict = await createFixture();
  const duplicateInput = {
    id: "duplicate-id",
    cwd: conflict.repository,
    timestamp: "2026-09-02T08:00:00.000Z",
  };
  await writeSession(conflict.sessions, duplicateInput);
  await writeSession(conflict.archived, { ...duplicateInput, commands: ["npm test"] });
  await assert.rejects(audit(conflict), /WPA_CONFLICTING_SESSION_SOURCES/u);
});

test("WPA-06a 巨大・深いsource treeと多数symlinkを列挙上限で早期停止する", async (context) => {
  await context.test("entry上限を超えた巨大treeを全列挙しない", async () => {
    const fixture = await createFixture();
    await Promise.all(Array.from({ length: 64 }, (_, index) =>
      mkdir(path.join(fixture.sessions, `entry-${String(index).padStart(3, "0")}`)),
    ));

    const { result } = await audit(fixture, [], { entries: 8, depth: 16, issues: 100 });
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.equal(result.sourceCoverage.enumeratedEntries, 9);
    assert.equal(result.sourceCoverage.scannedFiles, 0);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["source-entry-limit"]);
    assert.deepEqual(result.sourceCoverage.discoveryLimits, { entries: 8, depth: 16, issues: 100 });
  });

  await context.test("depth上限より深いtreeへ降りない", async () => {
    const fixture = await createFixture();
    let directory = fixture.sessions;
    for (let depth = 0; depth < 8; depth += 1) {
      directory = path.join(directory, `depth-${depth}`);
      await mkdir(directory);
    }

    const { result } = await audit(fixture, [], { entries: 100, depth: 3, issues: 100 });
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.equal(result.sourceCoverage.enumeratedEntries, 4);
    assert.equal(result.sourceCoverage.scannedFiles, 0);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["source-depth-limit"]);
  });

  await context.test("symlink issueを上限より多く蓄積しない", async () => {
    const fixture = await createFixture();
    const target = path.join(fixture.root, "symlink-target");
    await writeFile(target, "not a session\n");
    await Promise.all(Array.from({ length: 16 }, (_, index) =>
      symlink(target, path.join(fixture.sessions, `link-${String(index).padStart(2, "0")}`)),
    ));

    const { result } = await audit(fixture, [], { entries: 100, depth: 16, issues: 3 });
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.equal(result.sourceCoverage.enumeratedEntries, 4);
    assert.equal(result.sourceCoverage.sourceIssuesEncountered, 4);
    assert.equal(result.sourceCoverage.sourceIssues.length, 3);
    assert.ok(result.sourceCoverage.sourceIssues.every(({ reason }: { reason: string }) => reason === "symlink-entry"));
    assert.deepEqual(result.sourceCoverage.limitReasons, ["source-issue-limit"]);
  });
});

test("WPA-06c directory/file swapでsource root外のJSONLを読まない", async (context) => {
  await context.test("検査済みdirectoryが外部symlinkへ置換されたら全候補を破棄する", async () => {
    const fixture = await createFixture();
    const child = path.join(fixture.sessions, "swap-directory");
    const moved = path.join(fixture.sessions, "swap-directory-original");
    const external = path.join(fixture.root, "external-directory");
    const privateMarker = "EXTERNAL_DIRECTORY_PRIVATE_PAYLOAD";
    await Promise.all([mkdir(child), mkdir(external)]);
    await writeRawRecords(external, "external-directory", [
      { timestamp: "2026-09-02T08:10:00.000Z", ordinal: 0, type: "session_meta", payload: { id: privateMarker, cwd: fixture.repository } },
    ]);
    let swapped = false;

    const { result, stdout } = await audit(fixture, [], undefined, undefined, {
      async beforeDirectoryOpen({ root, depth }) {
        if (swapped || depth !== 1 || root !== child) return;
        swapped = true;
        await rename(child, moved);
        await symlink(external, child);
      },
    });
    assert.equal(swapped, true);
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.equal(result.sourceCoverage.candidateFiles, 0);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["source-path-safety-limit"]);
    assert.equal(stdout.includes(privateMarker), false);
  });

  await context.test("検査前fileが外部symlinkへ置換されたらscan対象にしない", async () => {
    const fixture = await createFixture();
    const target = await writeRecords(fixture.sessions, "swap-file", sessionRecords({
      id: "swap-file",
      cwd: fixture.repository,
      timestamp: "2026-09-02T08:20:00.000Z",
    }));
    const moved = `${target}.original`;
    const external = path.join(fixture.root, "external-file.jsonl");
    const privateMarker = "EXTERNAL_FILE_PRIVATE_PAYLOAD";
    await writeRawRecords(fixture.root, "external-file-source", [
      { timestamp: "2026-09-02T08:20:00.000Z", ordinal: 0, type: "session_meta", payload: { id: privateMarker, cwd: fixture.repository } },
    ]);
    await rename(path.join(fixture.root, "rollout-2026-09-02T00-00-00-external-file-source.jsonl"), external);
    let swapped = false;

    const { result, stdout } = await audit(fixture, [], undefined, undefined, {
      async beforeFileInspect({ target: candidate }) {
        if (swapped || candidate !== target) return;
        swapped = true;
        await rename(target, moved);
        await symlink(external, target);
      },
    });
    assert.equal(swapped, true);
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.equal(result.sourceCoverage.candidateFiles, 0);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["source-path-safety-limit"]);
    assert.equal(stdout.includes(privateMarker), false);
  });
});

test("WPA-06b 巨大な合法JSONLと相関stateを処理上限でfail-closedにする", async (context) => {
  await context.test("複数sourceの累積byte budgetを超えたら一件もscanしない", async () => {
    const fixture = await createFixture();
    for (const id of ["byte-budget-a", "byte-budget-b"]) {
      await writeSession(fixture.sessions, {
        id,
        cwd: fixture.repository,
        timestamp: "2026-09-02T01:00:00.000Z",
      });
    }
    const sizes = await Promise.all(["byte-budget-a", "byte-budget-b"].map(async (id) =>
      (await stat(path.join(fixture.sessions, `rollout-2026-09-02T00-00-00-${id}.jsonl`))).size,
    ));

    const { result } = await audit(
      fixture,
      [],
      undefined,
      processingLimits({ totalSourceBytes: Math.max(...sizes) }),
    );
    assert.equal(result.assessment.verdict, "判定不能");
    assert.deepEqual(result.assessment.candidates, []);
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.equal(result.sourceCoverage.candidateFiles, 2);
    assert.equal(result.sourceCoverage.scannedFiles, 0);
    assert.ok(result.sourceCoverage.candidateBytes > result.sourceCoverage.processingLimits.totalSourceBytes);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["total-source-byte-limit"]);
  });

  await context.test("record上限sourceを除外し、別sourceのP0へ誤昇格しない", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessions, {
      id: "otherwise-confirmed-p0",
      cwd: fixture.repository,
      timestamp: "2026-09-02T02:00:00.000Z",
      p0: true,
    });
    await writeRecords(fixture.sessions, "record-limited", [
      { timestamp: "2026-09-02T02:10:00.000Z", ordinal: 0, type: "session_meta", payload: { id: "record-limited", cwd: fixture.repository } },
      ...Array.from({ length: 5 }, (_, index) => ({
        timestamp: `2026-09-02T02:10:0${index + 1}.000Z`,
        ordinal: index + 1,
        type: "token_usage_record",
        payload: {},
      })),
    ]);

    const { result } = await audit(fixture, [], undefined, processingLimits({ recordsPerFile: 3 }));
    assert.equal(result.assessment.verdict, "判定不能");
    assert.deepEqual(result.assessment.candidates, []);
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.ok(result.sessions.excluded.some(({ id, reason }: { id?: string; reason: string }) =>
      id === fixtureSessionId("record-limited") && reason === "record-count-limit"));
    assert.deepEqual(result.sourceCoverage.limitReasons, ["record-count-limit"]);
  });

  await context.test("単一recordのbyte上限を超える合法JSONを保持しない", async () => {
    const fixture = await createFixture();
    await writeRecords(fixture.sessions, "record-byte-limited", [
      { timestamp: "2026-09-02T02:20:00.000Z", ordinal: 0, type: "session_meta", payload: { id: "record-byte-limited", cwd: fixture.repository } },
      { timestamp: "2026-09-02T02:20:01.000Z", ordinal: 1, type: "token_usage_record", payload: { padding: "x".repeat(2_048) } },
    ]);

    const { result } = await audit(fixture, [], undefined, processingLimits({ bytesPerRecord: 512 }));
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["record-byte-limit"]);
  });

  await context.test("open後に同一inodeが増加してもfile byte上限で停止する", async () => {
    const fixture = await createFixture();
    const records = [
      { timestamp: "2026-09-02T02:30:00.000Z", ordinal: 0, type: "session_meta", payload: { id: "growing-file", cwd: fixture.repository } },
      ...Array.from({ length: 20_000 }, (_, index) => ({
        timestamp: "2026-09-02T02:30:01.000Z",
        ordinal: index + 1,
        type: "token_usage_record",
        payload: {},
      })),
    ];
    const file = await writeRecords(fixture.sessions, "growing-file", records);
    const before = await stat(file);
    const writer = await openFile(file, "a");
    const { scanSessionFile } = await analyzerPromise;
    const scan = scanSessionFile(file, processingLimits({
      fileBytes: before.size + 512,
      recordsPerFile: 50_000,
    }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await writer.appendFile(`${JSON.stringify({
      timestamp: "2026-09-02T02:30:02.000Z",
      ordinal: 30_000,
      type: "token_usage_record",
      payload: { padding: "x".repeat(2_048) },
    })}\n`);
    await writer.close();

    const result = await scan;
    const after = await stat(file);
    assert.equal(after.ino, before.ino);
    assert.ok(after.size > before.size + 512);
    assert.equal(result.status, "limit");
    assert.equal(result.reason, "file-size-limit");
  });

  await context.test("未照合tool call保持数を制限する", async () => {
    const fixture = await createFixture();
    await writeRecords(fixture.sessions, "tool-retention", [
      { timestamp: "2026-09-02T03:00:00.000Z", ordinal: 0, type: "session_meta", payload: { id: "tool-retention", cwd: fixture.repository } },
      ...Array.from({ length: 3 }, (_, index) => ({
        timestamp: `2026-09-02T03:00:0${index + 1}.000Z`,
        ordinal: index + 1,
        type: "response_item",
        payload: { type: "custom_tool_call", id: `tool-${index}`, call_id: `call-${index}`, name: "exec" },
      })),
    ]);

    const { result } = await audit(fixture, [], undefined, processingLimits({ trackedToolCalls: 2 }));
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["tool-call-retention-limit"]);
  });

  await context.test("turn/task保持数を制限する", async () => {
    const fixture = await createFixture();
    await writeRecords(fixture.sessions, "turn-retention", [
      { timestamp: "2026-09-02T04:00:00.000Z", ordinal: 0, type: "session_meta", payload: { id: "turn-retention", cwd: fixture.repository } },
      ...Array.from({ length: 3 }, (_, index) => ({
        timestamp: `2026-09-02T04:00:0${index + 1}.000Z`,
        ordinal: index + 1,
        type: "event_msg",
        payload: { type: "task_started", turn_id: `turn-${index}`, started_at: `2026-09-02T04:00:0${index + 1}.000Z` },
      })),
    ]);

    const { result } = await audit(fixture, [], undefined, processingLimits({ trackedTurns: 2 }));
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["turn-retention-limit"]);
  });

  await context.test("distinct command保持数を制限する", async () => {
    const fixture = await createFixture();
    await writeRecords(fixture.sessions, "command-retention", sessionRecords({
      id: "command-retention",
      cwd: fixture.repository,
      timestamp: "2026-09-02T05:00:00.000Z",
      commands: ["git status --short a", "git status --short b", "git status --short c"],
    }));

    const { result } = await audit(fixture, [], undefined, processingLimits({ distinctCommands: 2 }));
    assert.equal(result.assessment.verdict, "判定不能");
    assert.equal(result.dataQuality.limitExceeded, true);
    assert.deepEqual(result.sourceCoverage.limitReasons, ["command-retention-limit"]);
  });
});
