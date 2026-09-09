import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
const modulePromise = import(pathToFileURL(path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/parity-verification-model.mjs")).href);
const fixturePromise = import(pathToFileURL(path.resolve(import.meta.dirname, "fixtures/parity-verification-model.mjs")).href);

test("MODEL-01/GENERIC-01: seeded local models preserve unrelated selections", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { verificationFixture } = await fixturePromise;
  for (const seed of [1, 19, 37]) {
    const small = await compileVerificationModel(await verificationFixture({ targets: 2, seed, boundary: 583 + seed }));
    const large = await compileVerificationModel(await verificationFixture({ targets: 5, seed, boundary: 583 + seed }));
    assert.deepEqual(large.cases.filter((item: { targetId: string }) => ["feature-0", "feature-1"].includes(item.targetId)), small.cases);
    const renamed = await compileVerificationModel(await verificationFixture({ targets: 2, seed, boundary: 583 + seed, prefix: "renamed" }));
    assert.equal(renamed.executionCount, small.executionCount);
    assert.equal(renamed.obligations.length, small.obligations.length);
  }
});
test("MODEL-02/GAP-01: reject default fallback, missing child and changed expectations", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { verificationFixture } = await fixturePromise;
  for (const mutation of ["state", "obligation", "expected", "risk"]) {
    const fixture = await verificationFixture();
    if (mutation === "state") fixture.profile.groups[0].factors.state.push("fallback");
    if (mutation === "obligation") fixture.profile.obligations.pop();
    if (mutation === "expected") fixture.profile.obligations[0].expected = "incorrect";
    if (mutation === "risk") fixture.requirements.risks.push("uncovered-risk");
    await assert.rejects(compileVerificationModel(fixture), { code: mutation === "state" ? "PARITY_MODEL_INVALID" : "PARITY_REQUIREMENT_GAP" });
  }
});
test("EXPLODE-01: exact symbolic candidate size without materializing product", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { verificationFixture } = await fixturePromise;
  const fixture = await verificationFixture();
  for (let i = 0; i < 12; i++) {
    fixture.profile.groups[0].factors[`axis${i}`] = Array.from({ length: 20 }, (_, n) => n);
    fixture.profile.groups[0].interactions.push({ factors: [`axis${i}`], strength: 1, reason: "Resource limit fixture" });
  }
  const result = await compileVerificationModel(fixture);
  assert.equal(result.status, "resource-limit");
  assert.equal(result.executionCount, null);
  assert.equal(result.cases, null);
  assert.ok(BigInt(result.candidateCount) > BigInt(Number.MAX_SAFE_INTEGER));
});
test("MERGE-01: semantic execution differences are never merged", async () => {
  const { executionConditions, modelDigest } = await modulePromise;
  const { verificationFixture } = await fixturePromise;
  const fixture = await verificationFixture();
  const scenario = fixture.profile.scenarios[0];
  const factors = { state: "state-0", width: 720, theme: "light" };
  const baseline = await modelDigest(executionConditions(scenario, factors, "feature-0"));
  const changes = [
    (s: typeof scenario) => { s.conditions.fixture.seed++; },
    (s: typeof scenario) => { s.conditions.authorization.tenant = "other"; },
    (s: typeof scenario) => { s.conditions.authorization.role = "other"; },
    (s: typeof scenario) => { s.conditions.locale = "en"; },
    (s: typeof scenario) => { s.conditions.timezone = "UTC"; },
    (s: typeof scenario) => { s.conditions.dpr = 2; },
    (s: typeof scenario) => { s.conditions.scroll.y = 99; },
    (s: typeof scenario) => { s.checkpoints[0].wait.selector = "#other"; },
    (s: typeof scenario) => { s.checkpoints[0].actions = [{ type: "click", selector: "button" }]; },
  ];
  for (const change of changes) { const other = structuredClone(scenario); change(other); assert.notEqual(await modelDigest(executionConditions(other, factors, "feature-0")), baseline); }
});
test("MERGE-02/03: union keeps obligations and rejects conflicting expectations", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { verificationFixture, rebindFixture } = await fixturePromise;
  const fixture = await verificationFixture();
  const duplicate = structuredClone(fixture.profile.groups[0]); duplicate.id += "-duplicate";
  const original = fixture.profile.obligations[0];
  const extra = { ...structuredClone(original), id: "additional-requirement", requirementIds: ["REQ-extra"], assertion: { kind: "visibility", selector: "#extra", pure: true }, expected: true };
  fixture.profile.obligations.push(extra); duplicate.obligationIds = [...duplicate.obligationIds, extra.id]; fixture.profile.groups.push(duplicate);
  await rebindFixture(fixture);
  const model = await compileVerificationModel(fixture);
  assert.ok(model.safeMergedCount > 0);
  assert.ok(model.cases.some((item: { obligationIds: string[] }) => item.obligationIds.includes(extra.id) && item.obligationIds.includes(original.id)));
  extra.assertion = original.assertion; extra.expected = "contradiction";
  await rebindFixture(fixture);
  await assert.rejects(compileVerificationModel(fixture), { code: "PARITY_MODEL_INVALID" });
});
test("COMBO-01: mixed strength, constraints and regression seeds preserve reachable tuples", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { verificationFixture } = await fixturePromise;
  const fixture = await verificationFixture();
  const group = fixture.profile.groups[0];
  group.factors.locale = ["ja", "en"]; group.factors.mode = ["read", "edit"];
  group.interactions.push({ factors: ["width", "theme", "locale"], strength: 3, reason: "Three-factor rendering risk" }, { factors: ["width", "theme", "locale", "mode"], strength: 4, reason: "Known four-factor regression" });
  group.constraints = { any: [{ eq: ["mode", "read"] }, { eq: ["locale", "ja"] }] };
  group.seeds = [{ when: { all: [{ eq: ["mode", "edit"] }, { eq: ["theme", "dark"] }] }, reason: "Regression" }];
  const result = await compileVerificationModel(fixture);
  assert.ok(result.requiredCoverageKeys.some((token: string) => token.includes('"mode","edit"')));
  assert.ok(!result.requiredCoverageKeys.some((token: string) => token.includes('"mode","edit"') && token.includes('"locale","en"')));
  assert.ok(result.cases.flatMap((item: { coverageKeys: string[] }) => item.coverageKeys).length >= result.requiredCoverageKeys.length);
});
test("IMPACT-01: direct and transitive source invalidation stays scoped", async () => {
  const { compileVerificationModel, invalidationForSources } = await modulePromise;
  const { verificationFixture } = await fixturePromise;
  const model = await compileVerificationModel(await verificationFixture({ targets: 4 }));
  const [local, shared] = invalidationForSources(model, ["feature-0.tsx", "shared.css"]);
  assert.ok(local.caseIds.length < shared.caseIds.length);
  assert.equal(shared.caseIds.length, model.cases.length);
  assert.ok(local.obligationIds.every((id: string) => id.startsWith("feature-0")));
});

test("CERT-01/LAYER-02: pending certificates keep fallback and stale/weak proofs fail", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { certificateFixture } = await fixturePromise;
  const fixture = await certificateFixture();
  const compiled = await compileVerificationModel(fixture);
  assert.equal(compiled.substitutions[0].status, "pending");
  assert.ok(compiled.cases.some((item: { obligationIds: string[] }) => item.obligationIds.includes(fixture.profile.substitutions[0].originalObligationIds[0])));
  for (const variant of ["source", "fake-pass", "capability", "cycle", "fallback"]) {
    const changed = structuredClone(fixture);
    const certificate = changed.profile.substitutions[0];
    if (variant === "source") certificate.evidenceSources[0].digest = "sha256:stale";
    if (variant === "fake-pass") certificate.replacementChecks[0].resultDigest = "sha256:fake";
    if (variant === "capability") certificate.replacementChecks[0].capabilities = ["source-text", "SSR"];
    if (variant === "cycle") certificate.dependsOn = [certificate.id];
    if (variant === "fallback") certificate.fallbackObligationIds = [];
    await assert.rejects(compileVerificationModel(changed), { code: ["capability", "fallback"].includes(variant) ? "PARITY_REQUIREMENT_GAP" : "PARITY_SUBSTITUTION_INVALID" });
  }
});
test("REPRESENT-01: every actual transitive consumer needs an integration obligation", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { certificateFixture } = await fixturePromise;
  const fixture = await certificateFixture("component-representative");
  await compileVerificationModel(fixture);
  fixture.profile.substitutions[0].consumerIntegrationObligationIds = fixture.profile.obligations.filter((item: { targetId: string }) => item.targetId === "feature-0").map((item: { id: string }) => item.id);
  await assert.rejects(compileVerificationModel(fixture), { code: "PARITY_REQUIREMENT_GAP" });
});
test("FACTOR-01/COMBO-02: layout-changing theme and missing tuple mappings cannot be split", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { certificateFixture } = await fixturePromise;
  const fixture = await certificateFixture("factor-split");
  Object.assign(fixture.profile.substitutions[0], { tupleMapping: [], calibration: { capabilities: ["real-browser-layout", "real-browser-focus"], resultDigest: null }, coupledProperties: [] });
  assert.equal((await compileVerificationModel(fixture)).substitutions[0].status, "pending");
  for (const property of ["display", "width", "font", "native-control", "focus-interaction"]) {
    const changed = structuredClone(fixture); changed.profile.substitutions[0].coupledProperties = [property];
    await assert.rejects(compileVerificationModel(changed), { code: "PARITY_SUBSTITUTION_INVALID" });
  }
  fixture.profile.substitutions[0].retainedTupleIds = ["original-three-way"];
  await assert.rejects(compileVerificationModel(fixture), { code: "PARITY_REQUIREMENT_GAP" });
});
test("CRITERIA-01: original text and every child stay independently addressable", async () => {
  const { compileVerificationModel, modelDigest } = await modulePromise;
  const { verificationFixture, rebindFixture } = await fixturePromise;
  const fixture = await verificationFixture();
  const base = fixture.profile.obligations[0];
  const children = ["count", "event", "focus", "visual"].map((kind, index) => ({ ...structuredClone(base), id: `criterion-child-${index}`, layer: kind === "visual" ? "visual" : "browser", assertion: { kind: kind === "visual" ? "screenshot" : kind === "count" ? "text" : "focus", selector: `#${kind}`, pure: true }, expected: kind, criterionIds: ["mixed-original"], requiredCapabilities: [kind === "visual" ? "visual" : kind === "focus" ? "real-browser-focus" : "DOM-event"], artifactRequests: kind === "visual" ? ["screenshot"] : [] }));
  fixture.profile.obligations.push(...children); fixture.profile.groups[0].obligationIds.push(...children.map(({ id }) => id));
  const text = "Exact count, operation result, focus, and readable error";
  fixture.profile.originalCriteria = [{ id: "mixed-original", text, textDigest: await modelDigest(text), requirementIds: base.requirementIds, conditions: base.when, childObligationIds: children.map(({ id }) => id) }];
  await rebindFixture(fixture);
  const result = await compileVerificationModel(fixture);
  assert.equal(result.originalCriteria[0].childObligationIds.length, 4);
  assert.equal(result.obligations.filter((item: { criterionIds: string[] }) => item.criterionIds.includes("mixed-original")).length, 4);
  fixture.profile.obligations.pop();
  await assert.rejects(compileVerificationModel(fixture), { code: "PARITY_REQUIREMENT_GAP" });
});
test("LAYER-01: applicable operations need both domain tests and actual Browser flow", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { verificationFixture, rebindFixture } = await fixturePromise;
  const fixture = await verificationFixture();
  const base = fixture.profile.obligations[0];
  const domain = { ...structuredClone(base), id: "domain-save", layer: "db", test: { path: "save.test.ts", caseId: "save-reload", command: ["node", "--test"], input: {}, environment: {}, capabilities: ["DB"] } };
  fixture.profile.obligations.push(domain); fixture.profile.groups[0].obligationIds.push(domain.id);
  fixture.profile.operationCategories["save-reload"] = { applicable: true, obligationIds: [base.id, domain.id] };
  await rebindFixture(fixture);
  await assert.rejects(compileVerificationModel(fixture), { code: "PARITY_REQUIREMENT_GAP" });
  fixture.profile.scenarios[0].type = "flow";
  fixture.profile.scenarios[0].checkpoints[0].actions = [{ type: "click", selector: "#save" }];
  await compileVerificationModel(fixture);
  fixture.profile.operationCategories["save-reload"].obligationIds = [domain.id];
  await assert.rejects(compileVerificationModel(fixture), { code: "PARITY_REQUIREMENT_GAP" });
});
test("BOUNDARY-01: source-defined local boundary executes both comparison sides", async () => {
  const { compileVerificationModel } = await modulePromise;
  const { verificationFixture, rebindFixture } = await fixturePromise;
  for (const boundary of [517, 873]) {
    const fixture = await verificationFixture({ boundary });
    const original = fixture.profile.obligations[0];
    const narrow = { ...structuredClone(original), id: "boundary-narrow", when: { eq: ["width", boundary - 1] }, assertion: { kind: "attribute", selector: "#layout", pure: true }, expected: "narrow", boundaryIds: ["local-width"] };
    const wide = { ...structuredClone(narrow), id: "boundary-wide", when: { eq: ["width", boundary] }, expected: "wide" };
    fixture.profile.obligations.push(narrow, wide); fixture.profile.groups[0].obligationIds.push(narrow.id, wide.id);
    fixture.requirements.boundaries = ["local-width"];
    fixture.profile.boundaryInventory = [{ id: "local-width", axis: "width", unit: "px", operator: "gte", value: boundary, step: 1, when: null, targetIds: ["feature-0"], sourcePaths: ["feature-0.tsx"], sides: [{ matches: false, value: boundary - 1, obligationIds: [narrow.id], expected: "narrow" }, { matches: true, value: boundary, obligationIds: [wide.id], expected: "wide" }] }];
    fixture.profile.groups[0].interactions = [{ factors: ["state", "width", "theme"], strength: 3, reason: "State-specific boundary fixture" }];
    await rebindFixture(fixture);
    const compiled = await compileVerificationModel(fixture);
    assert.ok(compiled.cases.some((item: { conditions: { viewport: { width: number } } }) => item.conditions.viewport.width === boundary));
    fixture.profile.boundaryInventory[0].sides.pop();
    await assert.rejects(compileVerificationModel(fixture), { code: "PARITY_REQUIREMENT_GAP" });
  }
});
test("MODEL-04: new schema pairing is explicit", async () => {
  const { validateVerificationSchema } = await modulePromise;
  const { verificationFixture } = await fixturePromise;
  const fixture = await verificationFixture();
  assert.doesNotThrow(() => validateVerificationSchema(fixture.contract, fixture.profile, fixture.requirements));
  assert.throws(() => validateVerificationSchema(fixture.contract, { ...fixture.profile, version: 4 }, fixture.requirements), { code: "PARITY_MODEL_INVALID" });
});


test("MODEL-04 legacy: contract 2/profile 4 retains existing selection without rewriting inputs", async () => {
  const core = await import(pathToFileURL(path.resolve(import.meta.dirname, "../.agents/skills/plan/scripts/parity-runner-core.mjs")).href);
  const { createFidelityFixture } = await import(pathToFileURL(path.resolve(import.meta.dirname, "fixtures/parity-fidelity.mjs")).href);
  const { contract, spec } = createFidelityFixture();
  contract.version = 2;
  for (const target of contract.comparisonTargets) target.states = [...new Set(contract.parityMatrix.filter((row: { targetId: string }) => row.targetId === target.id).map((row: { state: string }) => row.state))];
  const before = JSON.stringify({ contract, spec });
  assert.equal(core.validateParitySpec(spec, contract), spec);
  const rows = core.selectRows({ phase: "final", contract, spec, matrixScope: "coverage" });
  assert.equal(rows.length, 8);
  assert.equal(JSON.stringify({ contract, spec }), before);
});

test("CERT-01 execution: only a current exact replacement can omit original execution", async () => {
  const { compileVerificationModel, modelDigest } = await modulePromise;
  const { certificateFixture } = await fixturePromise;
  const fixture = await certificateFixture();
  const before = await compileVerificationModel(fixture);
  const certificate = fixture.profile.substitutions[0];
  certificate.consumerIntegrationObligationIds = certificate.consumerIntegrationObligationIds.filter((id: string) => !certificate.originalObligationIds.includes(id));
  certificate.originalConditions = before.cases.filter((item: { obligationIds: string[] }) => item.obligationIds.every((id: string) => certificate.originalObligationIds.includes(id))).map((item: { conditions: unknown }) => item.conditions);
  certificate.applicability = certificate.originalConditions.map((conditions: { targetId: string; state: string; props: unknown; authorization: { tenant: string; role: string }; locale: string; dictionary: string; fixture: unknown; viewport: unknown; dpr: number; theme: string; portal: string; ancestor: string; scroll: unknown; checkpoints: { actions: unknown[] }[] }) => ({ targetId: conditions.targetId, state: conditions.state, props: conditions.props, tenant: conditions.authorization.tenant, role: conditions.authorization.role, locale: conditions.locale, dictionary: conditions.dictionary, fixture: conditions.fixture, viewport: conditions.viewport, dpr: conditions.dpr, theme: conditions.theme, portal: conditions.portal, ancestor: conditions.ancestor, scroll: conditions.scroll, actions: conditions.checkpoints.flatMap((checkpoint) => checkpoint.actions), checkpointId: "ready" }));
  const check = certificate.replacementChecks[0];
  const payload = { status: "pass", path: check.path, caseId: check.caseId, layer: check.layer, sourceDigest: "sha256:replacement", input: check.input, assertion: check.assertion, expected: check.expected, environment: check.environment, capabilities: check.capabilities, dependencyDigests: Object.fromEntries(certificate.evidenceSources.map((entry: { path: string; digest: string }) => [entry.path, entry.digest])) };
  const proof = { ...payload, digest: await modelDigest(payload) };
  const after = await compileVerificationModel({ ...fixture, proofResults: [proof] });
  assert.equal(after.substitutions[0].status, "certified");
  assert.ok(after.cases.length < before.cases.length);
  assert.equal(after.obligations.length, before.obligations.length);
  const stale = { ...payload, dependencyDigests: {} };
  await assert.rejects(compileVerificationModel({ ...fixture, proofResults: [{ ...stale, digest: await modelDigest(stale) }] }), { code: "PARITY_SUBSTITUTION_INVALID" });
});
