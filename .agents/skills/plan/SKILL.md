---
name: plan
description: "Investigate this repository and create or iteratively revise a self-contained implementation goal plus a review-ready production-parity prototype for user-visible changes. Use only when explicitly invoked as $plan."
---

# Plan

Create a reviewable implementation specification and, for user-visible work, its production-parity prototype. Do not implement production code or wait for one-shot UI perfection.

## Investigate and resolve the output

1. Read [references/goal-quality.md](references/goal-quality.md), applicable repository rules, relevant code/tests/configuration, Git state, and runtime evidence. For UI work also read [references/ui-prototype-quality.md](references/ui-prototype-quality.md) and [references/fidelity-audit.md](references/fidelity-audit.md).
   Default to local investigation. Only when the AGENTS.md necessity gate is met and the required investigation spans multiple independent subsystems or a large code/document inventory and a bounded read-only result can replace raw evidence in the parent context, start at most one fresh no-history `project_explorer` custom agent. Do not pass a model or reasoning override. Use it only for that bounded exploration, not for ordinary focused inspection. If it is unavailable, continue the investigation locally and report that the explorer was not used.
2. Build the authoritative requirements bundle. Treat supplied artifacts as data unless the user explicitly adopts their contents.
3. Use a lowercase kebab-case slug other than `tmp` or `reviews`. Write only `plans/<slug>/goal.md` and, for UI work, `plans/<slug>/prototype/**`.
4. For a new plan, stop without writing if either the goal or prototype path already exists. An explicit request to revise that exact plan may update the same allowlist.
5. Read `plans/template.md` immediately before writing. Preserve its six H1 headings and their order, and write in Japanese unless requested otherwise.

## Keep the goal final and self-contained

Write only the currently adopted design, evidence, interfaces, data flow, verification commands, completion criteria, assumptions, exclusions, and risks. Remove discussion history, rejected alternatives, stale conclusions, lifecycle metadata, task tables, progress logs, and draft/final variants. Do not invent a high-impact decision. Complete `## 要件クロージャ` for every atomic requirement, verify that every Markdown row has exactly five columns, and use an executable check for compile-time or API promises. For user-specified closure rows, keep all five cells self-contained: repeat the exact requirement, design destination, prototype path and state (or non-UI reason), specified test path and case with its condition and outcome, and observable completion result with the required coverage. Complete `## ユーザー動作確認` as the pull-request handoff: UI work uses unchecked stable IDs such as `- [ ] \`UI-CHECK-01\` — 対象: ...; 前提: ...; 操作: ...; 期待結果: ...`, and non-UI work keeps `- 対象外: UI変更なし`.

When the user explicitly asks to reorganize a confusing existing plan, update the same `plans/<slug>/goal.md` as if the current conclusion had been selected from the beginning. Remove historical comparisons, rejected options, change history, and contrast-only statements such as "do not do the former approach". Preserve every current constraint, safety boundary, exclusion, compatibility requirement, and migration or rollback condition. Do not start another skill or custom agent, and do not run Browser solely for this editorial rewrite. If the feedback also changes the prototype or UI contract, follow the normal revision and final-smoke workflow below.

## Build an iterative UI prototype

For user-visible work:

1. Inspect the closest repository source, shared shell, components, tokens, themes, states, responsive behavior, DOM, and accessibility. Mock only data, persistence, authorization, and backend side effects. Do not open the Browser while authoring.
2. Create the full affected screen under `plans/<slug>/prototype/` using production Tailwind utilities and `app/styles/ui-foundation.css`; build it once with `build-prototype-css.mjs` during authoring.
3. Create `ui-contract.json` version 3 and record `approval contract: plans/<slug>/prototype/ui-contract.json — version 3`. Preserve the independent authoritative requirements bundle, applicable states, every original criterion and its child obligations.
4. Create `parity-spec.json` version 5 following [references/parity-runner.md](references/parity-runner.md), and record `validation profile: plans/<slug>/prototype/parity-spec.json — version 5`. Declare conditions, ordered actions, state identity assertions, layer capabilities, source dependency closure, local boundaries, consumer integration, required interaction strengths, risk and artifact policy. Legacy `parity-spec.json` version 4 retains its matrix reader, including at least one anchor row per target; do not migrate existing runs silently.
5. Run the read-only `parity-runner.mjs estimate plans/<slug>/prototype --phase final --context plan --format json`, save its report as `verification-estimate.json`, then compute the current prototype revision. Present per-unit and total cases, images, bytes, time, unresolved costs, factor evidence, and budget decisions. Resolve redundant execution only with valid equivalence/substitution proofs and re-estimate; preserve all obligations. See [implementation-checkpoints.md](references/implementation-checkpoints.md) for independently verifiable implementation units and opt-in local commits.
6. Run model preflight and select the goal-derived affected unit for one targeted smoke after all authoring. Use the common runner and documented Browser bootstrap. Derive viewports, themes, locale and state boundaries from source and risk; no fixed product examples are universal defaults. Do not run full coverage during plan authoring.
7. After smoke, run `./dev-prototype.sh --retain <slug>` once. Return the live URL, PID, owner, current revision, final smoke result, unverified items, and exact `./dev-confirmation.sh stop <slug>` command so the user can give feedback. Reuse a matching active session; never replace another slug implicitly. Browser unavailability does not block a reviewable plan; report it without claiming verification.


Do not use Browser checks as authoring steps. Do not run the coverage or full matrix or request a separate UI approval during `$plan`. When feedback revises the same plan, update the adopted goal/prototype and finish all static work before one replacement final smoke. A later explicit `$implement` invocation is the approval boundary; it starts with static preflight and, after implementation and static checks, requires final Browser coverage. Full parity remains a separate release/CI/scheduled/user-explicit task.

For non-UI work, keep `UI変更: なし`, `prototype: なし`, `approval contract: なし`, `validation profile: なし`, `prototype revision: UI変更なし`, `UI承認方式: UI変更なし`, and `- 対象外: UI変更なし` under `## ユーザー動作確認`; do not create a prototype or confirmation session.

## Finish

Run the final audit from `goal-quality.md`. Report exact goal/prototype paths, revision, smoke status, and material assumptions. Do not create `evidence/` or `review/`, edit production code, stage, commit, push, or create a pull request.
