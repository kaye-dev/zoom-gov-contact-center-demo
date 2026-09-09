# UI parity runner contract

Use this reference when authoring UI plans, running normal UI `$implement` final coverage, reviewing that evidence, or performing release, CI, scheduled, or user-explicit parity verification. Normal UI `$implement` starts with static preflight and approval, then runs the Browser lifecycle only after implementation and static checks are complete. Normal UI `$review` requires current final parity evidence. `ui-contract.json` version 2 is the complete UI acceptance contract. Current Browser-enabled plans use `parity-spec.json` version 4 and final `implementation-parity.json` schema version 5. Older profiles and evidence remain read-only compatibility inputs.

## Contract, profile, and coverage

`ui-contract.json` version 2 owns the complete feasible union of each target’s `states` × viewport × theme matrix and immutable row IDs. Each target declares its non-empty `states`; `baselineStateInventory` is exactly their union. Version 1 remains compatible with its original global-state product. A state that renders another screen’s default is not a separate business condition. Merge identical conditions only after preserving the union of probe definitions, comparisons, invariants, requirement references, and unresolved failures. The profile selects rows from that matrix; it never defines a second UI truth.

Version 4 `parity-spec.json` retains the following coverage fields and adds `fidelity` defined in [fidelity-audit.md](fidelity-audit.md):

- `version`, `stateSetups`, `probes`, `rowProbeMap`, and complete target-level `browserSetups`;
- `coverage.targetOrder`, `viewportOrder`, `themeOrder`, `anchorRows`, and `riskRows`;
- `sourceImpactMap`, `batchPolicy`, `artifactPolicy`, and `fidelity`.

Baseline comparison maps contract semantics without changing the `rowProbeMap` schema: every ID in a row's `expectedInvariantIds` has a same-ID required `equal` probe in that row's `probeIds`, and every ID in `intentionalDifferenceIds` has a same-ID required `different` probe there. Probe IDs are globally unique, so one arbitrary probe cannot stand in for multiple contract IDs. Missing, optional, wrong-mode, or row-unmapped same-ID probes fail static validation. Versions 1 and 2 retain their historical validation behavior.

Every `stateSetups` entry covers one target/state pair on production and prototype and names one or more required coverage `assertionProbeIds`. Surface setup permits bounded string query fixtures and allowlisted `click`, `press`, `focus`, `fill`, `selectOption`, `upload`, `waitForVisible`, and `waitForHidden` actions. It rejects JavaScript, external URLs, credentials, cookies, token-like names, real email/phone data, and unbounded free text.

A surface setup may declare `teardownActions` using the same action allowlist. The runner executes these real UI actions on that surface before its next navigation and at final cleanup. Declare cancel/discard actions for dirty forms; do not suppress unload guards or change application data to permit navigation. Teardown failure fails the run, while environment cleanup still runs.

`selectOption` uses `{type, selector, value}` for a bounded synthetic option value. It calls the Browser native selection API on exactly one element; unavailable support or an ambiguous selector fails. Do not replace selection with DOM assignments or assume keyboard navigation selected the requested value.

`dblclick` uses `{type, selector}` and the Browser native double-click API on exactly one element. Use it to verify repeated-input protection; two sequential awaited clicks do not establish the same timing. Unavailable native support fails without a synthetic event fallback. A seeded in-progress record verifies state rendering only, not that an execution request was sent or accepted.

`upload` uses `{type, selector, file, sha256}` with an approved synthetic fixture, a relative file path, and its `sha256:` digest. Supply `fixtureReader: createParityFixtureReader(checkoutRoot)` to the in-app Browser adapter; import the reader factory from `parity-file-fixtures.mjs` with an absolute owning-checkout root. Filesystem access stays outside the platform-neutral Browser adapter. The adapter checks real-path containment, file size (at most 2 MiB, including oversized-input test fixtures), and the digest before opening the Browser file chooser; it starts `waitForEvent("filechooser")` before clicking, calls `chooser.setFiles`, and checks for file drift afterward. Missing fixtures, symlinks outside the root, content changes, and unavailable chooser support fail the action. Do not upload repository credentials or real personal data. Keep fixture hashes in the profile and classify fixture sources in the impact map; a URL query or an injected DOM file value is not an upload assertion.

`browserSetups` covers every comparison target exactly once. Each target may declare `productionHost` beside `targetId`, `production`, and `prototype`. It accepts only `localhost` or a single-label tenant `.localhost` hostname, without a scheme, port, path, or credentials. Omission preserves the run's production base origin. The runner replaces only the hostname, preserving the ownership-verified run port. Declare the actual public tenant host for Host-routed pages and `localhost` for canonical admin pages; query fixtures do not replace Host routing. Coverage and ordinary runtime actions use the same resolved origin. Per-batch observed surface contexts bind session, owned tab, surface, origin, and authorization; evidence readers validate each row against its target host and merge observed origins across batches. Cleanup still covers each of the two owned tabs exactly once.

A surface uses one of:

- `query`: append the row theme to a safe reviewer-only parameter;
- `aria-switch`: reconcile `aria-checked`, root class, and `color-scheme`;
- `fixed`: only when every row for that target has the declared theme.

The normal `coverage` selection is deterministic. Contract v2 checks every state at the first viewport/theme and the first state at every viewport/theme; contract v1 retains its cycle for `max(state count, viewport count, theme count)` rows. Both add declared risk, anchor, and fidelity coordinates without duplicate rows. Static validation requires every target-state, target-viewport, and target-theme pair, no unassigned values, no duplicate coordinate, and stable row IDs/order. The current reference fixture is 18 targets × 5 states × 8 viewports × 2 themes: 144 coverage rows and 1,440 full rows.

Each risk row declares `id`, `targetId`, `state`, `viewport`, `theme`, `interaction`, `reason`, `requiredProbeIds`, and `expected`. Each anchor declares `id`, `targetId`, `rowId`, and `reason`; every target has at least one anchor, and the row maps an anchor probe. A risk coordinate already in the covering matrix is annotated rather than duplicated.

`sourceImpactMap` covers every `productionBaseline.sources` path exactly once. `target` and `shared` entries name affected target IDs; `global` names none because it invalidates all targets. Missing impact resolution fails closed to all targets.

Validate goal, contract, profile, source inventory, and deterministic selection without Browser work:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs preflight plans/<slug>/prototype --context plan --target <changed-target> --state <changed-state> [--risk <risk>]
node .agents/skills/plan/scripts/parity-runner.mjs preflight plans/<slug>/prototype --context implement
node .agents/skills/plan/scripts/parity-runner.mjs select plans/<slug>/prototype \
  --phase final --matrix-scope full --execution-context ci
```

`targeted` selection is for `$plan` smoke and legacy profiles; every version 3 declared risk-row coordinate is additive even when its theme or viewport is outside the representative changed scope. Independently requested final runs use `coverage` or `full`. Full selection requires one of `release`, `ci`, `scheduled`, or `explicit`; it is never inferred from file count or a shared component alone.

## Probe tiers

Every coverage row maps required `route`, `setup`, `state`, `viewport`, `theme`, `control`, `overflow`, and `console` probes. They verify route availability, successful deterministic setup, a state-specific identity assertion, exact logical viewport/DPR, root theme class and `color-scheme`, primary control state, no unintended window horizontal scroll or major target overflow, and no serious console error.

Anchor rows map only the detailed probes needed for that target: `screenshot`, `dom`, `accessibility`, `computedStyle`, `geometry`, `focus`, `keyboard`, or `network`. `keyboard` uses `{ "key": "<bounded key>" }`; geometry uses a non-negative tolerance. Screenshot, DOM, computed-style, and geometry are not required across every coverage row. Minor antialiasing, font rendering, and spacing differences require Codex visual judgments unless the contract declares a measurable invariant. DOM projection compares visible structure, text, geometry, computed typography/colors/spacing/borders, live control state, and resolved label references. Framework IDs, class ordering, transport names and native validation metadata are not visual equality inputs; application contract tests retain validation coverage. Missing label references remain visible failures.

The adapter returns screenshot, DOM, and accessibility payloads only to an injected artifact sink. Anchor screenshots use the Browser's full-page capture, or the viewport when a modal locks body scrolling; extending a fixed overlay beyond the viewport can corrupt backend rendering. A backend returning lossy JPEG retains the original `.jpg` artifact for visual review and reports lossless screenshot comparison as unavailable: optional comparisons are skipped, required comparisons fail. No pixel-equivalence claim is made from JPEG hashes. Missing anchor capture fails immediately, including optional anchors. DOM/accessibility projections remain bounded to 1,000 nodes, 524,288 serialized characters, and 1,048,576 UTF-8 bytes. The row result and LLM summary contain compact paths, digests, sizes, and bounded diagnostics. Missing sink for a required raw anchor fails with `PARITY_ARTIFACT_SINK_UNAVAILABLE`.

## Browser adapter

`parity-runner-core.mjs` is pure ESM without Node dependencies. It owns validation, deterministic selection, comparison, coverage reports, invalidation resolution, and `BrowserParityRunner`. `parity-runner.mjs` is the Node facade. The common adapter is `in-app-browser-parity-adapter.mjs`; do not create task-specific adapters, executable bundles, or runtime shims.

Use one task-owned in-app Browser session with distinct task-owned production and prototype tab handles passed as `tabs: { production, prototype }`. The runner keys logical contexts by session, tab, surface, origin, and authorization profile; it stabilizes each context once and invalidates it after identity/setup failure. The two-tab adapter validates the logical active tab and re-resolves its owned ID through `browser.tabs.get` between operations; the app-visible `tabs.selected()` is not the routing identity for background handles. Closed, missing, mismatched, or non-owned handles fail closed. The legacy single-tab adapter retains its selected-tab check. The adapter applies Browser viewport control plus per-tab CDP `Emulation.setDeviceMetricsOverride`, and treats `window.innerWidth`, `window.innerHeight`, and `window.devicePixelRatio` as authoritative. The canary requires `390x844 / DPR 1`, read-only evaluation, screenshot digest, and a network source when required. Other tasks must use separate sessions/tabs.

The adapter performs exactly one navigation for each row/surface, captures the initial viewport/DPR, and always clears network/CDP metrics and resets viewport. Cleanup reads back immediately; only a mismatch retries with bounded backoff up to two seconds. Failure is terminal and retains only stable code, allowlisted cause category, operation/row/surface/probe context, and sanitized evidence.

## Workspace, batch, checkpoint, and resume

The ignored workspace is `.codex/parity-runs/<run-id>/`. Directories are `0700`; files are `0600`; all paths are repository-contained, non-symlink, exclusively created, and read back. The immutable manifest fixes selection, row order, batch size, byte limit, runtime/source/profile digests, and artifact policy. For storage limits, automatic splitting, and recovery, read [Manifest size recovery policy](manifest-storage.md).

For normal UI `$implement` or an independently requested parity task, prepare only after approval, implementation, static checks, final diff review, and external runtime ownership/health readback:

Local uses `http://localhost:3000` or an ownership-verified single-label tenant origin such as `http://univ.localhost:3000`; worktrees use the ownership-verified allocated port within the [Browser operating range](../../../../docs/development/development-ports.md#利用範囲と割り当て). Obtain owner, process/container, mount, health, and `PRODUCTION_URL` from one completed `./dev-compose.sh ensure`; do not wrap it in status polling, fixed sleep, or follow-log commands. Matching CLI arguments do not prove ownership. Check both surface URLs against that range before Browser use; stop if either is outside it. The linked document also defines artifact reuse, release, migration, data preservation, rollback, and evidence handling.

```sh
node .agents/skills/plan/scripts/parity-runner.mjs prepare-run plans/<slug>/prototype \
  --run-id <run-id> \
  --production-url <verified-loopback-url> \
  --prototype-url <verified-loopback-url> \
  --runtime-owner <verified-owner> --runtime-checkout <verified-checkout> \
  --matrix-scope coverage
```

For full runs, also pass `--execution-context release|ci|scheduled|explicit`.

The common `executeBrowserBatch({ repositoryRootPath, runId, runner, tabs })` export from `parity-run-workspace.mjs` connects these steps for an in-app Browser executor: it requests one bounded batch with `nextRunBatch`, checks the immutable batch digest, runs only the canonical batch rows through `BrowserParityRunner.runWithoutCleanup`, and records the compact fragment with `recordBatchResult`. The runner checks batch identity, content, order, and policy against the complete deterministic selection before Browser operations. It returns only a compact checkpoint summary. First-batch capabilities and final-batch cleanup come from real Browser readbacks; two-tab cleanup must cover both owned surface IDs exactly once. Failures preserve sanitized diagnostics and a terminal checkpoint. The equivalent CLI protocol requests a bounded batch with `next-batch` and writes the compact result via stdin to `record-batch`. It checkpoints successful batches atomically. `resume-run` returns only pending or retryable work and never returns an already-passed batch.

```sh
node .agents/skills/plan/scripts/parity-runner.mjs next-batch plans/<slug>/prototype --run-id <run-id>
node .agents/skills/plan/scripts/parity-runner.mjs record-batch plans/<slug>/prototype \
  --run-id <run-id> --batch-id <batch-id>
node .agents/skills/plan/scripts/parity-runner.mjs resume-run plans/<slug>/prototype --run-id <run-id>
```

Record tool failure without raw output:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs record-failure plans/<slug>/prototype \
  --run-id <run-id> --batch-id <batch-id> \
  --failure-code <stable-code> --diagnostic <bounded-text> --transient true
```

A transient failure may retry the same batch once. The second failure is terminal. Required-probe failures are terminal immediately. There is no run-wide time cutoff. Never restart passed rows, rebuild the run with changing batch sizes, switch Browser, or rerun test/build solely because Browser failed.

Before a terminal recovery, read [Browser recovery](browser-recovery.md); its one-retry, canary, cleanup, and provenance requirements are mandatory.

After implementation fixes, invalidate by exact impact and resume:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs invalidate-run plans/<slug>/prototype \
  --run-id <run-id> --invalidation-scope target --target <target-id>
node .agents/skills/plan/scripts/parity-runner.mjs invalidate-run plans/<slug>/prototype \
  --run-id <run-id> --invalidation-scope shared --source <production-source>
node .agents/skills/plan/scripts/parity-runner.mjs invalidate-run plans/<slug>/prototype \
  --run-id <run-id> --invalidation-scope global
```

Target and shared invalidation preserve unrelated passing target batches. Global invalidation resets every target. The CLI rehashes the source inventory during invalidation and refreshes the manifest only when every changed source affects targets included in that invalidation. A changed source outside that scope is rejected before checkpoint mutation. Source changes without a resolvable declaration fail closed.

## Artifacts, finalization, and compact output

The artifact sink writes raw screenshot/DOM/accessibility files under the workspace, scans strings for secrets and personal data, and returns only `{path, sha256, bytes, kind, mediaType, surface, rowId, probeId}`. `artifactPolicy.maxBytes` is enforced. Artifacts never include credentials, authorization headers, cookies, tokens, response bodies, or real resident data.

Immediately before finalization, perform the one permitted runtime drift readback and pass the verified owner/checkout:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs finalize-run plans/<slug>/prototype \
  --run-id <run-id> \
  --runtime-owner <verified-owner> --runtime-checkout <verified-checkout>
```

Finalization first requires a bound `record-audit` input and all fidelity gates to pass, then requires all batches and probes to pass, validates fragment/artifact digests, promotes artifacts to `plans/<slug>/evidence/<run-id>/artifacts/`, removes the workspace, reads back its absence, and exclusively writes schema-version-5 `implementation-parity.json`. Failed runs retain the workspace when policy allows; remove only that run with `cleanup-run` or `abort-run`.

Each command returns a compact summary only: planned/executed/passed counts, failed row IDs, stable error code, bounded diagnostic, checkpoint, and cleanup. Do not stream successful rows, raw DOM/accessibility or large JSON. Open selected safe screenshot pairs for required Codex visual inspection.

## Evidence and independent statuses

The invocation-bound `approval.json` remains schema version 1. Current final evidence is schema version 5 and records `matrixScope: coverage | full`, execution context and exact row IDs; recomputable target-state/viewport/theme coverage; risk/anchor required-probe results; checkpoint/resume/attempt/invalidation history; runtime/source/goal/revision/profile digests; capability/artifact-index/cleanup/readback/metrics; and independent `automationCoverageStatus`, `humanVisualApprovalStatus`, and `fullParityStatus`.

Coverage evidence sets full parity to `not-run`; only a complete full run may set it to `pass`. Codex visual/requirement audit, real actions, static checks and t-way coverage are required by schema v5; human approval is independent and optional. Missing/duplicate/extra/failed rows, stale digest, condition drift, missing artifact, or failed cleanup prevents automated completion.

Stable failure codes include `PARITY_SELECTED_TAB_DRIFT`, `PARITY_COMPARISON_TAB_REQUIRED`, `PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE`, `PARITY_CDP_CAPABILITY_UNAVAILABLE`, `PARITY_DPR_OVERRIDE_UNAVAILABLE`, `PARITY_VIEWPORT_MISMATCH`, `PARITY_DPR_MISMATCH`, `PARITY_BROWSER_SETUP_REQUIRED`, `PARITY_THEME_SETUP_FAILED`, `PARITY_REQUIRED_PROBE_UNAVAILABLE`, `PARITY_ARTIFACT_SINK_UNAVAILABLE`, `PARITY_BATCH_INVALID`, `PARITY_BATCH_INCOMPLETE`, `PARITY_CURRENT_STATE_DRIFT`, and `PARITY_CLEANUP_FAILED`.

## Legacy compatibility

Profile versions 1, 2, and 3 and parity evidence schemas 1, 2, 3, and 4 remain read-only compatible. Validate existing evidence against its historical row, digest, runtime, and cleanup contract without migrating or adding fields. New Browser-enabled plans use profile version 4; independently requested new final runs use evidence schema 5. A migration changes workflow text, skills, profile, runner, evidence schema, tests, and evaluator together. Rollback must restore that entire compatible set; never roll back only a writer or reader.

## Development origins

Use the app and artifact origins in [Development ports](../../../../docs/development/development-ports.md). Check the reported allocation against the Browser operating range before opening either surface; stop the task if it is outside that range. The same document defines artifact reuse, explicit release, migration, data preservation, rollback, and evidence handling.


For state applicability, risk factors, screenshots, dependency scopes, and cross-run qualification, follow [Validation design](validation-design.md).
