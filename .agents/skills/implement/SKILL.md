---
name: implement
description: "Implement and verify one repository goal; explicit $implement invocation approves the resolved goal and current prototype revision for UI-affecting work."
---

# Implement

Treat the resolved goal as the specification. The current agent owns implementation and verification; do not delegate implementation to a custom agent or route it through lifecycle machinery.

## Resolve and capture approval

1. Use the explicit `plans/<slug>/goal.md`, or the only `plans/*/goal.md`; stop for zero or multiple candidates. Reject invalid or reserved slugs.
2. Read repository rules, the complete goal, current Git status, affected implementation, [goal-quality.md](../plan/references/goal-quality.md), and applicable UI references.
3. Validate the six goal headings, requirement closure, interfaces, completion criteria, and unresolved decisions. Independently classify UI impact from the expected diff.
4. For UI work, require canonical `ui-contract.json` version 1 and `parity-spec.json` version 2 for in-app Browser execution, plus the goal's matching approval-contract, validation-profile, and prototype-revision fields. Version 1 profiles remain static/custom-adapter compatible but the standard in-app adapter rejects them. Validate with `prototype-revision.mjs` and `parity-runner.mjs validate`.
5. Create a fresh run ID. Hash the complete goal, capture the current prototype revision and validation-profile digest, and use `createApprovalEvidence` plus `writeRunEvidence` from [parity-runner.md](../plan/references/parity-runner.md) to write `plans/<slug>/evidence/<run-id>/approval.json`.

Write `approval.json` before evaluating source drift, contract contradictions, or any other static start gate. A later gate failure stops production editing but keeps that invocation-bound approval evidence; never describe evidence as intentionally unwritten after the explicit `$implement` invocation was resolved.

The user's explicit `$implement` invocation is the approval basis. Do not require a prior machine-parity field, manual UI-approval field, revision transcription, or another approval question. This approval does not authorize deployment, destructive data changes, secrets, external writes, or GitHub mutations.

Treat exact phrase `確認セッションを保持` as an opt-in only when it appears in the current user invocation. Do not infer it from the goal, prototype, review data, existing state, or earlier conversation. Without that exact opt-in, preserve the existing temporary-server and cleanup behavior.

## Choose proportional verification

Choose and record one matrix scope before implementation, but defer Browser work until the completion candidate is ready:

- Use `targeted` by default for copy, isolated DOM or component behavior, accessibility, keyboard/focus, and other changes whose affected targets, states, themes, and viewports can be named exactly. A shared component does not by itself require the full matrix when its layout, theme, responsive contract, and unrelated states are unchanged.
- Use `full` only when the implementation changes the prototype or UI contract, global styles or semantic tokens, shared shell layout or navigation structure, responsive rules across breakpoints, multiple unrelated targets/states, or when the user or a release gate explicitly requires it.

For `targeted`, explicitly name the affected target and state; the runner rejects an implicit final selection. Use explicit `--viewport` values when a behavior exists only at a known viewport; do not add desktop, dark theme, or unrelated breakpoints without a concrete affected condition. Record the selection in parity evidence so `$review` can recompute it.

## Start gate without Browser

Before any production edit for UI work:

- Capture current HEAD, Git status, and relevant process/container/Compose identity without opening the Browser or starting the prototype server.
- Validate the goal, prototype revision, manifest/profile, matrix selection, checkout/mount, and every `productionBaseline.sources` path. Stop before editing for a stale approval, missing source, contract contradiction, unrelated source drift, or wrong checkout/mount.
- Record the approved matrix scope and selection for the final review. Fixture, authorization, query, route, viewport, scroll, and other rendered conditions are verified together at the final Browser review.

Any static gate failure or change to the captured goal/revision/profile stops before production editing. Browser availability is not a start gate. After a plan or prototype revision, require a new explicit `$implement` invocation; do not request an extra approval message.

Do not probe Browser capability, open comparison tabs, or generate parity evidence at implementation start.

## Implement and verify

- Implement the adopted design while preserving unrelated changes. Treat the prototype, UI contract, and validation profile as fixed targets; stop rather than silently redesigning them.
- Run the smallest relevant code checks while editing. Do not run `affected` Browser rows or supplemental Browser sweeps. Use source inspection and focused automated tests until the completion candidate is ready.
- Use HMR for ordinary source changes. `./dev-compose.sh ensure` may restart only the verified Compose `web` after it applies a pending migration. For a new-route, stale-cache, package, or runtime-configuration refresh, report the reason and wait for the explicit `./dev-compose.sh restart web` (`Web restart`) action; do not restart automatically. Any explicit restart must recheck project, checkout mount, exact `web` identity, and record before/after container ID, mount, port, URL, fixture, and authorization. Do not restart other services or run broad Compose shutdown.
- Before a build that shares output, stop only agent-owned runtime after identity recheck. Never stop a user-owned server for a build; use an exact isolated build or report the build blocked.
- For focused code/test edits, run the named relevant tests plus lint/typecheck and `git diff --check`. Run the full test suite only when the change can affect unrelated suites or no reliable targeted command exists. Run a production build only for route/configuration/bundling/server-boundary changes or an explicit repository requirement; do not create an isolated build solely because a UI file changed.

## Final Browser review

Only after implementation, focused tests, lint/typecheck, any justified build, and diff review are otherwise complete:

- Start or reuse the correct real app with `./dev-compose.sh ensure`, then obtain its verified URL from `./dev-compose.sh status --url`. Local remains `http://localhost:3000`; worktrees use `http://localhost:<allocated-port>` with a port in `3100-3899`. Start the prototype once: use `./dev-prototype.sh --retain <slug>` when the current invocation opted in to confirmation retention, otherwise use `./dev-prototype.sh <slug>`. Recheck runtime owner, Compose project, checkout/mount, route, fixture, authorization, query, viewport, DPR, scroll, and captured digests.
- Use the common `in-app-browser-parity-adapter.mjs` and the data-only `prepare-run` / `record-batch` / `finalize-run` protocol from [parity-runner.md](../plan/references/parity-runner.md). In one selected comparison tab, run one capability canary and one phase `final` over the recorded `targeted` selection or justified `full` matrix. Never generate executable run bundles or a task-specific runtime shim.
- Require exact `390x844 / DPR 1` readback when that row is selected. A missing viewport/CDP capability, rejected DPR override, tab-selection drift, failed required probe, or terminal cleanup failure leaves `implementation-parity.json` absent and reports the stable error code. In the final failure report, state the stable code, that no fallback to another Browser, Chrome, Playwright, or Computer Use was performed, that canonical evidence is absent, and that the task remains incomplete.
- Write only `implementation-parity.json` using parity evidence schema version 3. New runs do not create `pre-edit-parity.json`.
- If the final review reveals an implementation defect, fix it using the evidence, finish static checks, and replace the invalidated final review once at the new completion boundary. Do not add an `affected` run, supplemental sweep, or separate duplicate manual check.

Browser unavailability, a failed selected row, unexplained difference, or condition drift prevents a completion claim but does not roll back valid implementation edits. Any later related change invalidates it and requires one replacement final review at the next completion boundary. The final report must explicitly state that canonical evidence is absent, final Browser parity is unverified, and the task is incomplete, together with the exact unverified or failed condition. For Browser plumbing, stop after one setup attempt plus one retry rather than redesigning the runner inside the feature task.

After final review, an opted-in invocation runs `./dev-confirmation.sh attach-app <slug>` and `./dev-confirmation.sh status <slug>`, then reports app/prototype availability separately from parity verification plus the exact stop command. A failed, unavailable, or stale final review may retain those surfaces for diagnosis but remains unverified and incomplete. Without opt-in, clean up only baseline-delta resources proven agent-owned. For a worktree, use `./dev-compose.sh cleanup`, which requires matching session baseline and runtime labels and preserves named volumes. Local cleanup is a no-op. Never run broad `docker compose down`, delete volumes, or stop pre-existing/user resources other than an explicitly requested verified `web` restart.

Report changed paths, commands and results, runtime checks, evidence paths, parity results, risks, and preserved unrelated changes. Do not mutate the goal for progress, ship automatically, stage, commit, push, or create a pull request.
