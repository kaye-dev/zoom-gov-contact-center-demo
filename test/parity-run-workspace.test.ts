import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const workspaceModulePromise = import(
  pathToFileURL(
    path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/parity-run-workspace.mjs"),
  ).href,
);
const runnerModulePromise = import(
  pathToFileURL(
    path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/parity-runner.mjs"),
  ).href,
);
const revisionModulePromise = import(
  pathToFileURL(
    path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/prototype-revision.mjs"),
  ).href,
);

type WorkspaceModule = Awaited<typeof workspaceModulePromise>;
type WorkspaceArtifactSink = Awaited<
  ReturnType<WorkspaceModule["createWorkspaceArtifactSink"]>
>;
type WorkspaceArtifactRecord = Awaited<ReturnType<WorkspaceArtifactSink>>;

const digest = `sha256:${"a".repeat(64)}`;
const revision = `sha256:${"b".repeat(64)}`;
const profileDigest = `sha256:${"c".repeat(64)}`;
const sourceDigest = `sha256:${"d".repeat(64)}`;

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function captureOutput() {
  let value = "";
  return {
    stream: { write(chunk: string) { value += chunk; return true; } },
    read: () => value,
  };
}

function stdinText(value: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

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
    viewports: ["390x844"],
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
  responsiveContract: [{ id: "mobile", viewport: "390x844" }],
  visualInvariants: [{ id: "inv-shell", description: "same shell" }],
  intentionalDifferences: [],
  stateAndInteraction: ["focus"],
  comparisonTargets: [{ id: "main", entry: "index.html", route: "/fixture", surface: "page" }],
  parityMatrix: [{
    id: "main-default-mobile-light",
    targetId: "main",
    entry: "index.html",
    route: "/fixture",
    surface: "page",
    state: "default",
    viewport: "390x844",
    theme: "light",
    breakpoint: "mobile",
    expectedInvariantIds: ["inv-shell"],
    intentionalDifferenceIds: [],
  }],
};

const spec = {
  version: 2,
  stateSetups: [{
    targetId: "main",
    state: "default",
    production: { query: {}, actions: [] },
    prototype: { query: {}, actions: [] },
  }],
  browserSetups: [{
    targetId: "main",
    production: { type: "query", parameter: "theme" },
    prototype: { type: "query", parameter: "theme" },
  }],
  probes: [{
    id: "dom-main",
    kind: "dom",
    mode: "equal",
    productionSelector: "main",
    prototypeSelector: "main",
    required: true,
    options: {},
  }],
  rowProbeMap: [{ rowId: "main-default-mobile-light", probeIds: ["dom-main"] }],
};

async function createFixture(context: { after(callback: () => Promise<void>): void }, runId: string) {
  const root = await mkdtemp(path.join(tmpdir(), "parity-workspace-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".codex"), { mode: 0o700 });
  await mkdir(path.join(root, "plans", "fixture"), { recursive: true });
  await mkdir(path.join(root, "src"));
  await chmod(path.join(root, ".codex"), 0o700);
  const runner = await runnerModulePromise;
  const approval = runner.createApprovalEvidence({
    runId,
    goalSha256: digest,
    prototypeRevision: revision,
    validationProfileDigest: profileDigest,
    invokedAt: "2026-09-01T00:00:00.000Z",
  });
  const current = {
    goalSha256: digest,
    prototypeRevision: revision,
    validationProfileDigest: profileDigest,
    runtime: { owner: "fixture", checkout: "/fixture" },
    sources: [{ path: "src/ui.ts", sha256: sourceDigest }],
  };
  return { root, runner, approval, current };
}

function rowEvidence(status: "pass" | "fail" = "pass") {
  return {
    rowId: "main-default-mobile-light",
    status,
    actualConditions: {
      state: "default",
      theme: "light",
      viewport: "390x844",
      dpr: 1,
      urls: {
        production: "http://localhost:3142/fixture",
        prototype: "http://127.0.0.1:4142/index.html",
      },
      scroll: {
        production: { x: 0, y: 0, source: "window.scrollX/window.scrollY" },
        prototype: { x: 0, y: 0, source: "window.scrollX/window.scrollY" },
      },
    },
    probes: [{
      probeId: "dom-main",
      kind: "dom",
      status,
      production: { tag: "main" },
      prototype: status === "pass" ? { tag: "main" } : { tag: "aside" },
      ...(status === "fail" ? { reason: "expected equal values" } : {}),
      artifactPaths: [],
    }],
    artifactPaths: [],
  };
}

function fragment(handshake: { runId: string; batches: Array<{ batchId: string; sha256: string }> }, status: "pass" | "fail" = "pass") {
  const batch = handshake.batches[0];
  return {
    schemaVersion: 1,
    runId: handshake.runId,
    batchId: batch.batchId,
    batchSha256: batch.sha256,
    rowIds: ["main-default-mobile-light"],
    rows: [rowEvidence(status)],
    capabilities: {
      status: "pass",
      tabId: "comparison",
      viewport: { width: 390, height: 844, dpr: 1 },
      networkSource: "not-required",
      sessionId: "iab-fixture",
      screenshot: digest,
    },
    metrics: {
      startedAt: "2026-09-01T00:00:00.000Z",
      finishedAt: "2026-09-01T00:00:01.000Z",
      durationMs: 1000,
      shellCommands: 0,
      browserOperations: 20,
      fullMatrixRuns: 0,
    },
    terminalCleanup: {
      status: "pass",
      tabId: "comparison",
      cdpCleared: true,
      viewportReset: true,
      baseline: { width: 1280, height: 720, dpr: 2 },
      readback: { width: 1280, height: 720, dpr: 2 },
    },
  };
}

async function prepare(
  workspace: Awaited<typeof workspaceModulePromise>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  runId: string,
  definition = { contract, spec, prototypeRevision: revision, validationProfileDigest: profileDigest },
) {
  return workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId,
    definition,
    approval: fixture.approval,
    current: fixture.current,
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
    changedTargetIds: ["main"],
    changedStates: ["default"],
    changedViewports: ["390x844"],
    validateApproval: fixture.runner.validateApprovalEvidence,
  });
}

function createCoverageWorkspaceDefinition() {
  const targets = [
    { id: "main", entry: "index.html", route: "/fixture", surface: "page" },
    { id: "secondary", entry: "secondary.html", route: "/secondary", surface: "page" },
  ];
  const viewports = ["390x844", "1280x900"];
  const themes = ["light", "dark"];
  const rows = targets.flatMap((target) =>
    viewports.flatMap((viewport, viewportIndex) => themes.map((theme) => ({
      id: `${target.id}-ready-${viewportIndex}-${theme}`,
      targetId: target.id,
      entry: target.entry,
      route: target.route,
      surface: target.surface,
      state: "ready",
      viewport,
      theme,
      breakpoint: `viewport-${viewportIndex}`,
      expectedInvariantIds: ["coverage"],
      intentionalDifferenceIds: [],
    }))),
  );
  const coverageContract = {
    ...structuredClone(contract),
    comparisonConditions: { ...structuredClone(contract.comparisonConditions), viewports, themes },
    baselineStateInventory: ["ready"],
    themeContract: themes,
    responsiveContract: viewports.map((viewport, index) => ({ id: `viewport-${index}`, viewport })),
    visualInvariants: [{ id: "coverage", description: "coverage" }],
    stateAndInteraction: ["coverage"],
    comparisonTargets: targets,
    parityMatrix: rows,
  };
  const probeDefinitions = [
    ["route", {}],
    ["setup", {}],
    ["state", { expected: "visible" }],
    ["viewport", {}],
    ["theme", { rootClass: "row-theme", colorScheme: "row-theme" }],
    ["control", { expected: "enabled" }],
    ["overflow", { tolerancePx: 0 }],
    ["console", {}],
  ].map(([kind, options]) => ({
    id: `coverage-${kind}`,
    kind,
    mode: "equal",
    productionSelector: "main",
    prototypeSelector: "main",
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
  const anchorRows = targets.map((target) => ({
    id: `anchor-${target.id}`,
    targetId: target.id,
    rowId: `${target.id}-ready-0-light`,
    reason: "representative anchor",
  }));
  const coverageSpec = {
    version: 3,
    stateSetups: targets.map((target) => ({
      targetId: target.id,
      state: "ready",
      production: { query: {}, actions: [] },
      prototype: { query: {}, actions: [] },
      assertionProbeIds: ["coverage-state"],
    })),
    browserSetups: targets.map((target) => ({
      targetId: target.id,
      production: { type: "query", parameter: "theme" },
      prototype: { type: "query", parameter: "theme" },
    })),
    probes: [...probeDefinitions, anchorProbe],
    rowProbeMap: rows.map((row) => ({
      rowId: row.id,
      probeIds: anchorRows.some(({ rowId }) => rowId === row.id)
        ? [...probeDefinitions.map(({ id }) => id), anchorProbe.id]
        : probeDefinitions.map(({ id }) => id),
    })),
    coverage: {
      targetOrder: targets.map(({ id }) => id),
      viewportOrder: viewports,
      themeOrder: themes,
      anchorRows,
      riskRows: [],
    },
    sourceImpactMap: [{ source: "src/ui.ts", scope: "shared", targetIds: ["main"] }],
    batchPolicy: { maxRows: 2, maxBytes: 131072, summaryMaxBytes: 4096 },
    artifactPolicy: { kinds: ["screenshot", "dom", "accessibility"], maxBytes: 2097152, retainOnFailure: true },
  };
  return {
    contract: coverageContract,
    spec: coverageSpec,
    prototypeRevision: revision,
    validationProfileDigest: profileDigest,
  };
}

function coverageFragment(
  handshake: { runId: string; batches: Array<{ batchId: string; sha256: string }> },
  batch: { batchId: string; rowIds: string[] },
  definition: ReturnType<typeof createCoverageWorkspaceDefinition>,
) {
  const batchIndex = handshake.batches.findIndex(({ batchId }) => batchId === batch.batchId);
  const rowsById = new Map(definition.contract.parityMatrix.map((row) => [row.id, row]));
  const probeIdsByRow = new Map(definition.spec.rowProbeMap.map((mapping) => [mapping.rowId, mapping.probeIds]));
  const probeById = new Map(definition.spec.probes.map((probe) => [probe.id, probe]));
  return {
    schemaVersion: 2,
    runId: handshake.runId,
    batchId: batch.batchId,
    batchSha256: handshake.batches[batchIndex].sha256,
    rowIds: batch.rowIds,
    rows: batch.rowIds.map((rowId) => {
      const row = rowsById.get(rowId)!;
      return {
        rowId,
        status: "pass",
        actualConditions: {
          state: row.state,
          theme: row.theme,
          viewport: row.viewport,
          dpr: 1,
          urls: {
            production: `http://localhost:3142${row.route}`,
            prototype: `http://127.0.0.1:4142/${row.entry}`,
          },
          scroll: {
            production: { x: 0, y: 0, source: "window.scrollX/window.scrollY" },
            prototype: { x: 0, y: 0, source: "window.scrollX/window.scrollY" },
          },
        },
        probes: probeIdsByRow.get(rowId)!.map((probeId) => {
          const probe = probeById.get(probeId)!;
          const value = probe.kind === "console" ? [] : { matches: true };
          return {
            probeId,
            kind: probe.kind,
            tier: probe.tier,
            status: "pass",
            production: value,
            prototype: value,
            artifactPaths: [] as string[],
            artifacts: [] as WorkspaceArtifactRecord[],
          };
        }),
        artifactPaths: [] as string[],
        artifacts: [] as WorkspaceArtifactRecord[],
      };
    }),
    capabilities: batchIndex === 0 ? {
      status: "pass",
      tabId: "comparison",
      viewport: { width: 390, height: 844, dpr: 1 },
      networkSource: "not-required",
      sessionId: "coverage-fixture",
      screenshot: digest,
    } : null,
    metrics: {
      startedAt: "2026-09-01T00:00:00.000Z",
      finishedAt: "2026-09-01T00:00:01.000Z",
      durationMs: 1000,
      shellCommands: 0,
      browserOperations: 20,
      fullMatrixRuns: 0,
    },
    terminalCleanup: batchIndex === handshake.batches.length - 1 ? {
      status: "pass",
      tabId: "comparison",
      cdpCleared: true,
      viewportReset: true,
      baseline: { width: 1280, height: 720, dpr: 2 },
      readback: { width: 1280, height: 720, dpr: 2 },
    } : null,
  };
}

test("WS-01 bounded batch integrity", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-01");
  const handshake = await prepare(workspace, fixture, "ws-01");
  assert.equal(handshake.batches.length, 1);
  assert.match(handshake.manifestSha256, /^sha256:[a-f0-9]{64}$/u);
  const runRoot = path.dirname(handshake.manifestPath);
  const manifest = JSON.parse(await readFile(handshake.manifestPath, "utf8"));
  const batch = JSON.parse(await readFile(handshake.batches[0].path, "utf8"));
  assert.equal(handshake.manifestSha256, sha256(fixture.runner.stableStringify(manifest)));
  assert.equal(handshake.batches[0].sha256, sha256(fixture.runner.stableStringify(batch)));
  assert.equal((await stat(runRoot)).mode & 0o777, 0o700);
  for (const entry of await readdir(runRoot)) {
    assert.doesNotMatch(entry, /\.(?:mjs|js)$/u);
    assert.equal((await stat(path.join(runRoot, entry))).mode & 0o777, 0o600);
  }
  const result = fragment(handshake);
  await assert.rejects(
    workspace.recordBatchResult({
      repositoryRootPath: fixture.root,
      runId: "ws-01",
      batchId: handshake.batches[0].batchId,
      input: result,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "PARITY_BATCH_INVALID" &&
      /stdin JSON text/u.test((error as Error).message),
  );
  await workspace.recordBatchResult({
    repositoryRootPath: fixture.root,
    runId: "ws-01",
    batchId: handshake.batches[0].batchId,
    input: JSON.stringify(result),
  });
  await assert.rejects(
    workspace.recordBatchResult({
      repositoryRootPath: fixture.root,
      runId: "ws-01",
      batchId: handshake.batches[0].batchId,
      input: JSON.stringify(result),
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INVALID",
  );
  await assert.rejects(
    workspace.recordBatchResult({
      repositoryRootPath: fixture.root,
      runId: "ws-01",
      batchId: "batch-unknown",
      input: JSON.stringify(result),
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INVALID",
  );
  await assert.rejects(
    workspace.recordBatchResult({
      repositoryRootPath: fixture.root,
      runId: "ws-01",
      batchId: handshake.batches[0].batchId,
      input: "{",
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INVALID",
  );

  const unsafe = await createFixture(context, "ws-unsafe-url");
  await assert.rejects(
    workspace.prepareRunWorkspace({
      repositoryRootPath: unsafe.root,
      slug: "fixture",
      runId: "ws-unsafe-url",
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: profileDigest },
      approval: unsafe.approval,
      current: unsafe.current,
      baseUrls: { production: "https://example.com/", prototype: "http://127.0.0.1:4142/" },
      changedTargetIds: ["main"],
      changedStates: ["default"],
      changedViewports: ["390x844"],
      validateApproval: unsafe.runner.validateApprovalEvidence,
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INVALID",
  );
});

test("WS-02 fail-closed two-phase finalize", async (context) => {
  const workspace = await workspaceModulePromise;

  const success = await createFixture(context, "ws-success");
  const successHandshake = await prepare(workspace, success, "ws-success");
  await workspace.recordBatchResult({
    repositoryRootPath: success.root,
    runId: "ws-success",
    batchId: successHandshake.batches[0].batchId,
    input: JSON.stringify(fragment(successHandshake)),
  });
  const finalized = await workspace.finalizeRunWorkspace({
    repositoryRootPath: success.root,
    slug: "fixture",
    runId: "ws-success",
    approval: success.approval,
    current: success.current,
    definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: profileDigest },
    validateBundle: success.runner.validateEvidenceBundle,
    writeEvidence: success.runner.writeRunEvidence,
  });
  assert.equal(finalized.status, "pass");
  await assert.rejects(access(path.dirname(successHandshake.manifestPath)));
  const evidence = JSON.parse(await readFile(path.join(success.root, finalized.evidencePath), "utf8"));
  assert.equal(evidence.rows[0].status, "pass");
  assert.equal(evidence.capabilities.cleanup.status, "pass");

  const missing = await createFixture(context, "ws-missing");
  const missingHandshake = await prepare(workspace, missing, "ws-missing");
  await assert.rejects(
    workspace.finalizeRunWorkspace({
      repositoryRootPath: missing.root,
      slug: "fixture",
      runId: "ws-missing",
      approval: missing.approval,
      current: missing.current,
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: profileDigest },
      validateBundle: missing.runner.validateEvidenceBundle,
      writeEvidence: missing.runner.writeRunEvidence,
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INCOMPLETE",
  );
  await access(path.dirname(missingHandshake.manifestPath));
  await assert.rejects(access(path.join(missing.root, "plans/fixture/evidence/ws-missing/implementation-parity.json")));

  const failed = await createFixture(context, "ws-failed");
  const failedHandshake = await prepare(workspace, failed, "ws-failed");
  await workspace.recordBatchResult({
    repositoryRootPath: failed.root,
    runId: "ws-failed",
    batchId: failedHandshake.batches[0].batchId,
    input: JSON.stringify(fragment(failedHandshake, "fail")),
  });
  await assert.rejects(
    workspace.finalizeRunWorkspace({
      repositoryRootPath: failed.root,
      slug: "fixture",
      runId: "ws-failed",
      approval: failed.approval,
      current: failed.current,
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: profileDigest },
      validateBundle: failed.runner.validateEvidenceBundle,
      writeEvidence: failed.runner.writeRunEvidence,
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INCOMPLETE",
  );

  const cleanupFailure = await createFixture(context, "ws-cleanup");
  const cleanupHandshake = await prepare(workspace, cleanupFailure, "ws-cleanup");
  await workspace.recordBatchResult({
    repositoryRootPath: cleanupFailure.root,
    runId: "ws-cleanup",
    batchId: cleanupHandshake.batches[0].batchId,
    input: JSON.stringify(fragment(cleanupHandshake)),
  });
  await assert.rejects(
    workspace.finalizeRunWorkspace({
      repositoryRootPath: cleanupFailure.root,
      slug: "fixture",
      runId: "ws-cleanup",
      approval: cleanupFailure.approval,
      current: cleanupFailure.current,
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: profileDigest },
      validateBundle: cleanupFailure.runner.validateEvidenceBundle,
      writeEvidence: cleanupFailure.runner.writeRunEvidence,
      removeWorkspace: async () => { throw new Error("fixture cleanup failure"); },
    }),
    /fixture cleanup failure/u,
  );
  await access(path.dirname(cleanupHandshake.manifestPath));
});

test("WS-03 scoped abort and secret exclusion", async (context) => {
  const workspace = await workspaceModulePromise;
  const first = await createFixture(context, "ws-abort-a");
  const firstHandshake = await prepare(workspace, first, "ws-abort-a");
  const secondApproval = first.runner.createApprovalEvidence({
    runId: "ws-abort-b",
    goalSha256: digest,
    prototypeRevision: revision,
    validationProfileDigest: profileDigest,
  });
  const second = { ...first, approval: secondApproval };
  const secondHandshake = await prepare(workspace, second, "ws-abort-b");
  await workspace.abortRunWorkspace({ repositoryRootPath: first.root, runId: "ws-abort-a" });
  await assert.rejects(access(path.dirname(firstHandshake.manifestPath)));
  await access(path.dirname(secondHandshake.manifestPath));
  await access(path.join(first.root, "plans", "fixture"));

  const secretApproval = first.runner.createApprovalEvidence({
    runId: "ws-secret",
    goalSha256: digest,
    prototypeRevision: revision,
    validationProfileDigest: profileDigest,
  });
  await assert.rejects(
    workspace.prepareRunWorkspace({
      repositoryRootPath: first.root,
      slug: "fixture",
      runId: "ws-secret",
      definition: { contract, spec, prototypeRevision: revision, validationProfileDigest: profileDigest },
      approval: secretApproval,
      current: { ...first.current, runtime: { ...first.current.runtime, token: "should-not-be-recorded" } },
      baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
      changedTargetIds: ["main"],
      changedStates: ["default"],
      changedViewports: ["390x844"],
      validateApproval: first.runner.validateApprovalEvidence,
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INVALID",
  );
});

test("WS-SEC-01 canary cleanup URL and secret fragment contract", async (context) => {
  const workspace = await workspaceModulePromise;
  const cases: Array<{
    id: string;
    code: string;
    mutate(value: ReturnType<typeof fragment>): void;
  }> = [
    {
      id: "missing-screenshot",
      code: "PARITY_BATCH_INVALID",
      mutate(value) { delete (value.capabilities as { screenshot?: string }).screenshot; },
    },
    {
      id: "wrong-viewport",
      code: "PARITY_VIEWPORT_MISMATCH",
      mutate(value) { value.capabilities.viewport.width = 391; },
    },
    {
      id: "wrong-dpr",
      code: "PARITY_DPR_MISMATCH",
      mutate(value) { value.capabilities.viewport.dpr = 2; },
    },
    {
      id: "wrong-network-source",
      code: "PARITY_REQUIRED_PROBE_UNAVAILABLE",
      mutate(value) { value.capabilities.networkSource = "performance-resource-timing"; },
    },
    {
      id: "cleanup-readback",
      code: "PARITY_CLEANUP_FAILED",
      mutate(value) { value.terminalCleanup.readback.width = 1279; },
    },
    {
      id: "cleanup-tab",
      code: "PARITY_CLEANUP_FAILED",
      mutate(value) { value.terminalCleanup.tabId = "other"; },
    },
    {
      id: "evidence-query",
      code: "PARITY_BATCH_INVALID",
      mutate(value) { value.rows[0].actualConditions.urls.production += "?token=redacted"; },
    },
    {
      id: "console-secret",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        (value.rows[0].probes[0] as { production: unknown }).production = {
          message: "Bearer should-not-persist",
        };
      },
    },
    {
      id: "personal-data",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        (value.rows[0].probes[0] as { production: unknown }).production = {
          text: "resident@example.jp",
        };
      },
    },
  ];

  for (const item of cases) {
    const runId = `ws-${item.id}`;
    const fixture = await createFixture(context, runId);
    const handshake = await prepare(workspace, fixture, runId);
    const value = fragment(handshake);
    item.mutate(value);
    await assert.rejects(
      workspace.recordBatchResult({
        repositoryRootPath: fixture.root,
        runId,
        batchId: handshake.batches[0].batchId,
        input: JSON.stringify(value),
      }),
      (error: unknown) => (error as { code?: string }).code === item.code,
      item.id,
    );
    await access(path.dirname(handshake.manifestPath));
    await assert.rejects(access(path.join(fixture.root, "plans/fixture/evidence", runId, "implementation-parity.json")));
  }
});

test("WS-SEC-02 text and attribute fragments require compact fingerprints", async (context) => {
  const workspace = await workspaceModulePromise;
  const compactSpec = structuredClone(spec);
  compactSpec.probes.push(
    {
      id: "text-main",
      kind: "text",
      mode: "equal",
      productionSelector: "main",
      prototypeSelector: "main",
      required: true,
      options: { normalizeWhitespace: true },
    },
    {
      id: "attribute-main",
      kind: "attribute",
      mode: "equal",
      productionSelector: "main",
      prototypeSelector: "main",
      required: true,
      options: { name: "data-state" },
    },
  );
  compactSpec.rowProbeMap[0].probeIds.push("text-main", "attribute-main");
  const definition = {
    contract,
    spec: compactSpec,
    prototypeRevision: revision,
    validationProfileDigest: profileDigest,
  };
  const fixture = await createFixture(context, "ws-compact-probes");
  const handshake = await prepare(workspace, fixture, "ws-compact-probes", definition);
  const value = fragment(handshake);
  const probeResults = value.rows[0].probes as unknown as Array<{
    probeId: string;
    kind: string;
    status: string;
    production: unknown;
    prototype: unknown;
    artifactPaths: string[];
  }>;
  probeResults.push({
    probeId: "text-main",
    kind: "text",
    status: "pass",
    production: "Resident Name",
    prototype: "Resident Name",
    artifactPaths: [],
  });
  probeResults.push({
    probeId: "attribute-main",
    kind: "attribute",
    status: "pass",
    production: "ready",
    prototype: "ready",
    artifactPaths: [],
  });
  await assert.rejects(
    workspace.recordBatchResult({
      repositoryRootPath: fixture.root,
      runId: "ws-compact-probes",
      batchId: handshake.batches[0].batchId,
      input: JSON.stringify(value),
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INVALID",
  );

  const fingerprint = { sha256: digest, bytes: 12 };
  probeResults[1].production = fingerprint;
  probeResults[1].prototype = fingerprint;
  probeResults[2].production = { isNull: true };
  probeResults[2].prototype = { isNull: true };
  await workspace.recordBatchResult({
    repositoryRootPath: fixture.root,
    runId: "ws-compact-probes",
    batchId: handshake.batches[0].batchId,
    input: JSON.stringify(value),
  });
  const persisted = await readFile(
    path.join(path.dirname(handshake.manifestPath), `fragment-${handshake.batches[0].batchId}.json`),
    "utf8",
  );
  assert.doesNotMatch(persisted, /Resident Name|"ready"/u);
});

test("WS-CLI-01 prepare record finalize lifecycle", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "parity-cli-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const repositoryRoot = await realpath(root);
  const prototypeRoot = path.join(repositoryRoot, "plans", "fixture", "prototype");
  const evidenceRoot = path.join(repositoryRoot, "plans", "fixture", "evidence", "cli-run");
  await mkdir(prototypeRoot, { recursive: true });
  await mkdir(evidenceRoot, { recursive: true });
  await chmod(path.dirname(evidenceRoot), 0o700);
  await chmod(evidenceRoot, 0o700);
  await mkdir(path.join(repositoryRoot, ".codex"), { mode: 0o700 });
  await mkdir(path.join(repositoryRoot, "src"));
  await writeFile(path.join(repositoryRoot, "src", "ui.ts"), "export const fixture = true;\n");
  await writeFile(path.join(prototypeRoot, "index.html"), "<!doctype html><main>fixture</main>\n");

  const cliContract = structuredClone(contract);
  cliContract.productionBaseline.checkout = repositoryRoot;
  cliContract.comparisonConditions.viewports = ["390x844", "1280x800"];
  cliContract.responsiveContract = [
    { id: "mobile", viewport: "390x844" },
    { id: "desktop", viewport: "1280x800" },
  ];
  cliContract.stateAndInteraction = ["keyboard", "focus"];
  cliContract.parityMatrix = [
    ["mobile", "390x844"],
    ["desktop", "1280x800"],
  ].flatMap(([breakpoint, viewport]) => ["light", "dark"].map((theme) => ({
    ...contract.parityMatrix[0],
    id: `main-default-${breakpoint}-${theme}`,
    breakpoint,
    viewport,
    theme,
  })));
  const cliSpec = structuredClone(spec);
  cliSpec.rowProbeMap = cliContract.parityMatrix.map(({ id }) => ({ rowId: id, probeIds: ["dom-main"] }));
  const contractText = `${JSON.stringify(cliContract, null, 2)}\n`;
  const specText = `${JSON.stringify(cliSpec, null, 2)}\n`;
  const goalText = "# CLI fixture goal\n";
  await writeFile(path.join(prototypeRoot, "ui-contract.json"), contractText);
  await writeFile(path.join(prototypeRoot, "parity-spec.json"), specText);
  await writeFile(path.join(repositoryRoot, "plans", "fixture", "goal.md"), goalText);

  const [runner, revisionModule] = await Promise.all([runnerModulePromise, revisionModulePromise]);
  const computedRevision = await revisionModule.prototypeRevisionInRepository(
    "plans/fixture/prototype",
    repositoryRoot,
  );
  const approval = runner.createApprovalEvidence({
    runId: "cli-run",
    goalSha256: sha256(goalText),
    prototypeRevision: computedRevision,
    validationProfileDigest: sha256(specText),
    invokedAt: "2026-09-01T00:00:00.000Z",
  });
  await writeFile(
    path.join(evidenceRoot, "approval.json"),
    `${JSON.stringify(approval, null, 2)}\n`,
    { mode: 0o600 },
  );

  const preparedOutput = captureOutput();
  await runner.runCli({
    argv: [
      "prepare-run",
      "plans/fixture/prototype",
      "--run-id", "cli-run",
      "--production-url", "http://localhost:3142/",
      "--prototype-url", "http://127.0.0.1:4142/",
      "--runtime-owner", "fixture",
      "--runtime-checkout", repositoryRoot,
      "--target", "main",
      "--state", "default",
      "--viewport", "390x844",
      "--matrix-scope", "targeted",
    ],
    repositoryRootPath: repositoryRoot,
    stdout: preparedOutput.stream,
  });
  const handshake = JSON.parse(preparedOutput.read());
  assert.deepEqual(handshake.batches.map(({ batchId }: { batchId: string }) => batchId), ["batch-0001"]);

  const recordedOutput = captureOutput();
  await runner.runCli({
    argv: [
      "record-batch",
      "plans/fixture/prototype",
      "--run-id", "cli-run",
      "--batch-id", "batch-0001",
    ],
    repositoryRootPath: repositoryRoot,
    stdin: stdinText(JSON.stringify(fragment(handshake))),
    stdout: recordedOutput.stream,
  });
  assert.equal(JSON.parse(recordedOutput.read()).status, "recorded");

  const finalizedOutput = captureOutput();
  await runner.runCli({
    argv: [
      "finalize-run",
      "plans/fixture/prototype",
      "--run-id", "cli-run",
      "--runtime-owner", "fixture",
      "--runtime-checkout", repositoryRoot,
    ],
    repositoryRootPath: repositoryRoot,
    stdout: finalizedOutput.stream,
  });
  const finalized = JSON.parse(finalizedOutput.read());
  assert.equal(finalized.status, "pass");
  const evidence = JSON.parse(await readFile(path.join(repositoryRoot, finalized.evidencePath), "utf8"));
  assert.equal(evidence.rows[0].rowId, "main-default-mobile-light");
  await assert.rejects(access(path.join(repositoryRoot, ".codex", "parity-runs", "cli-run")));
});

test("WS-COVERAGE-01 checkpointは成功batchを保持し未実行batchだけを返す", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-coverage-checkpoint");
  const definition = createCoverageWorkspaceDefinition();
  const handshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: "ws-coverage-checkpoint",
    definition,
    approval: fixture.approval,
    current: fixture.current,
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
    matrixScope: "coverage",
    validateApproval: fixture.runner.validateApprovalEvidence,
  });
  assert.equal(handshake.schemaVersion, 2);
  assert.equal(handshake.summary.plannedRows, 4);
  assert.equal(handshake.batches.length, 2);

  const first = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  assert.equal(first.batch.batchId, "batch-0001");
  await workspace.recordBatchResult({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
    batchId: first.batch.batchId,
    input: JSON.stringify(coverageFragment(handshake, first.batch, definition)),
  });
  const second = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  assert.equal(second.batch.batchId, "batch-0002");
  assert.equal(second.summary.passedRows, 2);
  assert.deepEqual(second.summary.failedRowIds, []);
});

test("WS-COVERAGE-02 transient failureは同じbatchだけを1回再試行してterminalになる", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-coverage-retry");
  const definition = createCoverageWorkspaceDefinition();
  const handshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: "ws-coverage-retry",
    definition,
    approval: fixture.approval,
    current: fixture.current,
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
    matrixScope: "coverage",
    validateApproval: fixture.runner.validateApprovalEvidence,
  });
  const first = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  const retryable = await workspace.recordBatchFailure({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
    batchId: first.batch.batchId,
    code: "PARITY_BROWSER_TRANSIENT",
    diagnostic: "temporary Browser disconnect",
    transient: true,
  });
  assert.equal(retryable.retryable, true);
  const retry = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  assert.equal(retry.batch.batchId, first.batch.batchId);
  assert.equal(retry.batch.attempt, 2);
  const terminal = await workspace.recordBatchFailure({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
    batchId: retry.batch.batchId,
    code: "PARITY_BROWSER_TRANSIENT",
    diagnostic: "temporary Browser disconnect repeated",
    transient: true,
  });
  assert.equal(terminal.retryable, false);
  assert.equal(terminal.status, "terminal");
  const stopped = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  assert.equal(stopped.status, "terminal");
  assert.equal(stopped.batch, null);
});

test("WS-CLI-02 coverage checkpoint commandは失敗batchだけを1回再開する", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-cli-coverage");
  const definition = createCoverageWorkspaceDefinition();
  await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: "ws-cli-coverage",
    definition,
    approval: fixture.approval,
    current: fixture.current,
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
    matrixScope: "coverage",
    validateApproval: fixture.runner.validateApprovalEvidence,
  });

  const firstOutput = captureOutput();
  await fixture.runner.runCli({
    argv: ["next-batch", "plans/fixture/prototype", "--run-id", "ws-cli-coverage"],
    repositoryRootPath: fixture.root,
    stdout: firstOutput.stream,
  });
  const first = JSON.parse(firstOutput.read());
  assert.equal(first.batch.attempt, 1);

  const failureOutput = captureOutput();
  await fixture.runner.runCli({
    argv: [
      "record-failure", "plans/fixture/prototype",
      "--run-id", "ws-cli-coverage",
      "--batch-id", first.batch.batchId,
      "--failure-code", "PARITY_BROWSER_TRANSIENT",
      "--diagnostic", "temporary disconnect",
      "--transient", "true",
    ],
    repositoryRootPath: fixture.root,
    stdout: failureOutput.stream,
  });
  assert.equal(JSON.parse(failureOutput.read()).retryable, true);

  const resumeOutput = captureOutput();
  await fixture.runner.runCli({
    argv: ["resume-run", "plans/fixture/prototype", "--run-id", "ws-cli-coverage"],
    repositoryRootPath: fixture.root,
    stdout: resumeOutput.stream,
  });
  const retry = JSON.parse(resumeOutput.read());
  assert.equal(retry.batch.batchId, first.batch.batchId);
  assert.equal(retry.batch.attempt, 2);

  const terminalOutput = captureOutput();
  await fixture.runner.runCli({
    argv: [
      "record-failure", "plans/fixture/prototype",
      "--run-id", "ws-cli-coverage",
      "--batch-id", first.batch.batchId,
      "--failure-code", "PARITY_BROWSER_TRANSIENT",
      "--diagnostic", "temporary disconnect repeated",
      "--transient", "true",
    ],
    repositoryRootPath: fixture.root,
    stdout: terminalOutput.stream,
  });
  assert.equal(JSON.parse(terminalOutput.read()).status, "terminal");

  const cleanupOutput = captureOutput();
  await fixture.runner.runCli({
    argv: ["cleanup-run", "plans/fixture/prototype", "--run-id", "ws-cli-coverage"],
    repositoryRootPath: fixture.root,
    stdout: cleanupOutput.stream,
  });
  assert.equal(JSON.parse(cleanupOutput.read()).status, "aborted");
});

test("WS-COVERAGE-03 targetとsharedとglobal invalidationは非影響batchを保持する", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-coverage-invalidate");
  const definition = createCoverageWorkspaceDefinition();
  const handshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: "ws-coverage-invalidate",
    definition,
    approval: fixture.approval,
    current: fixture.current,
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
    matrixScope: "coverage",
    validateApproval: fixture.runner.validateApprovalEvidence,
  });
  for (let index = 0; index < handshake.batches.length; index += 1) {
    const next = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
    await workspace.recordBatchResult({
      repositoryRootPath: fixture.root,
      runId: handshake.runId,
      batchId: next.batch.batchId,
      input: JSON.stringify(coverageFragment(handshake, next.batch, definition)),
    });
  }
  const targeted = await workspace.invalidateRunWorkspace({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
    scope: "target",
    targetIds: ["main"],
  });
  assert.deepEqual(targeted.batchIds, ["batch-0001"]);
  assert.equal(targeted.summary.passedRows, 2);
  const component = await workspace.invalidateRunWorkspace({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
    scope: "shared",
    source: "src/ui.ts",
  });
  assert.deepEqual(component.targetIds, ["main"]);
  assert.equal(component.failClosed, false);
  const global = await workspace.invalidateRunWorkspace({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
    scope: "global",
  });
  assert.deepEqual(global.batchIds, ["batch-0001", "batch-0002"]);
  assert.equal(global.summary.passedRows, 0);
});

test("WS-COVERAGE-04 artifact sinkはprivate artifactだけを保存し秘密値を拒否する", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-coverage-artifact");
  const definition = createCoverageWorkspaceDefinition();
  const handshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: "ws-coverage-artifact",
    definition,
    approval: fixture.approval,
    current: fixture.current,
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
    matrixScope: "coverage",
    validateApproval: fixture.runner.validateApprovalEvidence,
  });
  const sink = await workspace.createWorkspaceArtifactSink({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
  });
  const artifact = await sink({
    kind: "dom",
    rowId: "main-ready-0-light",
    probeId: "anchor-screenshot",
    surface: "production",
    content: JSON.stringify({ role: "main", state: "ready" }),
    mediaType: "application/json",
  });
  assert.match(artifact.sha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal((await stat(path.join(fixture.root, artifact.path))).mode & 0o777, 0o600);
  assert.doesNotMatch(JSON.stringify(handshake.summary), /role|state/u);
  await assert.rejects(
    sink({
      kind: "dom",
      rowId: "main-ready-0-light",
      probeId: "anchor-screenshot",
      surface: "prototype",
      content: JSON.stringify({ email: "resident@example.jp" }),
      mediaType: "application/json",
    }),
    /sensitive data/u,
  );
});

test("WS-COVERAGE-05 finalizeはraw artifactを昇格してschema version 4 evidenceを作る", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-coverage-finalize");
  const definition = createCoverageWorkspaceDefinition();
  const evidenceRunRoot = path.join(fixture.root, "plans", "fixture", "evidence", "ws-coverage-finalize");
  await mkdir(evidenceRunRoot, { recursive: true, mode: 0o700 });
  await chmod(path.dirname(evidenceRunRoot), 0o700);
  await chmod(evidenceRunRoot, 0o700);
  const handshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: "ws-coverage-finalize",
    definition,
    approval: fixture.approval,
    current: fixture.current,
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
    matrixScope: "coverage",
    validateApproval: fixture.runner.validateApprovalEvidence,
  });
  const sink = await workspace.createWorkspaceArtifactSink({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
  });
  const artifactsByRow = new Map<string, WorkspaceArtifactRecord[]>();
  for (const anchor of definition.spec.coverage.anchorRows) {
    for (const surface of ["production", "prototype"]) {
      const record = await sink({
        kind: "screenshot",
        rowId: anchor.rowId,
        probeId: "anchor-screenshot",
        surface,
        content: new Uint8Array([1, 2, 3, surface === "production" ? 4 : 5]),
        mediaType: "image/png",
      });
      artifactsByRow.set(anchor.rowId, [...(artifactsByRow.get(anchor.rowId) ?? []), record]);
    }
  }
  for (let index = 0; index < handshake.batches.length; index += 1) {
    const next = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
    const value = coverageFragment(handshake, next.batch, definition);
    for (const row of value.rows) {
      const artifacts = artifactsByRow.get(row.rowId) ?? [];
      if (artifacts.length === 0) continue;
      const probe = row.probes.find(({ probeId }) => probeId === "anchor-screenshot")!;
      probe.artifacts = artifacts;
      probe.artifactPaths = artifacts.map(({ path: artifactPath }) => artifactPath as string);
      row.artifacts = artifacts;
      row.artifactPaths = [...probe.artifactPaths];
    }
    await workspace.recordBatchResult({
      repositoryRootPath: fixture.root,
      runId: handshake.runId,
      batchId: next.batch.batchId,
      input: JSON.stringify(value),
    });
  }
  const finalized = await workspace.finalizeRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: handshake.runId,
    approval: fixture.approval,
    current: fixture.current,
    definition,
    validateBundle: fixture.runner.validateEvidenceBundle,
    writeEvidence: fixture.runner.writeRunEvidence,
  });
  const evidence = JSON.parse(await readFile(path.join(fixture.root, finalized.evidencePath), "utf8"));
  assert.equal(evidence.schemaVersion, 4);
  assert.equal(evidence.matrixScope, "coverage");
  assert.equal(evidence.coverage.status, "pass");
  assert.equal(evidence.automationCoverageStatus, "pass");
  assert.equal(evidence.humanVisualApprovalStatus, "pending");
  assert.equal(evidence.fullParityStatus, "not-run");
  assert.equal(evidence.artifactIndex.length, 4);
  for (const artifact of evidence.artifactIndex) {
    assert.match(artifact.path, /^plans\/fixture\/evidence\/ws-coverage-finalize\/artifacts\//u);
    assert.equal((await stat(path.join(fixture.root, artifact.path))).mode & 0o777, 0o600);
  }
  await assert.rejects(access(path.dirname(handshake.manifestPath)));
});
