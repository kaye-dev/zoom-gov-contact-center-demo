---
name: implement
description: "Implement and statically verify one repository goal; explicit $implement invocation approves the resolved goal and current prototype revision for UI-affecting work."
---

# Implement

Treat the resolved goal as the specification. The current agent owns implementation and static verification; do not delegate implementation to a custom agent or route it through lifecycle machinery.

## Resolve and capture approval

1. Use the explicit `plans/<slug>/goal.md`, or the only `plans/*/goal.md`; stop for zero or multiple candidates. Reject invalid or reserved slugs.
2. Read repository rules, the complete goal, current Git status, affected implementation, [goal-quality.md](../plan/references/goal-quality.md), and applicable UI references.
3. Validate the six goal headings, requirement closure, interfaces, completion criteria, unresolved decisions, independently classified UI impact, and `## ユーザー動作確認` handoff.
4. For current UI work, require `ui-contract.json` version 1 and `parity-spec.json` version 3. Run one static `parity-runner.mjs preflight plans/<slug>/prototype --context implement` and require its goal, revision, profile, source inventory, invariant/probe, and selection checks to pass. Never rebuild or open the approved prototype. Versions 1 and 2 remain legacy read-only inputs and are not migrated during implementation.
5. Create a fresh run ID. Hash the complete goal, capture the current prototype revision and validation-profile digest, and use `createApprovalEvidence` plus `writeRunEvidence` from [parity-runner.md](../plan/references/parity-runner.md) to write `plans/<slug>/evidence/<run-id>/approval.json`.

Write `approval.json` before source-drift and other static start gates. A later gate failure keeps this invocation-bound evidence but stops production editing. The explicit `$implement` invocation is the approval basis; do not request a second approval, manual parity field, or revision transcription. Approval does not authorize deployment, destructive data changes, secrets, external writes, or GitHub mutations.

For non-UI work, require `UI変更: なし` and `- 対象外: UI変更なし`; do not create a prototype or approval evidence.

## Static start gate

Before editing production code:

- Capture HEAD, Git status, and the exact task path scope. Preserve unrelated changes.
- Validate the goal, requirement closure, interfaces, completion criteria, and the repository's relevant rules.
- For UI work, validate the current goal hash, prototype revision, validation-profile digest, complete `productionBaseline.sources`, source impact declarations, and the freshly written approval evidence.
- Require each UI checklist item to have a stable `UI-CHECK-XX` ID plus an observable target, prerequisite, operation, and expected result. Require every affected screen, state, interaction, responsive boundary, theme, and accessibility behavior that needs human judgment to be represented. Do not mark any item complete.
- Stop before editing for stale approval, missing source, contract contradiction, unrelated source drift, an ambiguous task scope, or an incomplete user-check handoff.

This gate is static. Do not probe Browser capability, start or inspect an app/prototype server, resolve runtime ownership, log in, run CDP, Playwright, Computer Use, or create parity results.

## Implement and verify statically

- Implement the adopted design while preserving unrelated changes. Treat the approved prototype, UI contract, and validation profile as fixed acceptance inputs.
- Run the smallest relevant code checks while editing.
- Before final checks, run `node scripts/validation-digest.mjs --scope <task-path>` once for the exact task paths and record its HEAD, staged/unstaged/untracked digests, validated diff digest, command, scope, and result.
- Run focused unit and contract tests, applicable lint and typecheck, and `git diff --check`. Run the full suite only when unrelated suites can be affected or no reliable target exists. Run a build only for route, configuration, bundling, server-boundary, or an explicit repository requirement.
- Reuse a passing check only when its command, scope, status, and validated diff digest match. Full test and build each run at most once per digest; after a source fix rerun only affected checks.
- Review the final diff against the goal, requirement closure, exact task scope, and user-check handoff. Ensure the checklist describes only behavior introduced or affected by the actual diff.

Normal `$implement` verification ends at this static boundary, including for UI changes. Do not use the in-app Browser, CDP, Playwright, Computer Use, `dev-compose`, `dev-prototype`, `dev-confirmation`, login flows, parity run lifecycle, artifact sink, screenshots, or `implementation-parity.json`. Do not reinterpret the phrase `確認セッションを保持` as permission to start or preserve a runtime during `$implement`.

The existing parity runner, adapter, and schemas remain available only for an independently requested release, CI, scheduled, or explicit parity task. Such a task is not part of normal `$implement`, and its absence never makes this implementation incomplete.

## Finish

Complete when the implementation matches the goal, all required static checks pass, the diff is cleanly scoped, and the user-check handoff is complete. Separate these states in the report:

- completed automated static checks, with exact commands and results
- user checks that remain unchecked for pull-request handoff
- any optional runtime, Browser, human visual approval, or full parity work that was not run
- changed paths, risks, and preserved unrelated changes

Do not claim runtime behavior, Browser coverage, human UI approval, or full parity from static results. Do not mutate the goal for progress, ship automatically, stage, commit, push, create a pull request, deploy, or merge.
