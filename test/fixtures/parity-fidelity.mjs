import { sha256Digest } from "../../.agents/skills/plan/scripts/parity-runner-core.mjs";

export function createFidelityFixture() {
  const states = ["ready", "error"], viewports = ["390x844", "1280x800"], themes = ["light", "dark"];
  const target = { id: "main", entry: "index.html", route: "/fixture", surface: "page" };
  const matrix = states.flatMap(state => viewports.flatMap((viewport, i) => themes.map(theme => ({
    id: `main-${state}-${i}-${theme}`, targetId: target.id, entry: target.entry, route: target.route,
    surface: "page", state, viewport, theme, breakpoint: `viewport-${i}`,
    expectedInvariantIds: ["identity"], intentionalDifferenceIds: ["copy"],
  }))));
  const contract = {
    version: 1,
    productionBaseline: { sources: ["src/ui.ts"], runtimeOwner: "fixture", checkout: "/fixture", commit: "1".repeat(40), route: target.route },
    comparisonConditions: { viewports, dpr: 1, scroll: { x: 0, y: 0 }, locale: "ja", themes, fixture: "fidelity-fixture", authorization: "admin", query: "none" },
    baselineStateInventory: states, themeContract: themes,
    responsiveContract: viewports.map((viewport, i) => ({ id: `viewport-${i}`, viewport })),
    visualInvariants: [{ id: "identity", description: "correct state" }],
    intentionalDifferences: [{ id: "copy", description: "approved copy changes" }],
    stateAndInteraction: ["save", "reload"], comparisonTargets: [target], parityMatrix: matrix,
  };
  const probes = [
    ["route", "route", {}], ["setup", "setup", {}], ["identity", "state", { expected: "visible" }],
    ["viewport", "viewport", {}], ["theme", "theme", { rootClass: "row-theme", colorScheme: "row-theme" }],
    ["control", "control", { expected: "enabled" }], ["overflow", "overflow", { tolerancePx: 0 }], ["console", "console", {}],
  ].map(([id, kind, options]) => ({ id, kind, options, mode: "equal", required: true, tier: "coverage", productionSelector: kind === "control" ? "button" : "main", prototypeSelector: kind === "control" ? "button" : "main" }));
  probes.push(
    { id: "image", kind: "screenshot", mode: "equal", required: true, tier: "anchor", productionSelector: "main", prototypeSelector: "main", options: {} },
    { id: "copy", kind: "text", mode: "different", required: true, tier: "anchor", productionSelector: "h1", prototypeSelector: "h1", options: { normalizeWhitespace: true } },
  );
  const spec = {
    version: 4,
    stateSetups: states.map(state => ({ targetId: "main", state, production: { query: { state }, actions: [] }, prototype: { query: { state }, actions: [] }, assertionProbeIds: ["identity"] })),
    probes, rowProbeMap: matrix.map(row => ({ rowId: row.id, probeIds: probes.map(probe => probe.id) })),
    browserSetups: [{ targetId: "main", production: { type: "query", parameter: "theme" }, prototype: { type: "query", parameter: "theme" } }],
    coverage: { targetOrder: ["main"], viewportOrder: viewports, themeOrder: themes, anchorRows: [{ id: "main-anchor", targetId: "main", rowId: matrix[0].id, reason: "representative" }], riskRows: [] },
    sourceImpactMap: [{ source: "src/ui.ts", scope: "global", targetIds: [] }],
    batchPolicy: { maxRows: 2, maxBytes: 131072, summaryMaxBytes: 4096 },
    artifactPolicy: { kinds: ["screenshot", "dom", "accessibility"], maxBytes: 2097152, retainOnFailure: true },
    fidelity: {
      requirements: [{ id: "REQ-01", expected: "approved heading and usable controls in all declared conditions", probeIds: ["copy"], runtimeCheckIds: [], visualCheckIds: ["visual-light", "visual-dark"], staticCheckIds: ["types"], interactionGroupIds: ["state-layout-theme"], noInteractionReason: null }],
      phaseComparisons: probes.map(probe => ({ probeId: probe.id, smoke: probe.kind === "screenshot" ? "capture" : probe.mode, final: probe.kind === "screenshot" ? "capture" : "equal", expected: null })),
      interactionGroups: [{ id: "state-layout-theme", requirementIds: ["REQ-01"], targetIds: ["main"], states, factors: ["state", "viewport", "theme"].map(source => ({ id: source, source, mapping: {}, rationale: source === "viewport" ? "mobile and desktop equivalence classes; breakpoint cases are declared by the contract" : "all declared values" })), strength: 3, reason: "error visibility depends on layout and theme together", exclusions: [], requiredProbeIds: ["identity", "copy"] }],
      runtimeChecks: [],
      visualChecks: [{ id: "visual-light", requirementIds: ["REQ-01"], rowId: matrix[0].id, probeId: "image", criteria: ["heading, spacing, and content are legible"] }, { id: "visual-dark", requirementIds: ["REQ-01"], rowId: matrix[3].id, probeId: "image", criteria: ["heading, spacing, and content are legible"] }],
      staticChecks: [{ id: "types", command: "npm run typecheck", scope: ["src/ui.ts"] }],
    },
  };
  return { contract, spec };
}

// Real HTTP fixture profile; uses the same public runner and adapter as product runs.
export async function createBrowserFidelityFixture() {
  const { contract, spec } = createFidelityFixture();
  for (const target of contract.comparisonTargets) { target.entry = "fidelity.html"; target.route = "/fidelity.html"; }
  for (const row of contract.parityMatrix) { row.entry = "fidelity.html"; row.route = "/fidelity.html"; }
  contract.productionBaseline.route = "/fidelity.html";
  for (const probe of spec.probes) {
    if (probe.kind === "control") probe.productionSelector = probe.prototypeSelector = "#save";
  }
  for (const setup of spec.stateSetups) {
    const id = `state-${setup.state}`;
    const selector = `main[data-state="${setup.state}"]`;
    spec.probes.push({ id, kind: "state", mode: "equal", required: true, tier: "coverage", productionSelector: selector, prototypeSelector: selector, options: { expected: "visible" } });
    spec.fidelity.phaseComparisons.push({ probeId: id, smoke: "equal", final: "equal", expected: null });
    setup.assertionProbeIds = [id];
    for (const surface of ["production", "prototype"]) setup[surface].actions = [{ type: "waitForVisible", selector }];
    for (const row of contract.parityMatrix.filter(row => row.state === setup.state)) spec.rowProbeMap.find(item => item.rowId === row.id).probeIds.push(id);
  }
  const requirement = spec.fidelity.requirements[0];
  const pairGroup = structuredClone(spec.fidelity.interactionGroups[0]);
  pairGroup.id = "state-layout-theme-pairs"; pairGroup.strength = 2;
  pairGroup.reason = "Check all pair interactions separately from the required triples";
  spec.fidelity.interactionGroups.push(pairGroup);
  requirement.interactionGroupIds.push(pairGroup.id);
  const risk = contract.parityMatrix.find(row => row.state === "error" && row.viewport === "390x844" && row.theme === "dark");
  spec.coverage.riskRows = [{ id: "error-mobile-dark", targetId: "main", state: risk.state, viewport: risk.viewport, theme: risk.theme, interaction: "error-layout-theme", reason: "Error copy must remain legible on narrow dark layouts", requiredProbeIds: ["state-error", "overflow"], expected: "visible error with no horizontal overflow" }];
  spec.fidelity.visualChecks = [0, 3, 5, 6].map(index => ({ id: `visual-${index}`, requirementIds: ["REQ-01"], rowId: contract.parityMatrix[index].id, probeId: "image", criteria: ["文字と状態表示が正しく鮮明である", "配置と余白が参照画面に一致する", "色とコントラストが一致し、はみ出しがない"] }));
  requirement.visualCheckIds = spec.fidelity.visualChecks.map(item => item.id);
  for (const [id, selector] of [["saved-value", "#saved"], ["site-value", "#site"]]) {
    spec.probes.push({ id, kind: "text", mode: "equal", required: true, tier: "anchor", productionSelector: selector, prototypeSelector: selector, options: { normalizeWhitespace: true } });
    spec.fidelity.phaseComparisons.push({ probeId: id, smoke: "equal", final: "equal", expected: null });
  }
  const value = async text => ({ sha256: await sha256Digest(`parity:text:v1\0${text}`), bytes: new TextEncoder().encode(text).byteLength });
  const steps = [];
  const add = async (action, saved, site) => steps.push({ action, assertions: [{ probeId: "saved-value", expected: await value(saved) }, { probeId: "site-value", expected: await value(site) }] });
  await add({ type: "click", selector: "#site-lg" }, "initial-lg", "lg");
  await add({ type: "fill", selector: "#value", value: "verified-lg" }, "initial-lg", "lg");
  await add({ type: "click", selector: "#save" }, "verified-lg", "lg");
  await add({ type: "reload" }, "verified-lg", "lg");
  await add({ type: "click", selector: "#site-univ" }, "initial-univ", "univ");
  await add({ type: "fill", selector: "#value", value: "verified-univ" }, "initial-univ", "univ");
  await add({ type: "click", selector: "#save" }, "verified-univ", "univ");
  await add({ type: "reload" }, "verified-lg", "lg");
  await add({ type: "click", selector: "#site-univ" }, "verified-univ", "univ");
  await add({ type: "click", selector: "#site-lg" }, "verified-lg", "lg");
  // Restore managed values, preserving independence of subsequent acceptance runs.
  await add({ type: "fill", selector: "#value", value: "initial-lg" }, "verified-lg", "lg");
  await add({ type: "click", selector: "#save" }, "initial-lg", "lg");
  await add({ type: "click", selector: "#site-univ" }, "verified-univ", "univ");
  await add({ type: "fill", selector: "#value", value: "initial-univ" }, "verified-univ", "univ");
  await add({ type: "click", selector: "#save" }, "initial-univ", "univ");
  await add({ type: "reload" }, "initial-lg", "lg");
  spec.fidelity.runtimeChecks = [{ id: "save-reload-isolation", requirementIds: ["REQ-01"], rowId: contract.parityMatrix.at(-1).id, query: {}, persistence: true, steps }];
  spec.rowProbeMap.at(-1).probeIds.push("saved-value", "site-value");
  requirement.runtimeCheckIds = ["save-reload-isolation"];
  spec.fidelity.staticChecks = [{ id: "types", command: "npm run typecheck", scope: ["test/fixtures/parity-fidelity.mjs"] }];
  return { contract, spec };
}

export function successfulAuditFixture() {
  const { contract, spec } = createFidelityFixture();
  const digest = `sha256:${"a".repeat(64)}`;
  const binding = { goalSha256: digest, prototypeRevision: digest, validationProfileDigest: digest, sources: [{ path: "src/ui.ts", sha256: digest }] };
  const rows = contract.parityMatrix.map(row => ({ rowId: row.id, status: "pass", probes: spec.probes.map(probe => ({ probeId: probe.id, status: "pass" })), runtimeChecks: [] }));
  const artifactIndex = spec.fidelity.visualChecks.flatMap((item, i) => ["production", "prototype"].map(surface => ({ rowId: item.rowId, probeId: item.probeId, surface, kind: "screenshot", bytes: 1000, sha256: `sha256:${String(i + 1).repeat(64)}` })));
  const audit = {
    binding, staticChecks: [{ id: "types", command: "npm run typecheck", scope: ["src/ui.ts"], exitCode: 0, logDigest: digest }],
    requirements: [{ id: "REQ-01", status: "pass", evidenceIds: ["copy", "visual-light", "visual-dark", "types", "state-layout-theme"], note: "each expected result inspected" }],
    visualChecks: spec.fidelity.visualChecks.map(item => ({ id: item.id, status: "pass", contentVerified: true, artifactDigests: artifactIndex.filter(a => a.rowId === item.rowId).map(a => a.sha256), criteriaResults: item.criteria.map(criterion => ({ criterion, status: "pass", note: "Both surfaces inspected; heading and controls aligned and legible." })) })),
  };
  return { contract, spec, audit, evidence: { ...binding, rows, artifactIndex } };
}
