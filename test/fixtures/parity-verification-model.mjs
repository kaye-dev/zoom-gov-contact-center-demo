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
    profile.scenarios.push({ id: scenarioId, targetId: id, type: "snapshot", conditions: { route: `/${id}`, surfaces: { production: `http://localhost:3001/${id}`, prototype: `http://localhost:4001/${id}` }, fixture: { id: "read-only", seed, dataDigest: "sha256:fixture" }, authorization: { profile: "reader", role: "reader", tenant: "tenant-a" }, locale: "ja", timezone: "Asia/Tokyo", setup: [], reset: [], isolation: "reset-between-executions", viewport: { width: { factor: "width" }, height: 845 }, dpr: 1, scroll: { x: 0, y: 0 }, theme: { factor: "theme" }, environment: { build: "fixture-build", libraries: "fixture-libraries", network: "fixture-network" }, state: { factor: "state" } }, checkpoints: [{ id: "ready", actions: [], wait: { selector: "[data-state]" } }] });
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
