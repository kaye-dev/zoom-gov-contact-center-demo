import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const load = (name: string) => import(pathToFileURL(path.resolve(import.meta.dirname, name)).href);
const modules = Promise.all([
  load("../.agents/skills/plan/scripts/parity-runner-core.mjs"),
  load("../.agents/skills/plan/scripts/parity-fidelity.mjs"),
  load("fixtures/parity-fidelity.mjs"),
]);

test("real Browser fixture declares measured states, pairs/triples, visual risks and normal-route persistence", async () => {
  const [core, fidelity, fixtures] = await modules;
  const { contract, spec } = await fixtures.createBrowserFidelityFixture();
  core.validateParitySpec(spec, contract);
  const rows = core.selectRows({ phase: "final", matrixScope: "coverage", contract, spec });
  assert.equal(rows.length, 8);
  assert.equal(core.createCoverageReport(contract, rows).status, "pass");
  assert.deepEqual(fidelity.interactionCoverage(contract, spec, []).map((g: {feasibleTuples:number}) => g.feasibleTuples), [8, 12]);
  assert.equal(spec.coverage.riskRows.length, 1);
  assert.equal(spec.fidelity.visualChecks.length, 4);
  const check = spec.fidelity.runtimeChecks[0];
  assert.deepEqual(check.query, {});
  assert.equal(check.steps.filter((s: {action:{type:string}}) => s.action.type === "reload").length, 3);
  const expected = check.steps[2].assertions[0].expected;
  assert.equal(expected.sha256, await core.sha256Digest("parity:text:v1\0verified-lg"));
  assert.equal(expected.bytes, 11);
  for (const setup of spec.stateSetups) {
    assert.ok(setup.production.actions[0].selector.includes(setup.state));
    assert.equal(setup.assertionProbeIds[0], `state-${setup.state}`);
  }
});

test("REQ-03/05: deterministic t-way supplementation preserves axes and all feasible triples", async () => {
  const [core, fidelity, fixtures] = await modules;
  const { contract, spec } = fixtures.createFidelityFixture();
  assert.equal(core.validateParitySpec(spec, contract), spec);
  const input = { phase: "final", contract, spec, matrixScope: "coverage" };
  const rows = core.selectRows(input);
  assert.equal(rows.length, 8);
  assert.deepEqual(core.selectRows(input), rows);
  assert.equal(core.createCoverageReport(contract, rows).status, "pass");
  const evidence = fixtures.successfulAuditFixture().evidence;
  assert.equal(fidelity.interactionCoverage(contract, spec, evidence.rows)[0].passedTuples, 8);
  const pairsOnly = evidence.rows.filter((_: unknown, i: number) => [0, 3, 5, 6].includes(i));
  spec.fidelity.interactionGroups[0].strength = 2;
  assert.equal(fidelity.interactionCoverage(contract, spec, pairsOnly)[0].status, "pass");
  spec.fidelity.interactionGroups[0].strength = 3;
  assert.equal(fidelity.interactionCoverage(contract, spec, pairsOnly)[0].status, "fail");
  assert.equal(fidelity.interactionCoverage(contract, spec, evidence.rows.slice(1))[0].passedTuples, 7);
});

test("REQ-04: exclusions and derived properties use contract values and need reasons", async () => {
  const [core, fidelity, fixtures] = await modules;
  const { contract, spec } = fixtures.createFidelityFixture();
  const group = spec.fidelity.interactionGroups[0];
  group.factors[0] = { id: "length", source: "property", mapping: { ready: "normal", error: "maximum-plus-one" }, rationale: "boundary at the declared length limit" };
  group.exclusions = [{ values: { length: "maximum-plus-one", viewport: "390x844", theme: "dark" }, reason: "fixture excludes this case for the constraint regression test" }];
  core.validateParitySpec(spec, contract);
  assert.equal(fidelity.interactionCoverage(contract, spec, [])[0].feasibleTuples, 7);
  group.exclusions.push(structuredClone(group.exclusions[0]));
  assert.throws(() => core.validateParitySpec(spec, contract), /duplicate exclusion/);
  group.exclusions.pop(); group.exclusions[0].reason = "";
  assert.throws(() => core.validateParitySpec(spec, contract), /rationale/);
});

test("REQ-06: unchanged implementation fails final; faithful copy passes; smoke permits baseline delta", async () => {
  const [core, fidelity, fixtures] = await modules;
  const { spec } = fixtures.createFidelityFixture();
  const probe = spec.probes.find((p: {id:string}) => p.id === "copy");
  const compare = (left: string, phase: string) => fidelity.compareFidelityProbe(probe, { value: left }, { value: "Approved" }, spec, phase, core.compareProbe).status;
  assert.equal(compare("Old", "smoke"), "pass");
  assert.equal(compare("Old", "final"), "fail");
  assert.equal(compare("Approved", "final"), "pass");
  const rule = spec.fidelity.phaseComparisons.find((p: {probeId:string}) => p.probeId === "copy");
  rule.final = "expected"; rule.expected = { production: "Real", prototype: "Fixture" };
  assert.equal(fidelity.compareFidelityProbe(probe, { value: "Wrong" }, { value: "Fixture" }, spec, "final", core.compareProbe).status, "fail");
});

test("REQ-01/02/08/09: coverage alone cannot replace CLI, requirement, or Codex visual evidence", async () => {
  const [, fidelity, fixtures] = await modules;
  const { spec, audit, evidence } = fixtures.successfulAuditFixture();
  assert.deepEqual(fidelity.validateFidelityAudit(audit, evidence, spec), { static: "pass", runtime: "pass", requirements: "pass", visual: "pass" });
  for (const mutate of [
    (a: typeof audit) => { a.staticChecks[0].exitCode = 1; },
    (a: typeof audit) => { a.visualChecks = []; },
    (a: typeof audit) => { a.visualChecks[0].contentVerified = false; },
    (a: typeof audit) => { a.requirements = []; },
    (a: typeof audit) => { a.binding.goalSha256 = `sha256:${"b".repeat(64)}`; },
    (a: typeof audit) => { a.visualChecks[0].artifactDigests = []; },
  ]) {
    const changed = structuredClone(audit); mutate(changed);
    assert.throws(() => fidelity.validateFidelityAudit(changed, evidence, spec), /PARITY_FIDELITY_INVALID/);
  }
  evidence.artifactIndex = [];
  assert.throws(() => fidelity.validateFidelityAudit(audit, evidence, spec), /screenshot pair/);
});

test("REQ-07: persistence requires normal query, real actions, reload, and expected results", async () => {
  const [core, fidelity, fixtures] = await modules;
  const { contract, spec } = fixtures.createFidelityFixture();
  spec.fidelity.requirements[0].runtimeCheckIds = ["save"];
  spec.fidelity.runtimeChecks = [{ id: "save", requirementIds: ["REQ-01"], rowId: contract.parityMatrix[0].id, query: {}, persistence: true, steps: [
    { action: { type: "click", selector: "button" }, assertions: [{ probeId: "copy", expected: "Saved" }] },
    { action: { type: "reload" }, assertions: [{ probeId: "copy", expected: "Saved" }] },
  ] }];
  core.validateParitySpec(spec, contract);
  assert.throws(() => fidelity.validateRuntimeResults(spec, []), /runtime results/);
  spec.fidelity.runtimeChecks[0].query = { state: "saved" };
  assert.throws(() => core.validateParitySpec(spec, contract), /simulated state/);
  spec.fidelity.runtimeChecks[0].query = {};
  spec.fidelity.runtimeChecks[0].steps.pop();
  assert.throws(() => core.validateParitySpec(spec, contract), /reload/);
});

test("REQ-07/09: runner executes normal-route actions and schema v5 audit is independently revalidated", async () => {
  const [core, fidelity, fixtures] = await modules;
  const facade = await load("../.agents/skills/plan/scripts/parity-runner.mjs");
  const { contract, spec } = fixtures.createFidelityFixture();
  const digest = `sha256:${"a".repeat(64)}`;
  const definition = { contract, spec, prototypeRevision: digest, validationProfileDigest: digest };
  spec.fidelity.requirements[0].runtimeCheckIds = ["save"];
  spec.fidelity.runtimeChecks = [{ id: "save", requirementIds: ["REQ-01"], rowId: contract.parityMatrix[0].id, query: {}, persistence: true, steps: [
    { action: { type: "click", selector: "button" }, assertions: [{ probeId: "copy", expected: "Approved" }] },
    { action: { type: "reload" }, assertions: [{ probeId: "copy", expected: "Approved" }] },
  ] }];
  core.validateParitySpec(spec, contract);
  let baselineMode = false;
  let active = "production", viewport = { width: 390, height: 844, dpr: 1 };
  const navigations: string[] = [], actions: string[] = [];
  const adapter = {
    sessionId: "fidelity-test",
    activateTab: async (id: string) => { active = id; }, activeTabId: async () => active,
    setViewport: async (_id: string, next: typeof viewport) => { viewport = { ...next, dpr: 1 }; },
    measureViewport: async () => viewport,
    navigate: async (_id: string, url: string) => { navigations.push(url); }, setTheme: async () => {},
    runAction: async (_id: string, action: {type:string}) => { actions.push(action.type); },
    measureScroll: async () => ({ x: 0, y: 0 }),
    runProbe: async (_id: string, probe: {id:string;kind:string}, context: {row:{id:string};surface:string}) => {
      if (probe.kind === "screenshot") return { unsupported: true, value: digest, artifact: { path: `artifacts/${context.row.id}-${context.surface}.jpg`, sha256: digest, bytes: 1000, kind: "screenshot", mediaType: "image/jpeg", surface: context.surface, rowId: context.row.id, probeId: probe.id } };
      if (probe.kind === "text") return { value: baselineMode && context.surface === "production" ? "Old" : "Approved" };
      if (probe.kind === "console") return { value: [] };
      return { value: { matches: true } };
    },
    cleanup: async () => ({ status: "pass", tabs: ["production", "prototype"] }),
  };
  const run = { runId: "fidelity-test", goalSha256: digest, sources: [{ path: "src/ui.ts", sha256: digest }], runtime: { owner: "fixture", checkout: "/fixture", commit: "1".repeat(40), fixture: "fidelity-fixture", authorization: "admin", query: "none" } };
  const result = await new core.BrowserParityRunner(adapter).run({ definition, phase: "final", tabs: { production: "production", prototype: "prototype" }, baseUrls: { production: "http://localhost:3000", prototype: "http://127.0.0.1:4000" }, run });
  assert.equal(result.schemaVersion, 5);
  assert.equal(fidelity.validateRuntimeResults(spec, result.rows), "pass");
  assert.deepEqual(actions, ["click", "reload"]);
  assert.ok(navigations.some(url => new URL(url).origin === "http://localhost:3000" && !new URL(url).searchParams.has("state")));
  const { audit } = fixtures.successfulAuditFixture();
  audit.binding = Object.fromEntries(["goalSha256", "prototypeRevision", "validationProfileDigest", "sources"].map(key => [key, result[key]]));
  audit.requirements[0].evidenceIds.push("save");
  for (const visual of audit.visualChecks) {
    const expected = spec.fidelity.visualChecks.find((item: {id:string}) => item.id === visual.id);
    visual.artifactDigests = result.artifactIndex.filter((item: {rowId:string}) => item.rowId === expected.rowId).map((item: {sha256:string}) => item.sha256);
  }
  result.audit = audit;
  result.interactionCoverage = fidelity.interactionCoverage(contract, spec, result.rows);
  result.auditStatus = fidelity.validateFidelityAudit(audit, result, spec);
  // This deliberately uses the public reader, not only the audit helper.
  facade.validateParityEvidence(result, contract, spec);
  const forged = structuredClone(result);
  forged.rows[0].probes.find((probe: {probeId:string}) => probe.probeId === "copy").production = "Old";
  assert.throws(() => facade.validateParityEvidence(forged, contract, spec), /not reproducible/);
  baselineMode = true;
  const smoke = await new core.BrowserParityRunner(adapter).run({ definition, phase: "smoke", tabs: { production: "production", prototype: "prototype" }, baseUrls: { production: "http://localhost:3000", prototype: "http://127.0.0.1:4000" }, run });
  facade.validateParityEvidence(smoke, contract, spec);
  assert.equal(smoke.audit, null);
  assert.equal(smoke.auditStatus.visual, "not-run");
  const promotedSmoke = { ...smoke, phase: "final" };
  assert.throws(() => facade.validateParityEvidence(promotedSmoke, contract, spec));
});

test("literal expectations match compact Browser text and attributes in execution and evidence replay", async () => {
  const [core, fidelity, fixtures] = await modules;
  const syncHash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
  for (const [kind, expected, normalized] of [
    ["attribute", "image/svg+xml", "image/svg+xml"],
    ["text", "  保存済み\n  完了  ", "保存済み 完了"],
  ]) {
    const { spec } = fixtures.createFidelityFixture();
    const probe = { id: "copy", kind, options: { name: "type", normalizeWhitespace: true } };
    const rule = spec.fidelity.phaseComparisons.find((item: {probeId:string}) => item.probeId === "copy");
    rule.final = "expected"; rule.expected = { production: expected, prototype: expected };
    const domain = kind === "attribute" ? "parity:attribute:v1\0type\0" : "parity:text:v1\0";
    const observed = { value: { sha256: syncHash(domain + normalized), bytes: Buffer.byteLength(normalized) } };
    const run = await fidelity.compareFidelityProbe(probe, observed, observed, spec, "final", core.compareProbe, core.sha256Digest);
    const replay = fidelity.compareFidelityProbe(probe, observed, observed, spec, "final", core.compareProbe, syncHash);
    assert.equal(run.status, "pass");
    assert.deepEqual(run, replay);
    assert.equal(JSON.stringify(run).includes(expected), false);
    const wrong = { value: { ...observed.value, bytes: observed.value.bytes + 1 } };
    assert.equal((await fidelity.compareFidelityProbe(probe, wrong, observed, spec, "final", core.compareProbe, core.sha256Digest)).status, "fail");
    rule.expected.production = "different";
    assert.equal(fidelity.compareFidelityProbe(probe, observed, observed, spec, "final", core.compareProbe, syncHash).status, "fail");
  }
});

 test("selection cache respects changed inputs and returns current contract rows", async () => {
  const [, fidelity, fixtures] = await modules;
  const { contract, spec } = fixtures.createFidelityFixture();
  const first = fidelity.supplementInteractionRows(contract, spec, []);
  const cloned = structuredClone(contract);
  const cached = fidelity.supplementInteractionRows(cloned, structuredClone(spec), []);
  assert.deepEqual(cached, first);
  assert.equal(cached[0], cloned.parityMatrix.find((row: {id:string}) => row.id === first[0].id));
  cached.pop();
  assert.equal(fidelity.supplementInteractionRows(contract, spec, []).length, first.length);
  const additional = { ...contract.parityMatrix[0], id: "zz-cache-extra" };
  contract.parityMatrix.push(additional);
  assert.ok(fidelity.supplementInteractionRows(contract, spec, [additional]).some((row: {id:string}) => row.id === additional.id));
  spec.fidelity.visualChecks.push({ ...spec.fidelity.visualChecks[0], rowId: additional.id });
  assert.ok(fidelity.supplementInteractionRows(contract, spec, []).some((row: {id:string}) => row.id === additional.id));
});
