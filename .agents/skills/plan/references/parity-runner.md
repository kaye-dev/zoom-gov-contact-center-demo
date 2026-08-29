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
  --phase smoke --target <target-id> --state <state> --risk <risk-tag>
```

The profile is inside `prototype/`, so `prototype-revision.mjs` includes it in the revision. Any change after `$implement` captures the revision invalidates that invocation.

## Phase selection

- `smoke`: changed target/state at representative desktop and 390×844 in light. Add both themes for `theme`, `semantic-token`, or `native-control`; add all affected breakpoints for `responsive`, `shell`, `navigation`, or `layout`.
- `pre-edit`: every manifest row exactly once immediately before the first production edit.
- `affected`: use the same risk routing as `smoke` after related implementation changes.
- `final`: every manifest row exactly once after the final related change.

Interaction risk tags (`dialog`, `menu`, `keyboard`, `focus`) select the changed interaction state and execute all probes mapped to it. `$plan` and `$plan-critic` do not run `pre-edit` or `final`.

## Browser adapter

Import `BrowserParityRunner` into the persistent JavaScript environment that owns the Codex in-app Browser binding. A standalone Node CLI validates files and selects rows but does not launch or substitute another browser.

The runner accepts only `http://localhost:3000` for production and an explicit `http://127.0.0.1:<port>` for the prototype. It rejects credentials, external origins, and base-URL query or fragments before activating a tab.

Wrap the selected Browser API with one adapter object exposing:

- `activateTab(tabId)` and `activeTabId()`
- `setViewport(tabId, {width, height})` and `measureViewport(tabId)` returning `{width, height, dpr}`
- `navigate(tabId, url)` and `setTheme(tabId, theme)`
- `runAction(tabId, action)` and `runProbe(tabId, probe, context)`
- `measureScroll(tabId)` returning `{x, y}` from `window.scrollX` and `window.scrollY`
- optional `performanceEntries()` or `networkEntries()` for a required network probe

`runProbe` returns `{ value, artifactPath? }`; it may return `{ unsupported: true }` only for a non-required probe. Selector failures must throw. The runner activates and rechecks the exact tab before operations, reads back each viewport and DPR, normalizes DOM object key order, excludes computed-hidden nodes from DOM comparison, and falls back from PerformanceResourceTiming to Browser network logs. If neither network source exists for a required probe, the capability canary fails.

## Approval and evidence

An explicit `$implement` invocation approves the resolved `goal.md`, current prototype revision, and validation-profile digest. Write these immutable files under one fresh `plans/<slug>/evidence/<run-id>/` directory:

- `approval.json`: created before runtime work with `basis: "explicit-$implement-invocation"`.
- `pre-edit-parity.json`: the complete successful or failed pre-edit run.
- `implementation-parity.json`: the complete final run after the last related change.

Use `createApprovalEvidence`, `validateApprovalEvidence`, `validateParityEvidence`, `validateEvidenceBundle`, and `writeRunEvidence` from `parity-runner.mjs`; do not hand-compose their schemas. Pass both the manifest and profile when validating parity evidence. The validator checks exact row identity, measured state/theme/viewport/DPR/route/scroll, and row-to-probe coverage. `validateEvidenceBundle` compares the three files with current goal/profile/revision, final runtime conditions, and source digests, so a related change after final parity is rejected. Every executed row occurs once and has only `pass` or `fail`. A missing file means the phase was not run; do not generate pending rows.

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

The pre-edit and final files must contain the exact full manifest row set. A failed or incomplete pre-edit run stops before production editing. A later goal, prototype, contract, profile, baseline-source, fixture, authorization, query, route, or Browser-condition change invalidates the captured approval or final evidence as applicable.

## Legacy evidence

`$review` may inspect legacy goal fields and Markdown evidence read-only for an existing plan. It must label that route legacy and apply the former revision/row checks. New or explicitly revised plans use only the JSON evidence contract and are never silently migrated by `$review`.
