import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const estimator = import(pathToFileURL(path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/parity-estimate.mjs")).href);
const fixtures = import(pathToFileURL(path.resolve(import.meta.dirname, "fixtures/parity-verification-model.mjs")).href);

test("EST-01/02: deterministic report is derived from compiler and retains obligation totals", async () => {
  const { estimateVerification } = await estimator;
  const { verificationFixture } = await fixtures;
  const input = await verificationFixture();
  const bytes = JSON.stringify(input);
  const report = await estimateVerification(input);
  assert.deepEqual(await estimateVerification(input), report);
  assert.equal(JSON.stringify(input), bytes);
  assert.equal(report.childObligationCount, input.requirements.obligations.length);
  assert.equal(report.artifacts.captureCount, 0);
  assert.equal(report.substitutions.certifiedCount, 0);
  assert.ok(report.time.high > report.time.low);
  assert.ok(report.basis.every((item: { confidence: string }) => item.confidence === "low"));
  const insufficient = await estimateVerification(input, { measurements: { execution: { sampleCount: 19, scope: "current-environment", p50: 0, p90: 0 } } });
  assert.deepEqual(insufficient.time, report.time);
});
test("EST-01 CLI: JSON stdout, input bytes unchanged and no run artifacts", async () => {
  const { verificationFixture } = await fixtures;
  const root = await mkdtemp(path.join(tmpdir(), "parity-model-estimate-"));
  try {
    const input = await verificationFixture();
    const target = "plans/example/prototype";
    await mkdir(path.join(root, target), { recursive: true });
    for (const source of input.profile.sourceInventory) {
      const content = `fixture ${source.id}`;
      await writeFile(path.join(root, source.id), content);
      source.digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    }
    for (const [name, value] of Object.entries({ "ui-contract.json": input.contract, "parity-spec.json": input.profile, "requirements.json": input.requirements })) await writeFile(path.join(root, target, name), JSON.stringify(value));
    const before = await readFile(path.join(root, target, "parity-spec.json"), "utf8");
    const moduleUrl = pathToFileURL(path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/parity-runner.mjs")).href;
    const script = `import {runCli} from ${JSON.stringify(moduleUrl)}; await runCli({repositoryRootPath: ${JSON.stringify(root)}, argv: ["estimate", ${JSON.stringify(target)}, "--phase", "final", "--context", "plan", "--format", "json"]});`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.version, 1); assert.equal(report.status, "complete");
    assert.ok(report.inputDigests.profile); assert.ok(report.additionalCosts); assert.ok(report.substitutions);
    assert.equal(await readFile(path.join(root, target, "parity-spec.json"), "utf8"), before);
    await assert.rejects(readFile(path.join(root, target, "implementation-parity.json")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("SCALE-01: exact thresholds, drift and scoped justified overrides", async () => {
  const { evaluateScale } = await estimator;
  const fresh = () => ({ conditionDuplicateCandidates: 0, conditionDuplicateRate: 0, unresolvedDuplicateCandidates: 0, browserExecutionCount: 20, imageRequestRate: 0, artifactJustification: null, blanketSnapshotPolicy: false, globalSourceRate: 0, globalDependenciesVerified: true, executionCount: 50, actionCount: 50, time: { high: 5400 }, units: [{ id: "one", time: { high: 900 } }], artifacts: { captureCount: 50, bytes: { high: 64 * 1024 * 1024 } } });
  assert.equal(evaluateScale(fresh()).length, 0);
  for (const field of ["duplicate", "image", "global", "unit", "total", "bytes"]) {
    const report = fresh();
    if (field === "duplicate") { report.conditionDuplicateCandidates = 10; report.unresolvedDuplicateCandidates = 1; }
    if (field === "image") report.imageRequestRate = 0.9;
    if (field === "global") { report.globalSourceRate = 0.25; report.globalDependenciesVerified = false; }
    if (field === "unit") report.units[0].time.high += 0.01;
    if (field === "total") report.time.high += 0.01;
    if (field === "bytes") report.artifacts.bytes.high++;
    assert.equal(evaluateScale(report).length, 1, field);
  }
  const before = fresh(), current = fresh(); current.executionCount = 60;
  assert.equal(evaluateScale(current, { baseline: before })[0].code, "PARITY_COST_DRIFT");
  current.executionCount = 59; assert.equal(evaluateScale(current, { baseline: before }).length, 0);
  current.units[0].time.high = 1200;
  assert.equal(evaluateScale(current, { policy: { overrides: [{ metric: "unitHighSeconds", value: 1200, unitIds: ["one"], reason: "Required regression space", evidence: "Measured fixture" }] } }).length, 0);
  assert.throws(() => evaluateScale(current, { policy: { overrides: [{ metric: "unitHighSeconds", value: 1200 }] } }), { code: "PARITY_MODEL_INVALID" });
});

test("SCALE-01 boundaries: inclusive percentages and absolute drift thresholds", async () => {
  const { evaluateScale } = await estimator;
  const base = () => ({ conditionDuplicateCandidates: 0, conditionDuplicateRate: 0, unresolvedDuplicateCandidates: 0, browserExecutionCount: 20, imageRequestRate: 0, artifactJustification: null, blanketSnapshotPolicy: false, globalSourceRate: 0, globalDependenciesVerified: true, executionCount: 50, actionCount: 50, time: { high: 1000 }, units: [], artifacts: { captureCount: 50, bytes: { high: 0 } } });
  for (const rate of [0.099999, 0.1, 0.100001]) { const report = base(); report.conditionDuplicateRate = rate; report.unresolvedDuplicateCandidates = 1; assert.equal(evaluateScale(report).length, rate < 0.1 ? 0 : 1); }
  for (const cases of [19, 20, 21]) for (const rate of [0.899999, 0.9, 0.900001]) { const report = base(); report.browserExecutionCount = cases; report.imageRequestRate = rate; assert.equal(evaluateScale(report).length, cases >= 20 && rate >= 0.9 ? 1 : 0); }
  for (const rate of [0.249999, 0.25, 0.250001]) { const report = base(); report.globalSourceRate = rate; report.globalDependenciesVerified = false; assert.equal(evaluateScale(report).length, rate >= 0.25 ? 1 : 0); }
  for (const delta of [299, 300, 301]) { const current = base(); current.time.high += delta; assert.equal(evaluateScale(current, { baseline: base() }).length, delta >= 300 ? 1 : 0); }
  for (const delta of [25 * 1024 * 1024 - 1, 25 * 1024 * 1024, 25 * 1024 * 1024 + 1]) { const current = base(); current.artifacts.bytes.high = delta; assert.equal(evaluateScale(current, { baseline: base() }).length, delta >= 25 * 1024 * 1024 ? 1 : 0); }
  for (const delta of [9, 10, 11]) { const current = base(); current.actionCount += delta; assert.equal(evaluateScale(current, { baseline: base() }).length, delta >= 10 ? 1 : 0); }
});
test("EST-03: pending calibrations add cost and resource-limited selection never reports zero", async () => {
  const { estimateVerification } = await estimator;
  const { verificationFixture, certificateFixture } = await fixtures;
  const fixture = await certificateFixture("factor-split");
  Object.assign(fixture.profile.substitutions[0], { tupleMapping: [], calibration: { capabilities: ["real-browser-layout", "real-browser-focus"], resultDigest: null }, coupledProperties: [] });
  const certifiedPending = await estimateVerification(fixture);
  const without = structuredClone(fixture); without.profile.substitutions = [];
  assert.ok(certifiedPending.time.high > (await estimateVerification(without)).time.high);
  assert.equal(certifiedPending.substitutions.certifiedCount, 0);
  assert.equal(certifiedPending.additionalCosts.calibrationChecks, 1);
  const huge = await verificationFixture();
  for (let i = 0; i < 7; i++) { huge.profile.groups[0].factors[`x${i}`] = Array.from({ length: 10 }, (_, n) => n); huge.profile.groups[0].interactions.push({ factors: [`x${i}`], strength: 1, reason: "Resource fixture" }); }
  const report = await estimateVerification(huge);
  assert.equal(report.status, "resource-limit"); assert.equal(report.executionCount, null);
  assert.ok(BigInt(report.candidateCount) > BigInt(1_000_000));
});

test("EST-01/SCALE-01: per-unit time includes CLI layers and cannot bypass the unit budget", async () => {
  const { estimateVerification } = await estimator;
  const { verificationFixture, rebindFixture } = await fixtures;
  const input = await verificationFixture({ targets: 1, states: 1 });
  for (const obligation of input.profile.obligations) Object.assign(obligation, { layer: "unit", requiredCapabilities: ["domain"], test: { path: "unit.test.mjs", caseId: "UNIT-01", command: ["node", "unit.test.mjs"], input: {}, environment: { fixture: "unit" }, capabilities: ["domain"] } });
  await rebindFixture(input);
  const report = await estimateVerification(input, { measurements: { cli: { sampleCount: 20, scope: "current-environment", p50: 400, p90: 500 } } });
  assert.equal(report.units[0].browserExecutionCount, 0);
  assert.equal(report.units[0].cliCount, report.executionCount);
  assert.equal(report.units[0].time.high, report.executionCount * 500);
  assert.ok(report.diagnostics.some((item: { metric: string }) => item.metric === "unit:feature-0:highSeconds"));
});
