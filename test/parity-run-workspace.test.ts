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
