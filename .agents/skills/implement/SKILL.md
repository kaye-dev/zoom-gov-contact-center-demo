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
4. For UI work, require canonical `ui-contract.json` version 1, `parity-spec.json` version 1, and the goal's matching approval-contract, validation-profile, and prototype-revision fields. Validate with `prototype-revision.mjs` and `parity-runner.mjs validate`.
5. Create a fresh run ID. Hash the complete goal, capture the current prototype revision and validation-profile digest, and use `createApprovalEvidence` plus `writeRunEvidence` from [parity-runner.md](../plan/references/parity-runner.md) to write `plans/<slug>/evidence/<run-id>/approval.json`.

The user's explicit `$implement` invocation is the approval basis. Do not require a prior machine-parity field, manual UI-approval field, revision transcription, or another approval question. This approval does not authorize deployment, destructive data changes, secrets, external writes, or GitHub mutations.

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
- If the verified Compose runtime needs a new-route or stale-cache refresh, recheck project, checkout mount, and exact `web` service identity, then run `./dev-compose.sh restart web` without asking. Record before/after container ID, mount, port, URL, fixture, and authorization. Do not restart other services or run broad Compose shutdown.
- Before a build that shares output, stop only agent-owned runtime after identity recheck. Never stop a user-owned server for a build; use an exact isolated build or report the build blocked.
- For focused code/test edits, run the named relevant tests plus lint/typecheck and `git diff --check`. Run the full test suite only when the change can affect unrelated suites or no reliable targeted command exists. Run a production build only for route/configuration/bundling/server-boundary changes or an explicit repository requirement; do not create an isolated build solely because a UI file changed.

## Final Browser review

Only after implementation, focused tests, lint/typecheck, any justified build, and diff review are otherwise complete:

- Start or reuse the correct real app at `http://localhost:3000`, then start `./dev-prototype.sh <slug>` once. Recheck runtime owner, checkout/mount, route, fixture, authorization, query, viewport, DPR, scroll, and captured digests.
- Run one capability canary and one phase `final` over the recorded `targeted` selection or justified `full` matrix. Use an existing common adapter when available; otherwise operate the selected rows directly in the Codex in-app Browser. Do not create a substantial task-specific adapter or runtime shim.
- Write only `implementation-parity.json` using parity evidence schema version 3. New runs do not create `pre-edit-parity.json`.
- If the final review reveals an implementation defect, fix it using the evidence, finish static checks, and replace the invalidated final review once at the new completion boundary. Do not add an `affected` run, supplemental sweep, or separate duplicate manual check.

Browser unavailability, a failed selected row, unexplained difference, or condition drift prevents a completion claim but does not roll back valid implementation edits. Any later related change invalidates it and requires one replacement final review at the next completion boundary. Report the exact unverified or failed condition. For Browser plumbing, stop after one setup attempt plus one retry rather than redesigning the runner inside the feature task.

Clean up only baseline-delta resources proven agent-owned. Never run broad `docker compose down`, delete volumes, or stop pre-existing/user resources other than the specifically authorized verified `web` restart.

Report changed paths, commands and results, runtime checks, evidence paths, parity results, risks, and preserved unrelated changes. Do not mutate the goal for progress, ship automatically, stage, commit, push, or create a pull request.
