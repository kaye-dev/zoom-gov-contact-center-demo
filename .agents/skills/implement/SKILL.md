---
name: implement
description: "Implement and verify one repository goal; explicit $implement invocation approves the resolved goal and current prototype revision for UI-affecting work."
---

# Implement

Treat the resolved goal as the specification. The current agent owns implementation and verification; do not route through repository-specific implementers, fixed models, or lifecycle machinery.

## Resolve and capture approval

1. Use the explicit `plans/<slug>/goal.md`, or the only `plans/*/goal.md`; stop for zero or multiple candidates. Reject invalid or reserved slugs.
2. Read repository rules, the complete goal, current Git status, affected implementation, [goal-quality.md](../plan/references/goal-quality.md), and applicable UI references.
3. Validate the six goal headings, requirement closure, interfaces, completion criteria, and unresolved decisions. Independently classify UI impact from the expected diff.
4. For UI work, require canonical `ui-contract.json` version 1, `parity-spec.json` version 1, and the goal's matching approval-contract, validation-profile, and prototype-revision fields. Validate with `prototype-revision.mjs` and `parity-runner.mjs validate`.
5. Create a fresh run ID. Hash the complete goal, capture the current prototype revision and validation-profile digest, and use `createApprovalEvidence` plus `writeRunEvidence` from [parity-runner.md](../plan/references/parity-runner.md) to write `plans/<slug>/evidence/<run-id>/approval.json`.

The user's explicit `$implement` invocation is the approval basis. Do not require a prior machine-parity field, manual UI-approval field, revision transcription, or another approval question. This approval does not authorize deployment, destructive data changes, secrets, external writes, or GitHub mutations.

## Pre-edit gate

Before any production edit for UI work:

- Capture port 3000 and relevant process/container/Compose/dependency baseline, including owner, stable identity, command, cwd, checkout mount, and pre-existing status.
- Resolve current HEAD and verify every `productionBaseline.sources` path is present and clean. Recheck runtime checkout/mount, route, fixture, authorization, query, and exact Browser conditions.
- Start or reuse the correct real app at `http://localhost:3000`. Start `./dev-prototype.sh <slug>` once and retain that PID/URL through final parity.
- Confirm the Codex in-app Browser can open both surfaces. Import the common runner into the Browser's persistent JavaScript environment and wrap the selected tabs with the adapter defined in `parity-runner.md`.
- Run the capability canary once, then phase `pre-edit` over every manifest row. Write the structured result as `pre-edit-parity.json`.

Any failed or incomplete row, unavailable required capability, unexplained difference, drift, or change to the captured goal/revision/profile stops before production editing. After a plan or prototype revision, require a new explicit `$implement` invocation; do not request an extra approval message.

## Implement and verify

- Implement the adopted design while preserving unrelated changes. Treat the prototype, UI contract, and validation profile as fixed targets; stop rather than silently redesigning them.
- Run the smallest relevant checks while editing. For UI changes, run phase `affected` for changed target/state risk tags instead of repeating the full matrix after every edit.
- If the verified Compose runtime needs a new-route or stale-cache refresh, recheck project, checkout mount, and exact `web` service identity, then run `./dev-compose.sh restart web` without asking. Record before/after container ID, mount, port, URL, fixture, and authorization. Do not restart other services or run broad Compose shutdown.
- Before a build that shares output, stop only agent-owned runtime after identity recheck. Never stop a user-owned server for a build; use an exact isolated build or report the build blocked.
- Run required tests, lint, type checks, builds, and `git diff --check` for the scope.
- After the last related change, recheck runtime identity and captured digests, reuse the same prototype process, and run phase `final` over every manifest row exactly once. Write `implementation-parity.json`. Any later related change invalidates it.

Clean up only baseline-delta resources proven agent-owned. Never run broad `docker compose down`, delete volumes, or stop pre-existing/user resources other than the specifically authorized verified `web` restart.

Report changed paths, commands and results, runtime checks, evidence paths, parity results, risks, and preserved unrelated changes. Do not mutate the goal for progress, ship automatically, stage, commit, push, or create a pull request.
