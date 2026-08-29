---
name: plan-critic
description: "Independently review and rewrite one repository goal and optional UI prototype into a self-contained, review-ready specification. Use only when explicitly invoked as $plan-critic."
---

# Plan Critic

Independently review one plan, repair deterministic defects, and leave the same goal as a coherent final design. Do not create a critique artifact or production change.

## Resolve and review

- Use the explicit `plans/<slug>/goal.md`, or the only `plans/*/goal.md`; stop for zero or multiple candidates. Reject invalid or reserved slugs.
- Read [../plan/references/goal-quality.md](../plan/references/goal-quality.md), repository rules, target artifacts, and minimum relevant code/runtime evidence. For UI work also read [../plan/references/ui-prototype-quality.md](../plan/references/ui-prototype-quality.md) and [../plan/references/parity-runner.md](../plan/references/parity-runner.md).
- The write allowlist is the selected goal and its optional canonical prototype. Never edit production, tests, documentation, configuration, Git state, or `review/`.
- Start a fresh no-history subagent with only the authoritative requirements bundle, exact goal/prototype, applicable rules, and necessary repository/runtime evidence. Ask it for atomic requirement closure, factual, interface, safety, verification, and UI-parity findings, including exactly five Markdown columns in every closure row; it must not edit files.

Validate every finding against the authoritative bundle and repository evidence. Stop for a user decision only when correction would choose new product behavior or required live evidence is unavailable. Repair deterministic omissions and prototype defects that follow uniquely from accepted requirements and the closest production UI.

## Rewrite once

Read `plans/template.md` and prepare a complete replacement. Finish prototype repair, CSS build, contract/profile validation, revision calculation, and the static audit before Browser work. Write the goal once as the adopted design, then run one final smoke immediately before returning the result. Preserve the six H1 headings and requirement closure. Do not add lifecycle state, progress, history, or separate draft/final files.

For a repaired or newly reconstructed UI prototype:

1. Synchronize `ui-contract.json` version 1 and `parity-spec.json` version 1 while preserving stable target, state, row, and probe IDs whose meaning did not change.
2. Build CSS, validate both contracts, and recompute `prototype revision`.
3. After every deterministic repair and static audit is complete, run one risk-selected `smoke` selection for the changed target/state. Do not use Browser checks while repairing. Do not run the full matrix or create approval/final evidence.
4. If Browser verification is unavailable, report the smoke scope as unverified and still return the reviewable plan.

Any prototype, manifest, or profile change creates a new revision. There is no plan-time approval state to reset; the next explicit `$implement` invocation approves the then-current goal and revision.

Run the shared final audit and report the updated goal, prototype paths, revision, smoke result, corrections, and remaining risks. Do not create `critique.md`, `evidence/`, or `review/`, and do not stage, commit, push, or create a pull request.
