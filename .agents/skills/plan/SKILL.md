---
name: plan
description: "Investigate this repository and create a self-contained implementation goal in a plan directory, including a production-parity prototype for user-visible changes. Use only when explicitly invoked as $plan."
---

# Plan

Create the implementation specification and, for a user-visible change, its approval-ready UI prototype. Do not implement production code.

## Investigate first

1. Read the applicable `AGENTS.md`, `CLAUDE.md`, and `.claude/rules/**.md` files.
2. Inspect the relevant code, tests, configuration, Git state, and runtime behavior. For UI or runtime work, verify the nearest existing behavior rather than planning from filenames alone.
3. Distinguish confirmed repository evidence, reasonable assumptions, and genuinely unknown facts. Do not present an unknown as confirmed.

## Choose the output

- Derive a concise English lowercase kebab-case slug matching `^[a-z0-9][a-z0-9-]*$`; `tmp` and `reviews` are reserved legacy names.
- Write the goal to `plans/<slug>/goal.md`. If that path already exists, stop before writing unless the user explicitly asked to revise or replace that exact goal.
- Read `plans/template.md` immediately before authoring. Preserve its six headings and their order exactly; add subsections only when they make the implementation unambiguous.
- Write the plan in Japanese unless the user requests another language.

## Author the adopted design

Write a self-contained plan that a new implementer can execute without the preceding conversation. Include concrete file paths, current behavior and evidence, accepted implementation decisions, interfaces and data flow, verification commands, completion criteria, assumptions, exclusions, and risks.

Describe only the adopted design in logical order. Remove rejected alternatives, discussion history, draft language, stale conclusions, and instructions that no longer apply. Do not invent decisions to close a high-impact unknown or requirement conflict; surface it to the user instead of writing a falsely complete plan.

For every inapplicable section or subsection, write `変更なし` or `なし`. Do not add global metadata, lifecycle status, task tables, lifecycle gates, progress logs, hashes, or draft/final files. Preserve the template's compact `UI契約` subsection.

## Align user-visible UI before implementation

- For every user-visible change, read [references/ui-prototype-quality.md](references/ui-prototype-quality.md) and follow it before finalizing the goal.
- Inspect the closest live route and its source, then create the production-parity artifact under `plans/<slug>/prototype/`. Mock only unavailable data, persistence, authorization, and backend side effects.
- Build prototype styling from production Tailwind utilities and `app/globals.css` with `.agents/skills/plan/scripts/build-prototype-css.mjs`; do not create an approximate parallel stylesheet.
- Record the baseline, actual comparison conditions, state inventory, themes, responsive boundaries, invariants, intentional deltas, parity matrix, machine result, and UI approval in `## UI契約` under `# 実装方針`.
- Automated and Browser comparisons may establish `machine parity: 合格 — YYYY-MM-DD — <evidence summary>` but never user approval. Keep `UI承認記録: 未承認` until the user explicitly approves the rendered prototype, then record `UI承認記録: YYYY-MM-DD — <explicit approval basis>` in that exact goal.
- If the user explicitly requests a revision or records approval for an existing goal, update that exact `goal.md`. Any material prototype or UI-contract change invalidates prior UI approval.
- When there is no user-visible change, keep `UI変更: なし`, `prototype: なし`, and `UI承認記録: UI変更なし`; do not create a prototype.

## Finish

Re-read the generated goal against `plans/template.md`, repository evidence, and the request. Confirm the heading order, output path, overwrite decision, unresolved high-impact matters, and UI approval state. Report the exact goal and prototype paths plus the most important assumptions. Do not edit production code, stage changes, commit, push, or create a pull request.
