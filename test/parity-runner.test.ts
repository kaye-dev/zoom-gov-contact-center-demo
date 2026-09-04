import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const parityModulePromise = import(
  pathToFileURL(
    path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/parity-runner.mjs"),
  ).href
);

const viewports = [
  ["desktop", "1280x800"],
  ["mobile", "390x844"],
  ["before-md", "767x844"],
  ["at-md", "768x844"],
] as const;

const contract = {
  version: 1,
  productionBaseline: {
    sources: ["src/ui.ts"],
    runtimeOwner: "fixture",
    checkout: "/fixture",
    commit: "1".repeat(40),
    route: "/fixture",
  },
  comparisonConditions: {
    viewports: viewports.map(([, viewport]) => viewport),
    dpr: 1,
    scroll: { x: 0, y: 0 },
    locale: "ja",
    themes: ["light", "dark"],
    fixture: "fixture-a",
    authorization: "admin",
    query: "none",
  },
  baselineStateInventory: ["default"],
  themeContract: ["light", "dark"],
  responsiveContract: viewports.map(([id, viewport]) => ({ id, viewport })),
  visualInvariants: [{ id: "inv-shell", description: "same shell" }],
  intentionalDifferences: [],
  stateAndInteraction: ["keyboard", "focus"],
  comparisonTargets: [
    { id: "main", entry: "index.html", route: "/fixture", surface: "page" },
  ],
  parityMatrix: viewports.flatMap(([breakpoint, viewport]) =>
    ["light", "dark"].map((theme) => ({
      id: `main-default-${breakpoint}-${theme}`,
      targetId: "main",
      entry: "index.html",
      route: "/fixture",
      surface: "page",
      state: "default",
      viewport,
      theme,
      breakpoint,
      expectedInvariantIds: ["inv-shell"],
      intentionalDifferenceIds: [],
    })),
  ),
};

const probes = [
  {
    id: "dom-shell",
    kind: "dom",
    mode: "equal",
    productionSelector: "main",
    prototypeSelector: "main",
    required: true,
    options: {},
  },
  {
    id: "network-clean",
    kind: "network",
    mode: "equal",
    productionSelector: "body",
    prototypeSelector: "body",
    required: true,
    options: {},
  },
];

const spec = {
  version: 1,
  stateSetups: [
    {
      targetId: "main",
      state: "default",
      production: { query: {}, actions: [] },
      prototype: { query: {}, actions: [] },
    },
  ],
  probes,
  rowProbeMap: contract.parityMatrix.map(({ id }) => ({
    rowId: id,
    probeIds: probes.map(({ id: probeId }) => probeId),
  })),
};

const digest = `sha256:${"a".repeat(64)}`;
const revision = `sha256:${"b".repeat(64)}`;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createCoverageFixture() {
  const states = ["ready", "pending", "success", "empty", "failure"];
  const coverageViewports = [
    "390x844",
    "639x844",
    "640x844",
    "767x900",
    "768x900",
    "1023x900",
    "1024x900",
    "1280x900",
  ];
  const themes = ["light", "dark"];
  const targets = Array.from({ length: 18 }, (_, index) => ({
    id: `target-${String(index + 1).padStart(2, "0")}`,
    entry: `target-${String(index + 1).padStart(2, "0")}.html`,
    route: `/target-${String(index + 1).padStart(2, "0")}`,
    surface: "page",
  }));
  const matrix = targets.flatMap((target) =>
    states.flatMap((state) =>
      coverageViewports.flatMap((viewport, viewportIndex) =>
        themes.map((theme) => ({
          id: `${target.id}-${state}-viewport-${viewportIndex}-${theme}`,
          targetId: target.id,
          entry: target.entry,
          route: target.route,
          surface: target.surface,
          state,
          viewport,
          theme,
          breakpoint: `viewport-${viewportIndex}`,
          expectedInvariantIds: ["coverage-invariant"],
          intentionalDifferenceIds: [],
        })),
      ),
    ),
  );
  const coverageContract = {
    version: 1,
    productionBaseline: {
      sources: ["src/ui.ts"],
      runtimeOwner: "fixture",
      checkout: "/fixture",
      commit: "1".repeat(40),
      route: targets[0].route,
    },
    comparisonConditions: {
      viewports: coverageViewports,
      dpr: 1,
      scroll: { x: 0, y: 0 },
      locale: "ja",
      themes,
      fixture: "coverage-fixture",
      authorization: "admin",
      query: "none",
    },
    baselineStateInventory: states,
    themeContract: themes,
    responsiveContract: coverageViewports.map((viewport, index) => ({ id: `viewport-${index}`, viewport })),
    visualInvariants: [{ id: "coverage-invariant", description: "coverage invariant" }],
    intentionalDifferences: [],
    stateAndInteraction: ["coverage", "anchor", "risk"],
    comparisonTargets: targets,
    parityMatrix: matrix,
  };
  const coverageProbes = [
    ["route", "route", {}],
    ["setup", "setup", {}],
    ["state", "state", { expected: "visible" }],
    ["viewport", "viewport", {}],
    ["theme", "theme", { rootClass: "row-theme", colorScheme: "row-theme" }],
    ["control", "control", { expected: "enabled" }],
    ["overflow", "overflow", { tolerancePx: 0 }],
    ["console", "console", {}],
  ].map(([id, kind, options]) => ({
    id: `coverage-${id}`,
    kind,
    mode: "equal",
    productionSelector: kind === "control" ? "button" : "main",
    prototypeSelector: kind === "control" ? "button" : "main",
    required: true,
    tier: "coverage",
    options,
  }));
  const anchorProbe = {
    id: "anchor-screenshot",
    kind: "screenshot",
    mode: "equal",
    productionSelector: "main",
    prototypeSelector: "main",
    required: true,
    tier: "anchor",
    options: {},
  };
  const keyboardProbe = {
    id: "anchor-keyboard",
    kind: "keyboard",
    mode: "equal",
    productionSelector: "button",
    prototypeSelector: "button",
    required: true,
    tier: "anchor",
    options: { key: "Enter" },
  };
  const anchorRows = targets.map((target, index) => ({
    id: `anchor-${target.id}`,
    targetId: target.id,
    rowId: `${target.id}-ready-viewport-0-light`,
    reason: `representative anchor ${index + 1}`,
  }));
  const universalProbeIds = coverageProbes.map(({ id }) => id);
  const coverageSpec = {
    version: 3,
    stateSetups: targets.flatMap((target) => states.map((state) => ({
      targetId: target.id,
      state,
      production: { query: { state }, actions: [] },
      prototype: { query: { state }, actions: [] },
      assertionProbeIds: ["coverage-state", "coverage-control"],
    }))),
    probes: [...coverageProbes, anchorProbe, keyboardProbe],
    rowProbeMap: matrix.map(({ id }) => ({
      rowId: id,
      probeIds: anchorRows.some(({ rowId }) => rowId === id)
        ? [
            ...universalProbeIds,
            anchorProbe.id,
            ...(id === anchorRows[0].rowId ? [keyboardProbe.id] : []),
          ]
        : universalProbeIds,
    })),
    browserSetups: targets.map(({ id: targetId }) => ({
      targetId,
      production: { type: "query", parameter: "theme" },
      prototype: { type: "query", parameter: "theme" },
    })),
    coverage: {
      targetOrder: targets.map(({ id }) => id),
      viewportOrder: coverageViewports,
      themeOrder: themes,
      anchorRows,
      riskRows: [{
        id: "risk-mobile-ready",
        targetId: targets[0].id,
        state: "ready",
        viewport: coverageViewports[0],
        theme: "light",
        interaction: "mobile-control",
        reason: "mobile control is state-specific",
        requiredProbeIds: ["coverage-control"],
        expected: "control remains operable",
      }],
    },
    sourceImpactMap: [{ source: "src/ui.ts", scope: "global", targetIds: [] }],
    batchPolicy: { maxRows: 4, maxBytes: 131072, summaryMaxBytes: 4096 },
    artifactPolicy: { kinds: ["screenshot", "dom", "accessibility"], maxBytes: 2097152, retainOnFailure: true },
  };
  return { contract: coverageContract, spec: coverageSpec, targets, states, viewports: coverageViewports, themes };
}

function createAdapter(overrides: Record<string, unknown> = {}) {
  let active = "production";
  let viewport = { width: 1280, height: 800, dpr: 1 };
  return {
    sessionId: "fixture-session",
    async activateTab(tabId: string) {
      active = tabId;
    },
    async activeTabId() {
      return active;
    },
    async setViewport(_tabId: string, next: { width: number; height: number }) {
      viewport = { ...next, dpr: 1 };
    },
    async measureViewport() {
      return viewport;
    },
    async navigate() {},
    async setTheme() {},
    async runAction() {},
    async runProbe(_tabId: string, probe: { kind: string }) {
      if (probe.kind === "dom") return { value: { b: 2, a: 1 } };
      return { value: [] };
    },
    async measureScroll() {
      return { x: 0, y: 0 };
    },
    async networkEntries() {
      return [];
    },
    ...overrides,
  };
}

test("parity-specは全target/state・row・probeを厳密に検証する", async () => {
  const { validateParitySpec } = await parityModulePromise;
  assert.equal(validateParitySpec(spec, contract), spec);

  const missingRow = clone(spec);
  missingRow.rowProbeMap.pop();
  assert.throws(
    () => validateParitySpec(missingRow, contract),
    /cover every ui-contract\.json parity row/u,
  );

  const arbitraryAction = clone(spec);
  arbitraryAction.stateSetups[0].production.actions.push({ type: "evaluate", value: "alert(1)" } as never);
  assert.throws(() => validateParitySpec(arbitraryAction, contract), /not allowed/u);

  const externalQuery = clone(spec);
  externalQuery.stateSetups[0].production.query = { returnTo: "https://example.com/" };
  assert.throws(() => validateParitySpec(externalQuery, contract), /safe fixture value|external/u);

  const secretQuery = clone(spec);
  secretQuery.stateSetups[0].production.query = { accessToken: "opaque-value" };
  assert.throws(() => validateParitySpec(secretQuery, contract), /sensitive query parameter/u);

  const personalDataFill = clone(spec);
  personalDataFill.stateSetups[0].production.actions.push({
    type: "fill",
    selector: "#field",
    value: "resident@example.jp",
  } as never);
  assert.throws(() => validateParitySpec(personalDataFill, contract), /synthetic fixture token/u);

  const safeFill = clone(spec);
  safeFill.stateSetups[0].production.actions.push({
    type: "fill",
    selector: "#field",
    value: "ZAAD_fixture_01",
  } as never);
  assert.equal(validateParitySpec(safeFill, contract), safeFill);
  for (const value of [
    "",
    "山田花子",
    "090-1234-5678",
    "https://example.invalid/",
    "fixture value",
    "fixture\nvalue",
    `A${"a".repeat(64)}`,
  ]) {
    const unsafeFill = clone(spec);
    unsafeFill.stateSetups[0].production.actions.push({
      type: "fill",
      selector: "#field",
      value,
    } as never);
    assert.throws(() => validateParitySpec(unsafeFill, contract), /synthetic fixture token/u, value);
  }
});

test("COMPAT-01 legacy CLI exports adapters and evidence readers", async () => {
  const parity = await parityModulePromise;
  for (const exportName of [
    "BrowserParityRunner",
    "ParityRunError",
    "compareProbe",
    "createApprovalEvidence",
    "loadParityDefinition",
    "runCli",
    "selectRows",
    "validateApprovalEvidence",
    "validateEvidenceBundle",
    "validateParityEvidence",
    "validateParitySpec",
    "writeRunEvidence",
  ]) {
    assert.equal(typeof (parity as Record<string, unknown>)[exportName], "function", `missing export ${exportName}`);
  }
  assert.equal(parity.validateParitySpec(spec, contract), spec);
  const versionTwo = {
    ...clone(spec),
    version: 2,
    browserSetups: [{
      targetId: "main",
      production: { type: "aria-switch", selector: "#theme", checkedTheme: "dark", readbackSelector: "html" },
      prototype: { type: "query", parameter: "theme" },
    }],
  };
  assert.equal(parity.validateParitySpec(versionTwo, contract), versionTwo);
  const missingBrowserTarget = clone(versionTwo);
  missingBrowserTarget.browserSetups = [];
  assert.throws(
    () => parity.validateParitySpec(missingBrowserTarget, contract),
    /cover every ui-contract\.json comparison target/u,
  );
  const unsafeBrowserQuery = clone(versionTwo);
  unsafeBrowserQuery.browserSetups[0].prototype.parameter = "https://example.com";
  assert.throws(
    () => parity.validateParitySpec(unsafeBrowserQuery, contract),
    /safe query parameter/u,
  );
  const inAppOnly = createAdapter({ requiresBrowserSetups: true });
  await assert.rejects(
    new parity.BrowserParityRunner(inAppOnly).run({
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: digest },
      phase: "final",
      changedTargetIds: ["main"],
      changedStates: ["default"],
      tabs: { production: "production", prototype: "prototype" },
      baseUrls: { production: "http://localhost:3000/", prototype: "http://127.0.0.1:4000/" },
      run: { runId: "compat", goalSha256: digest, runtime: {}, sources: [] },
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BROWSER_SETUP_REQUIRED",
  );
});

test("phaseとrisk tagからsmoke・affected・全matrixを決定する", async () => {
  const { selectRows } = await parityModulePromise;
  const normal = selectRows({ phase: "smoke", contract });
  assert.deepEqual(
    normal.map(({ id }: { id: string }) => id),
    ["main-default-desktop-light", "main-default-mobile-light"],
  );

  const theme = selectRows({ phase: "smoke", contract, risks: ["theme"] });
  assert.deepEqual(
    theme.map(({ id }: { id: string }) => id),
    [
      "main-default-desktop-light",
      "main-default-desktop-dark",
      "main-default-mobile-light",
      "main-default-mobile-dark",
    ],
  );

  const responsive = selectRows({ phase: "affected", contract, risks: ["responsive"] });
  assert.equal(responsive.length, 4);
  assert.ok(responsive.every(({ theme: selectedTheme }: { theme: string }) => selectedTheme === "light"));
  assert.throws(
    () => selectRows({ phase: "pre-edit", contract }),
    /require explicit changed target and state selections/u,
  );
  assert.equal(
    selectRows({ phase: "pre-edit", contract, changedTargetIds: ["main"], changedStates: ["default"] }).length,
    2,
  );
  assert.equal(
    selectRows({ phase: "final", contract, changedTargetIds: ["main"], changedStates: ["default"] }).length,
    2,
  );
  assert.equal(selectRows({ phase: "pre-edit", contract, matrixScope: "full" }).length, 8);
  assert.equal(selectRows({ phase: "final", contract, matrixScope: "full" }).length, 8);

  const mobileFocus = selectRows({
    phase: "final",
    contract,
    changedTargetIds: ["main"],
    changedStates: ["default"],
    changedViewports: ["390x844"],
    risks: ["focus"],
  });
  assert.deepEqual(mobileFocus.map(({ id }: { id: string }) => id), ["main-default-mobile-light"]);
});

test("COVERAGE-01 version 3 profileは144行で全軸をcoverしfullは明示contextで1440行になる", async () => {
  const parity = await parityModulePromise;
  const fixture = createCoverageFixture();
  assert.equal(parity.validateParitySpec(fixture.spec, fixture.contract), fixture.spec);
  const first = parity.selectRows({
    phase: "final",
    contract: fixture.contract,
    spec: fixture.spec,
    matrixScope: "coverage",
  });
  const second = parity.selectRows({
    phase: "final",
    contract: fixture.contract,
    spec: fixture.spec,
    matrixScope: "coverage",
  });
  assert.equal(first.length, 144);
  assert.equal(new Set(first.map(({ id }: { id: string }) => id)).size, 144);
  assert.deepEqual(first.map(({ id }: { id: string }) => id), second.map(({ id }: { id: string }) => id));
  const report = parity.createCoverageReport(fixture.contract, first);
  assert.equal(report.status, "pass");
  assert.equal(report.targetStates.length, 18 * 5);
  assert.equal(report.targetViewports.length, 18 * 8);
  assert.equal(report.targetThemes.length, 18 * 2);
  assert.throws(
    () => parity.selectRows({
      phase: "final",
      contract: fixture.contract,
      spec: fixture.spec,
      matrixScope: "full",
    }),
    /requires release, ci, scheduled, or explicit execution context/u,
  );
  assert.equal(parity.selectRows({
    phase: "final",
    contract: fixture.contract,
    spec: fixture.spec,
    matrixScope: "full",
    executionContext: "ci",
  }).length, 1_440);

  const additiveRisk = clone(fixture.spec);
  additiveRisk.coverage.riskRows.push({
    id: "risk-additive",
    targetId: fixture.targets[0].id,
    state: "ready",
    viewport: fixture.viewports[1],
    theme: "dark",
    interaction: "breakpoint-risk",
    reason: "this coordinate is outside the cyclic base rows",
    requiredProbeIds: ["coverage-overflow"],
    expected: "no horizontal overflow",
  });
  assert.equal(parity.selectRows({
    phase: "final",
    contract: fixture.contract,
    spec: additiveRisk,
    matrixScope: "coverage",
  }).length, 145);
});

test("COVERAGE-02 version 3 profileはanchor・state assertion・source impactの欠落を拒否する", async () => {
  const parity = await parityModulePromise;
  const fixture = createCoverageFixture();
  const missingAnchor = clone(fixture.spec);
  missingAnchor.coverage.anchorRows = missingAnchor.coverage.anchorRows.slice(1);
  assert.throws(() => parity.validateParitySpec(missingAnchor, fixture.contract), /must include target target-01/u);

  const missingAssertion = clone(fixture.spec);
  missingAssertion.stateSetups[0].assertionProbeIds = [];
  assert.throws(() => parity.validateParitySpec(missingAssertion, fixture.contract), /non-empty array/u);

  const missingImpact = clone(fixture.spec);
  missingImpact.sourceImpactMap = [];
  assert.throws(() => parity.validateParitySpec(missingImpact, fixture.contract), /cover every productionBaseline source/u);
});

test("DOM正規化はkey順を安定化しcomputed-hidden nodeを除外する", async () => {
  const { isVisibleSnapshot, normalizeDomSnapshot, stableNormalize } = await parityModulePromise;
  assert.deepEqual(stableNormalize({ z: 1, a: { y: 2, b: 3 } }), {
    a: { b: 3, y: 2 },
    z: 1,
  });
  const hidden = {
    role: "dialog",
    computedStyle: { display: "none", visibility: "visible", opacity: "1" },
    rect: { width: 100, height: 100 },
  };
  const visible = {
    role: "button",
    computedStyle: { display: "block", visibility: "visible", opacity: "1" },
    rect: { width: 20, height: 20 },
  };
  assert.equal(isVisibleSnapshot(hidden), false);
  assert.equal(isVisibleSnapshot(visible), true);
  assert.deepEqual(normalizeDomSnapshot([hidden, visible]), [stableNormalize(visible)]);
});

test("Browser canaryはactive tabとviewportのreadbackを強制する", async () => {
  const { BrowserParityRunner } = await parityModulePromise;
  const wrongTab = createAdapter({
    async activateTab() {},
    async activeTabId() {
      return "wrong";
    },
  });
  const runner = new BrowserParityRunner(wrongTab);
  await assert.rejects(
    runner.capabilityCanary({
      tabId: "production",
      viewport: { width: 1280, height: 800 },
      dpr: 1,
      requiresNetwork: false,
    }),
    /active tab mismatch/u,
  );

  const wrongViewport = createAdapter({
    async measureViewport() {
      return { width: 1024, height: 768, dpr: 1 };
    },
  });
  await assert.rejects(
    new BrowserParityRunner(wrongViewport).capabilityCanary({
      tabId: "production",
      viewport: { width: 1280, height: 800 },
      dpr: 1,
      requiresNetwork: false,
    }),
    /viewport mismatch/u,
  );
});

test("network probeはPerformanceResourceTiming欠落時にBrowser logへfallbackする", async () => {
  const { BrowserParityRunner } = await parityModulePromise;
  const runner = new BrowserParityRunner(createAdapter());
  const canary = await runner.capabilityCanary({
    tabId: "production",
    viewport: { width: 1280, height: 800 },
    dpr: 1,
    requiresNetwork: true,
  });
  assert.equal(canary.networkSource, "browser-network-log");

  const brokenPerformance = createAdapter({
    async performanceEntries() {
      throw new Error("PerformanceResourceTiming unavailable");
    },
  });
  const fallbackCanary = await new BrowserParityRunner(brokenPerformance).capabilityCanary({
    tabId: "production",
    viewport: { width: 1280, height: 800 },
    dpr: 1,
    requiresNetwork: true,
  });
  assert.equal(fallbackCanary.networkSource, "browser-network-log");

  const noNetwork = createAdapter();
  delete (noNetwork as { networkEntries?: unknown }).networkEntries;
  await assert.rejects(
    new BrowserParityRunner(noNetwork).capabilityCanary({
      tabId: "production",
      viewport: { width: 1280, height: 800 },
      dpr: 1,
      requiresNetwork: true,
    }),
    /network capability/u,
  );
});

test("runnerはrow内のprobeをsurface単位でbatchしてtab往復を増やさない", async () => {
  const { BrowserParityRunner } = await parityModulePromise;
  const switches: string[] = [];
  let active = "";
  const adapter = createAdapter({
    async activateTab(tabId: string) {
      if (active !== tabId) switches.push(tabId);
      active = tabId;
    },
    async activeTabId() {
      return active;
    },
  });
  await new BrowserParityRunner(adapter).run({
    definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: digest },
    phase: "final",
    changedTargetIds: ["main"],
    changedStates: ["default"],
    changedViewports: ["390x844"],
    risks: ["focus"],
    tabs: { production: "production", prototype: "prototype" },
    baseUrls: { production: "http://localhost:3000/", prototype: "http://127.0.0.1:4000/" },
    run: {
      runId: "run-batched",
      goalSha256: digest,
      runtime: { owner: "fixture", checkout: "/fixture" },
      sources: [{ path: "src/ui.ts", sha256: digest }],
    },
  });
  assert.deepEqual(switches, ["production", "prototype"]);
});

test("surface固有routeは各pathnameが正しければ一致として扱う", async () => {
  const { compareProbe } = await parityModulePromise;
  const probe = {
    id: "route-ready",
    kind: "route",
    mode: "equal",
    productionSelector: "body",
    prototypeSelector: "body",
    required: true,
    options: {},
  };

  assert.deepEqual(
    compareProbe(
      probe,
      { value: { matches: true, pathname: "/admin/reservations" } },
      { value: { matches: true, pathname: "/index.html" } },
    ),
    {
      status: "pass",
      production: { matches: true, pathname: "/admin/reservations" },
      prototype: { matches: true, pathname: "/index.html" },
      reason: undefined,
    },
  );
});

test("runnerは全rowを実行しscroll provenanceとmetricsを構造化する", async () => {
  const { BrowserParityRunner, validateParityEvidence } = await parityModulePromise;
  const evidence = await new BrowserParityRunner(createAdapter()).run({
    definition: {
      contract,
      spec,
      prototypeRevision: revision,
      validationProfileDigest: digest,
    },
    phase: "final",
    matrixScope: "full",
    tabs: { production: "production", prototype: "prototype" },
    baseUrls: { production: "http://localhost:3000/", prototype: "http://127.0.0.1:4000/" },
    run: {
      runId: "run-1",
      goalSha256: digest,
      shellCommands: 3,
      runtime: { owner: "fixture", checkout: "/fixture" },
      sources: [{ path: "src/ui.ts", sha256: digest }],
    },
  });
  assert.equal(evidence.rows.length, contract.parityMatrix.length);
  assert.equal(evidence.schemaVersion, 3);
  assert.ok(evidence.rows.every(({ status }: { status: string }) => status === "pass"));
  assert.equal(
    evidence.rows[0].actualConditions.scroll.production.source,
    "window.scrollX/window.scrollY",
  );
  assert.equal(evidence.metrics.fullMatrixRuns, 1);
  assert.equal(evidence.metrics.shellCommands, 3);
  assert.ok(evidence.metrics.durationMs >= 0);
  assert.equal(validateParityEvidence(evidence, contract, spec), evidence);

  const legacyEvidence = clone(evidence);
  legacyEvidence.schemaVersion = 1;
  delete legacyEvidence.matrixScope;
  delete legacyEvidence.selection;
  assert.equal(validateParityEvidence(legacyEvidence, contract, spec), legacyEvidence);

  const wrongViewport = clone(evidence);
  wrongViewport.rows[0].actualConditions.viewport = "1024x768";
  assert.throws(
    () => validateParityEvidence(wrongViewport, contract, spec),
    /viewport does not match the manifest/u,
  );

  const missingProbe = clone(evidence);
  missingProbe.rows[0].probes.pop();
  assert.throws(
    () => validateParityEvidence(missingProbe, contract, spec),
    /probes do not match parity-spec\.json/u,
  );
});

test("runnerは外部originを拒否してloopback surfaceだけを操作する", async () => {
  const { BrowserParityRunner } = await parityModulePromise;
  const run = {
    runId: "run-external",
    goalSha256: digest,
    runtime: {},
    sources: [],
  };
  await assert.rejects(
    new BrowserParityRunner(createAdapter()).run({
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: digest },
      phase: "smoke",
      tabs: { production: "production", prototype: "prototype" },
      baseUrls: { production: "https://example.com/", prototype: "http://127.0.0.1:4000/" },
      run,
    }),
    /production base URL must use HTTP/u,
  );
  await assert.rejects(
    new BrowserParityRunner(createAdapter()).run({
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: digest },
      phase: "smoke",
      tabs: { production: "production", prototype: "prototype" },
      baseUrls: { production: "http://localhost:3000/", prototype: "http://example.com:4000/" },
      run,
    }),
    /prototype base URL must use 127\.0\.0\.1/u,
  );
});

test("runnerはLocal 3000と割当済みworktree portだけをproduction loopbackとして受理する", async () => {
  const { BrowserParityRunner } = await parityModulePromise;
  const run = {
    runId: "run-worktree-port",
    goalSha256: digest,
    runtime: {},
    sources: [],
  };
  await new BrowserParityRunner(createAdapter()).run({
    definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: digest },
    phase: "smoke",
    tabs: { production: "production", prototype: "prototype" },
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4000/" },
    run,
  });
  for (const production of [
    "http://localhost:3001/",
    "http://localhost:3099/",
    "http://localhost:3900/",
    "http://127.0.0.1:3142/",
    "http://localhost:3142/path",
    "http://localhost:3142/?query=1",
  ]) {
    await assert.rejects(
      new BrowserParityRunner(createAdapter()).run({
        definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: digest },
        phase: "smoke",
        tabs: { production: "production", prototype: "prototype" },
        baseUrls: { production, prototype: "http://127.0.0.1:4000/" },
        run,
      }),
      /production base URL/u,
    );
  }
});

test("final-only evidenceはBrowser完了境界を検証し旧pre-edit pairもread-onlyで受け入れる", async () => {
  const {
    BrowserParityRunner,
    createApprovalEvidence,
    validateEvidenceBundle,
  } = await parityModulePromise;
  const runtime = { owner: "fixture", checkout: "/fixture", fixture: "fixture-a", authorization: "admin" };
  const sources = [{ path: "src/ui.ts", sha256: digest }];
  const definition = { contract, spec, prototypeRevision: revision, validationProfileDigest: digest };
  const run = { runId: "run-bundle", goalSha256: digest, runtime, sources };
  const runPhase = (phase: "final") =>
    new BrowserParityRunner(createAdapter()).run({
    definition,
    phase,
    changedTargetIds: ["main"],
    changedStates: ["default"],
    tabs: { production: "production", prototype: "prototype" },
      baseUrls: { production: "http://localhost:3000/", prototype: "http://127.0.0.1:4000/" },
      run,
    });
  const implementation = await runPhase("final");
  const approval = createApprovalEvidence({
    runId: run.runId,
    goalSha256: digest,
    prototypeRevision: revision,
    validationProfileDigest: digest,
  });
  const current = { goalSha256: digest, prototypeRevision: revision, validationProfileDigest: digest, runtime, sources };
  assert.equal(
    validateEvidenceBundle({ approval, implementation, contract, spec, current }).implementation,
    implementation,
  );

  const legacyPreEdit = clone(implementation);
  legacyPreEdit.schemaVersion = 2;
  legacyPreEdit.phase = "pre-edit";
  const legacyImplementation = clone(implementation);
  legacyImplementation.schemaVersion = 2;
  assert.equal(
    validateEvidenceBundle({
      approval,
      preEdit: legacyPreEdit,
      implementation: legacyImplementation,
      contract,
      spec,
      current,
    }).implementation,
    legacyImplementation,
  );
  assert.throws(
    () => validateEvidenceBundle({
      approval,
      implementation,
      contract,
      spec,
      current: { ...current, sources: [{ path: "src/ui.ts", sha256: `sha256:${"c".repeat(64)}` }] },
    }),
    /final evidence invalidated by current sources/u,
  );
});

test("未知のBrowser例外は秘密を保持せずstable codeと対象row/probeだけを示す", async () => {
  const { BrowserParityRunner, ParityRunError } = await parityModulePromise;
  const adapter = createAdapter({
    async runProbe() {
      throw new Error(
        "Bearer runner-secret Cookie: session=runner https://localhost/fixture?token=runner-secret",
      );
    },
  });
  await assert.rejects(
    new BrowserParityRunner(adapter).run({
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: digest },
      phase: "smoke",
      tabs: { production: "production", prototype: "prototype" },
      baseUrls: { production: "http://localhost:3000/", prototype: "http://127.0.0.1:4000/" },
      run: {
        runId: "run-selector",
        goalSha256: digest,
        runtime: {},
        sources: [],
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ParityRunError);
      const candidate = error as {
        code?: string;
        message?: string;
        evidence?: Record<string, unknown>;
      };
      assert.equal(candidate.code, "PARITY_UNEXPECTED_ERROR");
      assert.deepEqual(candidate.evidence, {
        operation: "runProbe",
        rowId: "main-default-desktop-light",
        surface: "production",
        probeId: "dom-shell",
      });
      assert.doesNotMatch(
        JSON.stringify({
          code: candidate.code,
          message: candidate.message,
          evidence: candidate.evidence,
        }),
        /Bearer|Cookie|runner-secret|token=/iu,
      );
      return true;
    },
  );

  const stableAdapter = createAdapter({
    async runProbe() {
      throw new ParityRunError("PARITY_REQUIRED_PROBE_UNAVAILABLE", "documented probe API unavailable");
    },
  });
  await assert.rejects(
    new BrowserParityRunner(stableAdapter).run({
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: digest },
      phase: "smoke",
      tabs: { production: "production", prototype: "prototype" },
      baseUrls: { production: "http://localhost:3000/", prototype: "http://127.0.0.1:4000/" },
      run: { runId: "run-stable-code", goalSha256: digest, runtime: {}, sources: [] },
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_REQUIRED_PROBE_UNAVAILABLE",
  );
});

test("approvalとphase evidenceを同じfresh run directoryへ一度ずつ保存する", async (context) => {
  const { createApprovalEvidence, writeRunEvidence } = await parityModulePromise;
  const temporary = await mkdtemp(path.join(tmpdir(), "parity-evidence-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(path.join(temporary, "plans", "fixture"), { recursive: true });
  const approval = createApprovalEvidence({
    runId: "run-1",
    goalSha256: digest,
    prototypeRevision: revision,
    validationProfileDigest: digest,
    invokedAt: "2026-08-29T00:00:00.000Z",
  });
  const approvalPath = await writeRunEvidence({
    repositoryRootPath: temporary,
    slug: "fixture",
    runId: "run-1",
    name: "approval.json",
    evidence: approval,
  });
  assert.equal(approvalPath, "plans/fixture/evidence/run-1/approval.json");
  assert.equal(
    JSON.parse(await readFile(path.join(temporary, approvalPath), "utf8")).basis,
    "explicit-$implement-invocation",
  );
  const phasePath = await writeRunEvidence({
    repositoryRootPath: temporary,
    slug: "fixture",
    runId: "run-1",
    name: "pre-edit-parity.json",
    evidence: { schemaVersion: 1 },
  });
  assert.equal(phasePath, "plans/fixture/evidence/run-1/pre-edit-parity.json");
  await assert.rejects(
    writeRunEvidence({
      repositoryRootPath: temporary,
      slug: "fixture",
      runId: "run-1",
      name: "approval.json",
      evidence: approval,
    }),
    /EEXIST/u,
  );
});
