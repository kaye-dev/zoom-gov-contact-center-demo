# UI parity runner contract

Use this reference when authoring UI plans, running `$implement`, or validating evidence in `$review`. `ui-contract.json` version 1 is the complete UI acceptance contract. Current Browser-enabled plans use `parity-spec.json` version 3 and final `implementation-parity.json` schema version 4. Older profiles and evidence remain read-only compatibility inputs.

## Contract, profile, and coverage

`ui-contract.json` owns the complete target × state × viewport × theme Cartesian matrix and immutable row IDs. The profile selects rows from that matrix; it never defines a second UI truth.

Version 3 `parity-spec.json` contains exactly:

- `version`, `stateSetups`, `probes`, `rowProbeMap`, and complete target-level `browserSetups`;
- `coverage.targetOrder`, `viewportOrder`, `themeOrder`, `anchorRows`, and `riskRows`;
- `sourceImpactMap`, `batchPolicy`, and `artifactPolicy`.

Every `stateSetups` entry covers one target/state pair on production and prototype and names one or more required coverage `assertionProbeIds`. Surface setup permits bounded string query fixtures and allowlisted `click`, `press`, `focus`, `fill`, `waitForVisible`, and `waitForHidden` actions. It rejects JavaScript, external URLs, credentials, cookies, token-like names, real email/phone data, and unbounded free text.

`browserSetups` covers every comparison target exactly once. A surface uses one of:

- `query`: append the row theme to a safe reviewer-only parameter;
- `aria-switch`: reconcile `aria-checked`, root class, and `color-scheme`;
- `fixed`: only when every row for that target has the declared theme.

The normal `coverage` selection is deterministic. For each target it cycles the declared state, viewport, and theme order for `max(state count, viewport count, theme count)` rows, then adds declared risk and anchor coordinates only when they are not already selected. Static validation requires every target-state, target-viewport, and target-theme pair, no unassigned values, no duplicate coordinate, and stable row IDs/order. The current reference fixture is 18 targets × 5 states × 8 viewports × 2 themes: 144 coverage rows and 1,440 full rows.

Each risk row declares `id`, `targetId`, `state`, `viewport`, `theme`, `interaction`, `reason`, `requiredProbeIds`, and `expected`. Each anchor declares `id`, `targetId`, `rowId`, and `reason`; every target has at least one anchor, and the row maps an anchor probe. A risk coordinate already in the covering matrix is annotated rather than duplicated.

`sourceImpactMap` covers every `productionBaseline.sources` path exactly once. `target` and `shared` entries name affected target IDs; `global` names none because it invalidates all targets. Missing impact resolution fails closed to all targets.

Validate and inspect without Browser work:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs validate plans/<slug>/prototype
node .agents/skills/plan/scripts/parity-runner.mjs select plans/<slug>/prototype \
  --phase final --matrix-scope coverage
node .agents/skills/plan/scripts/parity-runner.mjs select plans/<slug>/prototype \
  --phase final --matrix-scope full --execution-context ci
```

`targeted` selection is for `$plan` smoke and legacy profiles. Current final runs use `coverage` or `full`. Full selection requires one of `release`, `ci`, `scheduled`, or `explicit`; it is never inferred from file count or a shared component alone.

## Probe tiers

Every coverage row maps required `route`, `setup`, `state`, `viewport`, `theme`, `control`, `overflow`, and `console` probes. They verify route availability, successful deterministic setup, a state-specific identity assertion, exact logical viewport/DPR, root theme class and `color-scheme`, primary control state, no unintended window horizontal scroll or major target overflow, and no serious console error.

Anchor rows map only the detailed probes needed for that target: `screenshot`, `dom`, `accessibility`, `computedStyle`, `geometry`, `focus`, `keyboard`, or `network`. `keyboard` uses `{ "key": "<bounded key>" }`; geometry uses a non-negative tolerance. Screenshot, DOM, computed-style, and geometry are not required across every coverage row. Minor antialiasing, font rendering, and spacing differences remain human visual judgments unless the contract declares a measurable invariant.

The adapter returns raw screenshot, DOM, and accessibility payloads only to an injected artifact sink. The row result and LLM summary contain compact paths, digests, sizes, and bounded diagnostics. Missing sink for a required raw anchor fails with `PARITY_ARTIFACT_SINK_UNAVAILABLE`.

## Browser adapter

`parity-runner-core.mjs` is pure ESM without Node dependencies. It owns validation, deterministic selection, comparison, coverage reports, invalidation resolution, and `BrowserParityRunner`. `parity-runner.mjs` is the Node facade. The common adapter is `in-app-browser-parity-adapter.mjs`; do not create task-specific adapters, executable bundles, or runtime shims.

Use one fresh selected in-app Browser tab. Production and prototype run serially in that tab, with tab identity checked between operations. The adapter uses Browser viewport control and CDP `Emulation.setDeviceMetricsOverride`; `window.innerWidth`, `window.innerHeight`, and `window.devicePixelRatio` are authoritative. The capability canary requires selected-tab identity, `390x844 / DPR 1`, read-only evaluation, screenshot digest, and a network source when selected probes require one. Chrome, Playwright, Computer Use, or DPR 2 are not substitutes.

The adapter captures the initial viewport/DPR and always clears CDP metrics, resets the Browser viewport, and compares the terminal readback to the baseline. Cleanup failure is terminal and prevents canonical evidence.

## Workspace, batch, checkpoint, and resume

The ignored workspace is `.codex/parity-runs/<run-id>/`. Directories are `0700`; files are `0600`; all paths are repository-contained, non-symlink, exclusively created, and read back. The immutable manifest fixes selection, row order, batch size, byte limit, runtime/source/profile digests, and artifact policy.

Prepare only after approval, static checks, and external runtime ownership/health readback:

Local uses `http://localhost:3000`; worktrees use the ownership-verified allocated port in `3100-3899`. Obtain it through `./dev-compose.sh status --url`; matching CLI arguments do not themselves prove process, container, mount, or health ownership.

```sh
node .agents/skills/plan/scripts/parity-runner.mjs prepare-run plans/<slug>/prototype \
  --run-id <run-id> \
  --production-url <verified-loopback-url> \
  --prototype-url <verified-loopback-url> \
  --runtime-owner <verified-owner> \
  --runtime-checkout <verified-checkout> \
  --matrix-scope coverage
```

For full runs, also pass `--execution-context release|ci|scheduled|explicit`.

The non-LLM executor requests a bounded batch with `next-batch`, imports only the data-only manifest/batch, runs it through the common adapter, and writes the compact result via stdin to `record-batch`. It checkpoints successful batches atomically. `resume-run` returns only pending or retryable work and never returns an already-passed batch.

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

After implementation fixes, invalidate by exact impact and resume:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs invalidate-run plans/<slug>/prototype \
  --run-id <run-id> --invalidation-scope target --target <target-id>
node .agents/skills/plan/scripts/parity-runner.mjs invalidate-run plans/<slug>/prototype \
  --run-id <run-id> --invalidation-scope shared --source <production-source>
node .agents/skills/plan/scripts/parity-runner.mjs invalidate-run plans/<slug>/prototype \
  --run-id <run-id> --invalidation-scope global
```

Target and shared invalidation preserve unrelated passing target batches. Global invalidation resets every target. Source changes without a resolvable declaration fail closed.

## Artifacts, finalization, and compact output

The artifact sink writes raw screenshot/DOM/accessibility files under the workspace, scans strings for secrets and personal data, and returns only `{path, sha256, bytes, kind, mediaType, surface, rowId, probeId}`. `artifactPolicy.maxBytes` is enforced. Artifacts never include credentials, authorization headers, cookies, tokens, response bodies, or real resident data.

Before finalization, repeat external runtime ownership/health readback and pass the verified owner/checkout:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs finalize-run plans/<slug>/prototype \
  --run-id <run-id> \
  --runtime-owner <verified-owner> \
  --runtime-checkout <verified-checkout>
```

Finalization requires all batches and probes to pass, validates fragment/artifact digests, promotes artifacts to `plans/<slug>/evidence/<run-id>/artifacts/`, removes the workspace, reads back its absence, and exclusively writes schema-version-4 `implementation-parity.json`. Failed runs retain the workspace when policy allows; remove only that run with `cleanup-run` or `abort-run`.

Each command returns a compact summary only: planned/executed/passed counts, failed row IDs, stable error code, bounded diagnostic, checkpoint, and cleanup. Do not stream successful rows, raw screenshots/DOM/accessibility, or large JSON into model context.

## Evidence and independent statuses

The invocation-bound `approval.json` remains schema version 1. Current final evidence is schema version 4 and records:

- `matrixScope: coverage | full`, execution context, and exact row IDs;
- recomputable target-state, target-viewport, and target-theme coverage;
- risk and anchor rows with required probe results;
- checkpoint/resume/attempt/invalidation history;
- runtime, source, goal, revision, and profile digests;
- capability, artifact index, cleanup/readback, and metrics;
- `automationCoverageStatus`, `humanVisualApprovalStatus`, and `fullParityStatus`.

Coverage evidence sets full parity to `not-run`; only a complete full run may set it to `pass`. Human visual approval is independent and normally remains `pending` until a human inspects representative screenshots/URLs and visual finish. Missing/duplicate/extra/failed rows, stale digest, condition drift, missing artifact, or failed cleanup prevents automated completion.

Stable failure codes include `PARITY_SELECTED_TAB_DRIFT`, `PARITY_COMPARISON_TAB_REQUIRED`, `PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE`, `PARITY_CDP_CAPABILITY_UNAVAILABLE`, `PARITY_DPR_OVERRIDE_UNAVAILABLE`, `PARITY_VIEWPORT_MISMATCH`, `PARITY_DPR_MISMATCH`, `PARITY_BROWSER_SETUP_REQUIRED`, `PARITY_THEME_SETUP_FAILED`, `PARITY_REQUIRED_PROBE_UNAVAILABLE`, `PARITY_ARTIFACT_SINK_UNAVAILABLE`, `PARITY_BATCH_INVALID`, `PARITY_BATCH_INCOMPLETE`, `PARITY_CURRENT_STATE_DRIFT`, and `PARITY_CLEANUP_FAILED`.

## Legacy compatibility

Profile versions 1 and 2 and parity evidence schemas 1, 2, and 3 remain read-only. Validate their historical row, digest, runtime, and cleanup contracts without adding version-3 profile or schema-4 evidence fields. New Browser-enabled plans use profile version 3; new final runs use evidence schema 4. A migration changes workflow text, skills, profile, runner, evidence schema, tests, and evaluator together. Rollback must restore that entire compatible set; never roll back only a writer or reader.
