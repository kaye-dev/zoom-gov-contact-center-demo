---
name: implement
description: "Implement and verify one repository goal from its plan directory with the current agent, honoring an approved UI prototype when present. Use only when explicitly invoked as $implement."
---

# Implement

Treat the selected plan as a normal implementation specification. The current agent owns investigation, implementation, verification, and live behavior checks; do not route work through repository-specific implementer agents or fixed models.

## Resolve the plan

- Use the explicit `plans/<slug>/goal.md` path when supplied.
- Otherwise list `plans/*/goal.md`. Continue only when exactly one candidate exists; stop when there are zero or multiple candidates.
- Reject any other filename or depth, reserved legacy slugs, and invalid kebab-case slugs.

## Implement

1. Read repository rules, the complete plan, current Git status, and the affected implementation before editing.
2. Confirm the goal contains the six `plans/template.md` headings and no unresolved high-impact choice. Ask the user when a missing decision would materially change behavior.
3. For a user-visible change, require `plans/<slug>/prototype/`, a dated `machine parity: 合格 — ...`, and a dated explicit `UI承認記録: YYYY-MM-DD — ...` before editing production code. `未確認`, `未承認`, missing evidence, Browser evidence alone, and automated evidence alone all stop implementation.
4. Treat the approved prototype and `UI契約` as the production target. Replace mocked data and side effects without silently changing screen structure, copy, component choice, layout, responsive behavior, interactions, or states. Stop for renewed approval when a material deviation is necessary.
5. Implement the adopted design while preserving unrelated dirty or untracked changes. The goal does not authorize deployment, destructive data changes, secret access, external writes, or GitHub mutations.
6. If repository evidence contradicts the goal, stop and explain the conflict rather than silently changing scope.

## Verify

Run the smallest relevant checks during development, then the repository-required tests, lint, type checks, builds, and `git diff --check` that apply to the changed scope. For user-visible behavior, repeat the approved parity matrix against the real application at the same actual viewport, DPR, scroll, locale, theme, fixture, route, and state; cover keyboard/focus, console, and network, and fix every unexplained departure. Preserve dated implementation-parity evidence in the final report for `$review`; do not rewrite the goal as a progress log.

Report implemented behavior, changed paths, commands actually run and their results, live checks, prototype parity, unresolved risks, and preserved unrelated changes. Do not update the goal with progress, invoke shipping automatically, stage, commit, push, or create a pull request.
