import { modelDigest } from "../../.agents/skills/plan/scripts/parity-verification-model.mjs";
export async function verificationFixture({ targets = 2, states = 3, prefix = "feature", seed = 17, boundary = 621 } = {}) {
  const contract = { version: 3, productionBaseline: { sources: [], runtimeOwner: "fixture", checkout: "/fixture", commit: "1".repeat(40), route: "/feature-0" }, comparisonConditions: { locale: "ja" }, visualInvariants: [], comparisonTargets: [], requirementsBundle: { path: "requirements.json", digest: "" } };
  const profile = { version: 5, groups: [], scenarios: [], obligations: [], originalCriteria: [], substitutions: [], boundaryInventory: [], interactionObligations: [], sourceInventory: [], sourceImpactMap: [], costPolicy: { overrides: [] }, operationCategories: {} };
  for (const category of ["save-reload", "conflict", "input-boundary", "dirty-cancel-confirm", "failure-retention", "double-submit", "stale-response"]) profile.operationCategories[category] = { applicable: false, reason: "Read-only fixture" };
  for (let t = 0; t < targets; t++) {
    const id = `${prefix}-${t}`;
    const stateIds = Array.from({ length: 1 + ((states + seed + t) % states) }, (_, i) => `state-${i}`);
    const scenarioId = `${id}-snapshot`;
    contract.comparisonTargets.push({ id, entry: "index.html", route: `/${id}`, surface: "page", applicableStateIds: stateIds, states: stateIds.map((state) => ({ id: state, when: null, identity: { selector: "[data-state]", expected: { factor: "state" } }, scenarioIds: [scenarioId] })) });
    profile.scenarios.push({ id: scenarioId, targetId: id, type: "snapshot", conditions: { route: `/${id}`, surfaces: { production: `http://localhost:3001/${id}`, prototype: `http://127.0.0.1:4001/${id}` }, fixture: { id: "read-only", seed, dataDigest: "sha256:fixture" }, authorization: { profile: "reader", role: "reader", tenant: "tenant-a" }, locale: "ja", timezone: "Asia/Tokyo", props: {}, portal: "none", ancestor: "shell", dictionary: "dictionary-digest", setup: [], reset: [], isolation: "reset-between-executions", viewport: { width: { factor: "width" }, height: 845 }, dpr: 1, scroll: { x: 0, y: 0 }, theme: { factor: "theme" }, themeSetup: { type: "query", parameter: "theme" }, environment: { build: "fixture-build", libraries: "fixture-libraries", network: "fixture-network" }, state: { factor: "state" } }, checkpoints: [{ id: "ready", actions: [], wait: { selector: "[data-state]" } }] });
    const ids = [];
    for (const state of stateIds) {
      const obligationId = `${id}-${state}`; ids.push(obligationId);
      profile.obligations.push({ id: obligationId, requirementIds: [`REQ-${id}-${state}`], layer: "browser", targetId: id, scenarioId, when: { eq: ["state", state] }, checkpointId: "ready", assertion: { kind: "text", selector: "[data-state]", pure: true }, expected: state, requiredCapabilities: ["DOM-event"], sourcePaths: [`${id}.tsx`], riskIds: [], boundaryIds: [], runtimeStepIds: [], criterionIds: [], tupleIds: [], artifactRequests: [] });
    }
    profile.groups.push({ id: `${id}-functional`, targetId: id, unitId: id, factors: { state: stateIds, width: [boundary - 1, boundary], theme: ["light", "dark"] }, constraints: null, interactions: [{ factors: ["state"], strength: 1, reason: "Independent state display" }, { factors: ["width", "theme"], strength: 2, reason: "Layout and theme interaction" }], seeds: [], scenarioIds: [scenarioId], obligationIds: ids });
    profile.sourceInventory.push({ id: `${id}.tsx`, digest: `sha256:${id}`, dependencies: ["shared.css"] });
    profile.sourceImpactMap.push({ id: `${id}.tsx`, scope: "target", targetIds: [id] });
  }
  profile.sourceInventory.push({ id: "shared.css", digest: "sha256:shared", dependencies: [] });
  profile.sourceImpactMap.push({ id: "shared.css", scope: "global", targetIds: contract.comparisonTargets.map(({ id }) => id), reason: "All target source modules import shared.css" });
  contract.productionBaseline.sources = profile.sourceInventory.map(({ id }) => id);
  contract.productionBaseline.route = contract.comparisonTargets[0].route;
  const requirements = { requirements: profile.obligations.flatMap(({ requirementIds }) => requirementIds), obligations: structuredClone(profile.obligations), originalCriteria: [], risks: [], boundaries: [], runtimeSteps: [], tuples: [] };
  contract.requirementsBundle.digest = await modelDigest(requirements);
  return { contract, profile, requirements };
}
export async function rebindFixture(fixture) {
  fixture.requirements.obligations = structuredClone(fixture.profile.obligations);
  fixture.requirements.requirements = [...new Set(fixture.profile.obligations.flatMap(({ requirementIds }) => requirementIds))];
  fixture.requirements.originalCriteria = structuredClone(fixture.profile.originalCriteria);
  fixture.contract.requirementsBundle.digest = await modelDigest(fixture.requirements);
  return fixture;
}
export async function certificateFixture(kind = "layer-transfer") {
  const fixture = await verificationFixture({ targets: 2, states: 2 });
  const original = fixture.profile.obligations[0];
  const scenario = fixture.profile.scenarios[0];
  const check = { path: "replacement.test.ts", caseId: "exact-state-check", layer: "browser", command: ["node", "--test", "replacement.test.ts"], input: { state: "state-0", fixture: scenario.conditions.fixture }, assertion: original.assertion, expected: original.expected, environment: scenario.conditions.environment, capabilities: ["DOM-event"], resultDigest: null };
  fixture.profile.sourceInventory.push({ id: check.path, digest: "sha256:replacement", dependencies: ["shared.css"] });
  fixture.profile.sourceImpactMap.push({ id: check.path, scope: "shared", targetIds: [] });
  // The replacement test is a real dependency of each consumer's declared connection check.
  for (const obligation of fixture.profile.obligations) obligation.sourcePaths.push(check.path);
  fixture.profile.sourceImpactMap.at(-1).targetIds = fixture.contract.comparisonTargets.map(({ id }) => id);
  const certificate = { id: "certificate-1", kind, originalObligationIds: [original.id], originalCriterionIds: [], requirementIds: original.requirementIds, originalConditions: [scenario.conditions], expectedResults: [original.expected], observationPoints: [original.checkpointId], retainedRiskIds: [], retainedBoundaryIds: [], retainedTupleIds: [], retainedRuntimeIds: [], applicability: [{ targetId: original.targetId, state: "state-0", props: {}, tenant: "tenant-a", role: "reader", locale: "ja", dictionary: "dictionary-digest", fixture: scenario.conditions.fixture, viewport: { width: 620, height: 845 }, dpr: 1, theme: "light", portal: "none", ancestor: "shell", scroll: { x: 0, y: 0 }, actions: [], checkpointId: "ready" }], evidenceSources: fixture.profile.sourceInventory.map((source) => ({ path: source.id, symbol: "fixture", digest: source.digest, dependencies: source.dependencies, equivalence: "Exact fixture source and inputs" })), representativeCaseIds: [], selectionReason: "Exact state and shared rendering source", consumerIntegrationObligationIds: fixture.profile.obligations.map(({ id }) => id), replacementChecks: [check], residualRisks: [], invalidation: ["source", "test", "fixture", "environment", "props", "dictionary", "font", "breakpoint", "theme", "portal"], fallbackObligationIds: [original.id], dependsOn: [] };
  fixture.profile.substitutions.push(certificate);
  await rebindFixture(fixture);
  return fixture;
}
export function modelAdapterSpy() {
  const calls = []; let active; let viewport = { width: 390, height: 844, dpr: 1 }; let conditions;
  const adapter = {
    sessionId: "model-fixture", calls,
    async bootstrapStatus() { return { status: "ready", sessionId: "model-fixture", generation: "test-generation", documents: [{ id: "test-doc", sha256: "sha256:" + "a".repeat(64) }] }; },
    async screenshotDigest() { calls.push(["canary-image"]); return "sha256:" + "b".repeat(64); },
    async activateTab(id) { active = id; calls.push(["activate", id]); },
    async activeTabId() { return active; },
    async setViewport(id, value) { viewport = { ...value, dpr: 1 }; calls.push(["viewport", id]); },
    async measureViewport() { return viewport; },
    async navigate(id, url) { calls.push(["navigate", id, url]); },
    async setTheme() {},
    async runAction(id, action) { calls.push(["action", id, action]); },
    async runProbe() { return { value: true }; },
    async measureScroll() { return { x: 0, y: 0 }; },
    async setModelEnvironment(id, value) { conditions = value; calls.push(["environment", id]); },
    async runModelAssertion(id, assertion) { calls.push(["assertion", id, assertion]); return { value: assertion.kind === "visibility" ? true : conditions.state, capabilities: ["DOM-event", "real-browser-layout", "real-browser-focus"] }; },
    async captureModelArtifact(id, kind, context) { calls.push(["capture", id, kind]); return { path: `artifacts/${context.row.id}-${context.probeId}-${context.surface}.png`, sha256: await modelDigest({ id, context, conditions }), bytes: 100, kind, mediaType: "image/png", surface: context.surface, rowId: context.row.id, probeId: context.probeId }; },
    async cleanup() { calls.push(["cleanup"]); return { status: "pass" }; },
  };
  return adapter;
}

export async function liveVerificationFixture({ appPort, artifactPort }) {
  const fixture = await verificationFixture({ targets: 2, states: 1 });
  fixture.profile.groups = []; fixture.profile.obligations = []; fixture.profile.scenarios = []; fixture.profile.sourceInventory = []; fixture.profile.sourceImpactMap = [];
  const sourcePaths = ["test/fixtures/in-app-browser-parity/model.html", "test/fixtures/in-app-browser-parity/model-fixture.mjs", "test/fixtures/in-app-browser-parity/model-components.mjs"];
  for (const source of sourcePaths) {
    fixture.profile.sourceInventory.push({ id: source, digest: "pending", dependencies: source.endsWith("model-fixture.mjs") ? [sourcePaths[2]] : [] });
    fixture.profile.sourceImpactMap.push({ id: source, scope: "global", targetIds: ["feature-0", "feature-1"], reason: "Both fixture consumers import or render this exact shared source" });
  }
  for (let index = 0; index < 2; index++) {
    const target = fixture.contract.comparisonTargets[index];
    target.route = "/model.html"; target.states[0].id = "ready"; target.applicableStateIds = ["ready"]; target.states[0].identity = { selector: "#model-state", expected: "ready" };
    const consumer = index === 0 ? "host" : "second";
    const label = index === 0 ? "Representative host" : "Second consumer";
    const base = { route: "/model.html", surfaces: { production: `http://localhost:${appPort}/model.html`, prototype: `http://127.0.0.1:${artifactPort}/model.html` }, query: { consumer }, fixture: { id: "shared-controls", seed: 17, dataDigest: "fixture-controls-v1" }, authorization: { profile: "reader", role: "reader", tenant: "fixture" }, locale: "en-US", timezone: "UTC", props: {}, portal: "native-dialog", ancestor: "fixture-main", dictionary: "english-fixture", setup: [], reset: [], isolation: "reset-between-executions", viewport: { width: { factor: "width" }, height: 844 }, dpr: 1, scroll: { x: 0, y: 0 }, theme: { factor: "theme" }, themeSetup: { type: "query", parameter: "theme" }, environment: { build: "owned-fixture", libraries: "native-dialog", network: "loopback-only" }, state: "ready" };
    const flowId = `${target.id}-flow`, visualId = `${target.id}-visual`;
    const checkpoints = [
      { id: "ready", actions: [], checks: [["text", "#consumer-title", label], ["visibility", "#model-main", true]] },
      ...(index === 0 ? [
        { id: "help-hover", actions: [{ type: "hover", selector: "#help" }], checks: [["visibility", "#help-text", true]] },
        { id: "help-keyboard", actions: [{ type: "click", selector: "#help" }, { type: "press", selector: "#help", key: "Escape" }], checks: [["visibility", "#help-text", false], ["focus", "#help", true]] },
        { id: "help-pointer", actions: [{ type: "click", selector: "#help" }], checks: [["visibility", "#help-text", true]] },
        { id: "help-close", actions: [{ type: "press", selector: "#help", key: "Escape" }], checks: [["visibility", "#help-text", false]] },
      ] : []),
      { id: "open", actions: [{ type: "click", selector: "#dialog-open" }], checks: [["visibility", "#shared-dialog", true], ["focus", "#dialog-cancel", true], ["text", "#dialog-copy", `Confirm the change for ${label}.`]] },
      ...(index === 0 ? [
        { id: "tab", actions: [{ type: "press", selector: "#dialog-cancel", key: "Tab" }], checks: [["focus", "#dialog-confirm", true]] },
        { id: "wrap", actions: [{ type: "press", selector: "#dialog-confirm", key: "Tab" }], checks: [["focus", "#dialog-cancel", true]] },
        { id: "reverse", actions: [{ type: "press", selector: "#dialog-cancel", key: "Shift+Tab" }], checks: [["focus", "#dialog-confirm", true]] },
        { id: "escape", actions: [{ type: "press", selector: "#dialog-confirm", key: "Escape" }], checks: [["visibility", "#shared-dialog", false], ["focus", "#dialog-open", true]] },
        { id: "reopen", actions: [{ type: "click", selector: "#dialog-open" }], checks: [["focus", "#dialog-cancel", true]] },
      ] : []),
      { id: "confirm", actions: [{ type: "click", selector: "#dialog-confirm" }], checks: [["text", "#callback-count", String(index + 1)], ["visibility", "#shared-dialog", false], ["focus", "#dialog-open", true]] },
    ];
    fixture.profile.scenarios.push({ id: flowId, targetId: target.id, type: "flow", conditions: base, checkpoints: checkpoints.map(({ id, actions }) => ({ id, actions, wait: { selector: "#model-main" } })) }, { id: visualId, targetId: target.id, type: "snapshot", conditions: base, checkpoints: [{ id: "ready", actions: [], wait: { selector: "#model-main" } }] });
    const flowObligations = [];
    for (const checkpoint of checkpoints) for (const [number, [kind, selector, expected]] of checkpoint.checks.entries()) {
      const id = `${target.id}-${checkpoint.id}-${number}`; flowObligations.push(id);
      fixture.profile.obligations.push({ id, requirementIds: [`REQ-${target.id}-${checkpoint.id}-${number}`], layer: "browser", targetId: target.id, scenarioId: flowId, when: null, checkpointId: checkpoint.id, assertion: { kind, selector, pure: true }, expected, requiredCapabilities: [kind === "focus" ? "real-browser-focus" : kind === "visibility" ? "real-browser-layout" : "DOM-event"], sourcePaths, riskIds: [], boundaryIds: [], runtimeStepIds: [checkpoint.id], criterionIds: [], tupleIds: [], artifactRequests: [] });
    }
    const visualObligation = `${target.id}-visual`;
    fixture.profile.obligations.push({ id: visualObligation, requirementIds: [`REQ-${target.id}-visual`], layer: "visual", targetId: target.id, scenarioId: visualId, when: null, checkpointId: "ready", assertion: { kind: "screenshot", selector: "body", pure: true }, expected: "Readable consumer layout in declared theme and local boundary", requiredCapabilities: ["visual"], sourcePaths, riskIds: [], boundaryIds: [], runtimeStepIds: [], criterionIds: [visualObligation], tupleIds: [], artifactRequests: ["screenshot"] });
    const text = "Consumer text, controls and layout remain readable without clipping in this exact theme and width.";
    fixture.profile.originalCriteria.push({ id: visualObligation, text, textDigest: await modelDigest(text), requirementIds: [`REQ-${target.id}-visual`], conditions: { targetId: target.id }, childObligationIds: [visualObligation] });
    fixture.profile.groups.push({ id: flowId, targetId: target.id, unitId: `${target.id}-flow`, factors: { state: ["ready"], width: [620], theme: ["light"] }, constraints: null, interactions: [{ factors: ["state", "width", "theme"], strength: 1, reason: "Real flow at a declared representative display; visual boundaries are independent" }], seeds: [], scenarioIds: [flowId], obligationIds: flowObligations }, { id: visualId, targetId: target.id, unitId: `${target.id}-visual`, factors: { state: ["ready"], width: [519, 520], theme: ["light", "dark"] }, constraints: null, interactions: [{ factors: ["state", "width", "theme"], strength: 3, reason: "Actual local CSS transition and both themes" }], seeds: [], scenarioIds: [visualId], obligationIds: [visualObligation] });
    const visualGroup = fixture.profile.groups.at(-1);
    visualGroup.factors.mainWidth = [487, 472];
    visualGroup.constraints = { any: [{ all: [{ eq: ["width", 519] }, { eq: ["mainWidth", 487] }] }, { all: [{ eq: ["width", 520] }, { eq: ["mainWidth", 472] }] }] };
    visualGroup.interactions.push({ factors: ["width", "mainWidth", "theme"], strength: 3, reason: "Source-defined outer width must remain equal across light/dark" });
    const boundsId = `${target.id}-bounds`;
    fixture.profile.obligations.push({ id: boundsId, requirementIds: [`REQ-${target.id}-bounds`], layer: "browser", targetId: target.id, scenarioId: visualId, when: null, checkpointId: "ready", assertion: { kind: "geometry", selector: "#model-main", pure: true, tolerancePx: 0.25 }, expected: { width: { factor: "mainWidth" } }, requiredCapabilities: ["real-browser-layout"], sourcePaths, riskIds: [], boundaryIds: [], runtimeStepIds: [], criterionIds: [], tupleIds: [], artifactRequests: [] });
    visualGroup.obligationIds.push(boundsId);
    if (index === 0) {
      const focusId = "host-keyboard-visual";
      const focusText = "Dialog contents are readable and the keyboard-focused Confirm control has a visible focus indicator.";
      fixture.profile.obligations.push({ id: focusId, requirementIds: ["REQ-host-keyboard-visual"], layer: "visual", targetId: target.id, scenarioId: flowId, when: null, checkpointId: "tab", assertion: { kind: "screenshot", selector: "#shared-dialog", pure: true }, expected: focusText, requiredCapabilities: ["visual"], sourcePaths, riskIds: [], boundaryIds: [], runtimeStepIds: ["tab"], criterionIds: [focusId], tupleIds: [], artifactRequests: ["screenshot"] });
      fixture.profile.groups.find((group) => group.id === flowId).obligationIds.push(focusId);
      fixture.profile.originalCriteria.push({ id: focusId, text: focusText, textDigest: await modelDigest(focusText), requirementIds: ["REQ-host-keyboard-visual"], conditions: { targetId: target.id, checkpointId: "tab" }, childObligationIds: [focusId] });
    }
    target.states[0].scenarioIds = [flowId, visualId];
  }
  fixture.contract.productionBaseline.sources = sourcePaths;
  fixture.contract.productionBaseline.route = "/model.html";
  fixture.requirements.runtimeSteps = [...new Set(fixture.profile.obligations.flatMap((item) => item.runtimeStepIds))];
  await rebindFixture(fixture);
  return fixture;
}
