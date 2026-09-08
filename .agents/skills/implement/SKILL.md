---
name: implement
description: "Implement and verify one repository goal; explicit $implement invocation approves the resolved goal and current prototype revision for UI-affecting work."
---

# Implement

Treat the resolved goal as the specification. The current agent owns implementation and verification; do not delegate implementation to a custom agent or route it through lifecycle machinery.

## Resolve and capture approval

1. Use the explicit `plans/<slug>/goal.md`, or the only `plans/*/goal.md`; stop for zero or multiple candidates. Reject invalid or reserved slugs.
2. Read repository rules, the complete goal, current Git status, affected implementation, [goal-quality.md](../plan/references/goal-quality.md), and applicable UI references.
3. Validate the six goal headings, requirement closure, interfaces, completion criteria, unresolved decisions, independently classified UI impact, and `## ユーザー動作確認` handoff.
4. For current UI work, require `ui-contract.json` version 1 and `parity-spec.json` version 4. Run one `parity-runner.mjs preflight plans/<slug>/prototype --context implement` and require its goal, revision, profile, source inventory, invariant/probe, and coverage selection checks to pass; never rebuild the approved prototype; open it only at the final verification boundary. Versions 1, 2, and 3 remain legacy read-only inputs and are not migrated during implementation.
5. Create a fresh run ID. Hash the complete goal, capture the current prototype revision and validation-profile digest, and use `createApprovalEvidence` plus `writeRunEvidence` from [parity-runner.md](../plan/references/parity-runner.md) to write `plans/<slug>/evidence/<run-id>/approval.json`.

Write `approval.json` before source-drift and other start gates. A later gate failure keeps this invocation-bound evidence but stops production editing. The explicit `$implement` invocation is the approval basis; do not request a second approval, manual parity field, or revision transcription. Approval does not authorize deployment, destructive data changes, secrets, external writes, or GitHub mutations.

For non-UI work, require `UI変更: なし` and `- 対象外: UI変更なし`; do not create a prototype, Browser session, approval evidence, or `implementation-parity.json`. Use goal-specific static/runtime verification instead.

## Coverage scope and start gate

New UI runs use `matrixScope: coverage` by default. The deterministic covering matrix must include, for every target, every declared state, viewport, and light/dark theme at least once. Execute every declared risk row and at least one anchor row per target. Do not reduce axis coverage because a change is local.

Use `matrixScope: full` only for `release`, `ci`, `scheduled`, or user-`explicit` execution. A concrete cross-cutting risk may require full parity, but run it as a separate non-LLM verification task rather than an interactive feature turn. Never describe coverage evidence as full parity. `targeted` remains available only for `$plan` smoke and legacy profiles.

Before any UI production edit:

- Capture HEAD, Git status, process/container ID, Compose ownership, checkout mount, and runtime URL without opening Browser or starting the prototype.
- Validate goal/revision/profile, deterministic coverage selection, complete `productionBaseline.sources`, source impact declarations, and the freshly written approval evidence.
- Require each user checklist item to have a stable unchecked `UI-CHECK-XX` ID plus an observable production target, approved-prototype prerequisite, comparison operation, and expected result. Do not mark an item complete.
- Stop before editing for stale approval, missing source, contract contradiction, unrelated source drift, wrong ownership/mount, ambiguous task scope, or an incomplete user-check handoff.
- Record the coverage scope and exact selection for the final run. Rendered fixture, authorization, query, route, viewport, theme, and scroll conditions are verified at the final Browser boundary.

Browser availability is not a start gate. Do not probe Browser capability or create parity results before the completion candidate.

## Implement and verify statically

- Implement the adopted design while preserving unrelated changes. Treat the prototype, UI contract, and validation profile as fixed targets.
- Run the smallest relevant code checks while editing. Do not run Browser rows or supplemental sweeps during authoring.
- Use HMR for ordinary source changes. `./dev-compose.sh ensure` may restart only verified Compose `web` after a pending migration. For new-route, cache, package, or runtime-configuration refresh, report the reason and wait for the explicit `./dev-compose.sh restart web` (`Web restart`) action.
- Never stop a user-owned server for a build. Use an isolated build or report it blocked.
- Before final checks, run `node scripts/validation-digest.mjs --scope <task-path>` once for the exact task paths and record its HEAD, staged/unstaged/untracked digests, validated diff digest, command, scope, and result. Run focused tests plus applicable lint/typecheck and `git diff --check`; run the full suite only when unrelated suites can be affected or no reliable target exists, and build only for route, configuration, bundling, server-boundary, or explicit repository requirements.
- Reuse a passing check only when its command, scope, status, and validated diff digest match. Full test and build each run at most once per digest; after a source fix rerun only affected checks, and never rerun static checks for a Browser-only failure.
- Review the final diff against the goal, requirement closure, exact task scope, and user-check handoff before starting runtime verification.

## Final coverage run

For UI work, only after implementation, static checks, any justified build, and diff review are complete:

1. Start or reuse the verified real app with one authoritative `./dev-compose.sh ensure` and use the owner, health, project, checkout mount, container/PID, port, and `PRODUCTION_URL` in its final status; do not issue parallel status, fixed sleep, polling, or follow-log commands while it runs. Start the prototype once, and perform one drift readback only immediately before `finalize-run`; on ensure failure, take one bounded same-project status/process/recent-log diagnostic without changing foreign resources.
2. Use the common `in-app-browser-parity-adapter.mjs` with distinct task-owned `production` and `prototype` tab handles and the `prepare-run` / `next-batch` / `record-batch` / `record-failure` / `invalidate-run` / `resume-run` / `finalize-run` protocol from [parity-runner.md](../plan/references/parity-runner.md). Do not create task-specific adapters, executable bundles, or runtime shims.
3. Let the runner execute bounded data-only batches. Do not operate or narrate rows one by one. Batch summaries stay compact. After capture, Codex must open the declared sanitized image pairs by artifact path for visual inspection; do not dump raw DOM, accessibility trees, base64, or every successful row.
4. Require every coverage row and required probe to pass, including exact `390x844 / DPR 1` readback when declared. Coverage probes verify route, state setup and identity, exact viewport/DPR, root theme and `color-scheme`, primary controls, horizontal overflow/scroll, and serious console errors. Anchor rows add only the declared screenshot, DOM, accessibility, computed-style, geometry, focus, keyboard, and network probes.
5. Persist raw screenshot, DOM, and accessibility artifacts through the workspace artifact sink. Do not dump raw payloads; expose only the selected safe images needed for Codex visual inspection. Require private paths, artifact digests, denylist scanning, and terminal cleanup.
6. Perform the requirement, CLI, real-action, interaction, and Codex visual audit in [fidelity-audit.md](../plan/references/fidelity-audit.md), then use `record-audit`. Human inspection is optional.
7. Write schema-version-5 `implementation-parity.json` only after required coverage, interactions, real actions, Codex visual/requirement audit, CLI checks, and cleanup pass. It records `matrixScope: coverage | full`, exact rows, recomputed state/viewport/theme coverage, risk and anchor results, checkpoint/resume history, artifacts, digests, cleanup, automation coverage status, human visual approval status, and full parity status. New runs do not create `pre-edit-parity.json`.

There is no run-wide time cutoff. Completion occurs when required coverage passes, a required probe exposes an implementation defect, the same transient failure batch fails after its one retry, or cleanup/readback returns a terminal failure. Retry only the failed batch once; do not restart passed rows, change batch size, switch Browser, or rerun static checks because of a Browser-only failure.

## Fixes, invalidation, and terminal failure

When Browser validation exposes an implementation defect, identify the source impact before editing:

- Target-only source: invalidate that target's coverage, risk, and anchor rows.
- Shared source: invalidate only consumers declared by `sourceImpactMap`.
- Global style, theme foundation, or shared shell: invalidate every target.
- Unresolved impact: fail closed and invalidate every target.

Resume from the resulting checkpoint. Preserve unaffected passing rows and static results. Invalidate matching runtime and visual audit evidence too; retain unaffected passing rows. Repeat the final audit after fixes. Do not create an `affected` phase or duplicate manual sweep.

A missing Browser capability, selected-tab drift, failed required probe, second transient tool failure, or cleanup failure prevents an automated-coverage completion claim but preserves valid implementation edits. Report the stable code, verified and unexecuted coverage, checkpoint, absent canonical evidence when applicable, and the incomplete required checks. Do not replace a failed required check with a request for human approval. Do not fall back to another Browser, Chrome, Playwright, or Computer Use, and do not redesign the runner in the feature task. For terminal CDP capability/DPR failures, follow the fresh-task handoff in [fidelity-audit.md](../plan/references/fidelity-audit.md): recommend a new Codex task and return a populated, copyable continuation prompt without claiming recovery or creating a task automatically.

For manifest size failures, follow [Manifest size recovery policy](../plan/references/parity-runner.md#manifest-size-recovery-policy). Preserve the full contract and treat explicit user authorization for a runner fix as a workflow scope extension; the feature-task restriction above does not require another approval for that authorized fix. A documentation-only request does not authorize storage implementation.

## Codex visual audit, optional human approval, and cleanup

CLI checks, automated axis/interaction coverage, runtime actions, requirement conformance, Codex visual inspection, optional human approval, and full parity are distinct states. Codex must inspect every declared visual pair before completion. Never mark `UI-CHECK-XX` complete from automated coverage. The final report separates state coverage, viewport coverage, theme coverage, risk rows, anchor rows, unverified items, representative screenshot/URL, and visual judgments such as spacing, font rendering, pixels, and overall finish. Automated coverage passing does not claim human approval or full parity.

Treat exact phrase `確認セッションを保持` as an opt-in only when it appears in the current invocation. After final review, an opted-in invocation runs `./dev-confirmation.sh attach-app <slug>` and `./dev-confirmation.sh status <slug>`, then reports app/prototype availability separately from parity verification plus the exact stop command. Without opt-in, clean up only baseline-delta resources proven agent-owned. Worktrees use `./dev-compose.sh cleanup`; Local cleanup is a no-op. Never run broad `docker compose down`, delete volumes, or stop pre-existing/user resources.

## Finish

Complete UI work only when current schema-version-5 evidence has `automationCoverageStatus=pass`, complete recomputed `interactionCoverage`, and all `auditStatus` fields equal `pass`; human visual approval may remain pending and full parity may remain not-run. Non-UI work completes through its goal-specific checks without Browser or parity evidence.

Report changed paths, commands/results, runtime checks, evidence paths, coverage results, unchecked user checks, human-review status, full-parity status, risks, and preserved unrelated changes. Do not mutate the goal for progress, ship automatically, stage, commit, push, or create a pull request.

At the transition to independent review, follow [the manual model handoff](../review/references/model-handoff.md): finish required implementation verification first, then return the target model and populated continuation prompt before any independent review. Keep `$review` optional unless requested; do not start it automatically.
