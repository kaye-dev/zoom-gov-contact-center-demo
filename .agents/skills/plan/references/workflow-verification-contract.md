# UI smoke and focused verification

This is the shared verification contract for plan, implementation, review, and shipping. UI verification uses `UI検証方式: smoke`; non-UI work uses goal-specific checks.

## Scope and evidence

Choose normally 1–3 representative scenarios in total. Check prototype conformance, major visual breakage, and the main happy path through visible completion within that same selection. A scenario may contain several operations; do not turn each click or comparison into a separate validation requirement.

Before implementation, read the adopted prototype TSX, fixture/config, relevant saved `.shared` components/styles and assets, or the existing HTML/CSS. Reuse those presentation components and carry new TSX into production through data/action adapters. Do not refresh `.shared` during implementation or rewrite the prototype to make a comparison pass. Carry its major regions, components, order, placement, width, spacing, color roles, and typography hierarchy into the implementation, including visual details omitted from the goal. Apply the latest direct user correction to its specific scope. Do not rewrite the prototype to justify implementation drift.

Plan checks the completed prototype. After static validation, implementation displays the adopted prototype and real app with the same representative data, permissions, viewport, theme, and corresponding state, and visually compares those design features. Reuse a matching prototype server or serve its saved source through the existing non-retaining prototype entrypoint; follow runtime ownership and cleanup rules. Unrequested region additions/removals, reordering, card wrappers, or changes to these visual features are defects even when the page is usable and saving succeeds. Ignore minor pixel and browser-rendering differences. If production data differs, use an already-authorized equivalent sample or report the relevant differences; do not add product state-injection APIs or change DB data just for visual matching.

Report the compared screen/conditions, observed matches, differences authorized by direct instructions, and unverified items concisely in the implementation result. If either surface cannot be displayed, explicitly report `prototypeとの視覚照合は未確認`; source inspection alone does not establish visual conformance. Review and shipping reuse valid results, including this limitation. When matching implementation observations already exist, review them against the current source without reopening either surface. Moving to review or shipping is not a reason to rerun Browser. A screenshot or fixture state does not prove a real save or API operation.

The Browser scope excludes exhaustive failure/state/consumer/boundary combinations and strict DOM/style/geometry/pixel comparisons. Responsive/theme representatives belong in the same small selection when they are the subject of the change. Keep product requirements covered by affected unit/integration tests and diff inspection.

Run affected tests, applicable lint/typecheck, and diff checks. Full tests/build need a concrete change-related reason during implementation; shipping additionally requires the current automatic CI checks before commit under the git-commit-push-pr preflight contract. Reuse results based on path/content/time; rerun affected checks after a relevant edit or failure. Digest files and evidence schemas are not prerequisites. New prototype checks use the selected host and TSX only; no routine Next.js build, extra comparison phase, install, performance report, or approval is added. HMR and existing process/cache reuse replace repeated preparation.

## Runtime and failures

Use the Codex in-app Browser public API, after reading its current documentation. Follow `.claude/rules/dev-server.md` for verified URLs, ownership, login, retention, and cleanup. A Browser error must not be described as a permission error without supporting evidence. Do not bypass denials with another Browser or task.

An observed in-scope defect is repaired and rechecked locally. Browser unavailability is `UI未確認`; preserve edits and allow disclosed shipping. Keep known test/functional failures distinct. Stop repeated identical tool failures and report the limitation; validation infrastructure development is a separate scope.

A few minutes is a planning guide, not an approval deadline. Keep the selected scope bounded and disclose unexecuted checks. Do not introduce time-extension handoffs or new ledgers.

## Feedback and existing plans

A design revision uses `$plan` followed by explicit `$implement`. A direct local UI correction authorizes implementation without plan/prototype editing or skill reinvocation. Honor that correction in subsequent review/shipping. Permission/data-contract changes still require a resolved specification and applicable authorization.

For work adopting this workflow, existing goals also use smoke. Preserve functional, permission, and data requirements. Keep old parity descriptions and evidence as historical data without rewriting their results or requiring another approval of the verification method.

Detailed parity is not an execution option or completion gate. Do not generate its manifests, run its estimates/approval/matrix lifecycle, or route it to release/CI/scheduled checks. The old executors and readers have been removed. Preserve historical goals, images, archives, and evidence with their original bytes and status; no machine verification or run resumption is provided.
