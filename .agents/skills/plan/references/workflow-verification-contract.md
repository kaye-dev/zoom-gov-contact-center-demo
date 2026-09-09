# UI smoke and focused verification

This is the shared verification contract for plan, implementation, review, and shipping. UI verification uses `UI検証方式: smoke`; non-UI work uses goal-specific checks.

## Scope and evidence

Choose normally 1–3 representative scenarios in total. Observe major visual breakage and the main happy path through visible completion. Use the prototype for visual intent and the latest user instruction for accepted local differences. A scenario may contain several operations; do not turn each click into a separate validation requirement.

Plan checks the completed prototype. Implementation checks the completed real app after static validation. Review and shipping reuse valid implementation results. A screenshot or fixture state does not prove a real save or API operation. Report only what was observed.

The Browser scope excludes exhaustive failure/state/consumer/boundary combinations and strict DOM/style/geometry/pixel comparisons. Responsive/theme representatives belong in the same small selection when they are the subject of the change. Keep product requirements covered by affected unit/integration tests and diff inspection.

Run affected tests, applicable lint/typecheck, and diff checks. Full tests/build need a concrete change-related reason. Reuse results based on path/content/time; rerun affected checks after a relevant edit or failure. Digest files and evidence schemas are not prerequisites.

## Runtime and failures

Use the Codex in-app Browser public API, after reading its current documentation. Follow `.claude/rules/dev-server.md` for verified URLs, ownership, login, retention, and cleanup. A Browser error must not be described as a permission error without supporting evidence. Do not bypass denials with another Browser or task.

An observed in-scope defect is repaired and rechecked locally. Browser unavailability is `UI未確認`; preserve edits and allow disclosed shipping. Keep known test/functional failures distinct. Stop repeated identical tool failures and report the limitation; validation infrastructure development is a separate scope.

A few minutes is a planning guide, not an approval deadline. Keep the selected scope bounded and disclose unexecuted checks. Do not introduce time-extension handoffs or new ledgers.

## Feedback and existing plans

A design revision uses `$plan` followed by explicit `$implement`. A direct local UI correction authorizes implementation without plan/prototype editing or skill reinvocation. Honor that correction in subsequent review/shipping. Permission/data-contract changes still require a resolved specification and applicable authorization.

For work adopting this workflow, existing goals also use smoke. Preserve functional, permission, and data requirements. Keep old parity descriptions and evidence as historical data without rewriting their results or requiring another approval of the verification method.

Detailed parity is not an execution option or completion gate. Do not generate its manifests, run its estimates/approval/matrix lifecycle, or route it to release/CI/scheduled checks. Historical tools/readers remain available as stored code, outside normal execution. Read their archived references only for an explicit historical-data investigation, never as a prerequisite to feature work.
