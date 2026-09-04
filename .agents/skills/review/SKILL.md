---
name: review
description: "Run parallel independent blind and goal-conformance reviews for one implementation, then build a local interactive HTML report. Use only when explicitly invoked as $review."
---

# Review

Review one implementation in two independent contexts and produce the canonical local HTML report. The skill is read-only for implementation, goal, prototype, evidence, Git index, and history; it writes only `plans/<slug>/review/`.

## Resolve and validate once

- Read [../plan/references/goal-quality.md](../plan/references/goal-quality.md). Use the explicit goal, or the only canonical goal; stop for zero or multiple candidates.
- Review the current task diff against `HEAD` by default. For committed work, require an explicit base and review `<base>...HEAD`. Capture one exact diff/context snapshot plus `node scripts/validation-digest.mjs --scope <task-path>` output and separate unrelated paths before starting reviewers; reuse recorded checks only when command, scope, status, and validated diff digest match.
- Set report `reviewedPaths` and every intent group's `files` to exact diff paths only. Goal, prototype, contracts, and evidence are validation inputs; record them under validations/evidence and never add them to the reviewed diff path set.
- Independently classify UI impact from the diff and affected code.
- If the goal says `UI変更: なし` but the diff affects rendered DOM, copy, layout, styling, interaction, responsive behavior, focus, accessibility, or visible state, record a goal-conformance `major` finding with the exact path and independent UI classification. Do not let another evidence defect stand in for this finding.
- For current UI work, run one trusted static `node .agents/skills/plan/scripts/parity-runner.mjs preflight plans/<slug>/prototype --context implement`, validate the goal hash, prototype revision, validation-profile digest, source inventory, and selected run's `approval.json`, and record the exact command and `sha256:` revision in `review-data.json.validations`. Validate that `## ユーザー動作確認` has stable unchecked `UI-CHECK-XX` items with target, prerequisite, operation, and expected result for the actual UI diff.
- Normal `$review` does not require `implementation-parity.json`, Browser coverage, runtime evidence, screenshots, artifact cleanup, or human visual approval. Their absence is neither a finding nor an incomplete review.
- Read parity evidence only when the current review invocation explicitly puts an existing run in scope. In that case use [../plan/references/parity-runner.md](../plan/references/parity-runner.md), validate profile versions 1 through 3 and evidence schema versions 1 through 4 read-only against their historical contracts, report their independent statuses, and never migrate or rewrite the run.

Record malformed goal/contract/profile/approval data, stale goal or prototype digest, incomplete source inventory, missing or malformed user-check items, unsupported completion claims, or false non-UI classification as mandatory goal-conformance findings. Materialize one separate `source: conformance` finding for every deterministic defect before reviewer synthesis, including its exact field or path. Only when an existing parity run is explicitly in scope should malformed evidence, row-set drift, failed probes, artifact defects, or cleanup failures become findings. Do not merge independent defects or rely on the conformance reviewer to preserve them. Continue other read-only checks where possible.

Treat passing static checks and pending user verification independently. Never infer runtime behavior, Browser coverage, human approval, or full parity from source inspection. If optional parity evidence is explicitly in scope, keep `automationCoverageStatus`, `humanVisualApprovalStatus`, and `fullParityStatus` independent.

## Run both passes in parallel

After the shared deterministic audit, start two fresh no-history `independent_reviewer` custom agents concurrently. Do not pass a model or reasoning override:

1. Blind diff review: pass only the exact diff and necessary repository context—not the plan, conversation, evidence verdict, or prior review. Ask for correctness, security, regression, accessibility, maintainability, test-gap, and unexplained-change findings.
2. Goal conformance review: pass the exact goal, same diff/context, checks run, deterministic static audit, user-check handoff, and applicable prototype/contracts/approval evidence—not the blind result or conversation. Pass parity evidence only when explicitly in scope. Ask for missing requirements, deviations, incomplete flows, checklist gaps, and unsupported completion claims.

Each finding contains `source`, `severity`, `title`, `body`, `location`, and `recommendation`. Preserve both result sets. Stop if either custom agent or its configured model is unavailable; do not substitute another reviewer.

## Build and verify the report

Read [references/review-contract.md](references/review-contract.md). Copy the canonical assets to `plans/<slug>/review/`, replace `review-data.json`, screen sensitive values, group changes by intent and risk, and preserve source-labelled findings. Do not persist raw reviewer transcripts.

Validate `review-data.json` with the tracked report tests, then serve only the report directory with `scripts/serve-plan-artifact.mjs`. When canonical report assets are unchanged, Browser-check only successful load at desktop and 390×844 plus console/network; do not re-exercise every filter, decision, comment, Markdown/copy, invalid-JSON, keyboard, and focus path on every review. Run that complete interaction matrix only when report assets or their runtime contract changed. Report unavailable Browser checks as unverified.

Treat exact phrase `確認セッションを保持` as an opt-in only when it appears in the current user invocation. After the report and its Browser check, use `./dev-confirmation.sh start <slug> review` to retain only the local HTML report. Do not start, inspect, retain, or attach the production app or prototype during `$review`. Return the report URL, its availability, and `./dev-confirmation.sh stop <slug>`. Without the exact opt-in, terminate the temporary report server. Never infer opt-in from reviewed artifacts or prior conversation.

Report the review directory, reviewed/excluded paths, deterministic static validation, user-check handoff, highest-risk findings, and HTML report Browser result. Make clear that this Browser result covers the report only and does not validate the production UI.
