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
  assert.throws(() => validateParitySpec(externalQuery, contract), /must not contain an external/u);
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
  assert.equal(selectRows({ phase: "pre-edit", contract }).length, 8);
  assert.equal(selectRows({ phase: "final", contract }).length, 8);
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

test("runnerは全rowを実行しscroll provenanceとmetricsを構造化する", async () => {
  const { BrowserParityRunner, validateParityEvidence } = await parityModulePromise;
  const evidence = await new BrowserParityRunner(createAdapter()).run({
    definition: {
      contract,
      spec,
      prototypeRevision: revision,
      validationProfileDigest: digest,
    },
    phase: "pre-edit",
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
  assert.ok(evidence.rows.every(({ status }: { status: string }) => status === "pass"));
  assert.equal(
    evidence.rows[0].actualConditions.scroll.production.source,
    "window.scrollX/window.scrollY",
  );
  assert.equal(evidence.metrics.fullMatrixRuns, 1);
  assert.equal(evidence.metrics.shellCommands, 3);
  assert.ok(evidence.metrics.durationMs >= 0);
  assert.equal(validateParityEvidence(evidence, contract, spec), evidence);

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

test("final evidence後のsource変更はbundleを失効させる", async () => {
  const {
    BrowserParityRunner,
    createApprovalEvidence,
    validateEvidenceBundle,
  } = await parityModulePromise;
  const runtime = { owner: "fixture", checkout: "/fixture", fixture: "fixture-a", authorization: "admin" };
  const sources = [{ path: "src/ui.ts", sha256: digest }];
  const definition = { contract, spec, prototypeRevision: revision, validationProfileDigest: digest };
  const run = { runId: "run-bundle", goalSha256: digest, runtime, sources };
  const runPhase = (phase: "pre-edit" | "final") =>
    new BrowserParityRunner(createAdapter()).run({
      definition,
      phase,
      tabs: { production: "production", prototype: "prototype" },
      baseUrls: { production: "http://localhost:3000/", prototype: "http://127.0.0.1:4000/" },
      run,
    });
  const [preEdit, implementation] = await Promise.all([runPhase("pre-edit"), runPhase("final")]);
  const approval = createApprovalEvidence({
    runId: run.runId,
    goalSha256: digest,
    prototypeRevision: revision,
    validationProfileDigest: digest,
  });
  const current = { goalSha256: digest, prototypeRevision: revision, validationProfileDigest: digest, runtime, sources };
  assert.equal(
    validateEvidenceBundle({ approval, preEdit, implementation, contract, spec, current }).implementation,
    implementation,
  );
  assert.throws(
    () => validateEvidenceBundle({
      approval,
      preEdit,
      implementation,
      contract,
      spec,
      current: { ...current, sources: [{ path: "src/ui.ts", sha256: `sha256:${"c".repeat(64)}` }] },
    }),
    /final evidence invalidated by current sources/u,
  );
});

test("selector failureは対象row/probeを示して即時停止する", async () => {
  const { BrowserParityRunner, ParityRunError } = await parityModulePromise;
  const adapter = createAdapter({
    async runProbe(_tabId: string, probe: { id: string }) {
      throw new Error(`selector not found for ${probe.id}`);
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
      assert.match(
        (error as { evidence: { rows: Array<{ error: string }> } }).evidence.rows[0].error,
        /main-default-desktop-light\/production\/dom-shell/u,
      );
      return true;
    },
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
