---
name: plan-critic
description: "Independently review and rewrite one repository plan into an evidence-backed self-contained implementation plan. Use only when explicitly invoked as $plan-critic."
---

# Plan Critic

Review one plan with a fresh independent subagent, then replace that same file with a coherent final version. Do not create a critique artifact or change log.

## Resolve the plan

- Use the explicit `plans/<slug>.md` path when supplied.
- Otherwise list `plans/*.md`, excluding `plans/template.md`. Continue only when exactly one candidate exists; stop when there are zero or multiple candidates.
- Reject paths outside `plans/`, nested paths, `plans/template.md`, and slugs that do not match `^[a-z0-9][a-z0-9-]*$`.

## Run an independent critique

Read the applicable repository rules, target plan, relevant code, tests, configuration, and runtime evidence. Start a fresh no-history subagent and pass only:

- the exact plan;
- applicable repository rules;
- the minimum repository and runtime evidence needed to verify it.

Do not pass the parent conversation, desired verdict, or prior critique. Ask the reviewer to find factual errors, missing requirements, unsafe assumptions, contradictions, incomplete interfaces or data flow, weak completion criteria, and inadequate tests. The reviewer returns findings only and must not edit files.

## Decide before writing

Check every finding against the request and repository evidence. If resolving a high-impact unknown or requirement conflict requires a user decision, stop and ask the user before changing the plan. Do not guess, select a product direction, or silently narrow scope.

## Rewrite the same plan

Read `plans/template.md`, prepare the complete replacement, and write the target once so readers never observe a partially rewritten plan. Preserve the template's six headings and their order.

Rewrite the document as if the adopted design had been known from the start. Keep only current decisions and supporting evidence; remove rejected alternatives, discussion history, draft wording, contradictions, and obsolete instructions. Use `変更なし` or `なし` for inapplicable content. Do not add metadata, status, task tables, gates, progress logs, prototype contracts, hashes, or separate draft/final files.

Report the updated path, incorporated corrections, and any remaining explicit risks. Do not create `critique.md`, edit production code, stage changes, commit, push, or create a pull request.
