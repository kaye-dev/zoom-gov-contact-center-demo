import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFile(path.join(root, relative), "utf8");

test("workflow-retrospectiveは明示呼び出し専用の小さいinstruction packageである", async () => {
  const skillRoot = path.join(root, ".agents/skills/workflow-retrospective");
  const [skill, metadata, entries, agentEntries] = await Promise.all([
    read(".agents/skills/workflow-retrospective/SKILL.md"),
    read(".agents/skills/workflow-retrospective/agents/openai.yaml"),
    readdir(skillRoot),
    readdir(path.join(skillRoot, "agents")),
  ]);

  assert.deepEqual(entries.sort(), ["SKILL.md", "agents"]);
  assert.deepEqual(agentEntries, ["openai.yaml"]);
  assert.match(skill, /^name: workflow-retrospective$/m);
  assert.match(skill, /exactly one completed or intentionally interrupted Codex task/);
  assert.match(metadata, /display_name: "Improve Workflow"/);
  assert.match(metadata, /allow_implicit_invocation: false/);
  assert.match(metadata, /default_prompt: "[^"]*\$workflow-retrospective/);
  const description = /^\s*short_description:\s*"([^"]+)"$/mu.exec(metadata)?.[1];
  assert.ok(description);
  assert.ok(description.length >= 25 && description.length <= 64);
});

test("対象解決は明示thread、rollout、project候補の順で実行中taskを除外する", async () => {
  const skill = await read(".agents/skills/workflow-retrospective/SKILL.md");

  const thread = skill.indexOf("codex://threads/<thread-id>", skill.indexOf("## Resolve the source task"));
  const rollout = skill.indexOf("rollout JSONL", thread);
  const project = skill.indexOf("project path", rollout);
  assert.ok(thread >= 0 && rollout > thread && project > rollout);
  assert.match(skill, /if more than one can qualify, stop and ask the user to select one before auditing/);
  assert.match(skill, /canonical ID returned by task lookup or `session_meta`/);
  assert.match(skill, /Reject path separators, dot segments/);
  assert.match(skill, /resolve outside the exact `plans\/workflow-retrospectives\/` parent/);
  assert.match(skill, /Reject a symlinked parent, ancestor, or existing report/);
  assert.match(skill, /each worktree root and its repository common Git directory to real paths/);
  assert.match(skill, /Compare the common-directory identity so linked worktrees of the same repository remain valid/);
  assert.match(skill, /stop when identity is missing or differs/);
  assert.match(skill, /Record the source worktree path separately/);
  assert.match(skill, /Do not audit an active or running task/);
  assert.match(skill, /Capture its last revision or cursor, or an explicit rollout JSONL digest/);
  assert.match(skill, /re-check status and source identity immediately before writing the report/);
  assert.match(skill, /if the external source became active or changed, do not write and stop for a later retry/);
  assert.match(skill, /analyze completed turns only, exclude the current retrospective turn/);
  assert.match(skill, /never resume development or runtime operations/);
});

test("初回監査は一時reportだけを書き定量証拠を欠損時に推測しない", async () => {
  const skill = await read(".agents/skills/workflow-retrospective/SKILL.md");

  assert.match(skill, /The only write allowed is `plans\/workflow-retrospectives\/<thread-id>\.md`/);
  assert.match(skill, /do not change tracked files, the Git index, or runtime state/);
  assert.match(skill, /Re-auditing the same task rewrites that same report/);
  assert.match(skill, /record the canonical source ID, repository common-directory identity, source worktree real path/);
  assert.match(skill, /Paginate through the oldest completed turn/);
  assert.match(skill, /record the covered first and last timestamp or cursor/);
  assert.match(skill, /If history is truncated, omitted, or incomplete/);
  assert.match(skill, /mark every affected total `未確認`/);
  for (const metric of [
    "total elapsed time",
    "time to first production edit",
    "`$plan` and `$implement` invocation counts",
    "shell commands",
    "failed commands",
    "retries",
    "Browser operations",
    "full-matrix runs",
    "context compactions",
    "user interventions",
  ]) {
    assert.ok(skill.includes(metric), `missing metric: ${metric}`);
  }
  assert.match(skill, /write `未確認` when telemetry is absent instead of inferring zero/);
  assert.match(skill, /Never copy raw transcript or tool payloads, secrets, credentials, tokens, environment values, personal data, or hidden input/);
  assert.match(skill, /turn or event locator with a redacted paraphrase/);
});

test("改善候補は現行contractとの差分を分類し最大3件へ優先順位付けする", async () => {
  const skill = await read(".agents/skills/workflow-retrospective/SKILL.md");

  for (const classification of ["既に解消済み", "一時的な環境要因", "製品固有問題", "改善候補"]) {
    assert.ok(skill.includes(classification));
  }
  assert.match(skill, /already handled by the current contract/);
  assert.match(skill, /at most three improvement candidates/);
  assert.match(skill, /`P0` for correctness, safety, or progress-stopping defects/);
  assert.match(skill, /`P1` for measurable time savings without reducing quality/);
  assert.match(skill, /`P2` for limited convenience improvements/);
  assert.match(skill, /If there is no P0 or P1 candidate, recommend `変更しない`/);
  for (const field of [
    "stable root-cause ID",
    "evidence",
    "current-contract delta",
    "expected measurable effect",
    "minimal change",
    "exact candidate paths",
    "complexity increase or decrease",
    "risk",
  ]) {
    assert.ok(skill.includes(field), `missing candidate field: ${field}`);
  }
  assert.match(skill, /recommendation of `改善`, `保留`, or `却下`/);
  assert.match(skill, /Do not apply a candidate in the initial audit/);
});

test("明示選択された候補だけをallowlistと複雑性予算の内側で適用する", async () => {
  const skill = await read(".agents/skills/workflow-retrospective/SKILL.md");
  const applyMode = skill.slice(skill.indexOf("## Apply mode"));

  assert.match(skill, /unless the user explicitly selects candidate IDs from an existing report to improve or apply/);
  assert.match(skill, /Merely asking about, comparing, or quoting a candidate ID remains read-only and must not apply it/);
  assert.match(applyMode, /only when the user explicitly selects candidate IDs that exist in the report/);
  assert.match(applyMode, /accept only a canonical, non-symlinked `plans\/workflow-retrospectives\/<thread-id>\.md`/);
  assert.match(applyMode, /filename, stored source ID, and selected candidate IDs agree/);
  assert.match(applyMode, /Re-fetch the source before tracked writes/);
  assert.match(applyMode, /stored repository common-directory identity, source worktree path, and revision, cursor, or rollout digest to match/);
  assert.match(applyMode, /otherwise stop and require a new audit/);
  assert.match(applyMode, /exact file allowlist from only the selected candidates/);
  assert.match(skill, /directly referenced instructions, related common runners, and tests/);
  assert.match(applyMode, /a common workflow runner, and directly related tests or evals/);
  assert.match(applyMode, /Never change product code, goals, prototypes/);
  assert.match(applyMode, /the Git index, commits, pushes, or pull requests/);
  assert.match(applyMode, /Preserve unrelated dirty changes/);
  assert.match(applyMode, /Prefer replacement, consolidation, or deletion over addition/);
  assert.match(applyMode, /For P1 and P2, do not increase mandatory phases, Browser runs, user confirmation gates, required commands/);
  assert.match(applyMode, /nonblank instruction lines in changed skills and their directly linked references/);
  assert.match(applyMode, /new helper or reference is allowed only when it deterministically removes repeated work and total complexity decreases/);
  assert.match(applyMode, /otherwise helper count cannot increase/);
  assert.match(applyMode, /Record before and after values/);
  assert.match(applyMode, /Reject the change if this complexity budget cannot be met/);
});

test("workflow文書は振り返りを標準フローへ自動挿入しない", async () => {
  const [workflow, plan, implement, review] = await Promise.all([
    read("docs/development/codex-development-workflow.md"),
    read(".agents/skills/plan/SKILL.md"),
    read(".agents/skills/implement/SKILL.md"),
    read(".agents/skills/review/SKILL.md"),
  ]);

  const standardFlow = workflow.slice(workflow.indexOf("## 標準フロー"), workflow.indexOf("### `$plan`"));
  assert.doesNotMatch(standardFlow, /\$workflow-retrospective/);
  assert.match(workflow, /## 任意の振り返り/);
  assert.match(workflow, /### `\$workflow-retrospective`（別task推奨）/);
  assert.match(workflow, /\$workflow-retrospective codex:\/\/threads\/<thread-id>/);
  assert.match(workflow, /別taskから参照するsource taskが実行中なら監査しない/);
  assert.match(workflow, /同じtaskで使う場合は開発完了後に限り、現在の振り返りturnを除いた完了済みturnだけを対象にする/);
  assert.match(workflow, /plans\/workflow-retrospectives\/<thread-id>\.md/);
  assert.match(workflow, /最大3件/);
  assert.match(workflow, /自動実行・自動提案・自動通知しない/);
  for (const contract of [plan, implement, review]) {
    assert.doesNotMatch(contract, /workflow-retrospective/);
  }
});
