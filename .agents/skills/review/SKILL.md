---
name: review
description: "Run independent blind and plan-conformance reviews for one implementation, then build a local interactive HTML report. Use only when explicitly invoked as $review."
---

# Review

Review one implementation twice in independent fresh contexts and produce an explanatory local HTML report. This skill is read-only with respect to implementation and Git state; it may write only `plans/<slug>/review/`.

## Resolve the plan and diff

- Read [../plan/references/goal-quality.md](../plan/references/goal-quality.md) in full before resolving or evaluating the goal.
- Use the explicit `plans/<slug>/goal.md` path. When omitted, select the only `plans/*/goal.md`; stop for zero or multiple candidates. Reject any other filename or depth and reserved legacy slugs.
- By default review the current task's complete changes against `HEAD`: staged, unstaged, deleted, and relevant non-ignored untracked files.
- If the requested changes are already committed, require the user to state the Git base revision and review `<base>...HEAD` instead.
- Build sorted reviewed and excluded path lists. Never include unrelated changes in either reviewer input. If task and unrelated changes cannot be separated confidently, stop before generating the report.
- Capture the exact same diff and necessary file context once for both passes. Do not mutate files, the index, or commits during review.
- Independently classify the exact diff and affected code as UI-affecting when they can change rendered DOM or the accessibility tree, visible or accessible copy, styles or layout, interaction or focus behavior, or responsive behavior. Do not trust `UI変更: なし` when the diff or affected implementation meets that definition.
- For UI-affecting work, require the goal to record exactly `approval contract: plans/<slug>/prototype/ui-contract.json — version 1`. Run `node .agents/skills/plan/scripts/prototype-revision.mjs plans/<slug>/prototype` without modifying the goal, prototype, manifest, implementation, index, or history; use its success to validate the version 1 schema and its single `sha256:<64hex>` output as the current artifact revision. Independently require `comparisonConditions.scroll` to be the exact object `{ "x": <non-negative finite number>, "y": <non-negative finite number> }` and verify the evidence values came from each surface's measured `window.scrollX` and `window.scrollY`, not a scalar, shorthand, request, or inference.
- Read each of the goal's `prototype revision`, `parity evidence`, `machine parity`, and `UI承認記録` fields exactly once. Treat `parity evidence` and `machine parity` as `machineParityResults`: require each field to contain exactly one revision equal to the helper result and every immutable manifest row ID exactly once as `<row-id>=pass`. Bare row IDs, `all N`, missing statuses, `=pending`, `=fail`, duplicates, missing rows, aggregate-only summaries, and extra rows are mandatory major findings. Require the approval record to be dated and explicit. Separately verify the current-run pre-edit evidence and the post-implementation `implementationParityResults` against that same revision and exact row inventory; require the post-implementation result set to be dated and every executed row to be recorded exactly once as `<row-id>=pass|fail` with an evidence location. Every row must be `=pass` for completion, and the evidence must follow the last relevant implementation or contract change.
- Record every missing artifact or field, helper/schema failure, goal/manifest contradiction, stale or duplicate revision, row-set mismatch, non-passing row, missing current-run evidence, missing or stale post-implementation evidence, or false non-UI classification as a mandatory major finding. Do not omit, downgrade, or repair it during review; continue the remaining read-only checks when possible.

## Run two independent passes

1. Start a fresh no-history subagent for the blind diff review. Pass only the exact diff and necessary repository context—not the plan, conversation, task rationale, or any prior review. Ask for correctness, security, regression, accessibility, maintainability, test-gap, and unexplained-change findings.
2. Start a separate fresh no-history subagent for the conformance review. Pass the exact goal, same diff and context, checks actually run, the parent's deterministic UI classification and revision/evidence audit, and, for UI-affecting work, the approved prototype, validated `ui-contract.json`, current prototype revision, complete production `sources` inventory, approval-time `machineParityResults`, current-run pre-edit row evidence, and dated post-implementation `implementationParityResults`—not the blind result or conversation. Ask for missing requirements, unexplained deviations, incomplete flows, and unsupported completion claims. Require each evidence set to name the same current revision and every immutable manifest row exactly once with an explicit status: `<row-id>=pending` only before execution and `<row-id>=pass|fail` after execution. Bare row IDs never count. A missing or contradictory manifest/source inventory, stale revision, or missing status, duplicate, aggregate-only, extra, incomplete, pending, or failed implementation parity is a mandatory major finding; the HTML report cannot substitute for live application verification. For closure findings, require an executable compile-time command or concrete assertion when applicable and treat `production` and `本番` as equivalent semantic outcome wording.

Require each finding to contain `source`, `severity`, `title`, `body`, `location`, and `recommendation`. Preserve every finding from both passes. If independent subagents are unavailable, stop rather than silently simulating both passes in one context.

## Build the report

Read [review-contract.md](references/review-contract.md). Copy `assets/review-report/` to `plans/<slug>/review/`, replace `review-data.json` completely, and keep only the minimum contract described there. Screen reviewer text for sensitive values before writing it; never persist raw reviewer transcripts or separate raw review JSON.

Group changes by intent rather than file order, combine mechanical follow-up changes with their purpose, and sort groups by risk. Include locations, rationale, blast radius, verification evidence, and both source-labelled finding sets. Mark any change whose intent cannot be explained as `要改善`.

The page must support `採用 / 却下 / 未確定`, per-group human comments, and Markdown generation/copy containing adopted and unresolved findings plus comments. Use only local assets and DOM text APIs; do not add external requests, analytics, dynamic code execution, or `innerHTML`.

Serve only the generated directory with:

```sh
node scripts/serve-plan-artifact.mjs plans/<slug>/review
```

Open its `127.0.0.1` URL in the Codex in-app Browser. Verify desktop and 390×844 layouts, risk filters, decisions, comments, Markdown generation, clipboard behavior, keyboard/focus, invalid JSON handling, console, and network. Stop only the server started for this report.

Report the review directory, reviewed and excluded paths, validation results, highest-risk findings, and Browser checks. HTML review supplements rather than replaces automated tests, prototype parity, and live application verification.
