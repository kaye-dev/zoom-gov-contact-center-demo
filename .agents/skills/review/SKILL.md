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
- For new-format UI work, read [../plan/references/parity-runner.md](../plan/references/parity-runner.md), recompute prototype revision/profile digest, and validate the selected run's `approval.json`, `pre-edit-parity.json`, and `implementation-parity.json` before reviewer work. Require matching goal/revision/profile digests, exact full row sets for pre-edit/final, only `pass` rows for completion, structured scroll provenance, and evidence after the last related change.
- For an existing plan with only legacy goal/Markdown evidence, validate it read-only under the former revision and exact-row contract and label the route legacy. Never migrate it during `$review`.

Record malformed schema, stale digest, missing/duplicate/extra row, failed row, missing phase, condition drift, or false non-UI classification as mandatory major findings. Continue other read-only checks where possible.

## Run both passes in parallel

After the shared deterministic audit, start both fresh no-history subagents concurrently:

1. Blind diff review: pass only the exact diff and necessary repository context—not the plan, conversation, evidence verdict, or prior review. Ask for correctness, security, regression, accessibility, maintainability, test-gap, and unexplained-change findings.
2. Goal conformance review: pass the exact goal, same diff/context, checks run, deterministic audit, and applicable prototype/contracts/evidence—not the blind result or conversation. Ask for missing requirements, deviations, incomplete flows, and unsupported completion claims.

Each finding contains `source`, `severity`, `title`, `body`, `location`, and `recommendation`. Preserve both result sets. Stop if independent subagents are unavailable.

## Build and verify the report

Read [references/review-contract.md](references/review-contract.md). Copy the canonical assets to `plans/<slug>/review/`, replace `review-data.json`, screen sensitive values, group changes by intent and risk, and preserve source-labelled findings. Do not persist raw reviewer transcripts.

Serve only the report directory with `scripts/serve-plan-artifact.mjs`. In the Codex in-app Browser, verify desktop and 390×844 layout, filters, decisions, comments, Markdown/copy, keyboard/focus, invalid JSON, console, and network. Report unavailable Browser checks as unverified.

Report the review directory, reviewed/excluded paths, deterministic validation, highest-risk findings, and Browser result. The report does not replace automated tests or live parity.
