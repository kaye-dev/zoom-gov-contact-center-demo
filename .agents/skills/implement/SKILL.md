---
name: implement
description: "Implement an adopted repository goal, run focused static checks and a brief UI smoke, and incorporate direct minor UI feedback. Explicit $implement approves the selected design."
---

# Implement

The current agent owns implementation and verification; do not delegate implementation to a custom agent. Use the goal and the user's latest instructions as the specification. Preserve unrelated changes.

## Start

1. Resolve the explicit `plans/<slug>/goal.md`, or the only canonical goal. Stop for an ambiguous choice, not for other plans when the requested path is known.
2. Read the complete goal, applicable repository rules, affected code/tests, and Git status. Check its requirements, interfaces, completion conditions, and user-check handoff using [goal-quality.md](../plan/references/goal-quality.md).
3. The explicit invocation approves the selected goal and prototype. Ask only for a genuinely unresolved specification or new consequential action. Browser availability is not a start gate.
4. For UI work, read [workflow-verification-contract.md](../plan/references/workflow-verification-contract.md) and `.claude/rules/dev-server.md`. Read the adopted prototype HTML/CSS and referenced assets; carry its visual specification into implementation even where the goal omits it, honoring later direct UI instructions. Legacy parity descriptions are historical validation data; retain product requirements and use smoke for this workflow.

For non-UI work, verify the goal-specific static checks. Do not create a prototype, approval file, or parity evidence. An owned development-tool fixture is allowed only when the adopted goal calls for that limited test.

## Implement and verify

- Implement the adopted behavior and prototype design using existing components and conventions. Preserve the prototype; do not edit it to match an unintended implementation difference. Use focused checks during editing.
- At completion run affected tests, applicable lint/typecheck, and diff checks. Build for route/configuration/bundling/server-boundary changes or an explicit requirement. Run the full suite only for a concrete cross-suite impact or when no reliable focused selection exists.
- Reuse passing checks when their paths, content, and execution time still apply. A digest is optional supporting information. A missing digest alone does not require re-execution. After a fix rerun only affected checks.
- Review the final diff against the goal and latest instructions. Fix in-scope defects and continue; do not turn a test failure into another approval request for already-authorized repairs.
- Preserve user-owned servers. Use HMR for normal edits, an isolated build when needed, and the runtime ownership rules for any explicit restart.

## Brief final UI smoke

After implementation and static checks, start or reuse the owned app through `./dev-compose.sh ensure` and use its verified URL. Follow the public Browser documentation before operating the Codex in-app Browser.

Check normally 1–3 representative scenarios in total:

1. Display the adopted prototype and affected app UI at the same representative viewport/theme/state. Compare their major structure and appearance under the shared contract, and check missing, overlapping, clipped, overflowing, or unusable areas. A usable page can still have an unintended design difference.
2. Perform the main happy path through visible completion. For a save flow, observe the save result or rendered update. Prototype/fixture display alone is not evidence of real-app persistence.

Choose representative responsive/theme conditions only when relevant to the change. Do not enumerate every button, failure path, state, boundary, or viewport/theme combination. Do not use strict DOM, geometry, or pixel equality. Detailed parity, manifests, approval ledgers, estimates, and matrix runners are outside this workflow.

Keep the check to a few minutes as a guide, not an approval deadline. Fix a discovered in-scope defect and recheck the affected part. If Browser is unavailable, preserve the implementation, report static results and `UI未確認`, and allow shipping with that disclosure. An observed defect is a failure, not merely unverified. Stop repeated identical tool failures, report the actual limitation, and do not build validation infrastructure or switch tasks to bypass it.

## Direct UI feedback

A direct request for a local adjustment such as spacing, position, size, color, or wording authorizes that fix when behavior, permissions, and data contracts are preserved. Implement it without requiring `$plan` or another `$implement`, keep goal/prototype unchanged, and run only applicable local checks plus a brief check of the changed UI. Report the intended difference so later work honors the latest instruction instead of reverting to the older prototype.

For a requested design change, update the plan through an explicit `$plan` request and implement the adopted revision through `$implement`. Ask about unresolved product/permission/data decisions only; do not infer a new design from a vague complaint.

## Cleanup and finish

Treat exact phrase `確認セッションを保持` as an opt-in only when it appears in the current invocation. After smoke, use `./dev-confirmation.sh attach-app <slug>` and status to retain the owned app, and report `./dev-confirmation.sh stop <slug>`. Otherwise clean up only baseline-delta resources proven task-owned with `./dev-compose.sh cleanup`; never delete volumes or stop pre-existing/user resources.

Report changed paths, actual checks and smoke outcomes, comparison conditions/matches/accepted differences, known failures, unverified items, and unchecked human UI items. If either surface could not be displayed, report `prototypeとの視覚照合は未確認`. Keep progress in the report, not in the goal. Review and shipping reuse valid results rather than rerunning Browser for an engineering phase change.

Do not start `$review`, push, or create a PR automatically. Stage/commit only if the adopted goal explicitly authorizes scoped local commits; such commits require successful affected checks and do not authorize shipping. A later explicit `$git-commit-push-pr` handles commit, push, and PR together.
