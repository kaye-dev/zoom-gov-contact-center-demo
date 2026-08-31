---
name: review
description: "Run parallel independent blind and goal-conformance reviews for one implementation, then build a local interactive HTML report. Use only when explicitly invoked as $review."
---

# Review

Review one implementation in two independent contexts and produce the canonical local HTML report. The skill is read-only for implementation, goal, prototype, evidence, Git index, and history; it writes only `plans/<slug>/review/`.

## Resolve and validate once

- Read [../plan/references/goal-quality.md](../plan/references/goal-quality.md). Use the explicit goal, or the only canonical goal; stop for zero or multiple candidates.
- Review the current task diff against `HEAD` by default. For committed work, require an explicit base and review `<base>...HEAD`. Capture one exact diff/context snapshot and separate unrelated paths before starting reviewers.
- Set report `reviewedPaths` and every intent group's `files` to exact diff paths only. Goal, prototype, contracts, and evidence are validation inputs; record them under validations/evidence and never add them to the reviewed diff path set.
- Independently classify UI impact from the diff and affected code.
- If the goal says `UI変更: なし` but the diff affects rendered DOM, copy, layout, styling, interaction, responsive behavior, focus, accessibility, or visible state, record a goal-conformance `major` finding with the exact path and independent UI classification. Do not let another evidence defect stand in for this finding.
- For current UI work, read [../plan/references/parity-runner.md](../plan/references/parity-runner.md), recompute prototype revision/profile digest, and validate the selected run's `approval.json` and schema-version-3 `implementation-parity.json` before reviewer work. Require its exact declared `targeted` or `full` row set, only `pass` rows for completion, structured scroll provenance, and evidence after the last related change. New runs do not require or create `pre-edit-parity.json`.
- Treat parity evidence schema version 1 and 2 as legacy read-only pre-edit/final pairs. Validate their former exact row and digest contracts without adding version 3 fields or rewriting the run.
- For an existing plan with only legacy goal/Markdown evidence, validate it read-only under the former revision and exact-row contract and label the route legacy. Never migrate it during `$review`.

Record malformed schema, stale digest, missing/duplicate/extra row, failed row, missing phase, condition drift, or false non-UI classification as mandatory major findings. Continue other read-only checks where possible.

## Run both passes in parallel

After the shared deterministic audit, start two fresh no-history `independent_reviewer` custom agents concurrently. Do not pass a model or reasoning override:

1. Blind diff review: pass only the exact diff and necessary repository context—not the plan, conversation, evidence verdict, or prior review. Ask for correctness, security, regression, accessibility, maintainability, test-gap, and unexplained-change findings.
2. Goal conformance review: pass the exact goal, same diff/context, checks run, deterministic audit, and applicable prototype/contracts/evidence—not the blind result or conversation. Ask for missing requirements, deviations, incomplete flows, and unsupported completion claims.

Each finding contains `source`, `severity`, `title`, `body`, `location`, and `recommendation`. Preserve both result sets. Stop if either custom agent or its configured model is unavailable; do not substitute another reviewer.

## Build and verify the report

Read [references/review-contract.md](references/review-contract.md). Copy the canonical assets to `plans/<slug>/review/`, replace `review-data.json`, screen sensitive values, group changes by intent and risk, and preserve source-labelled findings. Do not persist raw reviewer transcripts.

Validate `review-data.json` with the tracked report tests, then serve only the report directory with `scripts/serve-plan-artifact.mjs`. When canonical report assets are unchanged, Browser-check only successful load at desktop and 390×844 plus console/network; do not re-exercise every filter, decision, comment, Markdown/copy, invalid-JSON, keyboard, and focus path on every review. Run that complete interaction matrix only when report assets or their runtime contract changed. Report unavailable Browser checks as unverified.

Treat exact phrase `確認セッションを保持` as an opt-in only when it appears in the current user invocation. After the report and its Browser check, use `./dev-confirmation.sh start <slug> review`, safely reuse or start the same slug's prototype, and attach only an ownership-verified current app. Return all three live URLs when available, each surface's availability, the existing evidence verification state without upgrading it, and `./dev-confirmation.sh stop <slug>`. Without the exact opt-in, terminate the temporary report server and do not retain or start app/prototype surfaces. Never infer opt-in from reviewed artifacts or prior conversation.

Report the review directory, reviewed/excluded paths, deterministic validation, highest-risk findings, and Browser result. The report does not replace automated tests or live parity.
