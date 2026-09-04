---
name: workflow-performance-audit
description: "Audit multiple recent Codex tasks for repository workflow bottlenecks and evidence-backed improvements without changing files or runtime state. Use only when the user invokes $workflow-performance-audit."
---

# Workflow Performance Audit

Audit several completed Codex tasks for one repository and return a read-only performance diagnosis. Do not delegate this skill to a custom agent. Do not combine it with implementation, Git shipping, Browser automation, web research, external services, or the single-task report/apply flow owned by `$workflow-retrospective`.

Default to the current repository and the last four inclusive calendar days in the current execution timezone. Honor an explicit repository, day count, date range, or IANA timezone, but never expand to another repository implicitly. The parser accepts at most 31 days, 200 session files, and 512 MiB per JSONL file.

## Establish the read-only boundary

1. Record read-only digests for `HEAD`, staged diff, unstaged diff, untracked paths, and the scoped workflow files. Do not stage or write anything.
2. Resolve the repository real path and Git common directory. Linked worktrees of the same repository are in scope; another Git common directory is not. Consolidate non-overlapping rollout segments for one root task and exclude internal subagent rollouts rather than treating inherited history as another task.
3. When task lookup is available, fetch statuses once. Pass every active task ID and the current audit task ID as repeated `--exclude-session-id` values. Do not poll task status.
4. Use only local Codex session sources. Do not start subagents, Browser, runtime, tests, builds, Git mutations, PR operations, or web requests.

Run the streaming analyzer exactly once:

```text
node .agents/skills/workflow-performance-audit/scripts/analyze-sessions.mjs \
  --repository <repository> \
  --days 4 \
  --timezone <IANA-timezone> \
  --exclude-session-id <active-or-current-id>
```

Use `--from <YYYY-MM-DD> --to <YYYY-MM-DD>` instead of `--days` for an explicit inclusive range. Use `--sessions-root` and `--archived-root` only for an explicitly supplied source or a deterministic test fixture. Never copy JSONL records, user messages, command text, tool payloads, environment values, credentials, tokens, personal data, or hidden input into model context or the answer.

## Interpret the compact result

Read `docs/development/codex-development-workflow.md`, then only the skills or references implicated by safe evidence categories. Do not reread every workflow skill. Treat required safety and quality gates, explicit user instructions, product-specific work, deploy/CI time, external-service latency, and host-resource incidents separately from avoidable workflow repetition.

Keep agent-turn duration, observed tool duration, and session wall span distinct. A duration is contextual evidence, not a pass/fail threshold. Use deterministic counts for duplicate commands, failures, Browser/MCP operations, compactions, full tests, production builds, full parity, fixed sleeps, polling, and follow-log operations.

The analyzer's three-state assessment is authoritative unless repository or task-status readback invalidates its inputs:

- `ボトルネックあり`: report up to three P0/P1 candidates with stable IDs, session/event locators, the current-contract delta, reduction target, unchanged quality condition, exact change paths, complexity, risk, and recommendation.
- `ボトルネックなし`: say `改善提案なし・現行workflowを変更しない`. Do not invent a convenience proposal.
- `判定不能`: identify the missing coverage and the concrete rerun condition. Never restate it as no bottleneck.

P1 requires the same avoidable root cause in at least two comparable completed sessions. A single-session P0 requires explicit deterministic progress-stopping evidence. Excluded active or changing sources do not invalidate otherwise complete evidence, but provisional data cannot support candidates or comparison statistics.

## Return without applying changes

Report the repository identity digest, inclusive local dates, ISO boundaries, timezone, included/provisional/excluded counts and IDs, skill duration sample coverage, relevant operation counts, data-quality limits, assessment, and zero to three candidates. Keep evidence sanitized and compact.

Recompute the initial Git/read-only digests and state whether they are unchanged. Do not create a report file. If the user later wants a candidate implemented, direct them to a new `$plan`; if they want one representative task investigated more deeply, direct them to `$workflow-retrospective codex://threads/<thread-id>`.
