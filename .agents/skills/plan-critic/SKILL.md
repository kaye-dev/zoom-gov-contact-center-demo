---
name: plan-critic
description: "Independently review a Japanese implementation plan and optional UI prototype. Do not rewrite or implement the plan."
---

# Plan Critic

Review the exact `plans/tmp/<plan-id>/draft.md` in a fresh read-only context created with `fork_turns="none"` or the runtime's exact no-history equivalent. Explicitly pass only the target draft, optional prototype, repository rules, and needed code/runtime evidence.

- Use the configured `plan_critic` (`gpt-5.6-sol` / `xhigh`). Re-read repository rules and inspect enough code/runtime/UI evidence to test the plan.
- Check objective, scope, UI contract, interfaces, task dependencies, `write_set`, parallelization, completion criteria, verification, risks, rollback, and permission boundaries.
- For a user-visible change, compare the prototype with the actual current screen and the shared UI source. Treat unexplained changes to product identity, shell, navigation, layout, typography, tokens, component density, icons, or responsive behavior as at least `major`; a polished but product-inconsistent mock is not approvable. Require baseline evidence, intentional-deviation rationale, desktop and 390×844 comparison, and applicable interaction/state evidence.
- Treat the prototype as the proposed final production UI contract. Report a missing affected route, overlay, state, final copy, responsive decision, or material interaction as `major` when it would force the implementer to design during development or could cause user-visible rework after implementation.
- Classify findings as `blocker`, `major`, `minor`, or `question`, with evidence, consequence, and a recommended correction in Japanese.
- Do not rewrite the draft, decide whether a finding is accepted, implement code, or perform Git/GitHub operations.

Return the critique to the calling task. Save it as `plans/tmp/<plan-id>/critique.md` only when artifact creation is part of the current request.
