# UI parity runner contract

Use this reference only for UI prototype authoring, `$implement` parity, or `$review` evidence validation. `ui-contract.json` version 1 remains the UI acceptance contract. `parity-spec.json` version 1 supplies deterministic state setup and probes; mutable results live under `plans/<slug>/evidence/<run-id>/`.

## Validation profile

Create `plans/<slug>/prototype/parity-spec.json` with exactly these top-level fields:

- `version`: `1`.
- `stateSetups`: one entry for every `targetId` and `state` pair in the manifest.
- `probes`: reusable paired-surface checks.
- `rowProbeMap`: one entry for every manifest row ID.

Each state setup has `targetId`, `state`, `production`, and `prototype`. Each surface has a string-to-string `query` object and an `actions` array. Actions are restricted to `click`, `press`, `focus`, `fill`, `waitForVisible`, and `waitForHidden`; use their required `selector` plus `key` or `value` where applicable. Never embed JavaScript or a URL in the profile.

Each probe has `id`, `kind`, `mode`, `productionSelector`, `prototypeSelector`, `required`, and `options`. Supported kinds are `screenshot`, `dom`, `accessibility`, `visibility`, `text`, `attribute`, `computedStyle`, `geometry`, `focus`, `console`, and `network`. `mode` is `equal` or `different`. Options are empty except:

- `visibility`: `{ "expected": "visible" | "hidden" }`
- `text`: `{ "normalizeWhitespace": true | false }`
- `attribute`: `{ "name": "<attribute>" }`
- `computedStyle`: `{ "properties": ["<property>"] }`
- `geometry`: `{ "tolerancePx": <non-negative number> }`

Validate and inspect row selection with:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs validate plans/<slug>/prototype
node .agents/skills/plan/scripts/parity-runner.mjs select plans/<slug>/prototype \
  --phase smoke --target <target-id> --state <state> \
  --viewport <width>x<height> --risk <risk-tag>
```

The profile is inside `prototype/`, so `prototype-revision.mjs` includes it in the revision. Any change after `$implement` captures the revision invalidates that invocation.

## Phase selection

- `smoke`: changed target/state at representative desktop and 390×844 in light. Add both themes for `theme`, `semantic-token`, or `native-control`; add all affected breakpoints for `responsive`, `shell`, `navigation`, or `layout`.
- `pre-edit`: legacy evidence selection only; new runs do not execute it.
- `affected`: legacy evidence selection only; new runs do not execute it.
- `final`: the recorded affected selection after implementation and static verification are otherwise complete.

Interaction risk tags (`dialog`, `menu`, `keyboard`, `focus`) select the changed interaction state and execute all probes mapped to it. `$plan` does not run `pre-edit` or `final`.

`final` defaults to `matrixScope: "targeted"` and requires explicit changed targets and states; for viewport-specific behavior, also supply `changedViewports` or repeated `--viewport` arguments. Use `matrixScope: "full"` or `--matrix-scope full` only for prototype/contract changes, global style or token changes, shared shell layout/navigation structure, cross-breakpoint responsive changes, multiple unrelated surfaces, or an explicit user/release requirement. File count and shared-component ownership alone do not make a run full-scope.

## Browser adapter

Use the standalone Node CLI to validate files and select rows. When a compatible reusable Browser adapter already exists, `BrowserParityRunner` may execute those rows. Otherwise perform the selected operations directly through the Codex in-app Browser and pass the measured result through the same evidence validator. Do not create runtime shims or a large task-specific adapter during feature implementation.

The runner accepts `http://localhost:3000` for a verified Local runtime or `http://localhost:<port>` in the worktree allocator range `3100-3899` for a verified worktree runtime. The caller must obtain that production URL from `./dev-compose.sh status --url` after checking project, checkout mount, runtime identity, and health. The prototype still requires an explicit `http://127.0.0.1:<port>`. It rejects credentials, external origins, ports outside those contracts, and base-URL query or fragments before activating a tab.

Wrap the selected Browser API with one adapter object exposing:

- `activateTab(tabId)` and `activeTabId()`
- `setViewport(tabId, {width, height})` and `measureViewport(tabId)` returning `{width, height, dpr}`
- `navigate(tabId, url)` and `setTheme(tabId, theme)`
- `runAction(tabId, action)` and `runProbe(tabId, probe, context)`
- `measureScroll(tabId)` returning `{x, y}` from `window.scrollX` and `window.scrollY`
- optional `performanceEntries()` or `networkEntries()` for a required network probe

`runProbe` returns `{ value, artifactPath? }`; it may return `{ unsupported: true }` only for a non-required probe. Selector failures must throw. The runner activates and rechecks the exact tab before operations, reads back each viewport and DPR, normalizes DOM object key order, excludes computed-hidden nodes from DOM comparison, and falls back from PerformanceResourceTiming to Browser network logs. It batches all production probes for a row before switching to the prototype, avoiding a surface round-trip per probe. If neither network source exists for a required probe, the capability canary fails.

## Approval and evidence

An explicit `$implement` invocation approves the resolved `goal.md`, current prototype revision, and validation-profile digest. Approval evidence remains schema version 1. Newly generated final parity evidence uses schema version 3 so its matrix scope and selection are explicit and no pre-edit run is implied. Write these immutable files under one fresh `plans/<slug>/evidence/<run-id>/` directory:

- `approval.json`: created before runtime work with `basis: "explicit-$implement-invocation"`.
- `implementation-parity.json`: the complete final run after the last related change.

Use `createApprovalEvidence`, `validateApprovalEvidence`, `validateParityEvidence`, `validateEvidenceBundle`, and `writeRunEvidence` from `parity-runner.mjs`. Pass both the manifest and profile when validating parity evidence. The final file records `matrixScope` and its exact target/state/viewport/risk selection; the validator recomputes that selection, checks measured state/theme/viewport/DPR/route/scroll and row-to-probe coverage, and rejects missing or extra rows. `validateEvidenceBundle` compares it with the current approval, goal/profile/revision, runtime conditions, and source digests. Every executed row occurs once and has only `pass` or `fail`. A missing final file means the completion review was not run; do not generate pending rows.

Each parity phase records `durationMs`, `shellCommands`, `browserOperations`, and `fullMatrixRuns`. Pass the cumulative phase command count as `run.shellCommands`; the runner owns the other metrics.

Pass the verified runtime owner and checkout as `run.runtime.owner` and `run.runtime.checkout`. Pass every manifest baseline source exactly once as `{ "path": "<repository-relative-path>", "sha256": "sha256:<64hex>" }` in `run.sources`; the validator rejects an incomplete inventory or runtime mismatch.

Each row records both surfaces as:

```json
{
  "scroll": {
    "production": { "x": 0, "y": 0, "source": "window.scrollX/window.scrollY" },
    "prototype": { "x": 0, "y": 0, "source": "window.scrollX/window.scrollY" }
  }
}
```

The final file must contain the exact declared selection; a `full` run contains the complete manifest. A failed or incomplete selection prevents a completion claim. A later goal, prototype, contract, profile, baseline-source, fixture, authorization, query, route, or Browser-condition change invalidates the captured approval or final evidence as applicable. Do not repeat a passing row or add a supplemental all-row sweep unless a related edit invalidated the final result.

## Legacy evidence

`$review` may inspect legacy goal fields and Markdown evidence read-only for an existing plan. It may also validate parity evidence schema version 1 as a legacy full-matrix pair and schema version 2 as a legacy scoped pre-edit/final pair; it must not rewrite either. New runs use final-only parity evidence schema version 3. Label legacy routes and apply their former revision/row checks; never silently migrate them during `$review`.
