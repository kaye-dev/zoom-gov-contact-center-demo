---
name: plan-critic
description: "Independently review and rewrite one repository goal and its optional UI prototype into an evidence-backed self-contained specification. Use only when explicitly invoked as $plan-critic."
---

# Plan Critic

Review one goal and its optional prototype with a fresh independent subagent, then replace that same goal with a coherent final version. Do not create a critique artifact or change log.

## Resolve the plan

- Use the explicit `plans/<slug>/goal.md` path when supplied.
- Otherwise list `plans/*/goal.md`. Continue only when exactly one candidate exists; stop when there are zero or multiple candidates.
- Reject any other filename or depth, reserved legacy slugs, and slugs that do not match `^[a-z0-9][a-z0-9-]*$`.

## Run an independent critique

Read the applicable repository rules, target plan, relevant code, tests, configuration, and runtime evidence. Start a fresh no-history subagent and pass only:

- the exact goal;
- `plans/<slug>/prototype/` when the goal declares a user-visible change;
- applicable repository rules;
- the minimum repository and runtime evidence needed to verify it.

Do not pass the parent conversation, desired verdict, or prior critique. Ask the reviewer to find factual errors, missing requirements, unsafe assumptions, contradictions, incomplete interfaces or data flow, weak completion criteria, and inadequate tests. For a user-visible change, require comparison with the closest live route and shared UI source; treat unexplained differences in shell, copy, component choice, Tailwind utilities, themes, responsive behavior, states, keyboard/focus, DOM, or accessibility as major. The reviewer returns findings only and must not edit files.

## Decide before writing

Check every finding against the request and repository evidence. If resolving a high-impact unknown or requirement conflict requires a user decision, stop and ask the user before changing the plan. Do not guess, select a product direction, or silently narrow scope.

## Rewrite the same plan

Read `plans/template.md`, prepare the complete replacement, and write the target once so readers never observe a partially rewritten plan. Preserve the template's six headings and their order.

Rewrite the document as if the adopted design had been known from the start. Keep only current decisions and supporting evidence; remove rejected alternatives, discussion history, draft wording, contradictions, and obsolete instructions. Use `変更なし` or `なし` for inapplicable content. Do not add global metadata, lifecycle status, task tables, gates, progress logs, hashes, or separate draft/final files. Preserve and correct the compact `UI契約`.

Do not edit the prototype. When a finding requires a material prototype or UI-contract change, set `machine parity: 未確認` and `UI承認記録: 未承認`, describe the required revision in the goal, and report that `$plan` must update and revalidate the prototype before implementation. Preserve an existing approval only when neither the rendered prototype nor its material UI contract changed.

Report the updated goal path, incorporated corrections, prototype approval state, and any remaining explicit risks. Do not create `critique.md`, edit the prototype or production code, stage changes, commit, push, or create a pull request.
