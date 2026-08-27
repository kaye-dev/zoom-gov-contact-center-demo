---
name: plan
description: "Investigate this repository and create a self-contained implementation plan under plans from plans/template.md. Use only when explicitly invoked as $plan."
---

# Plan

Create the implementation specification; do not implement it.

## Investigate first

1. Read the applicable `AGENTS.md`, `CLAUDE.md`, and `.claude/rules/**.md` files.
2. Inspect the relevant code, tests, configuration, Git state, and runtime behavior. For UI or runtime work, verify the nearest existing behavior rather than planning from filenames alone.
3. Distinguish confirmed repository evidence, reasonable assumptions, and genuinely unknown facts. Do not present an unknown as confirmed.

## Choose the output

- Derive a concise English lowercase kebab-case slug matching `^[a-z0-9][a-z0-9-]*$` and write `plans/<slug>.md`.
- If that path already exists, stop before writing unless the user explicitly asked to replace that exact plan.
- Read `plans/template.md` immediately before authoring. Preserve its six headings and their order exactly; add subsections only when they make the implementation unambiguous.
- Write the plan in Japanese unless the user requests another language.

## Author the adopted design

Write a self-contained plan that a new implementer can execute without the preceding conversation. Include concrete file paths, current behavior and evidence, accepted implementation decisions, interfaces and data flow, verification commands, completion criteria, assumptions, exclusions, and risks.

Describe only the adopted design in logical order. Remove rejected alternatives, discussion history, draft language, stale conclusions, and instructions that no longer apply. Do not invent decisions to close a high-impact unknown or requirement conflict; surface it to the user instead of writing a falsely complete plan.

For every inapplicable section or subsection, write `変更なし` or `なし`. Do not add metadata, status, task tables, lifecycle gates, progress logs, prototype contracts, hashes, or draft/final files.

## Finish

Re-read the generated file against `plans/template.md`, repository evidence, and the request. Confirm the heading order, output path, overwrite decision, unresolved high-impact matters, and absence of obsolete workflow language. Report the created plan path and the most important assumptions. Do not edit production code, stage changes, commit, push, or create a pull request.
