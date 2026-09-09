import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const runtimeHelperPath = path.join(repositoryRoot, "scripts", "dev-compose-runtime.zsh");

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

function surfaceContexts(sessionId: string) {
  const authorizationProfile = contract.comparisonConditions.authorization;
  const authorizationProfileDigest = sha256(
    `parity:authorization-profile:v1\0${authorizationProfile}`,
  );
  return [
    {
      sessionId,
      tabId: "comparison",
      surface: "production",
      origin: "http://localhost:3002",
      authorizationProfile,
      authorizationProfileDigest,
    },
    {
      sessionId,
      tabId: "prototype",
      surface: "prototype",
      origin: "http://127.0.0.1:4002",
      authorizationProfile,
      authorizationProfileDigest,
    },
  ];
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

async function readWorkspaceFiles(root: string): Promise<string[]> {
  const values: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) values.push(...await readWorkspaceFiles(target));
    else if (entry.isFile()) values.push(await readFile(target, "utf8"));
  }
  return values;
}

async function replaceRunRootWithExternal(runRoot: string, externalRoot: string) {
  const originalRoot = `${runRoot}.original`;
  await rename(runRoot, originalRoot);
  await symlink(externalRoot, runRoot);
  return originalRoot;
}

function parseRuntimeContext(output: string) {
  return Object.fromEntries(output.trim().split("\n").filter((line) => line.includes("=")).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

async function allocateFixtureRuntime(
  fixtureRoot: string,
  commonGitDirectory: string,
  stateRoot: string,
  suffix: string,
) {
  const gitDirectory = path.join(fixtureRoot, `linked-${suffix}.git`);
  const stubDirectory = path.join(fixtureRoot, `runtime-bin-${suffix}`);
  await Promise.all([
    mkdir(gitDirectory),
    mkdir(stubDirectory),
  ]);
  await Promise.all([
    writeFile(path.join(stubDirectory, "docker"), "#!/bin/sh\nexit 1\n", { mode: 0o755 }),
    writeFile(path.join(stubDirectory, "lsof"), "#!/bin/sh\nexit 1\n", { mode: 0o755 }),
  ]);
  const command = 'set -euo pipefail; source "$1"; dev_runtime_prepare; dev_runtime_print_context';
  const { stdout } = await execFileAsync("zsh", ["-c", command, "zsh", runtimeHelperPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DEV_RUNTIME_CHECKOUT_OVERRIDE: fixtureRoot,
      DEV_RUNTIME_GIT_DIR_OVERRIDE: gitDirectory,
      DEV_RUNTIME_GIT_COMMON_DIR_OVERRIDE: commonGitDirectory,
      DEV_RUNTIME_STATE_ROOT: stateRoot,
      NODE_ENV: "test",
      DEVELOPMENT_PORT_STATE_ROOT: path.join(await realpath(path.dirname(commonGitDirectory)), "port-state"),
      DEVELOPMENT_PORT_TEST_INSPECTION: "stub",
      PATH: `${stubDirectory}:${process.env.PATH ?? ""}`,
    },
  });
  return parseRuntimeContext(stdout);
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

async function createFixture(
  context: { after(callback: () => Promise<void>): void },
  runId: string,
  { prototypeRevision = revision }: { prototypeRevision?: string } = {},
) {
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
    prototypeRevision,
    validationProfileDigest: profileDigest,
    invokedAt: "2026-09-01T00:00:00.000Z",
  });
  const current = {
    goalSha256: digest,
    prototypeRevision,
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
        production: "http://localhost:3002/fixture",
        prototype: "http://127.0.0.1:4002/index.html",
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
      surfaceContexts: surfaceContexts("iab-fixture"),
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
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
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
    id: kind === "state" ? "coverage" : `coverage-${kind}`,
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
      assertionProbeIds: ["coverage"],
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
            production: `http://localhost:3002${row.route}`,
            prototype: `http://127.0.0.1:4002/${row.entry}`,
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
      surfaceContexts: surfaceContexts("coverage-fixture"),
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
      baseUrls: { production: "https://example.com/", prototype: "http://127.0.0.1:4002/" },
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
      baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
      changedTargetIds: ["main"],
      changedStates: ["default"],
      changedViewports: ["390x844"],
      validateApproval: first.runner.validateApprovalEvidence,
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_BATCH_INVALID",
  );
});

test("WS-PARALLEL-00 同一repositoryの別runはworkspace root作成raceを許容する", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "parallel-root-a");
  const secondApproval = fixture.runner.createApprovalEvidence({
    runId: "parallel-root-b",
    goalSha256: digest,
    prototypeRevision: revision,
    validationProfileDigest: profileDigest,
  });
  const handshakes = await Promise.all([
    prepare(workspace, fixture, "parallel-root-a"),
    prepare(workspace, { ...fixture, approval: secondApproval }, "parallel-root-b"),
  ]);
  assert.notEqual(path.dirname(handshakes[0].manifestPath), path.dirname(handshakes[1].manifestPath));
  await Promise.all(handshakes.map(({ manifestPath }) => access(manifestPath)));
});

test("WS-PARALLEL-01 parallel fixtureはport・workspace・revision・checkpointを共有しない", async (context) => {
  const workspace = await workspaceModulePromise;
  const revisions = [`sha256:${"e".repeat(64)}`, `sha256:${"f".repeat(64)}`];
  const fixtures = await Promise.all([
    createFixture(context, "parallel-a", { prototypeRevision: revisions[0] }),
    createFixture(context, "parallel-b", { prototypeRevision: revisions[1] }),
  ]);
  const definitions = [createCoverageWorkspaceDefinition(), createCoverageWorkspaceDefinition()];
  definitions.forEach((definition, index) => {
    definition.prototypeRevision = revisions[index];
  });
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), "parity-runtime-common-"));
  context.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const commonGitDirectory = path.join(runtimeRoot, "common.git");
  const stateRoot = path.join(runtimeRoot, "state");
  await mkdir(commonGitDirectory);
  const runtimes = await Promise.all(fixtures.map((fixture, index) =>
    allocateFixtureRuntime(
      fixture.root,
      commonGitDirectory,
      stateRoot,
      index === 0 ? "a" : "b",
    )));
  assert.notEqual(runtimes[0].RUNTIME_ID, runtimes[1].RUNTIME_ID);
  assert.notEqual(runtimes[0].COMPOSE_PROJECT_NAME, runtimes[1].COMPOSE_PROJECT_NAME);
  assert.notEqual(runtimes[0].HOST_PORT, runtimes[1].HOST_PORT);
  const ports = runtimes.map((runtime) => ({
    production: `http://localhost:${runtime.HOST_PORT}/`,
    prototype: `http://127.0.0.1:${Number(runtime.HOST_PORT) + 1_000}/`,
  }));
  fixtures.forEach((fixture, index) => {
    fixture.current.runtime.owner = runtimes[index].RUNTIME_ID;
    fixture.current.runtime.checkout = runtimes[index].RUNTIME_CHECKOUT_PATH;
    Object.assign(fixture.current.runtime, {
      composeProject: runtimes[index].COMPOSE_PROJECT_NAME,
      port: Number(runtimes[index].HOST_PORT),
    });
  });
  const handshakes = await Promise.all(fixtures.map((fixture, index) =>
    workspace.prepareRunWorkspace({
      repositoryRootPath: fixture.root,
      slug: "fixture",
      runId: `parallel-${index === 0 ? "a" : "b"}`,
      definition: definitions[index],
      approval: fixture.approval,
      current: fixture.current,
      baseUrls: ports[index],
      matrixScope: "coverage",
      validateApproval: fixture.runner.validateApprovalEvidence,
    })));

  const manifests = await Promise.all(handshakes.map(({ manifestPath }) =>
    readFile(manifestPath, "utf8").then(JSON.parse)));
  for (const index of [0, 1]) {
    assert.equal(manifests[index].runId, `parallel-${index === 0 ? "a" : "b"}`);
    assert.equal(manifests[index].prototypeRevision, revisions[index]);
    assert.deepEqual(manifests[index].baseUrls, ports[index]);
    assert.deepEqual(manifests[index].runtime, {
      owner: runtimes[index].RUNTIME_ID,
      checkout: runtimes[index].RUNTIME_CHECKOUT_PATH,
      composeProject: runtimes[index].COMPOSE_PROJECT_NAME,
      port: Number(runtimes[index].HOST_PORT),
    });
  }
  assert.notEqual(path.dirname(handshakes[0].manifestPath), path.dirname(handshakes[1].manifestPath));
  await assert.rejects(access(path.join(fixtures[0].root, ".codex", "parity-runs", "parallel-b")));
  await assert.rejects(access(path.join(fixtures[1].root, ".codex", "parity-runs", "parallel-a")));

  const batches = await Promise.all(handshakes.map(({ runId }, index) =>
    workspace.nextRunBatch({ repositoryRootPath: fixtures[index].root, runId })));
  const secondCheckpointPath = path.join(path.dirname(handshakes[1].manifestPath), "checkpoint.json");
  const secondCheckpointBefore = await readFile(secondCheckpointPath, "utf8");
  await workspace.recordBatchFailure({
    repositoryRootPath: fixtures[0].root,
    runId: handshakes[0].runId,
    batchId: batches[0].batch.batchId,
    code: "PARITY_BROWSER_TRANSIENT",
    diagnostic: "fixture-a transient failure",
    transient: true,
  });
  assert.equal(await readFile(secondCheckpointPath, "utf8"), secondCheckpointBefore);
  assert.equal(JSON.parse(secondCheckpointBefore).batches[0].status, "running");
  await workspace.abortRunWorkspace({
    repositoryRootPath: fixtures[0].root,
    runId: handshakes[0].runId,
  });
  await assert.rejects(access(path.dirname(handshakes[0].manifestPath)));
  await access(path.dirname(handshakes[1].manifestPath));
  assert.equal(await readFile(secondCheckpointPath, "utf8"), secondCheckpointBefore);
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
      id: "wrong-authorization-profile",
      code: "PARITY_BATCH_INVALID",
      mutate(value) { value.capabilities.surfaceContexts[0].authorizationProfile = "other"; },
    },
    {
      id: "wrong-authorization-digest",
      code: "PARITY_BATCH_INVALID",
      mutate(value) { value.capabilities.surfaceContexts[0].authorizationProfileDigest = digest; },
    },
    {
      id: "wrong-surface-origin",
      code: "PARITY_BATCH_INVALID",
      mutate(value) { value.capabilities.surfaceContexts[1].origin = "http://127.0.0.1:4003"; },
    },
    {
      id: "same-surface-tab",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        value.capabilities.surfaceContexts[1].tabId = value.capabilities.surfaceContexts[0].tabId;
      },
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
      id: "basic-authorization",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        (value.rows[0].probes[0] as { production: unknown }).production = {
          authorization: "Basic dXNlcjpwYXNz",
        };
      },
    },
    {
      id: "credential-uri",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        (value.rows[0].probes[0] as { production: unknown }).production = {
          dsn: "postgresql://fixture:password@localhost/database",
        };
      },
    },
    {
      id: "api-key-assignment",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        (value.rows[0].probes[0] as { production: unknown }).production = {
          message: "api_key=sk-live-secret-value",
        };
      },
    },
    {
      id: "password-assignment",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        (value.rows[0].probes[0] as { production: unknown }).production = {
          message: "PaSsWoRd = fixture-password",
        };
      },
    },
    {
      id: "token-assignment",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        (value.rows[0].probes[0] as { production: unknown }).production = {
          message: "ToKeN : fixture-token",
        };
      },
    },
    {
      id: "authorization-token",
      code: "PARITY_BATCH_INVALID",
      mutate(value) {
        (value.rows[0].probes[0] as { production: unknown }).production = {
          authorization: "Token fixture-authorization",
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

test("WS-CLI-01 new CLI runs reject historical profiles", async (context) => {
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
  await assert.rejects(runner.runCli({
    argv: [
      "prepare-run",
      "plans/fixture/prototype",
      "--run-id", "cli-run",
      "--production-url", "http://localhost:3002/",
      "--prototype-url", "http://127.0.0.1:4002/",
      "--runtime-owner", "fixture",
      "--runtime-checkout", repositoryRoot,
      "--target", "main",
      "--state", "default",
      "--viewport", "390x844",
      "--matrix-scope", "targeted",
    ],
    repositoryRootPath: repositoryRoot,
    stdout: preparedOutput.stream,
  }), /new runs require parity-spec.json version 4/);

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
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
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
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
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
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
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
      "--failure-code", "PARITY_NAVIGATION_TIMEOUT",
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
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
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
  const updatedSources = [{ path: "src/ui.ts", sha256: `sha256:${"b".repeat(64)}` }];
  await assert.rejects(workspace.invalidateRunWorkspace({
    repositoryRootPath: fixture.root, runId: handshake.runId,
    scope: "target", targetIds: ["secondary"], currentSources: updatedSources,
  }), /outside invalidation|unknown target/u);
  const targeted = await workspace.invalidateRunWorkspace({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
    scope: "target",
    targetIds: ["main"],
    currentSources: updatedSources,
  });
  const refreshedManifest = JSON.parse(await readFile(handshake.manifestPath, "utf8"));
  assert.deepEqual(refreshedManifest.sources, updatedSources);
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
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage",
    validateApproval: fixture.runner.validateApprovalEvidence,
  });
  const sink = await workspace.createWorkspaceArtifactSink({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
  });
  const jpeg = await sink({ kind: "screenshot", rowId: "main-default-mobile-light", probeId: "jpeg-test",
    surface: "production", content: Buffer.from([255,216,255,217]), mediaType: "image/jpeg" });
  assert.ok(jpeg.path.endsWith(".jpg"));
  assert.deepEqual(await readFile(path.join(fixture.root, jpeg.path)), Buffer.from([255,216,255,217]));
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
  for (const [probeId, content] of [
    ["basic-authorization", JSON.stringify({ authorization: "Basic dXNlcjpwYXNz" })],
    ["token-authorization", JSON.stringify({ authorization: "Token fixture-authorization" })],
    ["credential-uri", JSON.stringify({ dsn: "postgresql://fixture:password@localhost/database" })],
    ["binary-basic-authorization", Buffer.from("Basic dXNlcjpwYXNz", "utf8")],
    ["binary-password", Buffer.from("PaSsWoRd = fixture-password", "utf8")],
    ["binary-token", Buffer.from("ToKeN : fixture-token", "utf8")],
    ["api-key-assignment", JSON.stringify({ detail: "X-API-Key: sk-live-secret-value" })],
    ["camel-access-token", Buffer.from("accessToken=fixture-access-value", "utf8")],
    ["camel-client-secret", Buffer.from("clientSecret=fixture-client-value", "utf8")],
    ["camel-session-token", Buffer.from("sessionToken=fixture-session-value", "utf8")],
    ["credential-assignment", Buffer.from("credential=fixture-credential-value", "utf8")],
  ]) {
    await assert.rejects(
      sink({
        kind: "dom",
        rowId: "main-ready-0-light",
        probeId,
        surface: "prototype",
        content,
        mediaType: "application/json",
      }),
      /(?:sensitive data|authorization profile)/u,
    );
  }
  await assert.rejects(
    sink({
      kind: "dom",
      rowId: "main-ready-0-light",
      probeId: "secret-media-type",
      surface: "prototype",
      content: "{}",
      mediaType: "application/json; ToKeN = fixture-token",
    }),
    /sensitive data/u,
  );
  assert.doesNotMatch(
    (await readWorkspaceFiles(path.dirname(handshake.manifestPath))).join("\n"),
    /fixture-(?:access|client|session|credential)-value/u,
  );
  await assert.rejects(
    access(path.join(
      fixture.root,
      "plans/fixture/evidence/ws-coverage-artifact/implementation-parity.json",
    )),
  );
});

test("WS-SEC-03 failure diagnosticは破棄しallowlist済み固定文だけをcheckpointとstdoutへ返す", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-secret-diagnostic");
  const definition = createCoverageWorkspaceDefinition();
  const handshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: "ws-secret-diagnostic",
    definition,
    approval: fixture.approval,
    current: fixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage",
    validateApproval: fixture.runner.validateApprovalEvidence,
  });
  const next = await workspace.nextRunBatch({
    repositoryRootPath: fixture.root,
    runId: handshake.runId,
  });
  const canary = "password=hunter2 token=token-live-value Authorization: Token private-value";
  const checkpointPath = path.join(path.dirname(handshake.manifestPath), "checkpoint.json");
  const before = await readFile(checkpointPath, "utf8");
  await assert.rejects(
    workspace.recordBatchFailure({
      repositoryRootPath: fixture.root,
      runId: handshake.runId,
      batchId: next.batch.batchId,
      code: "PARITY_NOT_ALLOWLISTED",
      diagnostic: canary,
      transient: true,
    }),
    (error: unknown) => {
      assert.match(String(error), /failure code is not allowlisted/u);
      assert.doesNotMatch(String(error), /hunter2|token-live-value|private-value/u);
      return true;
    },
  );
  assert.equal(await readFile(checkpointPath, "utf8"), before);

  const output = captureOutput();
  await fixture.runner.runCli({
    argv: [
      "record-failure", "plans/fixture/prototype",
      "--run-id", handshake.runId,
      "--batch-id", next.batch.batchId,
      "--failure-code", "PARITY_NAVIGATION_TIMEOUT",
      "--diagnostic", canary,
      "--transient", "true",
    ],
    repositoryRootPath: fixture.root,
    stdout: output.stream,
  });
  const result = JSON.parse(output.read());
  assert.equal(result.summary.errorCode, "PARITY_NAVIGATION_TIMEOUT");
  assert.equal(result.summary.diagnostic, "Browser navigation exceeded its bounded deadline");

  const persisted = (await readWorkspaceFiles(path.dirname(handshake.manifestPath))).join("\n");
  for (const value of [output.read(), persisted]) {
    assert.doesNotMatch(value, /hunter2|token-live-value|private-value|Authorization: Token/u);
  }
});

test("WS-SEC-04 JSON readerはsymlink・byte超過・読取中のinode metadata変更を拒否する", async (context) => {
  const workspace = await workspaceModulePromise;
  const root = await mkdtemp(path.join(tmpdir(), "parity-json-reader-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const realTarget = path.join(root, "real.json");
  const symlinkTarget = path.join(root, "symlink.json");
  await writeFile(realTarget, '{"status":"pass"}\n', { mode: 0o600 });
  await symlink(realTarget, symlinkTarget);
  await assert.rejects(
    workspace.readJsonFile(symlinkTarget, { limit: 128 }),
    /must be a regular file/u,
  );

  const oversizedTarget = path.join(root, "oversized.json");
  await writeFile(oversizedTarget, JSON.stringify({ padding: "x".repeat(128) }), { mode: 0o600 });
  await assert.rejects(
    workspace.readJsonFile(oversizedTarget, { limit: 64 }),
    /exceeds the byte limit/u,
  );

  const racedTarget = path.join(root, "raced.json");
  await writeFile(racedTarget, '{"status":"before"}\n', { mode: 0o600 });
  await assert.rejects(
    workspace.readJsonFile(racedTarget, {
      limit: 128,
      beforeMetadataReadback: () => writeFile(racedTarget, '{"status":"after","changed":true}\n'),
    }),
    /changed while it was being read/u,
  );
});

test("WS-MANIFEST-01 大きな契約は行やdigestを変えず読込可能なサイズで生成・更新する", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-manifest-formatting");
  const definition = createCoverageWorkspaceDefinition();
  definition.contract.stateAndInteraction = Array.from({ length: 90_000 }, (_, index) => `interaction-${index}`);
  const handshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root, slug: "fixture", runId: "ws-manifest-formatting",
    definition, approval: fixture.approval, current: fixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage", validateApproval: fixture.runner.validateApprovalEvidence,
  });
  const text = await readFile(handshake.manifestPath, "utf8");
  const manifest = JSON.parse(text);
  assert.ok(Buffer.byteLength(JSON.stringify(manifest, null, 2)) > 2 * 1024 * 1024);
  assert.ok(Buffer.byteLength(text) <= 2 * 1024 * 1024);
  assert.deepEqual(manifest.definition, definition);
  assert.equal(handshake.manifestSha256, sha256(fixture.runner.stableStringify(manifest)));
  const first = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  assert.equal(first.batch.batchId, "batch-0001");
  const updatedSources = [{ path: "src/ui.ts", sha256: revision }];
  await workspace.invalidateRunWorkspace({
    repositoryRootPath: fixture.root, runId: handshake.runId,
    scope: "global", currentSources: updatedSources,
  });
  const updated = JSON.parse(await readFile(handshake.manifestPath, "utf8"));
  assert.deepEqual(updated.sources, updatedSources);
  assert.deepEqual(updated.definition, definition);
  assert.deepEqual(updated.rowIds, manifest.rowIds);
  const next = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  assert.equal(next.batch.batchId, "batch-0001");
});

test("WS-MANIFEST-02 aggregate上限を超える契約はprepareで拒否し部分workspaceを残さない", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-manifest-too-large");
  const definition = createCoverageWorkspaceDefinition();
  definition.contract.stateAndInteraction = ["界".repeat(12_000_000)];
  await assert.rejects(workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root, slug: "fixture", runId: "ws-manifest-too-large",
    definition, approval: fixture.approval, current: fixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage", validateApproval: fixture.runner.validateApprovalEvidence,
  }), /exceeds the aggregate byte limit/u);
  await assert.rejects(access(path.join(fixture.root, ".codex/parity-runs/ws-manifest-too-large")));
});

test("WS-MANIFEST-03 分割契約の再開・更新と参照の改ざん・欠落・逸脱を検証する", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-split-manifest");
  const definition = createCoverageWorkspaceDefinition();
  definition.contract.stateAndInteraction = ["界😀".repeat(400_000)];
  const handshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: fixture.root, slug: "fixture", runId: "ws-split-manifest",
    definition, approval: fixture.approval, current: fixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage", validateApproval: fixture.runner.validateApprovalEvidence,
  });
  const indexText = await readFile(handshake.manifestPath, "utf8");
  const index = JSON.parse(indexText);
  assert.equal(index.kind, "split-manifest");
  assert.equal(index.sha256, handshake.manifestSha256);
  assert.ok(index.bytes > 2 * 1024 * 1024);
  for (const part of index.parts) {
    const metadata = await stat(path.join(path.dirname(handshake.manifestPath), part.fileName));
    assert.ok(metadata.size <= 2 * 1024 * 1024);
    assert.equal(metadata.mode & 0o777, 0o600);
  }
  const next = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  await workspace.recordBatchResult({ repositoryRootPath: fixture.root, runId: handshake.runId,
    batchId: next.batch.batchId, input: JSON.stringify(coverageFragment(handshake, next.batch, definition)) });
  const resumed = await workspace.resumeRunWorkspace({ repositoryRootPath: fixture.root, runId: handshake.runId });
  assert.equal(resumed.batch.batchId, "batch-0002");
  await workspace.invalidateRunWorkspace({ repositoryRootPath: fixture.root, runId: handshake.runId,
    scope: "global", currentSources: [{ path: "src/ui.ts", sha256: revision }] });
  const updatedText = await readFile(handshake.manifestPath, "utf8");
  const updated = JSON.parse(updatedText);
  const partPath = path.join(path.dirname(handshake.manifestPath), updated.parts[0].fileName);
  const original = await readFile(partPath, "utf8");
  await writeFile(partPath, JSON.stringify({ text: "tampered" }));
  await assert.rejects(workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId }), /digest/u);
  await rm(partPath);
  await assert.rejects(workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId }), /ENOENT/u);
  const external = path.join(fixture.root, "external.json");
  await writeFile(external, original, { mode: 0o600 });
  await symlink(external, partPath);
  await assert.rejects(workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId }), /regular file|mode 600/u);
  await rm(partPath);
  await writeFile(partPath, original, { mode: 0o600 });
  updated.parts[0].fileName = "../external.json";
  await writeFile(handshake.manifestPath, JSON.stringify(updated));
  await assert.rejects(workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId }), /reference/u);
  for (const invalid of [
    { ...JSON.parse(updatedText), bytes: 33 * 1024 * 1024 },
    { ...JSON.parse(updatedText), parts: Array(257).fill(JSON.parse(updatedText).parts[0]) },
    { ...JSON.parse(updatedText), sha256: digest },
    { ...JSON.parse(updatedText), parts: [...JSON.parse(updatedText).parts].reverse() },
  ]) {
    await writeFile(handshake.manifestPath, JSON.stringify(invalid));
    await assert.rejects(workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId }),
      /bounds|digest|JSON|byte mismatch/u);
  }
  await writeFile(handshake.manifestPath, updatedText);
  const fresh = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  assert.equal(fresh.batch.batchId, "batch-0001");
});

test("WS-SEC-05 manifestとcheckpointの用途別byte上限を強制する", async (context) => {
  const workspace = await workspaceModulePromise;
  const definition = createCoverageWorkspaceDefinition();

  const manifestFixture = await createFixture(context, "ws-large-manifest");
  const manifestHandshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: manifestFixture.root,
    slug: "fixture",
    runId: "ws-large-manifest",
    definition,
    approval: manifestFixture.approval,
    current: manifestFixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage",
    validateApproval: manifestFixture.runner.validateApprovalEvidence,
  });
  await writeFile(manifestHandshake.manifestPath, JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024) }));
  await assert.rejects(
    workspace.nextRunBatch({ repositoryRootPath: manifestFixture.root, runId: manifestHandshake.runId }),
    /exceeds the byte limit/u,
  );

  const checkpointFixture = await createFixture(context, "ws-large-checkpoint");
  const checkpointHandshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: checkpointFixture.root,
    slug: "fixture",
    runId: "ws-large-checkpoint",
    definition,
    approval: checkpointFixture.approval,
    current: checkpointFixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage",
    validateApproval: checkpointFixture.runner.validateApprovalEvidence,
  });
  const checkpointPath = path.join(path.dirname(checkpointHandshake.manifestPath), "checkpoint.json");
  await writeFile(checkpointPath, JSON.stringify({ padding: "x".repeat(512 * 1024) }));
  await assert.rejects(
    workspace.nextRunBatch({ repositoryRootPath: checkpointFixture.root, runId: checkpointHandshake.runId }),
    /exceeds the byte limit/u,
  );
});

test("WS-SEC-06 runRootの外部symlink差替えはread・write・promote前に停止する", async (context) => {
  const workspace = await workspaceModulePromise;
  const definition = createCoverageWorkspaceDefinition();

  const readFixture = await createFixture(context, "ws-parent-read");
  const readHandshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: readFixture.root,
    slug: "fixture",
    runId: "ws-parent-read",
    definition,
    approval: readFixture.approval,
    current: readFixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage",
    validateApproval: readFixture.runner.validateApprovalEvidence,
  });
  const readExternal = await mkdtemp(path.join(tmpdir(), "parity-external-read-"));
  context.after(() => rm(readExternal, { recursive: true, force: true }));
  await writeFile(path.join(readExternal, "sentinel.txt"), "read-safe\n");
  const readExternalBefore = (await readWorkspaceFiles(readExternal)).join("\n");
  await replaceRunRootWithExternal(path.dirname(readHandshake.manifestPath), readExternal);
  await assert.rejects(
    workspace.nextRunBatch({ repositoryRootPath: readFixture.root, runId: readHandshake.runId }),
    /must be a real directory|directory identity changed/u,
  );
  assert.equal((await readWorkspaceFiles(readExternal)).join("\n"), readExternalBefore);

  const writeFixture = await createFixture(context, "ws-parent-write");
  const writeHandshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: writeFixture.root,
    slug: "fixture",
    runId: "ws-parent-write",
    definition,
    approval: writeFixture.approval,
    current: writeFixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage",
    validateApproval: writeFixture.runner.validateApprovalEvidence,
  });
  const sink = await workspace.createWorkspaceArtifactSink({
    repositoryRootPath: writeFixture.root,
    runId: writeHandshake.runId,
  });
  const writeExternal = await mkdtemp(path.join(tmpdir(), "parity-external-write-"));
  context.after(() => rm(writeExternal, { recursive: true, force: true }));
  await mkdir(path.join(writeExternal, "artifacts"), { mode: 0o700 });
  await writeFile(path.join(writeExternal, "sentinel.txt"), "write-safe\n");
  const writeExternalBefore = (await readWorkspaceFiles(writeExternal)).join("\n");
  await replaceRunRootWithExternal(path.dirname(writeHandshake.manifestPath), writeExternal);
  await assert.rejects(
    sink({
      kind: "dom",
      rowId: "main-ready-0-light",
      probeId: "parent-swap",
      surface: "prototype",
      content: "{}",
      mediaType: "application/json",
    }),
    /directory identity changed/u,
  );
  assert.equal((await readWorkspaceFiles(writeExternal)).join("\n"), writeExternalBefore);

  const promoteFixture = await createFixture(context, "ws-parent-promote");
  const evidenceRunRoot = path.join(promoteFixture.root, "plans", "fixture", "evidence", "ws-parent-promote");
  await mkdir(evidenceRunRoot, { recursive: true, mode: 0o700 });
  await chmod(path.dirname(evidenceRunRoot), 0o700);
  await chmod(evidenceRunRoot, 0o700);
  const promoteHandshake = await workspace.prepareRunWorkspace({
    repositoryRootPath: promoteFixture.root,
    slug: "fixture",
    runId: "ws-parent-promote",
    definition,
    approval: promoteFixture.approval,
    current: promoteFixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage",
    validateApproval: promoteFixture.runner.validateApprovalEvidence,
  });
  const promoteSink = await workspace.createWorkspaceArtifactSink({
    repositoryRootPath: promoteFixture.root,
    runId: promoteHandshake.runId,
  });
  const artifactsByRow = new Map<string, WorkspaceArtifactRecord[]>();
  for (const anchor of definition.spec.coverage.anchorRows) {
    for (const surface of ["production", "prototype"]) {
      const record = await promoteSink({
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
  for (let index = 0; index < promoteHandshake.batches.length; index += 1) {
    const next = await workspace.nextRunBatch({
      repositoryRootPath: promoteFixture.root,
      runId: promoteHandshake.runId,
    });
    const value = coverageFragment(promoteHandshake, next.batch, definition);
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
      repositoryRootPath: promoteFixture.root,
      runId: promoteHandshake.runId,
      batchId: next.batch.batchId,
      input: JSON.stringify(value),
    });
  }
  const promoteExternal = await mkdtemp(path.join(tmpdir(), "parity-external-promote-"));
  context.after(() => rm(promoteExternal, { recursive: true, force: true }));
  await writeFile(path.join(promoteExternal, "sentinel.txt"), "promote-safe\n");
  const promoteExternalBefore = (await readWorkspaceFiles(promoteExternal)).join("\n");
  await assert.rejects(
    workspace.finalizeRunWorkspace({
      repositoryRootPath: promoteFixture.root,
      slug: "fixture",
      runId: promoteHandshake.runId,
      approval: promoteFixture.approval,
      current: promoteFixture.current,
      definition,
      validateBundle: promoteFixture.runner.validateEvidenceBundle,
      writeEvidence: promoteFixture.runner.writeRunEvidence,
      beforeArtifactPromotion: () => replaceRunRootWithExternal(
        path.dirname(promoteHandshake.manifestPath),
        promoteExternal,
      ),
    }),
    /directory identity changed/u,
  );
  assert.equal((await readWorkspaceFiles(promoteExternal)).join("\n"), promoteExternalBefore);
  await assert.rejects(access(path.join(evidenceRunRoot, "implementation-parity.json")));
});

for (const storage of ["inline", "split"]) for (const version of [3, 4]) test(`WS-COVERAGE-05 ${storage} finalize promotes artifacts only after profile ${version} requirements pass`, async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-coverage-finalize");
  const definition = createCoverageWorkspaceDefinition();
  if (storage === "split") definition.contract.stateAndInteraction = ["界😀".repeat(400_000)];
  const fidelity = {
    requirements: [{ id: "REQ-01", expected: "Both target layouts conform", probeIds: ["coverage"], runtimeCheckIds: [], visualCheckIds: [] as string[], staticCheckIds: ["types"], interactionGroupIds: ["themes"], noInteractionReason: null }],
    phaseComparisons: definition.spec.probes.map(probe => ({ probeId: probe.id, smoke: "equal", final: probe.kind === "screenshot" ? "capture" : "equal", expected: null })),
    interactionGroups: [{ id: "themes", requirementIds: ["REQ-01"], targetIds: ["main", "secondary"], states: ["ready"], factors: ["targetId", "viewport", "theme"].map(source => ({ id: source, source, mapping: {}, rationale: "Declared UI axis" })), strength: 3, reason: "All target/width/theme interactions", exclusions: [], requiredProbeIds: ["coverage"] }],
    runtimeChecks: [],
    visualChecks: [] as Array<{ id: string; requirementIds: string[]; rowId: string; probeId: string; criteria: string[] }>,
    staticChecks: [{ id: "types", command: "npm run typecheck", scope: ["src/ui.ts"] }],
  };
  if (version === 4) {
    definition.spec.version = 4;
    for (const target of definition.contract.comparisonTargets) {
      const rowId = `${target.id}-ready-1-dark`;
      definition.spec.coverage.anchorRows.push({ id: `desktop-${target.id}`, targetId: target.id, rowId, reason: "Desktop dark visual comparison" });
      definition.spec.rowProbeMap.find(row => row.rowId === rowId)!.probeIds.push("anchor-screenshot");
    }
    fidelity.visualChecks = definition.spec.coverage.anchorRows.map(anchor => ({ id: anchor.id, requirementIds: ["REQ-01"], rowId: anchor.rowId, probeId: "anchor-screenshot", criteria: ["Layout is visible and matches"] }));
    fidelity.requirements[0].visualCheckIds = fidelity.visualChecks.map(check => check.id);
    Object.assign(definition.spec, { fidelity });
  }
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
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
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
      if (version === 4) Object.assign(row, { runtimeChecks: [] });
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
  const finalize = () => workspace.finalizeRunWorkspace({
    repositoryRootPath: fixture.root,
    slug: "fixture",
    runId: handshake.runId,
    approval: fixture.approval,
    current: fixture.current,
    definition,
    validateBundle: fixture.runner.validateEvidenceBundle,
    writeEvidence: fixture.runner.writeRunEvidence,
  });
  if (version === 4) {
    await assert.rejects(finalize(), /ENOENT|audit/);
    // Audit absence must fail before promotion so completed Browser batches remain reusable.
    const audit = {
      binding: { goalSha256: digest, prototypeRevision: revision, validationProfileDigest: profileDigest, sources: fixture.current.sources },
      staticChecks: [{ ...fidelity.staticChecks[0], exitCode: 0, logDigest: digest }],
      requirements: [{ id: "REQ-01", status: "pass", evidenceIds: ["coverage", "types", "themes", ...fidelity.requirements[0].visualCheckIds], note: "Fixture audit passes declared checks" }],
      visualChecks: fidelity.visualChecks.map(check => ({ id: check.id, status: "pass", contentVerified: true, artifactDigests: artifactsByRow.get(check.rowId)!.map(item => item.sha256), criteriaResults: check.criteria.map(criterion => ({ criterion, status: "pass", note: "Synthetic fixture inspection attestation" })) })),
    };
    await fixture.runner.runCli({ argv: ["record-audit", "plans/fixture/prototype", "--run-id", handshake.runId], repositoryRootPath: fixture.root, stdin: stdinText(JSON.stringify(audit)), stdout: captureOutput().stream });
  }
  const finalized = await finalize();
  const evidence = JSON.parse(await readFile(path.join(fixture.root, finalized.evidencePath), "utf8"));
  assert.equal(evidence.schemaVersion, version + 1);
  if (version === 4) {
    assert.equal(evidence.interactionCoverage[0].passedTuples, 8);
    assert.equal(evidence.auditStatus.visual, "pass");
  }
  assert.equal(evidence.matrixScope, "coverage");
  assert.equal(evidence.coverage.status, "pass");
  assert.equal(evidence.automationCoverageStatus, "pass");
  assert.equal(evidence.humanVisualApprovalStatus, "pending");
  assert.equal(evidence.fullParityStatus, "not-run");
  assert.equal(evidence.artifactIndex.length, version === 4 ? 8 : 4);
  for (const artifact of evidence.artifactIndex) {
    assert.match(artifact.path, /^plans\/fixture\/evidence\/ws-coverage-finalize\/artifacts\//u);
    assert.equal((await stat(path.join(fixture.root, artifact.path))).mode & 0o777, 0o600);
  }
  await assert.rejects(access(path.dirname(handshake.manifestPath)));
});

test("workspace Browser executor checkpoints bounded rows and validates both cleanup tabs", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-browser-executor");
  const definition = createCoverageWorkspaceDefinition();
  const handshake = await workspace.prepareRunWorkspace({ repositoryRootPath: fixture.root,
    slug: "fixture", runId: "ws-browser-executor", definition, approval: fixture.approval,
    current: fixture.current, baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage", validateApproval: fixture.runner.validateApprovalEvidence });
  const batchDescriptors = await Promise.all(handshake.batches.map(async (descriptor: { path: string }) => ({ ...descriptor, ...JSON.parse(await readFile(descriptor.path, "utf8")) })));
  const executed: string[] = [];
  let cleanupCount = 0;
  const terminal = coverageFragment(handshake, batchDescriptors.at(-1)!, definition).terminalCleanup!;
  const runner = {
    operations: 100,
    async runWithoutCleanup(input: { batch: { batchId: string; rowIds: string[] } }) {
      executed.push(input.batch.batchId);
      this.operations += 20;
      const fragment = coverageFragment(handshake, batchDescriptors.find((batch: { batchId: string }) => batch.batchId === input.batch.batchId)!, definition);
      return { rows: fragment.rows, capabilities: fragment.capabilities, metrics: { ...fragment.metrics, browserOperations: this.operations } };
    },
    adapter: { async cleanup() { cleanupCount += 1; return { status: "pass", tabs: [terminal, { ...terminal, tabId: "prototype" }] }; } },
  };
  const options = { repositoryRootPath: fixture.root, runId: handshake.runId, runner,
    tabs: { production: "comparison", prototype: "prototype" } };
  const first = await workspace.executeBrowserBatch(options);
  assert.equal(first.summary.passedRows, 2);
  assert.equal(cleanupCount, 0);
  const last = await workspace.executeBrowserBatch(options);
  assert.equal(last.summary.passedRows, 4);
  assert.equal(cleanupCount, 1);
  for (const batchId of executed) {
    const recorded = JSON.parse(await readFile(path.join(fixture.root, '.codex/parity-runs', handshake.runId, `fragment-${batchId}.json`), 'utf8'));
    assert.equal(recorded.metrics.browserOperations, 20);
  }
  assert.equal((await workspace.executeBrowserBatch(options)).status, "complete");
  assert.deepEqual(executed, ["batch-0001", "batch-0002"]);
});

test("target invalidation removes only its verified artifacts and allows fresh capture", async (context) => {
  const workspace = await workspaceModulePromise;
  const fixture = await createFixture(context, "ws-artifact-invalidate");
  const definition = createCoverageWorkspaceDefinition();
  const handshake = await workspace.prepareRunWorkspace({ repositoryRootPath: fixture.root,
    slug: "fixture", runId: "ws-artifact-invalidate", definition, approval: fixture.approval,
    current: fixture.current, baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage", validateApproval: fixture.runner.validateApprovalEvidence });
  const sink = await workspace.createWorkspaceArtifactSink({ repositoryRootPath: fixture.root, runId: handshake.runId });
  const anchors = definition.spec.coverage.anchorRows;
  const records = [];
  for (const anchor of anchors) records.push(await sink({ kind: "dom", rowId: anchor.rowId,
    probeId: "anchor-dom", surface: "production", content: '{}', mediaType: "application/json" }));
  await workspace.invalidateRunWorkspace({ repositoryRootPath: fixture.root, runId: handshake.runId,
    scope: "target", targetIds: [anchors[0].targetId] });
  await assert.rejects(access(path.join(fixture.root, records[0].path)));
  await access(path.join(fixture.root, records[1].path));
  const checkpoint = JSON.parse(await readFile(path.join(fixture.root, '.codex/parity-runs', handshake.runId, 'checkpoint.json'), 'utf8'));
  assert.equal(checkpoint.artifactIndex.length, 1);
  await sink({ kind: "dom", rowId: anchors[0].rowId, probeId: "anchor-dom", surface: "production",
    content: '{"recaptured":true}', mediaType: "application/json" });
});

test("PORT-09: retired-origin workspace stays readable and resumption never rewrites checkpoint", async context => {
  const workspace = await workspaceModulePromise;
  const runId = "retired-port-workspace";
  const fixture = await createFixture(context, runId);
  const definition = createCoverageWorkspaceDefinition();
  await workspace.prepareRunWorkspace({ repositoryRootPath: fixture.root, slug: "fixture", runId, definition,
    approval: fixture.approval, current: fixture.current, matrixScope: "coverage",
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    validateApproval: fixture.runner.validateApprovalEvidence });
  const runRoot = path.join(fixture.root, ".codex/parity-runs", runId);
  const manifestPath = path.join(runRoot, "manifest.json");
  const stored = JSON.parse(await readFile(manifestPath, "utf8"));
  stored.baseUrls = { production: "http://localhost:3142/", prototype: "http://127.0.0.1:60237/" };
  await writeFile(manifestPath, JSON.stringify(stored));
  const before = await readFile(path.join(runRoot, "checkpoint.json"), "utf8");
  const data = await workspace.readJsonFile(manifestPath);
  assert.equal(data.value.baseUrls.prototype, "http://127.0.0.1:60237/");
  for (const operation of [workspace.nextRunBatch, workspace.resumeRunWorkspace]) {
    await assert.rejects(operation({ repositoryRootPath: fixture.root, runId }),
      (error: { code?: string }) => error.code === "PARITY_CURRENT_STATE_DRIFT");
    assert.equal(await readFile(path.join(runRoot, "checkpoint.json"), "utf8"), before);
  }
});

test("BOOT-RECOVER: current documentation and common canary recover only the proven failed batch", async (context) => {
  const workspace = await workspaceModulePromise;
  const bootstrap = await import("../.agents/skills/plan/scripts/browser-api-bootstrap.mjs");
  const { createInAppBrowserParityAdapter } = await import("../.agents/skills/plan/scripts/in-app-browser-parity-adapter.mjs");
  const { BrowserParityRunner } = await import("../.agents/skills/plan/scripts/parity-runner-core.mjs");
  const fixture = await createFixture(context, "boot-recover");
  const definition = createCoverageWorkspaceDefinition();
  const handshake = await workspace.prepareRunWorkspace({ repositoryRootPath: fixture.root, slug: "fixture",
    runId: "boot-recover", definition, approval: fixture.approval, current: fixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage", validateApproval: fixture.runner.validateApprovalEvidence });
  const first = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  await workspace.recordBatchResult({ repositoryRootPath: fixture.root, runId: handshake.runId,
    batchId: first.batch.batchId, input: JSON.stringify(coverageFragment(handshake, first.batch, definition)) });
  const second = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  await workspace.recordBatchFailure({ repositoryRootPath: fixture.root, runId: handshake.runId,
    batchId: second.batch.batchId, code: "BROWSER_DOCUMENTATION_REQUIRED", transient: false });
  const browser = { browserId: "boot-recover" };
  const adapter = createInAppBrowserParityAdapter({ browser, tab: { id: "owned" } });
  const runner = new BrowserParityRunner(adapter);
  const args = { repositoryRootPath: fixture.root, runId: handshake.runId,
    batchId: second.batch.batchId, browser, runner, tabId: "owned" };
  await assert.rejects(workspace.recoverDocumentationFailure(args), { code: "BROWSER_DOCUMENTATION_REQUIRED" });
  bootstrap.beginBrowserBootstrap(browser, { sessionId: browser.browserId, generation: "one", requiredDocumentIds: ["mock"] });
  const receipt = await bootstrap.publishBrowserDocumentation(browser, { invocationId: "publish",
    documents: [{ id: "mock", text: "Full mock Browser documentation", complete: true }], publish: () => {} });
  bootstrap.acknowledgeBrowserDocumentation(browser, { receipt, invocationId: "acknowledge", displayedDocumentDigests: receipt.documents });
  const canary = context.mock.method(runner, "capabilityCanary", async () => { throw new Error("canary failed"); });
  await assert.rejects(workspace.recoverDocumentationFailure(args), /canary failed/u);
  assert.equal((await workspace.nextRunBatch(args)).status, "terminal");
  canary.mock.mockImplementation(async (input: { viewport: object; dpr: number }) => {
    assert.deepEqual(input.viewport, { width: 390, height: 844 });
    assert.equal(input.dpr, 1);
    return { status: "pass", sessionId: browser.browserId, tabId: "owned", viewport: input.viewport, networkSource: "browser-network-log" };
  });
  const result = await workspace.recoverDocumentationFailure(args);
  assert.equal(result.status, "recovered");
  assert.equal(result.summary.passedRows, 2);
  const resumed = await workspace.nextRunBatch(args);
  assert.equal(resumed.batch.batchId, second.batch.batchId);
  assert.equal(resumed.batch.attempt, 2);
  assert.equal(resumed.summary.passedRows, 2);
  await workspace.recordBatchFailure({ ...args, code: "PARITY_DPR_OVERRIDE_UNAVAILABLE", transient: false });
  await assert.rejects(workspace.recoverDocumentationFailure(args), /proven documentation failure/u);
  await assert.rejects(workspace.recoverDocumentationFailure({ ...args, legacyDiagnosticFile: "../foreign.json" }), /workspace failure record/u);
});

test("BOOT-LEGACY: old DPR terminal needs a digest-bound workspace record proving unread documentation", async (context) => {
  const workspace = await workspaceModulePromise;
  const { createInAppBrowserParityAdapter, browserBootstrap } = await import("../.agents/skills/plan/scripts/in-app-browser-parity-adapter.mjs");
  const { BrowserParityRunner } = await import("../.agents/skills/plan/scripts/parity-runner-core.mjs");
  const fixture = await createFixture(context, "boot-legacy");
  const handshake = await workspace.prepareRunWorkspace({ repositoryRootPath: fixture.root, slug: "fixture",
    runId: "boot-legacy", definition: createCoverageWorkspaceDefinition(), approval: fixture.approval, current: fixture.current,
    baseUrls: { production: "http://localhost:3002/", prototype: "http://127.0.0.1:4002/" },
    matrixScope: "coverage", validateApproval: fixture.runner.validateApprovalEvidence });
  const next = await workspace.nextRunBatch({ repositoryRootPath: fixture.root, runId: handshake.runId });
  const args = { repositoryRootPath: fixture.root, runId: handshake.runId, batchId: next.batch.batchId };
  await workspace.recordBatchFailure({ ...args, code: "PARITY_DPR_OVERRIDE_UNAVAILABLE", transient: false });
  const browser = { browserId: "boot-legacy" };
  const runner = new BrowserParityRunner(createInAppBrowserParityAdapter({ browser, tab: { id: "owned" } }));
  browserBootstrap.beginBrowserBootstrap(browser, { sessionId: browser.browserId, generation: "one", requiredDocumentIds: ["mock"] });
  const receipt = await browserBootstrap.publishBrowserDocumentation(browser, { invocationId: "read",
    documents: [{ id: "mock", text: "Complete mock documentation", complete: true }], publish: () => {} });
  browserBootstrap.acknowledgeBrowserDocumentation(browser, { receipt, invocationId: "next", displayedDocumentDigests: receipt.documents });
  context.mock.method(runner, "capabilityCanary", async () => ({ status: "pass", sessionId: browser.browserId,
    tabId: "owned", viewport: { width: 390, height: 844, dpr: 1 }, networkSource: "browser-network-log" }));
  const legacyDiagnosticFile = `failure-${args.batchId}-1.json`;
  const proofPath = path.join(path.dirname(next.batch.path), legacyDiagnosticFile);
  await writeFile(proofPath, JSON.stringify({ code: "PARITY_DPR_OVERRIDE_UNAVAILABLE", diagnostic: "Unknown failure" }), { mode: 0o600 });
  const recovery = { ...args, browser, runner, tabId: "owned", legacyDiagnosticFile };
  await assert.rejects(workspace.recoverDocumentationFailure(recovery), /does not prove/u);
  await writeFile(proofPath, JSON.stringify({ code: "PARITY_DPR_OVERRIDE_UNAVAILABLE",
    diagnostic: 'Required documentation has not been read: "confirmations"' }), { mode: 0o600 });
  const before = await readFile(proofPath);
  assert.equal((await workspace.recoverDocumentationFailure(recovery)).status, "recovered");
  assert.deepEqual(await readFile(proofPath), before);
  const checkpoint = JSON.parse(await readFile(path.join(path.dirname(proofPath), "checkpoint.json"), "utf8"));
  assert.equal(checkpoint.batches[0].documentationRecovery.legacyProof.sha256, sha256(before.toString()));
});
