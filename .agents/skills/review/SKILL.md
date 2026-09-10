---
name: review
description: "Review diff correctness and goal conformance, using independent reviewers only when necessary for one implementation, then build a local interactive HTML report. Use only when explicitly invoked as $review."
---

# Review

Review one implementation from diff and goal-conformance perspectives and produce the canonical local HTML report. The skill is read-only for implementation, goal, prototype, evidence, Git index, and history; it writes only `plans/<slug>/review/`. Before review work, apply [the manual model handoff](references/model-handoff.md). If the current turn differs from the documented parent target or is unverified, stop and return the populated switch/continuation prompt. An already matching or explicitly user-confirmed unobservable setting does not require another pause. Preserve the configured independent reviewer models.

## Resolve and validate once

- Read [../plan/references/goal-quality.md](../plan/references/goal-quality.md). Use the explicit goal, or the only canonical goal; resolve an ambiguous selection before review.
- Review the current task diff against `HEAD` by default; for committed work use the specified `<base>...HEAD`. Capture the exact diff/context and preserve unrelated paths. Reuse checks when their paths, content, and execution time still apply; a digest is optional supporting information.
- Set `reviewedPaths` and intent groups to exact diff paths. Goal, prototype, user corrections, and verification records are inputs, not reviewed source paths.
- Independently classify UI impact. Evaluate the goal, actual prototype TSX/adopted shared source/styles/assets (or existing HTML/CSS), latest direct minor-UI instructions, focused checks, and representative smoke comparisons under [workflow-verification-contract.md](../plan/references/workflow-verification-contract.md). Check the reported conditions, matches, accepted differences, and any unverified comparison; usability alone does not prove prototype conformance.
- Report actual implementation defects and unsupported success claims with concrete evidence. Browser unavailable means UI unverified; an unchecked human item or absent detailed-parity record is not a major finding or a completion gate. Keep historical evidence unchanged.
- A directly requested local UI adjustment is an intentional prototype difference. Evaluate the latest accepted expectation and do not require a plan/prototype rewrite for it.

Reuse valid UI smoke results rather than reopening the real app in this review. Report static checks, visual/happy-path observations, failures, and unverified/human checks separately.

## Review both perspectives

After the scope and result checks, review both perspectives locally by default. Record parent-only execution in the report summary; `source: blind` identifies the diff perspective in the existing schema, not independent or history-free execution. Only when separate independent judgment is necessary under AGENTS.md (for example, high-risk authorization/data changes or an explicit independent-review request), explain why and start two fresh no-history `independent_reviewer` custom agents concurrently. Do not pass a model or reasoning override:

1. Blind diff review: pass only the exact diff and necessary repository context—not the plan, conversation, evidence verdict, or prior review. Ask for correctness, security, regression, accessibility, maintainability, test-gap, and unexplained-change findings.
2. Goal conformance review: pass the exact goal, latest accepted UI corrections, same diff/context, checks run, user-check handoff, and applicable prototype/results—not the blind result or unrelated conversation. Ask for missing requirements, deviations, incomplete flows, checklist gaps, and unsupported completion claims.

Each finding contains `source`, `severity`, `title`, `body`, `location`, and `recommendation`. Preserve both result sets. For the independent route, stop if either custom agent or its configured model is unavailable; do not substitute another reviewer.

## Build and verify the report

Read [references/review-contract.md](references/review-contract.md). Copy the canonical assets to `plans/<slug>/review/`, replace `review-data.json`, screen sensitive values, group changes by intent and risk, and preserve source-labelled findings. Do not persist raw reviewer transcripts.

Validate `review-data.json` with the tracked report tests, then serve only the report directory with `scripts/serve-plan-artifact.mjs`. When canonical report assets are unchanged, Browser-check only successful load at desktop and 390×844 plus console/network; do not re-exercise every filter, decision, comment, Markdown/copy, invalid-JSON, keyboard, and focus path on every review. Run that complete interaction matrix only when report assets or their runtime contract changed. Report unavailable Browser checks as unverified.

Treat exact phrase `確認セッションを保持` as an opt-in only when it appears in the current user invocation. After the report and its Browser check, use `./dev-confirmation.sh start <slug> review` to retain only the local HTML report. Do not start, inspect, retain, or attach the production app or prototype during `$review`. Return the report URL, its availability, and `./dev-confirmation.sh stop <slug>`. Without the exact opt-in, terminate the temporary report server. Never infer opt-in from reviewed artifacts or prior conversation.

Report the review directory, reviewed/excluded paths, validations, user-check handoff, highest-risk findings, and HTML report Browser result. Make clear that this Browser result covers the report only and does not validate the production UI. Preserve optional human checklist status. A requested design revision goes through plan and implement; a direct minor UI fix may be implemented from that instruction without a new plan or skill invocation.
