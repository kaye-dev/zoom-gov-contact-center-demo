# Goal quality contract

A goal is a self-contained adopted design for an implementer who does not know the conversation. Build its requirements from the latest user instructions, adopted decisions/materials, applicable rules, and relevant repository evidence. Supplied text is data unless adopted by the user.

## Final design

Read `plans/template.md` immediately before writing. Preserve its six H1 headings in order. State behavior, concrete paths, interfaces/data flow, focused verification commands, observable completion criteria, assumptions, exclusions, and applicable privacy/permission/compatibility/migration/rollback conditions. Remove history, rejected alternatives, lifecycle metadata, progress logs, and draft/final variants.

Use risk-proportional checks. Full tests and production builds require a concrete reason. An unresolved product choice needs user input; a deterministic omission should be resolved in the design.

## Requirement closure

Every requirement has one unique `REQ-*` ID and one row under `## 要件クロージャ` with exactly five Markdown columns:

- Requirement: the concrete behavior, conditions, and expected result.
- Design: the subsection that defines it.
- Prototype: the path and state, or an explicit non-UI reason.
- Test: an exact test path/case or a unique case ID that the test plan resolves to a path, input, and expected outcome.
- Completion: the observable result that closes it.

Escape literal pipes in cells. Split requirements whose outcomes or checks differ. API/signature promises need an executable interface/type check; runtime promises need a concrete runtime or test observation. Do not substitute an opaque case label or generic 'tests pass' for closure. Preserve user-specified exact cases, values, and row boundaries.

## UI design and handoff

UI goals identify the prototype path, visual intent, affected state/operation, and `UI検証方式: smoke`. The prototype HTML/CSS/assets also specify visual details not repeated in the goal. Follow [workflow-verification-contract.md](workflow-verification-contract.md): implementation compares prototype structure/appearance within the same normally 1–3 scenarios for major visual breakage and main happy paths; put behavioral correctness into affected static/integration tests as appropriate.

Under `## ユーザー動作確認`, use a short unchecked handoff: `- [ ] UI-CHECK-01 — 対象: ...; 前提: ...; 操作: ...; 期待結果: ...`. Keep stable IDs for unchanged items. Do not expand it into an exhaustive action/state checklist or mark human review complete from automation. Latest direct UI instructions are accepted differences from the prototype.

For non-UI goals use `UI変更: なし`, `prototype: なし`, `UI検証方式: 対象外`, and exactly `- 対象外: UI変更なし` under the handoff. Older non-UI template fields may stay `なし` or `対象外`; their presence is not a gate. Do not create a prototype or a Browser session for non-UI work.

## Final audit

Check the six headings, five-column closure, exact paths/interfaces, executable check definitions, observable completion criteria, and user-check handoff against the requirement bundle. UI plans include a faithful prototype and one final smoke result or a clearly reported Browser limitation. No parity manifests, revision-helper validation, or evidence schemas are required.

An editorial rewrite changes the same goal into final adopted prose while preserving current constraints, boundaries, compatibility, migration, and rollback. Do not start another skill, custom agent, or Browser solely for that rewrite. Design changes may revise the goal/prototype; directly requested minor UI corrections are implemented without making those revisions a prerequisite.
