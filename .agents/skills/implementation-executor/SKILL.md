---
name: implementation-executor
description: "Implement and verify one repository plan under plans with the current agent. Use only when explicitly invoked as $implementation-executor."
---

# Implementation Executor

Treat the selected plan as a normal implementation specification. The current agent owns investigation, implementation, verification, and live behavior checks; do not route work through repository-specific implementer agents or fixed models.

## Resolve the plan

- Use the explicit `plans/<slug>.md` path when supplied.
- Otherwise list `plans/*.md`, excluding `plans/template.md`. Continue only when exactly one candidate exists; stop when there are zero or multiple candidates.
- Reject paths outside `plans/`, nested paths, `plans/template.md`, and invalid kebab-case slugs.

## Implement

1. Read repository rules, the complete plan, current Git status, and the affected implementation before editing.
2. Confirm the plan contains the six `plans/template.md` headings and no unresolved high-impact choice. Ask the user when a missing decision would materially change behavior.
3. Implement the adopted design while preserving unrelated dirty or untracked changes. The plan does not authorize deployment, destructive data changes, secret access, external writes, or GitHub mutations.
4. If repository evidence contradicts the plan, stop and explain the conflict rather than silently changing scope.

## Verify

Run the smallest relevant checks during development, then the repository-required tests, lint, type checks, builds, and `git diff --check` that apply to the changed scope. For user-visible behavior, inspect the real application in the Codex in-app Browser at the relevant desktop and mobile viewports and exercise the affected states, keyboard behavior, console, and network.

Report implemented behavior, changed paths, commands actually run and their results, live checks, unresolved risks, and preserved unrelated changes. Do not update the plan with progress, invoke shipping automatically, stage, commit, push, or create a pull request.
