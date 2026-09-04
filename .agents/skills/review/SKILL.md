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
- For current UI work, read [../plan/references/parity-runner.md](../plan/references/parity-runner.md), run one trusted `node .agents/skills/plan/scripts/parity-runner.mjs preflight plans/<slug>/prototype --context implement`, and validate its revision/profile/source selection, the selected run's `approval.json`, and schema-version-4 `implementation-parity.json` before reviewer work. Record that exact command and `sha256:` revision in `review-data.json.validations`; recompute the exact `coverage` or `full` row set, target-state/target-viewport/target-theme coverage, risk rows, anchor rows, probe tiers, artifact digests, checkpoint history, runtime/source/profile digests, terminal cleanup, and successful `.codex/parity-runs/<run-id>/` absence. A residual workspace, missing artifact, incomplete coverage, stale digest, or failed cleanup is a major finding. New runs do not create `pre-edit-parity.json`.
- Treat profile versions 1 and 2 and parity evidence schema versions 1, 2, and 3 as legacy read-only inputs. Validate their former exact row, digest, runtime, and cleanup contracts without adding current fields or rewriting the run.
- For an existing plan with only legacy goal/Markdown evidence, validate it read-only under the former revision and exact-row contract and label the route legacy. Never migrate it during `$review`.

Record malformed schema, stale digest, missing/duplicate/extra row, incomplete axis coverage, failed required/risk/anchor probe, missing artifact, invalid checkpoint, failed cleanup, condition drift, false full-parity claim, or false non-UI classification as mandatory major findings. Materialize one separate `source: conformance`, `severity: major` finding for every deterministic defect before reviewer synthesis, including its exact row ID, digest, field, or path. Every row-set finding must explicitly name `ui-contract.json` and `parity-spec.json` as the expected set and `implementation-parity.json` as the observed set. Do not merge independent defects or rely on the conformance reviewer to preserve them. Continue other read-only checks where possible.

Treat `automationCoverageStatus`, `humanVisualApprovalStatus`, and `fullParityStatus` independently. Coverage passing is not human approval and is not full parity. Include representative screenshot/URL availability and the visual judgments still requiring a human in the report evidence.

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
