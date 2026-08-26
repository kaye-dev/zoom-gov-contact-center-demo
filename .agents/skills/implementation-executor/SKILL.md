---
name: implementation-executor
description: "Implement one approved plans/tmp plan with Terra and optional Luna workers, then verify it. This is a lightweight execution handoff, not a custom Plan Mode."
---

# Implementation Executor

Implement the exact plan path supplied by the user, normally `plans/tmp/<plan-id>/final.md`. This skill is explicit-invocation only and does not create its own runtime, state machine, or permission model.

## Execute the plan

1. Read repository rules, the exact plan, current Git status, and relevant implementation. Run `node scripts/validate-plan-file.mjs <plan-path>` before editing.
2. Require user approval of the plan and any UI prototype. Stop for unresolved high-impact questions, read-only permission, overlapping unrelated changes, or an operation outside the user's authority.
3. Use one `implementer` (`gpt-5.6-terra` / `high`) as the integration owner for non-trivial work. Use `mechanical_worker` (`gpt-5.6-luna` / `medium`) only for narrow tasks without design judgment.
4. Run independent reads/tests in parallel where useful. Run parallel writes only in separate Git worktrees; otherwise write serially in the shared worktree. Workers do not stage, commit, push, or update the plan.
5. After integrating a task, run its stated verification and only then check its progress box and add a concise Japanese result to `実行記録`.
6. Run the plan's final lint, typecheck, tests, build, and live UI checks as applicable. Do not claim checks that did not run.

The integration owner checks G03 only after the implementation code and final automated checks pass. For a large or hard-to-understand diff, explicitly hand the result to `implementation-review`, fix accepted findings, and repeat the relevant checks. Check G04 only after both fresh review passes have been rerun against the final diff with no unresolved blocker/major and `node scripts/validate-review-data.mjs <review-directory> <exact-final.md>` passes. When review is not applicable, check G04 only after recording the concrete reason in `実行記録`. Check G05 only after every required in-app Browser/live behavior check passes. Record the evidence beside each gate.

Commit, push, PR updates, deploys, external writes, secrets, destructive operations, and production migrations require separate current-user authorization; when shipping is authorized, hand the exact plan path to `git-commit-push-pr`.
