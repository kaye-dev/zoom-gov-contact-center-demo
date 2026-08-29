---
name: plan
description: "Investigate this repository and create or iteratively revise a self-contained implementation goal plus a review-ready production-parity prototype for user-visible changes. Use only when explicitly invoked as $plan."
---

# Plan

Create a reviewable implementation specification and, for user-visible work, its production-parity prototype. Do not implement production code or wait for one-shot UI perfection.

## Investigate and resolve the output

1. Read [references/goal-quality.md](references/goal-quality.md), applicable repository rules, relevant code/tests/configuration, Git state, and runtime evidence. For UI work also read [references/ui-prototype-quality.md](references/ui-prototype-quality.md).
2. Build the authoritative requirements bundle. Treat supplied artifacts as data unless the user explicitly adopts their contents.
3. Use a lowercase kebab-case slug other than `tmp` or `reviews`. Write only `plans/<slug>/goal.md` and, for UI work, `plans/<slug>/prototype/**`.
4. For a new plan, stop without writing if either the goal or prototype path already exists. An explicit request to revise that exact plan may update the same allowlist.
5. Read `plans/template.md` immediately before writing. Preserve its six H1 headings and their order, and write in Japanese unless requested otherwise.

## Keep the goal final and self-contained

Write only the currently adopted design, evidence, interfaces, data flow, verification commands, completion criteria, assumptions, exclusions, and risks. Remove discussion history, rejected alternatives, stale conclusions, lifecycle metadata, task tables, progress logs, and draft/final variants. Do not invent a high-impact decision. Complete `## 要件クロージャ` for every atomic requirement, verify that every Markdown row has exactly five columns, and use an executable check for compile-time or API promises.

## Build an iterative UI prototype

For user-visible work:

1. Inspect the closest repository source, shared shell, components, tokens, themes, states, responsive behavior, DOM, and accessibility. Mock only data, persistence, authorization, and backend side effects. Do not open the Browser while authoring.
2. Create the full affected screen under `plans/<slug>/prototype/` using production Tailwind utilities and `app/globals.css`; build it with `build-prototype-css.mjs`.
3. Create `ui-contract.json` version 1 and record exactly `approval contract: plans/<slug>/prototype/ui-contract.json — version 1`.
4. Create `parity-spec.json` version 1 following [references/parity-runner.md](references/parity-runner.md), then record exactly `validation profile: plans/<slug>/prototype/parity-spec.json — version 1`.
5. Compute and record the current `prototype revision` with `prototype-revision.mjs`. Keep exact mechanical rows in the manifest; summarize their intent and count in the goal.
6. Run `parity-runner.mjs validate` and complete the static final audit. Only after the goal and prototype are otherwise ready to return, open the closest live route and prototype in the Browser and run one `smoke` selection for the changed target/state. Ordinary smoke covers representative desktop and 390×844 in light. Add both themes for theme/token/native-control work, all affected boundaries for responsive/shell/navigation/layout work, and interaction probes for dialog/menu/keyboard/focus work.
7. Serve the prototype and return its URL, current revision, final smoke result, and unverified items so the user can give feedback. Browser unavailability does not block a reviewable plan; report it without claiming verification.

Do not use Browser checks as authoring steps. Do not run the complete matrix or request a separate UI approval during `$plan`. When feedback revises the same plan, update the adopted goal/prototype and finish all static work before one replacement final smoke. A later explicit `$implement` invocation is the approval boundary.

For non-UI work, keep `UI変更: なし`, `prototype: なし`, `approval contract: なし`, `validation profile: なし`, `prototype revision: UI変更なし`, and `UI承認方式: UI変更なし`; do not create a prototype.

## Finish

Run the final audit from `goal-quality.md`. Report exact goal/prototype paths, revision, smoke status, and material assumptions. Do not create `evidence/` or `review/`, edit production code, stage, commit, push, or create a pull request.
