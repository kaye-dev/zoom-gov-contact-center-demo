const phases = new Set(["smoke", "pre-edit", "affected", "final"]);
const fullMatrixPhases = new Set(["pre-edit", "final"]);
const matrixScopes = new Set(["targeted", "coverage", "full"]);
const legacyMatrixScopes = new Set(["targeted", "full"]);
const coverageMatrixScopes = new Set(["coverage", "full"]);
const fullExecutionContexts = new Set(["release", "ci", "scheduled", "explicit"]);
const actionTypes = new Set([
  "click",
  "press",
  "focus",
  "fill",
  "waitForVisible",
  "waitForHidden",
]);
const probeKinds = new Set([
  "screenshot",
  "dom",
  "accessibility",
  "visibility",
  "text",
  "attribute",
  "computedStyle",
  "geometry",
  "focus",
  "keyboard",
  "console",
  "network",
  "route",
  "setup",
  "state",
  "viewport",
  "theme",
  "control",
  "overflow",
]);
const coverageProbeKinds = new Set([
  "route",
  "setup",
  "state",
  "viewport",
  "theme",
  "control",
  "overflow",
  "console",
]);
const anchorProbeKinds = new Set([
  "screenshot",
  "dom",
  "accessibility",
  "computedStyle",
  "geometry",
  "focus",
  "keyboard",
  "network",
]);
const probeTiers = new Set(["coverage", "anchor"]);
const probeModes = new Set(["equal", "different"]);
const riskTags = new Set([
  "normal",
  "theme",
  "semantic-token",
  "native-control",
  "responsive",
  "shell",
  "navigation",
  "layout",
  "dialog",
  "menu",
  "keyboard",
  "focus",
]);
const themeRiskTags = new Set(["theme", "semantic-token", "native-control"]);
const responsiveRiskTags = new Set(["responsive", "shell", "navigation", "layout"]);
const requiredAdapterMethods = [
  "activateTab",
  "activeTabId",
  "setViewport",
  "measureViewport",
  "navigate",
  "setTheme",
  "runAction",
  "runProbe",
  "measureScroll",
];
const scrollSource = "window.scrollX/window.scrollY";
const browserSetupTypes = new Set(["query", "aria-switch", "fixed"]);
const safeQueryParameter = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const safeQueryValue = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const safeFixtureValue = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const sensitiveQueryParameter = /(?:auth(?:orization)?|cookie|credential|key|password|secret|session|token)/iu;

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, keys, label) {
  ensure(isPlainObject(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  ensure(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} must contain exactly: ${expected.join(", ")}`,
  );
}

function requireNonEmptyString(value, label) {
  ensure(typeof value === "string" && value.trim() !== "", `${label} must be a non-empty string`);
  return value;
}

function requireBoolean(value, label) {
  ensure(typeof value === "boolean", `${label} must be a boolean`);
  return value;
}

function requireUniqueStrings(value, label, { allowEmpty = false } = {}) {
  ensure(
    Array.isArray(value) && (allowEmpty || value.length > 0),
    `${label} must be ${allowEmpty ? "an" : "a non-empty"} array`,
  );
  const strings = value.map((item, index) => requireNonEmptyString(item, `${label}[${index}]`));
  ensure(new Set(strings).size === strings.length, `${label} must not contain duplicates`);
  return strings;
}

function requireQuery(value, label) {
  ensure(isPlainObject(value), `${label} must be an object`);
  for (const [key, item] of Object.entries(value)) {
    ensure(safeQueryParameter.test(key), `${label}.${key} is not a safe query parameter`);
    ensure(!sensitiveQueryParameter.test(key), `${label}.${key} uses a sensitive query parameter`);
    ensure(typeof item === "string" && safeQueryValue.test(item), `${label}.${key} is not a safe fixture value`);
    ensure(
      !/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(item.trim()),
      `${label}.${key} must not contain an external or protocol URL`,
    );
  }
}

function validateAction(action, label) {
  ensure(isPlainObject(action), `${label} must be an object`);
  requireNonEmptyString(action.type, `${label}.type`);
  ensure(actionTypes.has(action.type), `${label}.type is not allowed: ${action.type}`);
  if (["click", "focus", "waitForVisible", "waitForHidden"].includes(action.type)) {
    requireExactKeys(action, ["type", "selector"], label);
    requireNonEmptyString(action.selector, `${label}.selector`);
    return;
  }
  if (action.type === "press") {
    requireExactKeys(action, ["type", "selector", "key"], label);
    requireNonEmptyString(action.selector, `${label}.selector`);
    requireNonEmptyString(action.key, `${label}.key`);
    return;
  }
  requireExactKeys(action, ["type", "selector", "value"], label);
  requireNonEmptyString(action.selector, `${label}.selector`);
  ensure(
    typeof action.value === "string" && safeFixtureValue.test(action.value),
    `${label}.value must be a bounded synthetic fixture token`,
  );
}

function validateSurfaceSetup(surface, label) {
  requireExactKeys(surface, ["query", "actions"], label);
  requireQuery(surface.query, `${label}.query`);
  ensure(Array.isArray(surface.actions), `${label}.actions must be an array`);
  surface.actions.forEach((action, index) => validateAction(action, `${label}.actions[${index}]`));
}

function validateBrowserThemeSetup(setup, label, themes) {
  ensure(isPlainObject(setup), `${label} must be an object`);
  requireNonEmptyString(setup.type, `${label}.type`);
  ensure(browserSetupTypes.has(setup.type), `${label}.type is not allowed: ${setup.type}`);
  if (setup.type === "query") {
    requireExactKeys(setup, ["type", "parameter"], label);
    ensure(safeQueryParameter.test(setup.parameter), `${label}.parameter is not a safe query parameter`);
    ensure(!sensitiveQueryParameter.test(setup.parameter), `${label}.parameter is sensitive`);
    return;
  }
  if (setup.type === "aria-switch") {
    requireExactKeys(setup, ["type", "selector", "checkedTheme", "readbackSelector"], label);
    requireNonEmptyString(setup.selector, `${label}.selector`);
    requireNonEmptyString(setup.readbackSelector, `${label}.readbackSelector`);
    ensure(themes.length === 2, `${label} requires exactly two declared themes`);
    ensure(themes.includes(setup.checkedTheme), `${label}.checkedTheme is not declared by ui-contract.json`);
    return;
  }
  requireExactKeys(setup, ["type", "theme"], label);
  ensure(themes.includes(setup.theme), `${label}.theme is not declared by ui-contract.json`);
}

function validateBrowserSetups(browserSetups, contract) {
  ensure(Array.isArray(browserSetups), "parity-spec.json browserSetups must be an array");
  const targetIds = contract.comparisonTargets.map(({ id }) => id);
  const themes = requireUniqueStrings(contract.comparisonConditions.themes, "ui-contract.json themes");
  const seen = new Set();
  for (const [index, browserSetup] of browserSetups.entries()) {
    const label = `browserSetups[${index}]`;
    requireExactKeys(browserSetup, ["targetId", "production", "prototype"], label);
    const targetId = requireNonEmptyString(browserSetup.targetId, `${label}.targetId`);
    ensure(targetIds.includes(targetId), `${label}.targetId is not declared by ui-contract.json`);
    ensure(!seen.has(targetId), "browserSetups target IDs must be unique");
    seen.add(targetId);
    validateBrowserThemeSetup(browserSetup.production, `${label}.production`, themes);
    validateBrowserThemeSetup(browserSetup.prototype, `${label}.prototype`, themes);
    const targetThemes = new Set(
      contract.parityMatrix.filter((row) => row.targetId === targetId).map((row) => row.theme),
    );
    for (const surface of ["production", "prototype"]) {
      const surfaceSetup = browserSetup[surface];
      if (surfaceSetup.type === "fixed") {
        ensure(
          targetThemes.size === 1 && targetThemes.has(surfaceSetup.theme),
          `${label}.${surface} fixed theme does not cover the target matrix`,
        );
      }
    }
  }
  ensure(
    JSON.stringify([...seen].sort()) === JSON.stringify([...targetIds].sort()),
    "browserSetups must cover every ui-contract.json comparison target exactly once",
  );
}

function validateProbeOptions(probe, label) {
  const options = probe.options;
  switch (probe.kind) {
    case "visibility":
      requireExactKeys(options, ["expected"], `${label}.options`);
      ensure(
        options.expected === "visible" || options.expected === "hidden",
        `${label}.options.expected must be visible or hidden`,
      );
      break;
    case "text":
      requireExactKeys(options, ["normalizeWhitespace"], `${label}.options`);
      requireBoolean(options.normalizeWhitespace, `${label}.options.normalizeWhitespace`);
      break;
    case "attribute":
      requireExactKeys(options, ["name"], `${label}.options`);
      requireNonEmptyString(options.name, `${label}.options.name`);
      break;
    case "computedStyle":
      requireExactKeys(options, ["properties"], `${label}.options`);
      requireUniqueStrings(options.properties, `${label}.options.properties`);
      break;
    case "geometry":
      requireExactKeys(options, ["tolerancePx"], `${label}.options`);
      ensure(
        typeof options.tolerancePx === "number" &&
          Number.isFinite(options.tolerancePx) &&
          options.tolerancePx >= 0,
        `${label}.options.tolerancePx must be a non-negative finite number`,
      );
      break;
    case "keyboard":
      requireExactKeys(options, ["key"], `${label}.options`);
      requireNonEmptyString(options.key, `${label}.options.key`);
      break;
    case "state":
      requireExactKeys(options, ["expected"], `${label}.options`);
      ensure(
        options.expected === "visible" || options.expected === "hidden",
        `${label}.options.expected must be visible or hidden`,
      );
      break;
    case "control":
      requireExactKeys(options, ["expected"], `${label}.options`);
      ensure(
        ["enabled", "disabled", "visible", "hidden"].includes(options.expected),
        `${label}.options.expected must be enabled, disabled, visible, or hidden`,
      );
      break;
    case "theme":
      requireExactKeys(options, ["rootClass", "colorScheme"], `${label}.options`);
      requireNonEmptyString(options.rootClass, `${label}.options.rootClass`);
      ensure(
        options.colorScheme === "row-theme",
        `${label}.options.colorScheme must be row-theme`,
      );
      break;
    case "overflow":
      requireExactKeys(options, ["tolerancePx"], `${label}.options`);
      ensure(
        typeof options.tolerancePx === "number" &&
          Number.isFinite(options.tolerancePx) &&
          options.tolerancePx >= 0,
        `${label}.options.tolerancePx must be a non-negative finite number`,
      );
      break;
    default:
      requireExactKeys(options, [], `${label}.options`);
  }
}

function rowCoordinate(row) {
  return JSON.stringify([row.targetId, row.state, row.viewport, row.theme]);
}

function validateCoverageProfile(spec, contract, { probeById, probeIdsByRow, setupTuples }) {
  requireExactKeys(
    spec.coverage,
    ["targetOrder", "viewportOrder", "themeOrder", "anchorRows", "riskRows"],
    "parity-spec.json coverage",
  );
  const targetIds = contract.comparisonTargets.map(({ id }) => id);
  const viewports = contract.comparisonConditions.viewports;
  const themes = contract.comparisonConditions.themes;
  ensure(
    JSON.stringify(requireUniqueStrings(spec.coverage.targetOrder, "coverage.targetOrder")) ===
      JSON.stringify(targetIds),
    "coverage.targetOrder must match ui-contract.json comparison target order",
  );
  ensure(
    JSON.stringify(requireUniqueStrings(spec.coverage.viewportOrder, "coverage.viewportOrder")) ===
      JSON.stringify(viewports),
    "coverage.viewportOrder must match ui-contract.json viewport order",
  );
  ensure(
    JSON.stringify(requireUniqueStrings(spec.coverage.themeOrder, "coverage.themeOrder")) ===
      JSON.stringify(themes),
    "coverage.themeOrder must match ui-contract.json theme order",
  );

  const rowById = new Map(contract.parityMatrix.map((row) => [row.id, row]));
  const rowByCoordinate = new Map(contract.parityMatrix.map((row) => [rowCoordinate(row), row]));
  ensure(rowByCoordinate.size === contract.parityMatrix.length, "ui-contract.json parityMatrix coordinates must be unique");
  ensure(Array.isArray(spec.coverage.anchorRows), "coverage.anchorRows must be an array");
  const anchorsByTarget = new Map(targetIds.map((targetId) => [targetId, 0]));
  const anchorIds = new Set();
  for (const [index, anchor] of spec.coverage.anchorRows.entries()) {
    const label = `coverage.anchorRows[${index}]`;
    requireExactKeys(anchor, ["id", "targetId", "rowId", "reason"], label);
    const id = requireNonEmptyString(anchor.id, `${label}.id`);
    ensure(!anchorIds.has(id), "coverage anchor IDs must be unique");
    anchorIds.add(id);
    const targetId = requireNonEmptyString(anchor.targetId, `${label}.targetId`);
    ensure(anchorsByTarget.has(targetId), `${label}.targetId is not declared`);
    const row = rowById.get(requireNonEmptyString(anchor.rowId, `${label}.rowId`));
    ensure(row?.targetId === targetId, `${label}.rowId must belong to targetId`);
    requireNonEmptyString(anchor.reason, `${label}.reason`);
    ensure(
      (probeIdsByRow.get(row.id) ?? []).some((probeId) => probeById.get(probeId)?.tier === "anchor"),
      `${label}.rowId must map at least one anchor probe`,
    );
    anchorsByTarget.set(targetId, anchorsByTarget.get(targetId) + 1);
  }
  for (const [targetId, count] of anchorsByTarget) {
    ensure(count > 0, `coverage.anchorRows must include target ${targetId}`);
  }

  ensure(Array.isArray(spec.coverage.riskRows), "coverage.riskRows must be an array");
  const riskIds = new Set();
  for (const [index, risk] of spec.coverage.riskRows.entries()) {
    const label = `coverage.riskRows[${index}]`;
    requireExactKeys(
      risk,
      ["id", "targetId", "state", "viewport", "theme", "interaction", "reason", "requiredProbeIds", "expected"],
      label,
    );
    const id = requireNonEmptyString(risk.id, `${label}.id`);
    ensure(!riskIds.has(id), "coverage risk IDs must be unique");
    riskIds.add(id);
    const coordinate = JSON.stringify([
      requireNonEmptyString(risk.targetId, `${label}.targetId`),
      requireNonEmptyString(risk.state, `${label}.state`),
      requireNonEmptyString(risk.viewport, `${label}.viewport`),
      requireNonEmptyString(risk.theme, `${label}.theme`),
    ]);
    const row = rowByCoordinate.get(coordinate);
    ensure(row, `${label} does not resolve to a ui-contract.json parity row`);
    requireNonEmptyString(risk.interaction, `${label}.interaction`);
    requireNonEmptyString(risk.reason, `${label}.reason`);
    requireNonEmptyString(risk.expected, `${label}.expected`);
    const mappedProbeIds = new Set(probeIdsByRow.get(row.id) ?? []);
    for (const probeId of requireUniqueStrings(risk.requiredProbeIds, `${label}.requiredProbeIds`)) {
      const probe = probeById.get(probeId);
      ensure(probe?.required === true, `${label} references a non-required probe: ${probeId}`);
      ensure(mappedProbeIds.has(probeId), `${label} probe is not mapped to its row: ${probeId}`);
    }
  }

  requireExactKeys(spec.batchPolicy, ["maxRows", "maxBytes", "summaryMaxBytes"], "parity-spec.json batchPolicy");
  for (const field of ["maxRows", "maxBytes", "summaryMaxBytes"]) {
    ensure(
      Number.isInteger(spec.batchPolicy[field]) && spec.batchPolicy[field] > 0,
      `batchPolicy.${field} must be a positive integer`,
    );
  }
  requireExactKeys(spec.artifactPolicy, ["kinds", "maxBytes", "retainOnFailure"], "parity-spec.json artifactPolicy");
  const artifactKinds = requireUniqueStrings(spec.artifactPolicy.kinds, "artifactPolicy.kinds");
  ensure(
    artifactKinds.every((kind) => ["screenshot", "dom", "accessibility"].includes(kind)),
    "artifactPolicy.kinds contains an unsupported artifact kind",
  );
  ensure(
    Number.isInteger(spec.artifactPolicy.maxBytes) && spec.artifactPolicy.maxBytes > 0,
    "artifactPolicy.maxBytes must be a positive integer",
  );
  requireBoolean(spec.artifactPolicy.retainOnFailure, "artifactPolicy.retainOnFailure");

  ensure(Array.isArray(spec.sourceImpactMap), "parity-spec.json sourceImpactMap must be an array");
  const sourceEntries = new Map();
  for (const [index, impact] of spec.sourceImpactMap.entries()) {
    const label = `sourceImpactMap[${index}]`;
    requireExactKeys(impact, ["source", "scope", "targetIds"], label);
    const source = requireNonEmptyString(impact.source, `${label}.source`);
    ensure(!sourceEntries.has(source), "sourceImpactMap sources must be unique");
    ensure(contract.productionBaseline.sources.includes(source), `${label}.source is not in productionBaseline.sources`);
    ensure(["target", "shared", "global"].includes(impact.scope), `${label}.scope is invalid`);
    const impactedTargets = requireUniqueStrings(impact.targetIds, `${label}.targetIds`, {
      allowEmpty: impact.scope === "global",
    });
    ensure(impactedTargets.every((targetId) => targetIds.includes(targetId)), `${label}.targetIds contains an unknown target`);
    if (impact.scope === "global") ensure(impactedTargets.length === 0, `${label}.targetIds must be empty for global scope`);
    sourceEntries.set(source, impact);
  }
  ensure(
    JSON.stringify([...sourceEntries.keys()].sort()) === JSON.stringify([...contract.productionBaseline.sources].sort()),
    "sourceImpactMap must cover every productionBaseline source exactly once",
  );

  for (const tuple of setupTuples) {
    const [targetId, state] = JSON.parse(tuple);
    const setup = spec.stateSetups.find((item) => item.targetId === targetId && item.state === state);
    const assertionIds = requireUniqueStrings(setup.assertionProbeIds, `stateSetups ${targetId}/${state}.assertionProbeIds`);
    for (const probeId of assertionIds) {
      const probe = probeById.get(probeId);
      ensure(probe?.required === true && probe.tier === "coverage", `state assertion must reference a required coverage probe: ${probeId}`);
    }
  }
}

function validateParitySpec(spec, contract) {
  ensure(isPlainObject(spec), "parity-spec.json must be an object");
  ensure([1, 2, 3].includes(spec.version), "parity-spec.json version must be 1, 2, or 3");
  requireExactKeys(
    spec,
    [
      "version",
      "stateSetups",
      "probes",
      "rowProbeMap",
      ...([2, 3].includes(spec.version) ? ["browserSetups"] : []),
      ...(spec.version === 3 ? ["coverage", "sourceImpactMap", "batchPolicy", "artifactPolicy"] : []),
    ],
    "parity-spec.json",
  );
  ensure(isPlainObject(contract), "ui-contract.json must contain an object");
  ensure(Array.isArray(contract.comparisonTargets), "ui-contract.json comparisonTargets must be an array");
  ensure(Array.isArray(contract.parityMatrix), "ui-contract.json parityMatrix must be an array");

  const targetIds = new Set(contract.comparisonTargets.map(({ id }) => id));
  const requiredTargetStates = new Set(
    contract.parityMatrix.map(({ targetId, state }) => JSON.stringify([targetId, state])),
  );
  ensure(Array.isArray(spec.stateSetups), "parity-spec.json stateSetups must be an array");
  const setupTuples = new Set();
  for (const [index, setup] of spec.stateSetups.entries()) {
    const label = `stateSetups[${index}]`;
    requireExactKeys(
      setup,
      ["targetId", "state", "production", "prototype", ...(spec.version === 3 ? ["assertionProbeIds"] : [])],
      label,
    );
    requireNonEmptyString(setup.targetId, `${label}.targetId`);
    requireNonEmptyString(setup.state, `${label}.state`);
    ensure(targetIds.has(setup.targetId), `${label}.targetId is not declared by ui-contract.json`);
    validateSurfaceSetup(setup.production, `${label}.production`);
    validateSurfaceSetup(setup.prototype, `${label}.prototype`);
    const tuple = JSON.stringify([setup.targetId, setup.state]);
    ensure(!setupTuples.has(tuple), "stateSetups target/state pairs must be unique");
    setupTuples.add(tuple);
  }
  ensure(
    JSON.stringify([...setupTuples].sort()) === JSON.stringify([...requiredTargetStates].sort()),
    "stateSetups must cover every ui-contract.json target/state pair exactly once",
  );

  ensure(Array.isArray(spec.probes) && spec.probes.length > 0, "parity-spec.json probes must be a non-empty array");
  const probeIds = new Set();
  const probeById = new Map();
  for (const [index, probe] of spec.probes.entries()) {
    const label = `probes[${index}]`;
    requireExactKeys(
      probe,
      [
        "id",
        "kind",
        "mode",
        "productionSelector",
        "prototypeSelector",
        "required",
        "options",
        ...(spec.version === 3 ? ["tier"] : []),
      ],
      label,
    );
    const id = requireNonEmptyString(probe.id, `${label}.id`);
    ensure(!probeIds.has(id), "probe IDs must be unique");
    probeIds.add(id);
    probeById.set(id, probe);
    ensure(probeKinds.has(probe.kind), `${label}.kind is not allowed: ${probe.kind}`);
    ensure(probeModes.has(probe.mode), `${label}.mode must be equal or different`);
    requireNonEmptyString(probe.productionSelector, `${label}.productionSelector`);
    requireNonEmptyString(probe.prototypeSelector, `${label}.prototypeSelector`);
    requireBoolean(probe.required, `${label}.required`);
    if (spec.version === 3) {
      ensure(probeTiers.has(probe.tier), `${label}.tier must be coverage or anchor`);
      if (probe.tier === "coverage") {
        ensure(coverageProbeKinds.has(probe.kind), `${label}.kind is not allowed for coverage tier`);
        ensure(probe.required === true, `${label} coverage probes must be required`);
      } else {
        ensure(anchorProbeKinds.has(probe.kind), `${label}.kind is not allowed for anchor tier`);
      }
    }
    validateProbeOptions(probe, label);
  }

  ensure(Array.isArray(spec.rowProbeMap), "parity-spec.json rowProbeMap must be an array");
  const contractRowIds = contract.parityMatrix.map(({ id }) => id);
  const mappedRowIds = new Set();
  const usedProbeIds = new Set();
  const probeIdsByRow = new Map();
  for (const [index, mapping] of spec.rowProbeMap.entries()) {
    const label = `rowProbeMap[${index}]`;
    requireExactKeys(mapping, ["rowId", "probeIds"], label);
    const rowId = requireNonEmptyString(mapping.rowId, `${label}.rowId`);
    ensure(contractRowIds.includes(rowId), `${label}.rowId is not declared by ui-contract.json`);
    ensure(!mappedRowIds.has(rowId), "rowProbeMap row IDs must be unique");
    mappedRowIds.add(rowId);
    const mappedProbeIds = requireUniqueStrings(mapping.probeIds, `${label}.probeIds`);
    probeIdsByRow.set(rowId, mappedProbeIds);
    for (const probeId of mappedProbeIds) {
      ensure(probeIds.has(probeId), `${label} references an unknown probe: ${probeId}`);
      usedProbeIds.add(probeId);
    }
  }
  ensure(
    JSON.stringify([...mappedRowIds].sort()) === JSON.stringify([...contractRowIds].sort()),
    "rowProbeMap must cover every ui-contract.json parity row exactly once",
  );
  ensure(
    JSON.stringify([...usedProbeIds].sort()) === JSON.stringify([...probeIds].sort()),
    "every probe must be used by rowProbeMap",
  );
  if ([2, 3].includes(spec.version)) validateBrowserSetups(spec.browserSetups, contract);
  if (spec.version === 3) {
    for (const [rowId, mappedProbeIds] of probeIdsByRow) {
      const mappedKinds = new Set(
        mappedProbeIds
          .map((probeId) => probeById.get(probeId))
          .filter((probe) => probe?.tier === "coverage")
          .map(({ kind }) => kind),
      );
      for (const kind of coverageProbeKinds) {
        ensure(mappedKinds.has(kind), `rowProbeMap ${rowId} is missing required coverage probe kind: ${kind}`);
      }
    }
    validateCoverageProfile(spec, contract, { probeById, probeIdsByRow, setupTuples });
  }
  return spec;
}

function parseViewport(viewport) {
  const match = /^(\d+)x(\d+)$/u.exec(viewport);
  ensure(match, `invalid viewport: ${viewport}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function selectedScope(contract, changedTargetIds, changedStates) {
  const declaredTargets = contract.comparisonTargets.map(({ id }) => id);
  const declaredStates = [...new Set(contract.parityMatrix.map(({ state }) => state))];
  const targets = changedTargetIds.length > 0 ? changedTargetIds : declaredTargets.slice(0, 1);
  const states = changedStates.length > 0 ? changedStates : declaredStates.slice(0, 1);
  for (const target of targets) ensure(declaredTargets.includes(target), `unknown changed target: ${target}`);
  for (const state of states) ensure(declaredStates.includes(state), `unknown changed state: ${state}`);
  return { targets: new Set(targets), states: new Set(states) };
}

function coverageRows(contract, spec) {
  ensure(spec?.version === 3, "coverage matrix scope requires parity-spec.json version 3");
  validateParitySpec(spec, contract);
  const rowByCoordinate = new Map(contract.parityMatrix.map((row) => [rowCoordinate(row), row]));
  const selected = [];
  const selectedIds = new Set();
  const addRow = (row, label) => {
    ensure(row, `${label} does not resolve to a parity row`);
    if (selectedIds.has(row.id)) return;
    selectedIds.add(row.id);
    selected.push(row);
  };
  for (const targetId of spec.coverage.targetOrder) {
    const targetRows = contract.parityMatrix.filter((row) => row.targetId === targetId);
    const states = [...new Set(targetRows.map(({ state }) => state))];
    const viewports = spec.coverage.viewportOrder;
    const themes = spec.coverage.themeOrder;
    const baseRowCount = Math.max(states.length, viewports.length, themes.length);
    for (let index = 0; index < baseRowCount; index += 1) {
      const coordinate = JSON.stringify([
        targetId,
        states[index % states.length],
        viewports[index % viewports.length],
        themes[index % themes.length],
      ]);
      addRow(rowByCoordinate.get(coordinate), `coverage row ${targetId}/${index}`);
    }
  }
  for (const risk of spec.coverage.riskRows) {
    addRow(
      rowByCoordinate.get(JSON.stringify([risk.targetId, risk.state, risk.viewport, risk.theme])),
      `risk row ${risk.id}`,
    );
  }
  const rowById = new Map(contract.parityMatrix.map((row) => [row.id, row]));
  for (const anchor of spec.coverage.anchorRows) addRow(rowById.get(anchor.rowId), `anchor row ${anchor.id}`);
  return selected;
}

function coverageSelectionMetadata(spec, rows) {
  const selectedIds = new Set(rows.map(({ id }) => id));
  return {
    exactRowIds: rows.map(({ id }) => id),
    riskRowIds: spec.coverage.riskRows
      .map((risk) => ({
        id: risk.id,
        rowId: rows.find((row) =>
          row.targetId === risk.targetId &&
          row.state === risk.state &&
          row.viewport === risk.viewport &&
          row.theme === risk.theme)?.id,
      }))
      .filter(({ rowId }) => selectedIds.has(rowId)),
    anchorRowIds: spec.coverage.anchorRows
      .filter(({ rowId }) => selectedIds.has(rowId))
      .map(({ id, rowId, targetId }) => ({ id, rowId, targetId })),
  };
}

function createCoverageReport(contract, rows) {
  const selected = new Set(rows.map(rowCoordinate));
  const targetStates = [];
  const targetViewports = [];
  const targetThemes = [];
  for (const { id: targetId } of contract.comparisonTargets) {
    const targetRows = contract.parityMatrix.filter((row) => row.targetId === targetId);
    for (const state of [...new Set(targetRows.map((row) => row.state))]) {
      targetStates.push({
        targetId,
        state,
        covered: targetRows.some((row) => row.state === state && selected.has(rowCoordinate(row))),
      });
    }
    for (const viewport of contract.comparisonConditions.viewports) {
      targetViewports.push({
        targetId,
        viewport,
        covered: targetRows.some((row) => row.viewport === viewport && selected.has(rowCoordinate(row))),
      });
    }
    for (const theme of contract.comparisonConditions.themes) {
      targetThemes.push({
        targetId,
        theme,
        covered: targetRows.some((row) => row.theme === theme && selected.has(rowCoordinate(row))),
      });
    }
  }
  const missing = {
    targetStates: targetStates.filter(({ covered }) => !covered).map(({ targetId, state }) => `${targetId}/${state}`),
    targetViewports: targetViewports.filter(({ covered }) => !covered).map(({ targetId, viewport }) => `${targetId}/${viewport}`),
    targetThemes: targetThemes.filter(({ covered }) => !covered).map(({ targetId, theme }) => `${targetId}/${theme}`),
  };
  return {
    targetStates,
    targetViewports,
    targetThemes,
    missing,
    status: Object.values(missing).every((values) => values.length === 0) ? "pass" : "fail",
  };
}

function resolveInvalidationTargets({ spec, contract, scope, targetIds = [], source }) {
  ensure(spec?.version === 3, "invalidation requires parity-spec.json version 3");
  const declaredTargets = contract.comparisonTargets.map(({ id }) => id);
  if (scope === "global") return { targetIds: declaredTargets, failClosed: false };
  if (scope === "target") {
    const selected = requireUniqueStrings(targetIds, "invalidation targetIds");
    ensure(selected.every((targetId) => declaredTargets.includes(targetId)), "invalidation contains an unknown target");
    return { targetIds: selected, failClosed: false };
  }
  ensure(scope === "shared", "invalidation scope must be target, shared, or global");
  requireNonEmptyString(source, "invalidation source");
  const impact = spec.sourceImpactMap.find((entry) => entry.source === source);
  if (!impact) return { targetIds: declaredTargets, failClosed: true };
  if (impact.scope === "global") return { targetIds: declaredTargets, failClosed: false };
  return { targetIds: impact.targetIds, failClosed: false };
}

function selectRows({
  phase,
  contract,
  spec,
  changedTargetIds = [],
  changedStates = [],
  changedViewports = [],
  risks = ["normal"],
  matrixScope = spec?.version === 3 && phase !== "smoke" ? "coverage" : "targeted",
  executionContext,
}) {
  ensure(phases.has(phase), `phase must be one of: ${[...phases].join(", ")}`);
  ensure(matrixScopes.has(matrixScope), `matrixScope must be one of: ${[...matrixScopes].join(", ")}`);
  if (spec?.version === 3) {
    if (matrixScope === "targeted") {
      ensure(phase === "smoke", "parity-spec.json version 3 targeted scope is allowed only for plan smoke");
    } else {
      ensure(coverageMatrixScopes.has(matrixScope), "parity-spec.json version 3 supports coverage or full matrix scope");
    }
    if (matrixScope === "coverage") return coverageRows(contract, spec);
    if (matrixScope === "full") {
      ensure(fullMatrixPhases.has(phase), "full matrix scope is allowed only for pre-edit or final");
      ensure(fullExecutionContexts.has(executionContext), "full matrix scope requires release, ci, scheduled, or explicit execution context");
      return [...contract.parityMatrix];
    }
  }
  ensure(legacyMatrixScopes.has(matrixScope), "targeted selection supports targeted or full matrix scope");
  if (matrixScope === "full") {
    ensure(fullMatrixPhases.has(phase), "full matrix scope is allowed only for pre-edit or final");
    return [...contract.parityMatrix];
  }
  if (fullMatrixPhases.has(phase)) {
    ensure(
      changedTargetIds.length > 0 && changedStates.length > 0,
      "targeted pre-edit and final require explicit changed target and state selections",
    );
  }
  const normalizedRisks = requireUniqueStrings(risks, "risks");
  for (const risk of normalizedRisks) ensure(riskTags.has(risk), `unknown risk tag: ${risk}`);
  const { targets, states } = selectedScope(contract, changedTargetIds, changedStates);
  const declaredViewports = new Set(contract.comparisonConditions.viewports);
  const viewports = new Set(requireUniqueStrings(changedViewports, "changedViewports", { allowEmpty: true }));
  for (const viewport of viewports) ensure(declaredViewports.has(viewport), `unknown changed viewport: ${viewport}`);
  const scopedRows = contract.parityMatrix.filter(
    ({ targetId, state }) => targets.has(targetId) && states.has(state),
  ).filter(({ viewport }) => viewports.size === 0 || viewports.has(viewport));
  ensure(scopedRows.length > 0, "no parity rows match the changed target/state scope");
  const includeAllThemes = normalizedRisks.some((risk) => themeRiskTags.has(risk));
  const includeAllBreakpoints = normalizedRisks.some((risk) => responsiveRiskTags.has(risk));
  const fallbackTheme = scopedRows.some(({ theme }) => theme === "light") ? "light" : scopedRows[0].theme;
  const selected = scopedRows.filter((row) => includeAllThemes || row.theme === fallbackTheme);
  if (includeAllBreakpoints || viewports.size > 0) return selected;

  const grouped = new Map();
  for (const row of selected) {
    const key = JSON.stringify([row.targetId, row.state, row.theme]);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  const result = new Set();
  for (const rows of grouped.values()) {
    const parsed = rows.map((row) => ({ row, ...parseViewport(row.viewport) }));
    const mobile = parsed.find(({ width, height }) => width === 390 && height === 844);
    if (mobile) result.add(mobile.row.id);
    const desktopRows = parsed.filter(({ width }) => width >= 1024);
    const desktop = (desktopRows.length > 0 ? desktopRows : parsed)
      .sort((left, right) => right.width - left.width || right.height - left.height)[0];
    result.add(desktop.row.id);
  }
  return contract.parityMatrix.filter(({ id }) => result.has(id));
}

function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableNormalize(value[key])]),
  );
}

function stableStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

async function sha256Digest(value, cryptoProvider = globalThis.crypto) {
  ensure(cryptoProvider?.subtle, "Web Crypto SHA-256 is unavailable");
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  ensure(
    ArrayBuffer.isView(bytes) &&
      bytes.BYTES_PER_ELEMENT === 1 &&
      Object.prototype.toString.call(bytes) === "[object Uint8Array]",
    "sha256Digest input must be a string or Uint8Array",
  );
  const digest = new Uint8Array(await cryptoProvider.subtle.digest("SHA-256", bytes));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function createBatches(rows, { maxRows = 4, maxBytes = 128 * 1024, preserveTargetBoundaries = false } = {}) {
  ensure(Array.isArray(rows) && rows.length > 0, "batch rows must be a non-empty array");
  ensure(Number.isInteger(maxRows) && maxRows > 0, "maxRows must be a positive integer");
  ensure(Number.isInteger(maxBytes) && maxBytes > 0, "maxBytes must be a positive integer");
  const batches = [];
  let current = [];
  for (const row of rows) {
    requireNonEmptyString(row?.id, "batch row.id");
    const candidate = [...current, row];
    const byteLength = new TextEncoder().encode(stableStringify(candidate)).byteLength;
    const rowByteLength = new TextEncoder().encode(stableStringify([row])).byteLength;
    if (rowByteLength > maxBytes) {
      throwParityError("PARITY_BATCH_INVALID", `row exceeds the batch byte limit: ${row.id}`);
    }
    if (byteLength > maxBytes && current.length === 0) {
      throwParityError("PARITY_BATCH_INVALID", `row exceeds the batch byte limit: ${row.id}`);
    }
    const crossesTargetBoundary =
      preserveTargetBoundaries && current.length > 0 && current[0].targetId !== row.targetId;
    if (current.length >= maxRows || byteLength > maxBytes || crossesTargetBoundary) {
      batches.push(current);
      current = [row];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches.map((batchRows, index) => ({
    batchId: `batch-${String(index + 1).padStart(4, "0")}`,
    rowIds: batchRows.map(({ id }) => id),
    rows: batchRows,
  }));
}

function createRunContext({
  runId,
  definition,
  phase = "final",
  changedTargetIds = [],
  changedStates = [],
  changedViewports = [],
  risks = ["normal"],
  matrixScope = definition?.spec?.version === 3 ? "coverage" : "targeted",
  executionContext,
  maxRows,
  maxBytes,
}) {
  requireNonEmptyString(runId, "runId");
  validateParitySpec(definition.spec, definition.contract);
  const rows = selectRows({
    phase,
    contract: definition.contract,
    spec: definition.spec,
    changedTargetIds,
    changedStates,
    changedViewports,
    risks,
    matrixScope,
    executionContext,
  });
  const coverageMetadata = definition.spec.version === 3
    ? coverageSelectionMetadata(definition.spec, rows)
    : undefined;
  return {
    runId,
    phase,
    matrixScope,
    selection: definition.spec.version === 3
      ? { executionContext: executionContext ?? "feature", ...coverageMetadata }
      : { changedTargetIds, changedStates, changedViewports, risks },
    rowIds: rows.map(({ id }) => id),
    batches: createBatches(rows, {
      maxRows,
      maxBytes,
      preserveTargetBoundaries: definition.spec.version === 3,
    }),
  };
}

async function runBatch({ batch, executeRow }) {
  requireExactKeys(batch, ["batchId", "rowIds", "rows"], "batch");
  requireNonEmptyString(batch.batchId, "batch.batchId");
  ensure(typeof executeRow === "function", "executeRow must be a function");
  ensure(
    stableStringify(batch.rowIds) === stableStringify(batch.rows.map(({ id }) => id)),
    "batch rowIds do not match rows",
  );
  const rows = [];
  for (const row of batch.rows) rows.push(await executeRow(row));
  return { batchId: batch.batchId, rowIds: [...batch.rowIds], rows };
}

function mergeBatchResults({ expectedRowIds, fragments }) {
  requireUniqueStrings(expectedRowIds, "expectedRowIds");
  ensure(Array.isArray(fragments) && fragments.length > 0, "fragments must be a non-empty array");
  const actual = [];
  const rows = [];
  for (const [index, fragment] of fragments.entries()) {
    requireExactKeys(fragment, ["batchId", "rowIds", "rows"], `fragments[${index}]`);
    requireNonEmptyString(fragment.batchId, `fragments[${index}].batchId`);
    requireUniqueStrings(fragment.rowIds, `fragments[${index}].rowIds`);
    ensure(fragment.rows.length === fragment.rowIds.length, `fragments[${index}] row count mismatch`);
    for (let rowIndex = 0; rowIndex < fragment.rows.length; rowIndex += 1) {
      const row = fragment.rows[rowIndex];
      ensure(row?.rowId === fragment.rowIds[rowIndex], `fragments[${index}] row ordering mismatch`);
      actual.push(row.rowId);
      rows.push(row);
    }
  }
  ensure(new Set(actual).size === actual.length, "batch results contain duplicate rows");
  if (stableStringify(actual) !== stableStringify(expectedRowIds)) {
    throwParityError("PARITY_BATCH_INCOMPLETE", "batch results do not cover the selected rows in order");
  }
  return rows;
}

function isVisibleSnapshot(value) {
  if (!isPlainObject(value)) return Boolean(value);
  if (typeof value.visible === "boolean") return value.visible;
  const style = isPlainObject(value.computedStyle) ? value.computedStyle : {};
  const rect = isPlainObject(value.rect) ? value.rect : {};
  return !(
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    Number(style.opacity) === 0 ||
    Number(rect.width) === 0 ||
    Number(rect.height) === 0
  );
}

function normalizeDomSnapshot(value, { includeHidden = false } = {}) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => includeHidden || !isPlainObject(item) || isVisibleSnapshot(item))
      .map((item) => normalizeDomSnapshot(item, { includeHidden }));
  }
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeDomSnapshot(value[key], { includeHidden })]),
  );
}

function normalizeProbeValue(probe, value) {
  if (probe.kind === "dom" || probe.kind === "accessibility") {
    return normalizeDomSnapshot(value);
  }
  if (probe.kind === "text" && probe.options.normalizeWhitespace && typeof value === "string") {
    return value.replace(/\s+/gu, " ").trim();
  }
  if (probe.kind === "visibility") return isVisibleSnapshot(value) ? "visible" : "hidden";
  return stableNormalize(value);
}

function geometryMatches(left, right, tolerance) {
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  return ["x", "y", "width", "height"].every(
    (key) =>
      typeof left[key] === "number" &&
      typeof right[key] === "number" &&
      Math.abs(left[key] - right[key]) <= tolerance,
  );
}

function compareProbe(probe, productionResult, prototypeResult) {
  if (productionResult?.unsupported || prototypeResult?.unsupported) {
    return {
      status: probe.required ? "fail" : "skipped",
      reason: "probe capability unavailable",
    };
  }
  const production = normalizeProbeValue(probe, productionResult?.value);
  const prototype = normalizeProbeValue(probe, prototypeResult?.value);
  let equal;
  if (probe.kind === "route") {
    equal = production?.matches === true && prototype?.matches === true;
  } else if (probe.kind === "geometry") {
    equal = geometryMatches(production, prototype, probe.options.tolerancePx);
  } else {
    equal = JSON.stringify(production) === JSON.stringify(prototype);
  }
  if (probe.kind === "visibility" && probe.mode === "equal") {
    equal = equal && production === probe.options.expected;
  }
  if (["route", "setup", "state", "viewport", "theme", "control", "overflow", "keyboard"].includes(probe.kind)) {
    equal = equal && production?.matches === true && prototype?.matches === true;
  }
  if (probe.kind === "console") {
    equal = equal && Array.isArray(production) && production.length === 0;
  }
  const passed = probe.mode === "equal" ? equal : !equal;
  return {
    status: passed ? "pass" : "fail",
    production,
    prototype,
    reason: passed ? undefined : `expected ${probe.mode} values`,
  };
}

function appendQuery(url, query) {
  const parsed = new URL(url);
  ensure(["http:", "https:"].includes(parsed.protocol), `parity URL must be HTTP(S): ${url}`);
  ensure(parsed.username === "" && parsed.password === "", "parity URL must not contain credentials");
  for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, value);
  return parsed.toString();
}

function requireLoopbackBaseUrl(value, surface) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${surface} base URL must be an absolute URL`);
  }
  ensure(parsed.protocol === "http:", `${surface} base URL must use HTTP`);
  ensure(parsed.username === "" && parsed.password === "", `${surface} base URL must not contain credentials`);
  ensure(parsed.pathname === "/", `${surface} base URL must use the origin root`);
  ensure(parsed.search === "" && parsed.hash === "", `${surface} base URL must not contain query or fragment`);
  if (surface === "production") {
    const port = Number(parsed.port);
    ensure(
      parsed.hostname === "localhost" &&
        (port === 3000 || (port >= 3100 && port <= 3899)),
      "production base URL must use Local localhost:3000 or an allocated worktree localhost port in 3100-3899",
    );
  } else {
    ensure(parsed.hostname === "127.0.0.1" && parsed.port !== "", "prototype base URL must use 127.0.0.1 with an explicit port");
  }
  return parsed;
}

function targetUrl(baseUrl, row, surface, setup) {
  const relative = surface === "production" ? row.route : row.entry;
  const query = { ...setup.query };
  if (setup.browser?.type === "query") query[setup.browser.parameter] = row.theme;
  return appendQuery(new URL(relative, baseUrl).toString(), query);
}

function evidenceUrl(value) {
  const parsed = new URL(value);
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function requireAdapter(adapter) {
  ensure(isPlainObject(adapter), "browser adapter must be an object");
  for (const method of requiredAdapterMethods) {
    ensure(typeof adapter[method] === "function", `browser adapter is missing ${method}()`);
  }
}

class ParityRunError extends Error {
  constructor(code, message, evidence) {
    if (typeof message !== "string") {
      evidence = message;
      message = code;
      code = "PARITY_RUN_FAILED";
    }
    super(message);
    this.name = "ParityRunError";
    this.code = code;
    this.evidence = evidence;
  }
}

function throwParityError(code, message, evidence) {
  throw new ParityRunError(code, message, evidence);
}

class BrowserParityRunner {
  constructor(adapter) {
    requireAdapter(adapter);
    this.adapter = adapter;
    this.canary = undefined;
    this.operations = 0;
  }

  async call(method, ...args) {
    this.operations += 1;
    try {
      return await this.adapter[method](...args);
    } catch (error) {
      if (error instanceof ParityRunError) throw error;
      throw new ParityRunError(
        "PARITY_UNEXPECTED_ERROR",
        `Unexpected Browser adapter failure during ${method}`,
        { operation: method },
      );
    }
  }

  async assertActiveTab(tabId, label) {
    const active = await this.call("activeTabId");
    if (active !== tabId) {
      throwParityError(
        "PARITY_SELECTED_TAB_DRIFT",
        `${label}: active tab mismatch; expected ${tabId}, received ${active}`,
      );
    }
  }

  async activate(tabId, label) {
    await this.call("activateTab", tabId);
    await this.assertActiveTab(tabId, label);
  }

  async capabilityCanary({ tabId, viewport, dpr, requiresNetwork, url }) {
    if (this.canary) return this.canary;
    await this.activate(tabId, "capability canary");
    if (url) {
      await this.call("navigate", tabId, url);
      await this.assertActiveTab(tabId, "capability canary navigation");
    }
    await this.call("setViewport", tabId, viewport);
    await this.assertActiveTab(tabId, "capability canary viewport");
    const measured = await this.call("measureViewport", tabId);
    if (measured?.width !== viewport.width || measured?.height !== viewport.height) {
      throwParityError(
        "PARITY_VIEWPORT_MISMATCH",
        `capability canary viewport mismatch: expected ${viewport.width}x${viewport.height}`,
      );
    }
    if (measured.dpr !== dpr) {
      throwParityError("PARITY_DPR_MISMATCH", `capability canary DPR mismatch: expected ${dpr}`);
    }
    let networkSource;
    if (requiresNetwork && typeof this.adapter.performanceEntries === "function") {
      try {
        const entries = await this.call("performanceEntries", tabId);
        if (Array.isArray(entries)) networkSource = "performance-resource-timing";
      } catch {
        networkSource = undefined;
      }
    }
    if (!networkSource && requiresNetwork && typeof this.adapter.networkEntries === "function") {
      try {
        const entries = await this.call("networkEntries", tabId);
        if (Array.isArray(entries)) networkSource = "browser-network-log";
      } catch {
        networkSource = undefined;
      }
    }
    if (requiresNetwork && !networkSource) {
      throwParityError(
        "PARITY_REQUIRED_PROBE_UNAVAILABLE",
        "network capability requires PerformanceResourceTiming or browser network logs",
      );
    }
    let screenshot;
    if (typeof this.adapter.screenshotDigest === "function") {
      screenshot = await this.call("screenshotDigest", tabId);
    }
    this.canary = {
      status: "pass",
      tabId,
      viewport: measured,
      networkSource: networkSource ?? "not-required",
      sessionId: this.adapter.sessionId ?? "unknown",
      ...(screenshot ? { screenshot } : {}),
    };
    return this.canary;
  }

  async prepareSurface({ tabId, row, surface, setup, baseUrl, dpr, expectedScroll }) {
    const label = `${row.id}/${surface}`;
    await this.activate(tabId, label);
    const viewport = parseViewport(row.viewport);
    await this.call("setViewport", tabId, viewport);
    await this.assertActiveTab(tabId, `${label} viewport`);
    const measuredViewport = await this.call("measureViewport", tabId);
    ensure(
      measuredViewport?.width === viewport.width && measuredViewport?.height === viewport.height,
      `${label}: viewport was not applied`,
    );
    ensure(measuredViewport.dpr === dpr, `${label}: DPR does not match the contract`);
    const url = targetUrl(baseUrl, row, surface, setup);
    await this.call("navigate", tabId, url);
    await this.assertActiveTab(tabId, `${label} navigation`);
    await this.call("setTheme", tabId, row.theme, {
      targetId: row.targetId,
      surface,
      setup: setup.browser ?? null,
      url,
    });
    for (const action of setup.actions) {
      await this.assertActiveTab(tabId, `${label} action ${action.type}`);
      await this.call("runAction", tabId, action);
    }
    const scroll = await this.call("measureScroll", tabId);
    ensure(
      isPlainObject(scroll) &&
        typeof scroll.x === "number" &&
        Number.isFinite(scroll.x) &&
        typeof scroll.y === "number" &&
        Number.isFinite(scroll.y),
      `${label}: scroll measurement is invalid`,
    );
    ensure(
      scroll.x === expectedScroll.x && scroll.y === expectedScroll.y,
      `${label}: measured scroll does not match ui-contract.json`,
    );
    return {
      url,
      viewport: measuredViewport,
      scroll: { x: scroll.x, y: scroll.y, source: scrollSource },
    };
  }

  async runProbe({ tabId, row, surface, probe, networkSource }) {
    await this.activate(tabId, `${row.id}/${surface}/${probe.id}`);
    try {
      return await this.call("runProbe", tabId, probe, { row, surface, networkSource });
    } catch (error) {
      if (error instanceof ParityRunError) {
        throw new ParityRunError(
          error.code,
          `Browser probe failed with ${error.code}`,
          {
            operation: "runProbe",
            rowId: row.id,
            surface,
            probeId: probe.id,
          },
        );
      }
      throw new ParityRunError(
        "PARITY_UNEXPECTED_ERROR",
        "Unexpected Browser probe failure",
        {
          operation: "runProbe",
          rowId: row.id,
          surface,
          probeId: probe.id,
        },
      );
    }
  }

  async runWithoutCleanup({
    definition,
    phase,
    tabs,
    baseUrls,
    changedTargetIds = [],
    changedStates = [],
    changedViewports = [],
    risks = ["normal"],
    matrixScope,
    executionContext,
    run,
  }) {
    const { contract, spec } = definition;
    const resolvedMatrixScope = matrixScope ?? (spec.version === 3 && phase === "final" ? "coverage" : "targeted");
    ensure(
      phase === "smoke" || phase === "final",
      "new Browser runs support only final-boundary smoke or final phases",
    );
    requireLoopbackBaseUrl(baseUrls.production, "production");
    requireLoopbackBaseUrl(baseUrls.prototype, "prototype");
    if (this.adapter.requiresBrowserSetups === true && ![2, 3].includes(spec.version)) {
      throwParityError(
        "PARITY_BROWSER_SETUP_REQUIRED",
        "in-app Browser execution requires parity-spec.json version 2 or 3 browserSetups",
      );
    }
    const rows = selectRows({
      phase,
      contract,
      spec,
      changedTargetIds,
      changedStates,
      changedViewports,
      risks,
      matrixScope: resolvedMatrixScope,
      executionContext,
    });
    const probeById = new Map(spec.probes.map((probe) => [probe.id, probe]));
    const probeIdsByRow = new Map(spec.rowProbeMap.map(({ rowId, probeIds }) => [rowId, probeIds]));
    const setupByTuple = new Map(
      spec.stateSetups.map((setup) => [JSON.stringify([setup.targetId, setup.state]), setup]),
    );
    const browserSetupByTarget = new Map(
      (spec.browserSetups ?? []).map((setup) => [setup.targetId, setup]),
    );
    const inAppBrowserRun = this.adapter.requiresBrowserSetups === true;
    if (inAppBrowserRun) {
      ensure(
        contract.comparisonConditions.viewports.includes("390x844"),
        "in-app Browser capability canary requires a declared 390x844 viewport",
      );
      if (contract.comparisonConditions.dpr !== 1) {
        throwParityError("PARITY_DPR_MISMATCH", "in-app Browser capability canary requires DPR 1");
      }
    }
    const firstViewport = inAppBrowserRun ? { width: 390, height: 844 } : parseViewport(rows[0].viewport);
    const firstRow = rows[0];
    const firstStateSetup = setupByTuple.get(JSON.stringify([firstRow.targetId, firstRow.state]));
    const firstProductionSetup = {
      ...firstStateSetup.production,
      browser: browserSetupByTarget.get(firstRow.targetId)?.production,
    };
    const canaryUrl = targetUrl(baseUrls.production, firstRow, "production", firstProductionSetup);
    const requiresNetwork = rows.some((row) =>
      probeIdsByRow.get(row.id).some((probeId) => probeById.get(probeId).kind === "network"),
    );
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const canary = await this.capabilityCanary({
      tabId: tabs.production,
      viewport: firstViewport,
      dpr: contract.comparisonConditions.dpr,
      requiresNetwork,
      url: canaryUrl,
    });
    const selection = spec.version === 3
      ? {
          executionContext: executionContext ?? (phase === "smoke" ? "plan-smoke" : "feature"),
          ...coverageSelectionMetadata(spec, rows),
        }
      : { changedTargetIds, changedStates, changedViewports, risks };
    const evidence = {
      schemaVersion: spec.version === 3 ? 4 : 3,
      phase,
      runId: run.runId,
      generatedAt: startedAt,
      goalSha256: run.goalSha256,
      prototypeRevision: definition.prototypeRevision,
      validationProfileDigest: definition.validationProfileDigest,
      matrixScope: resolvedMatrixScope,
      selection,
      runtime: run.runtime,
      sources: run.sources,
      capabilities: canary,
      rows: [],
      metrics: undefined,
      ...(spec.version === 3
        ? {
            coverage: createCoverageReport(contract, rows),
            riskRows: spec.coverage.riskRows.map((risk) => ({
              id: risk.id,
              rowId: selection.riskRowIds.find(({ id }) => id === risk.id)?.rowId,
              requiredProbeIds: risk.requiredProbeIds,
              status: "pending",
            })),
            anchorRows: selection.anchorRowIds.map((anchor) => ({ ...anchor, status: "pending" })),
            checkpoints: { resumed: false, batches: [], invalidations: [] },
            artifactIndex: [],
            cleanup: { status: "pending" },
            automationCoverageStatus: "pending",
            humanVisualApprovalStatus: "pending",
            fullParityStatus: resolvedMatrixScope === "full" ? "pending" : "not-run",
          }
        : {}),
    };

    for (const row of rows) {
      try {
        const setup = setupByTuple.get(JSON.stringify([row.targetId, row.state]));
        const productionConditions = await this.prepareSurface({
          tabId: tabs.production,
          row,
          surface: "production",
          setup: { ...setup.production, browser: browserSetupByTarget.get(row.targetId)?.production },
          baseUrl: baseUrls.production,
          dpr: contract.comparisonConditions.dpr,
          expectedScroll: contract.comparisonConditions.scroll,
        });
        const productionProbeResults = new Map();
        for (const probeId of probeIdsByRow.get(row.id)) {
          productionProbeResults.set(
            probeId,
            await this.runProbe({
              tabId: tabs.production,
              row,
              surface: "production",
              probe: probeById.get(probeId),
              networkSource: canary.networkSource,
            }),
          );
        }
        const prototypeConditions = await this.prepareSurface({
          tabId: tabs.prototype,
          row,
          surface: "prototype",
          setup: { ...setup.prototype, browser: browserSetupByTarget.get(row.targetId)?.prototype },
          baseUrl: baseUrls.prototype,
          dpr: contract.comparisonConditions.dpr,
          expectedScroll: contract.comparisonConditions.scroll,
        });
        const prototypeProbeResults = new Map();
        for (const probeId of probeIdsByRow.get(row.id)) {
          prototypeProbeResults.set(
            probeId,
            await this.runProbe({
              tabId: tabs.prototype,
              row,
              surface: "prototype",
              probe: probeById.get(probeId),
              networkSource: canary.networkSource,
            }),
          );
        }
        const rowEvidence = {
          rowId: row.id,
          status: "pass",
          actualConditions: {
            state: row.state,
            theme: row.theme,
            viewport: row.viewport,
            dpr: contract.comparisonConditions.dpr,
            urls: {
              production: evidenceUrl(productionConditions.url),
              prototype: evidenceUrl(prototypeConditions.url),
            },
            scroll: {
              production: productionConditions.scroll,
              prototype: prototypeConditions.scroll,
            },
          },
          probes: [],
          artifactPaths: [],
          ...(spec.version === 3 ? { artifacts: [] } : {}),
        };
        for (const probeId of probeIdsByRow.get(row.id)) {
          const probe = probeById.get(probeId);
          const production = productionProbeResults.get(probeId);
          const prototype = prototypeProbeResults.get(probeId);
          const comparison = compareProbe(probe, production, prototype);
          const artifactRecords = [production?.artifact, prototype?.artifact].filter(Boolean);
          const artifacts = [
            production?.artifactPath ?? production?.artifact?.path,
            prototype?.artifactPath ?? prototype?.artifact?.path,
          ].filter(Boolean);
          rowEvidence.artifactPaths.push(...artifacts);
          if (spec.version === 3) {
            rowEvidence.artifacts.push(...artifactRecords);
            evidence.artifactIndex.push(...artifactRecords);
          }
          rowEvidence.probes.push({
            probeId,
            kind: probe.kind,
            ...comparison,
            artifactPaths: artifacts,
            ...(spec.version === 3 ? { tier: probe.tier, artifacts: artifactRecords } : {}),
          });
          if (comparison.status === "fail") rowEvidence.status = "fail";
        }
        evidence.rows.push(rowEvidence);
        if (rowEvidence.status === "fail") {
          evidence.metrics = {
            startedAt,
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - startedMs,
            shellCommands: Number.isInteger(run.shellCommands) && run.shellCommands >= 0 ? run.shellCommands : 0,
            browserOperations: this.operations,
            fullMatrixRuns: resolvedMatrixScope === "full" ? 1 : 0,
          };
          throw new ParityRunError("PARITY_ROW_FAILED", `parity row failed: ${row.id}`, evidence);
        }
      } catch (error) {
        if (error instanceof ParityRunError) throw error;
        evidence.rows.push({
          rowId: row.id,
          status: "fail",
          actualConditions: null,
          probes: [],
          artifactPaths: [],
          ...(spec.version === 3 ? { artifacts: [] } : {}),
          error: "PARITY_UNEXPECTED_ERROR",
        });
        evidence.metrics = {
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          shellCommands: Number.isInteger(run.shellCommands) && run.shellCommands >= 0 ? run.shellCommands : 0,
          browserOperations: this.operations,
          fullMatrixRuns: resolvedMatrixScope === "full" ? 1 : 0,
        };
        throw new ParityRunError(
          "PARITY_UNEXPECTED_ERROR",
          "Unexpected parity row execution failure",
          evidence,
        );
      }
    }
    evidence.metrics = {
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      shellCommands: Number.isInteger(run.shellCommands) && run.shellCommands >= 0 ? run.shellCommands : 0,
      browserOperations: this.operations,
      fullMatrixRuns: resolvedMatrixScope === "full" ? 1 : 0,
    };
    if (spec.version === 3) {
      evidence.riskRows = evidence.riskRows.map((risk) => ({
        ...risk,
        status: evidence.rows.find(({ rowId }) => rowId === risk.rowId)?.status ?? "fail",
      }));
      evidence.anchorRows = evidence.anchorRows.map((anchor) => ({
        ...anchor,
        status: evidence.rows.find(({ rowId }) => rowId === anchor.rowId)?.status ?? "fail",
      }));
      evidence.automationCoverageStatus =
        evidence.coverage.status === "pass" && evidence.rows.every(({ status }) => status === "pass")
          ? "pass"
          : "fail";
      evidence.fullParityStatus = resolvedMatrixScope === "full" && evidence.automationCoverageStatus === "pass"
        ? "pass"
        : evidence.fullParityStatus;
    }
    return evidence;
  }

  async run(input) {
    this.canary = undefined;
    this.operations = 0;
    let result;
    let failure;
    try {
      result = await this.runWithoutCleanup(input);
    } catch (error) {
      failure = error;
    }
    if (typeof this.adapter.cleanup === "function") {
      try {
        const cleanup = await this.call("cleanup");
        if (result?.capabilities) result.capabilities.cleanup = cleanup;
        if (result?.schemaVersion === 4) result.cleanup = cleanup;
        if (failure?.evidence?.capabilities) failure.evidence.capabilities.cleanup = cleanup;
        if (failure?.evidence?.schemaVersion === 4) failure.evidence.cleanup = cleanup;
      } catch {
        throw new ParityRunError(
          "PARITY_CLEANUP_FAILED",
          "Browser cleanup did not complete",
          failure?.evidence ?? result,
        );
      }
    }
    if (failure) throw failure;
    return result;
  }
}

export {
  BrowserParityRunner,
  ParityRunError,
  compareProbe,
  coverageSelectionMetadata,
  createBatches,
  createCoverageReport,
  createRunContext,
  ensure,
  fullMatrixPhases,
  isPlainObject,
  isVisibleSnapshot,
  matrixScopes,
  mergeBatchResults,
  normalizeDomSnapshot,
  phases,
  probeKinds,
  requireExactKeys,
  requireNonEmptyString,
  requireLoopbackBaseUrl,
  requireUniqueStrings,
  resolveInvalidationTargets,
  scrollSource,
  selectRows,
  sha256Digest,
  stableNormalize,
  stableStringify,
  runBatch,
  validateParitySpec,
};
