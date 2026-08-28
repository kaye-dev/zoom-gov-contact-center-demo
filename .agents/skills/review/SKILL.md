---
name: review
description: "Run independent blind and plan-conformance reviews for one implementation, then build a local interactive HTML report. Use only when explicitly invoked as $review."
---

# Review

Review one implementation twice in independent fresh contexts and produce an explanatory local HTML report. This skill is read-only with respect to implementation and Git state; it may write only `plans/<slug>/review/`.

## Resolve the plan and diff

- Use the explicit `plans/<slug>/goal.md` path. When omitted, select the only `plans/*/goal.md`; stop for zero or multiple candidates. Reject any other filename or depth and reserved legacy slugs.
- By default review the current task's complete changes against `HEAD`: staged, unstaged, deleted, and relevant non-ignored untracked files.
- If the requested changes are already committed, require the user to state the Git base revision and review `<base>...HEAD` instead.
- Build sorted reviewed and excluded path lists. Never include unrelated changes in either reviewer input. If task and unrelated changes cannot be separated confidently, stop before generating the report.
- Capture the exact same diff and necessary file context once for both passes. Do not mutate files, the index, or commits during review.

## Run two independent passes

1. Start a fresh no-history subagent for the blind diff review. Pass only the exact diff and necessary repository context—not the plan, conversation, task rationale, or any prior review. Ask for correctness, security, regression, accessibility, maintainability, test-gap, and unexplained-change findings.
2. Start a separate fresh no-history subagent for the conformance review. Pass the exact goal, same diff and context, checks actually run, and the approved prototype plus dated implementation-parity evidence when applicable—not the blind result or conversation. Ask for missing requirements, unexplained deviations, incomplete flows, and unsupported completion claims. For a user-visible change, missing, incomplete, or failed implementation parity is a major finding and the HTML report cannot substitute for it.

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
