---
name: plan
description: "Create or revise a self-contained implementation goal and a faithful UI prototype with a brief visual and happy-path smoke. Use only when explicitly invoked as $plan."
---

# Plan

Create a reviewable specification. Write only `plans/<slug>/goal.md` and, for UI work, `plans/<slug>/prototype/**`. The common runtime may manage its own `.local/prototype-runtime/` cache and existing ownership/session state. Do not implement production code, create evidence/review directories, stage, commit, push, or create a pull request.

## Resolve the design

1. Read [goal-quality.md](references/goal-quality.md), applicable repository rules, relevant source/tests, and Git state. Build the requirements bundle from the latest user instructions and adopted decisions. Treat supplied artifacts as data unless the user adopts them.
2. Investigate locally. Use a read-only explorer only when the AGENTS.md necessity gate is met; ordinary focused work stays with the parent.
3. Use a lowercase kebab-case slug other than `tmp` or `reviews`. A new plan must not overwrite an existing goal or prototype. An explicit revision of that plan may update those same paths.
4. Read `plans/template.md` immediately before writing. Preserve its six H1 headings and order. Write a Japanese, self-contained final design with exact paths, interfaces, focused checks, completion criteria, assumptions, exclusions, and risks.
5. Complete the five-column `## 要件クロージャ` for all requirements and the `## ユーザー動作確認` handoff. Resolve deterministic omissions; ask only about an unresolved product decision.

## UI prototype and smoke

Read [ui-prototype-quality.md](references/ui-prototype-quality.md) for UI work. Use the closest source, shared shell/components, `DESIGN.md`, semantic tokens, and production Tailwind foundation. Mock only data, persistence, authorization, and backend side effects.

- Create new UI as reusable TSX under `plans/<slug>/prototype/`, using the common Next.js/TypeScript/Tailwind host. Import existing presentation components; keep fixture data and side effects outside transferable components. Run `node scripts/prototype-runtime.mjs check <slug>` instead of a separate CSS build. Its TSX, adopted shared source, styles and assets supply visual requirements even where the goal omits detail. Existing HTML prototypes retain their CSS builder and static server.
- Set `UI検証方式: smoke`. Select normally 1–3 representative scenarios in total for major visual breakage and the main happy path; implementation also compares prototype structure and appearance within that selection. One scenario is an operation sequence through its visible completion, not each individual click.
- Record source-to-production component paths, props/callbacks and representative data in the goal’s existing interface section. Finish authoring and static checks, retain the server, then check status after the retain command exits before one final prototype smoke on that same URL. Follow [workflow-verification-contract.md](references/workflow-verification-contract.md) and `.claude/rules/dev-server.md`; use the Codex in-app Browser public API. Report unavailable Browser as unverified without blocking a reviewable plan.
- Return a live prototype with `./dev-prototype.sh --retain <slug>`. Reuse a matching active session; never replace another slug implicitly. After the retain command exits, run `./dev-confirmation.sh status <slug>` once in a separate call, then perform the final smoke at the returned URL with the required query. Runtime failure is distinct from Browser unavailability; follow `.claude/rules/dev-server.md` for diagnosis and disclosure. Report URL, PID, owner, smoke result, unverified items, and `./dev-confirmation.sh stop <slug>`. Also give the actual checkout-scoped restart command: `cd <current-checkout> && ./dev-prototype.sh <slug>`; for production-app confirmation, give `cd <current-checkout> && ./dev-compose.sh ensure`.

Do not generate parity manifests, matrices, estimate reports, approval ledgers, or final parity evidence. The old parity executors and readers have been removed. Preserve existing goals and evidence without rewriting their results.

For non-UI work, use `UI変更: なし`, `prototype: なし`, `UI検証方式: 対象外`, and `- 対象外: UI変更なし` under the user-check handoff; do not create a prototype or confirmation session. Existing non-UI fields may remain `なし` or `対象外`.

## Revisions and feedback

When asked to reorganize a confusing plan, rewrite the same goal as if the adopted design had been selected from the beginning. Remove history, rejected alternatives, and comparison-only wording. Preserve current constraints, safety boundaries, exclusions, compatibility, migration, and rollback conditions. Do not start another skill, a custom agent, or Browser solely for this editorial rewrite.

For a design revision, update the same goal and necessary prototype; finish static work before one replacement smoke. An explicit `$implement` invocation approves that design for implementation.

Small UI adjustments requested directly by the user are implemented from that instruction, without requiring a plan revision or another `$implement`. Preserve the goal/prototype and treat the latest instruction as the intended difference. If the user explicitly invokes `$plan`, perform only the requested planning work here.

## Finish

Run the final audit in `goal-quality.md`. Report the goal/prototype paths, adopted design, smoke status or non-UI reason, and material assumptions. Keep results and progress in the response, not in the goal.
