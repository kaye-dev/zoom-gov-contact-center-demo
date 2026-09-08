# Requirement fidelity and combinatorial verification

Use this contract for new UI plans, normal UI implementation, and current review/shipping validation. The pure implementation is `.agents/skills/plan/scripts/parity-fidelity.mjs`; executable examples are in `test/fixtures/parity-fidelity.mjs` (repository-relative). Keep `SKILL.md` as the short workflow entrypoint.

## Input model and selection

Follow [NIST's DOs and DON'Ts](https://csrc.nist.gov/Projects/automated-combinatorial-testing-for-software/software-testing-methodology/dos-and-don-ts-of-testing): derive factors from requirements, include abstract properties, choose equivalence classes and boundaries, and choose an appropriate interaction strength rather than assuming pairwise is sufficient. Four to six values is a modelling guideline, not permission to remove required states or known reproduction cases.

Current axis coverage is not a pairwise guarantee. Keep the complete Cartesian UI contract v1 and stable row IDs. Start from existing axis/risk/anchor coverage plus declared runtime/visual rows. Supplement feasible t-way tuples greedily by greatest missing-tuple coverage, resolving ties by case ID lexical order. Report actual counts, not a fixed 63-case limit or a mathematical minimum. Full UI Cartesian runs remain independent explicit/release/CI/scheduled tasks.

Profile v4 retains every v3 field and adds exactly one `fidelity` object:

- `requirements`: `{id, expected, probeIds, runtimeCheckIds, visualCheckIds, staticCheckIds, interactionGroupIds, noInteractionReason}`. IDs use `REQ-*` and must exactly match goal closure IDs. Every list resolves to declared checks, every requirement has an observable expected result and evidence, and runtime/visual/group mappings are reciprocal. Use a concrete `noInteractionReason` only when the group list is empty; otherwise use null.
- `phaseComparisons`: one `{probeId, smoke, final, expected}` per probe. `smoke` matches its existing baseline `mode` (`equal` or `different`), with explicit screenshot-only `capture` also permitted for smoke. Captured smoke images still need plan visual inspection and do not prove pixel equality. Final is `equal`, `expected`, or screenshot-only `capture`. `expected` requires `{production, prototype}` with exact bounded values; other modes use null. Final never accepts arbitrary inequality. Route equality means each surface reaches its own declared route, not identical pathnames.
- `interactionGroups`: `{id, requirementIds, targetIds, states, factors, strength, reason, exclusions, requiredProbeIds}`. Scope references the existing contract. Each factor is `{id, source, mapping, rationale}`. `source` is `targetId`, `state`, `viewport`, `theme`, or `property`; direct factors have an empty mapping and derive their values from the contract. A property maps every scoped state ID to its abstract value (e.g. ordinary/maximum/over-limit text). Define any missing material states in the contract during planning, not during implementation. Rationales explain equivalence and boundary selection. Strength is 2 through factor count: use 3 or higher when requirements or known bugs involve those conditions together. Each exclusion is `{values: {factorId: value, ...}, reason}`; it must match declared values and cannot eliminate every case. The denominator is the union of feasible tuples projected from valid contract rows, not the unconstrained theoretical product. Every candidate maps all required expected-result probes.
- `runtimeChecks`: `{id, requirementIds, rowId, query, persistence, steps}`. Use a normal application route with a safe query, never `state`, `review*`, or `fixture*` simulation parameters. Steps are `{action, assertions: [{probeId, expected}]}`. Existing bounded UI actions plus `{type: "reload"}` are supported. Every step needs a bounded required probe and exact expected value; readback waits up to five seconds for asynchronous UI completion and fails on timeout. Persistence requires an actual action followed by reload and readback. The agent must choose actions that exercise real local API/storage, not a saved-state fixture. Perform necessary setup/restore only on managed local test data; do not authorize production writes or credential changes through a profile.
- `visualChecks`: `{id, requirementIds, rowId, probeId, criteria}`. The mapped probe is a screenshot. Cover each affected target, each declared theme, and mobile/desktop where declared; add every material changed visual state and boundary risk. Criteria address the concrete requirement, including icon identity/legibility, text, spacing, alignment, color, clipping, and important state. Do not substitute a generic screenshot-exists check.
- `staticChecks`: `{id, command, scope}`. Record exact commands and task paths. Related tests, contract checks, lint/typecheck, and diff checks are required as applicable; full test/build escalation remains impact-based.

UI factors are not duplicated in a second manifest. Runtime actions and visual checks reuse row IDs. Only the selected rows gain detailed probes/actions; do not inflate every row into a full visual or API test. Report axis, interaction tuple, real-action, and visual coverage separately.

## Execution and inspection

After CLI checks and diff review, use the common task-owned real-app/prototype Browser tabs and CDP adapter. Compare equal fixture, authorization, locale, theme, viewport, DPR, and scroll conditions by actual readback. Then runtime checks navigate to the ordinary application route and execute their action/assertion sequence. A query-rendered saved state never proves persistence. Mock adapter tests prove runner logic only, not live Browser success.

Persist screenshots/DOM/a11y privately with the artifact sink. Keep batches and logs compact; the agent must open the specifically declared safe screenshot pairs by path and inspect their content. This is an exception to the old blanket prohibition on showing any artifact to the model, not permission to dump raw DOM, base64, tokens, cookies, response bodies, or all successful rows. Blank, missing, clipped-away, stale, or uninspected images cannot pass. JPEG may support Codex visual review, never lossless pixel equivalence. `capture` proves paired artifact capture only; Codex inspection must still pass.

Record an audit before finalization:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs record-audit plans/<slug>/prototype --run-id <run-id> < <private-audit-file>
node .agents/skills/plan/scripts/parity-runner.mjs finalize-run plans/<slug>/prototype --run-id <run-id> --runtime-owner <verified-owner> --runtime-checkout <verified-checkout>
```

The audit input has exactly `binding`, `staticChecks`, `requirements`, `visualChecks`:

- `binding`: the run's exact `{goalSha256, prototypeRevision, validationProfileDigest, sources}`.
- Static results: `{id, command, scope, exitCode, logDigest}`. Capture command output privately and hash it; do not invent a successful exit or reuse stale scope/digests.
- Requirement results: `{id, status, evidenceIds, note}`. Cite exactly the declared check IDs and explain the observed outcome. Missing or failed evidence cannot be closed by prose.
- Visual results: `{id, status, contentVerified, artifactDigests, criteriaResults}`. `contentVerified: true` is allowed only after viewing the complete relevant content of both surfaces. Record the exact pair's digests and one `{criterion, status, note}` per declared criterion with the observed comparison. Never fill these records in advance or from image existence alone.

Runtime results come from actual runner steps in each row's `runtimeChecks`, never from this audit input. Finalization recomputes tuple coverage from passed required probes and validates audit references, binding, artifacts and cleanup. Invalid audits fail before artifact promotion, allowing correction without rerunning successful Browser rows. Source changes invalidate target/shared/global consumers and their dependent audit evidence; no-source Browser/tool failures do not rerun static checks. Preserve unaffected rows and inspection records whose artifacts and expectations still match, then bind the reviewed audit to the refreshed run. Never weaken the approved goal/profile to obtain a pass.

## Completion, compatibility, and reporting

Smoke evidence uses schema v5 with `audit: null` and all audit statuses `not-run`; partial interaction coverage is permitted only for smoke and never qualifies as completion. Current final evidence is schema v5. It retains v4 fields and adds `audit`, `auditStatus`, and `interactionCoverage`. `auditStatus` contains `static`, `runtime`, `requirements`, and `visual`; all must be pass. Each interaction result contains `id`, `strength`, `feasibleTuples`, `passedTuples`, `missingTuples`, and `status`, recomputable from the immutable profile and observed successful probes. Missing/extra/failed/stale evidence, mandatory skip, runtime failure, uninspected images, or cleanup failure prevents completion.

`automationCoverageStatus=pass` alone is insufficient. Human approval and full parity are independent optional states; they may remain pending/not-run. Do not relabel Codex visual inspection as human approval or tick the optional user's checklist. Report requirement and Codex visual completion explicitly so a human-pending label does not imply required work remains.

Historical profile v1–3 and evidence v1–4 remain read-only compatibility inputs. New current plans use profile v4; new current final runs and shipping require schema v5. Never rewrite an old result as newly verified. Synchronize writers, readers, skills, references, templates, fixtures and behavioral evaluations together. Product APIs, DB schema, and the two-stage archive/finalize shipping protocol are unchanged.


## Fresh-task handoff after CDP failure

After terminal `PARITY_CDP_CAPABILITY_UNAVAILABLE` or `PARITY_DPR_OVERRIDE_UNAVAILABLE`, preserve valid implementation/checkpoints, clean up only owned resources, and recommend one fresh Codex task to revalidate the same scope. Failure in one task does not establish globally disabled CDP; success elsewhere does not prove the cause or complete the remaining checks. Distinguish advertised/acquired capability, command rejection, supported Browser API path, origin, arguments and timeout. An explicit permission denial must be resolved through the stated permission flow; a new task is not a way to bypass it. Do not recommend session changes for application assertion failures or stale source contracts.

Always return a fenced, copyable continuation prompt populated from the current task: absolute checkout and goal/verification paths, source task link if known, stable failure code and observed conditions, API path, run ID/checkpoint (or explicitly absent), successful checks with their digests, remaining cases/expected outcomes, and cleanup status. Never leave known values as placeholders, include credentials, create/send a new task automatically, or claim a fresh session is guaranteed to work. Do not keep cycling through new tasks if the same failure recurs; retain diagnostics and report the unresolved capability/permission/API issue.

Include `前タスクのディープリンク: codex://threads/<current-thread-id>` inside the prompt when the current task ID is available from trusted session context or a read-only tool result (for example, `get_goal` returning `goal.threadId`). Use the current source task, not another task mentioned in the conversation. Do not create a goal merely to obtain an ID, guess an ID, or create a share link. If the ID cannot be obtained, include `前タスクのディープリンク: ［ユーザーが入力］` and continue without blocking; this is the only deliberately unfilled link field.

Before returning, check the fenced prompt itself contains the deep-link field, full absolute paths, the explicit common-adapter/runner `canary` recheck, remaining cases and expected outcomes, and owned-resource cleanup. The prompt must stand alone; do not replace these instructions with a reference to another handoff file or create a separate continuation file. An optional `verification.json` failure diagnostic must use `status: incomplete`, the stable `failureCode`, and the current `runId`; it is never completion evidence.

Use this shape, filling the actual values and remaining work:

```text
前タスクで停止した検証を、この新規Codexタスクで継続してください。
作業ディレクトリ・対象goal・検証記録: （実際の絶対path）
前タスクのディープリンク: （取得済みのcodex://threads/リンク。不明な場合のみ［ユーザーが入力］）
停止状況: （code、origin、viewport/DPR、呼出経路、run/checkpointまたは未作成）
通過済み: （check、scope、digest）。未実施: （具体的caseと期待結果）。
現在の規約と所有権、source/goal/profile/artifactの一致を確認してください。
正式なCodex内Browser APIで独立した所有タブを作り、共通adapter／runnerのcanaryで同条件を実測してください。直接CDPだけの成功でrunner全体を合格にしないでください。
成功したら有効な証跡を再利用して残りを実行し、要件適合・Codex目視・cleanupまで確認してください。古いrunを無条件に流用せず、再利用できない証跡と必要な再実行を明示してください。
再失敗したら原因を断定せず診断と未完了範囲を記録してください。別Browser、権限回避、CLIだけの代替完了はしないでください。
検証記録を更新し、今回のタブ・server・viewport/DPRをcleanupしてください。既存資源と無関係な変更を保全し、commit/push/PRは行わないでください。
```
