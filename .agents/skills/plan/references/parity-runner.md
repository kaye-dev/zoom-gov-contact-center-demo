# UI parity runner contract

Use this reference for UI prototype authoring, `$implement` parity, and `$review` evidence validation. `ui-contract.json` version 1 remains the UI acceptance contract. New Browser-enabled plans use `parity-spec.json` version 2. Version 1 remains valid for static validation, row selection, existing custom adapters, and legacy plans.

## Validation profile

Version 1 contains exactly `version`, `stateSetups`, `probes`, and `rowProbeMap`. Version 2 adds `browserSetups`.

Each state setup covers one `targetId` and `state` pair with `production` and `prototype` surfaces. Each surface has a string-to-string `query` object and an `actions` array. Query names and values use bounded fixture-token allowlists; credential-, cookie-, session-, secret-, key-, and token-like names are rejected. Actions are restricted to `click`, `press`, `focus`, `fill`, `waitForVisible`, and `waitForHidden`. `fill` accepts only a bounded ASCII synthetic-fixture token; email addresses, phone numbers with punctuation, free text, and credentials are rejected during profile validation. `click`, `press`, `focus`, `fill`, and `waitForVisible` require exactly one element. `waitForHidden` accepts zero elements, a detached element, or exactly one hidden element. Profiles never contain JavaScript, credentials, fragments, protocol values, or external URLs. Evidence URLs retain only origin and path; query and fragment values are never persisted.

Version 2 `browserSetups` covers every comparison target exactly once. Each target has one production and one prototype theme setup:

- `query`: `{ "type": "query", "parameter": "theme" }` appends the row theme to a safe reviewer-only query parameter before navigation.
- `aria-switch`: `{ "type": "aria-switch", "selector": "...", "checkedTheme": "dark", "readbackSelector": "html" }` clicks only when `aria-checked` differs and then reads the control, root class, and `color-scheme` back.
- `fixed`: `{ "type": "fixed", "theme": "light" }` is valid only when every row for that target uses the declared theme.

`setTheme(tabId, theme, {targetId, surface, setup, url})` receives the resolved setup. Existing two-argument custom adapter functions remain compatible because the third JavaScript argument is optional. The in-app Browser adapter rejects version 1 with `PARITY_BROWSER_SETUP_REQUIRED`.

Each probe has `id`, `kind`, `mode`, `productionSelector`, `prototypeSelector`, `required`, and `options`. Supported kinds are `screenshot`, `dom`, `accessibility`, `visibility`, `text`, `attribute`, `computedStyle`, `geometry`, `focus`, `console`, and `network`. `mode` is `equal` or `different`. Options are empty except:

- `visibility`: `{ "expected": "visible" | "hidden" }`
- `text`: `{ "normalizeWhitespace": true | false }`
- `attribute`: `{ "name": "<attribute>" }`
- `computedStyle`: `{ "properties": ["<property>"] }`
- `geometry`: `{ "tolerancePx": <non-negative number> }`

Validate and inspect selection without Browser work:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs validate plans/<slug>/prototype
node .agents/skills/plan/scripts/parity-runner.mjs select plans/<slug>/prototype \
  --phase smoke --target <target-id> --state <state> \
  --viewport <width>x<height> --risk <risk-tag>
```

The profile is inside `prototype/`, so `prototype-revision.mjs` includes it. Any profile change after `$implement` approval invalidates the invocation.

## Phase selection

- `smoke`: representative desktop and 390×844 in light for the changed target/state. `theme`, `semantic-token`, and `native-control` risks add both themes. `responsive`, `shell`, `navigation`, and `layout` risks add affected boundaries.
- `pre-edit` and `affected`: legacy selection only; new runs do not execute them.
- `final`: the recorded selection after implementation, tests, lint, typecheck, required build, and diff review complete.

`final` defaults to `matrixScope: "targeted"` and requires explicit changed targets and states. Use `full` only for prototype/contract, global style or token, shell/navigation, cross-breakpoint responsive, multiple unrelated targets, or an explicit release requirement.

## Pure core and in-app Browser adapter

`parity-runner-core.mjs` contains no `node:*`, filesystem, environment, or `process` dependency. It owns profile validation, selection, normalization/comparison, `BrowserParityRunner`, and bounded batch helpers. `parity-runner.mjs` is the Node compatibility facade and keeps the existing named exports, `validate`/`select` CLI, and schema 1–3 readers.

In the Browser Node REPL, read the complete installed Browser documentation once, import its absolute `browser-client.mjs`, get `agent.browsers.get("iab")`, and import these repository modules by absolute path:

- `.agents/skills/plan/scripts/parity-runner-core.mjs`
- `.agents/skills/plan/scripts/in-app-browser-parity-adapter.mjs`

Create one fresh tab with `browser.tabs.new()`, then immediately read `browser.tabs.selected()`. The IDs must match. The documented Browser API has no select or activate operation; if they differ, stop with `PARITY_COMPARISON_TAB_REQUIRED`, ask the user to select that fresh tab, and only read `selected()` again. Production and prototype use that single selected tab. Every operation rechecks its ID; drift is `PARITY_SELECTED_TAB_DRIFT`.

The adapter maps documented APIs as follows:

- Browser `viewport.set({width,height})` sets logical size.
- Optional tab `cdp.send("Emulation.setDeviceMetricsOverride", ...)` requests DPR; `window.innerWidth`, `window.innerHeight`, and `window.devicePixelRatio` are the required readback.
- `tab.goto`, `tab.url`, Playwright locators/evaluate, `tab.screenshot`, `tab.dev.logs`, PerformanceResourceTiming, and optional CDP events implement navigation, action, and probe contracts.
- DOM and accessibility probes hash a normalized page-side projection and return only the digest, node count, byte count, and bounded structural diagnostic. Platform AX availability is diagnostic only.
- `focus` uses the documented `pressSequentially("")` path and must pass the focus probe in the deterministic runtime fixture.
- Screenshot evidence contains a compact SHA-256 and geometry, never raw bytes.
- Text and attribute evidence contains only a SHA-256 and byte count (or an explicit null marker), never raw page values. Text whitespace normalization occurs before hashing when requested by the profile.
- Console collection is enabled before navigation, subtracts a per-surface tab-lifetime baseline, and persists only message digests, byte counts, levels, and query-free paths. Network uses PerformanceResourceTiming first and optional CDP events only when required; entries are sorted before comparison.
- An unavailable optional probe returns a reason-coded `skipped` comparison. The same failure on a required probe preserves `PARITY_REQUIRED_PROBE_UNAVAILABLE`.

The capability canary runs after the first loopback navigation. It requires selected-tab identity, `390x844 / DPR 1`, read-only evaluate, screenshot digest, and a network source when selected probes require one. It does not treat DPR 2, screenshot dimensions, Chrome, Playwright, or Computer Use as a substitute.

The adapter captures the initial viewport and DPR before the first override. It always attempts `Emulation.clearDeviceMetricsOverride` and Browser viewport `reset()`, then requires the terminal readback to equal that initial baseline. Cleanup failure is `PARITY_CLEANUP_FAILED` and prevents passing evidence or adapter reuse.

## Run workspace and CLI

Large matrices use ignored data-only files in `/.codex/parity-runs/<run-id>/`. Directories are mode `0700`; files are mode `0600`; paths must be contained, non-symlink, and exclusively created. Canonical `plans/<slug>/evidence/`, its run directory, `approval.json`, and `implementation-parity.json` use the same `0700` / `0600` boundary. Creation applies the exact mode independently of the process umask and reads type, non-symlink identity, real path, and mode back. An existing symlink or a group/other-accessible path fails closed; the runner does not repair or inherit it. Manifests, batches, fragments, logs, and evidence exclude credentials, cookies, tokens, response bodies, and raw screenshots.

Prepare a run after approval and static checks:

Immediately before `prepare-run`, execute `./dev-compose.sh status` and require `RUNTIME_OWNERSHIP=verified`, `ACTIVE_RUNTIME_HEALTH=healthy`, `RUNTIME_RESTART_REQUIRED=0`, the expected runtime/container or PID, cwd, checkout mount, Compose project, and allocated port. Then obtain the production URL with `./dev-compose.sh status --url`. Local uses `localhost:3000`; worktrees use the allocated `localhost:3100-3899` range. The prototype remains an explicit `127.0.0.1` port. For the deterministic standalone adapter fixture, read `/__owner` and independently confirm its listener PID, cwd, checkout, and both loopback ports instead.

```sh
node .agents/skills/plan/scripts/parity-runner.mjs prepare-run plans/<slug>/prototype \
  --run-id <run-id> \
  --production-url <verified-loopback-url> \
  --prototype-url <verified-loopback-url> \
  --runtime-owner <verified-owner> \
  --runtime-checkout <verified-checkout> \
  --target <target-id> --state <state> \
  --matrix-scope targeted
```

`--runtime-owner` and `--runtime-checkout` are compatibility-preserving declarations copied from that external readback. The CLI binds them to `ui-contract.json`, the current canonical checkout, manifest, and final evidence; it does not inspect a process, container, listener, mount, health endpoint, or live URL and therefore does not itself prove runtime ownership or liveness. A matching pair of CLI arguments is never a substitute for the preceding status/owner readback.

`prepare-run` verifies approval/current goal, revision, profile, loopback URL grammar, declared runtime binding, source inventory, selection, containment, permissions, and digests. It prints a small manifest handshake. Manifest and batch digests are SHA-256 over pure-core stable JSON serialization, so Browser Node REPL can reproduce them after JSON import. Browser Node REPL imports only the absolute data-only JSON manifest and one bounded batch at a time and verifies the handshake and batch SHA-256 before page operations.

Record each compact result only through stdin:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs record-batch plans/<slug>/prototype \
  --run-id <run-id> --batch-id <batch-id>
```

The first fragment contains exactly one passing canary with selected tab ID, Browser session ID, `390x844 / DPR 1` readback, screenshot digest, and the selected probes' network source. Only the final fragment contains terminal cleanup with the same tab ID, successful CDP/viewport reset acknowledgements, and identical initial/final viewport and DPR readbacks. Fragments are recorded in manifest order. After the final batch records this passing terminal Browser cleanup result:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs finalize-run plans/<slug>/prototype \
  --run-id <run-id> \
  --runtime-owner <verified-owner> \
  --runtime-checkout <verified-checkout>
```

Repeat the same external status/owner readback immediately before `finalize-run`; pass the read-back owner and canonical checkout again. `finalize-run` first validates every fragment, exact row order/completeness, all-pass status, approval/current digests, declared runtime/source binding, and terminal cleanup in memory. It then deletes the exact run workspace and reads its absence back. Only after both stages pass does it create canonical `implementation-parity.json` with `wx` and mode `0600`. If the canonical write fails after cleanup, rerun from a fresh run. A failed run keeps its exact workspace for diagnosis; remove only that run with:

```sh
node .agents/skills/plan/scripts/parity-runner.mjs abort-run plans/<slug>/prototype \
  --run-id <run-id>
```

Stable failure codes include `PARITY_SELECTED_TAB_DRIFT`, `PARITY_COMPARISON_TAB_REQUIRED`, `PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE`, `PARITY_CDP_CAPABILITY_UNAVAILABLE`, `PARITY_DPR_OVERRIDE_UNAVAILABLE`, `PARITY_VIEWPORT_MISMATCH`, `PARITY_DPR_MISMATCH`, `PARITY_BROWSER_SETUP_REQUIRED`, `PARITY_THEME_SETUP_FAILED`, `PARITY_REQUIRED_PROBE_UNAVAILABLE`, `PARITY_BATCH_INVALID`, `PARITY_BUNDLE_IMPORT_UNAVAILABLE`, `PARITY_BATCH_INCOMPLETE`, `PARITY_CURRENT_STATE_DRIFT`, `PARITY_CLEANUP_FAILED`, and `PARITY_UNEXPECTED_ERROR`. CLI failures print a human-readable message and machine-readable JSON without secrets.

## Approval and canonical evidence

An explicit `$implement` invocation approves the resolved goal, current prototype revision, and profile digest. Write immutable schema-version-1 `approval.json` through `writeRunEvidence` before static source gates; its parent directories are `0700` and the file is `0600`. New completion evidence is final-only schema version 3 under the same fresh run:

- `approval.json`
- `implementation-parity.json`

The final file records `matrixScope`, exact selection, runtime, complete source digests, passing capability and cleanup, every executed row exactly once, structured `window.scrollX/window.scrollY`, and metrics. Use `validateApprovalEvidence`, `validateParityEvidence`, `validateEvidenceBundle`, and `writeRunEvidence` from the facade. Missing, duplicate, extra, failed, stale, or condition-drifted rows prevent completion. A missing final file means the final review did not run; do not generate pending rows.

A later goal, prototype, contract/profile, source, fixture, authorization, query, route, Browser condition, or related implementation change invalidates the applicable approval or final evidence. Do not repeat passing rows as a supplemental sweep.

## Deterministic adapter acceptance

Use only `test/fixtures/in-app-browser-parity/` and `scripts/serve-in-app-browser-parity-fixture.mjs` for adapter runtime acceptance. Run one selected session containing mobile and desktop rows, required probes, and terminal cleanup. This summary proves adapter runtime behavior; it does not modify or substitute for any product plan's canonical evidence.

## Legacy evidence

Schema version 1 parity evidence remains a legacy full-matrix pair. Schema version 2 evidence remains a legacy scoped pre-edit/final pair. Version 1 profiles remain supported by static validation and custom adapters. Read legacy evidence without rewriting it; new Browser-enabled profiles use version 2 and new final evidence uses schema version 3.
