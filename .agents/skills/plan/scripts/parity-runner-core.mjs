const phases = new Set(["smoke", "pre-edit", "affected", "final"]);
const fullMatrixPhases = new Set(["pre-edit", "final"]);
const matrixScopes = new Set(["targeted", "full"]);
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
  "console",
  "network",
]);
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
    default:
      requireExactKeys(options, [], `${label}.options`);
  }
}

function validateParitySpec(spec, contract) {
  ensure(isPlainObject(spec), "parity-spec.json must be an object");
  ensure(spec.version === 1 || spec.version === 2, "parity-spec.json version must be 1 or 2");
  requireExactKeys(
    spec,
    ["version", "stateSetups", "probes", "rowProbeMap", ...(spec.version === 2 ? ["browserSetups"] : [])],
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
    requireExactKeys(setup, ["targetId", "state", "production", "prototype"], label);
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
  for (const [index, probe] of spec.probes.entries()) {
    const label = `probes[${index}]`;
    requireExactKeys(
      probe,
      ["id", "kind", "mode", "productionSelector", "prototypeSelector", "required", "options"],
      label,
    );
    const id = requireNonEmptyString(probe.id, `${label}.id`);
    ensure(!probeIds.has(id), "probe IDs must be unique");
    probeIds.add(id);
    ensure(probeKinds.has(probe.kind), `${label}.kind is not allowed: ${probe.kind}`);
    ensure(probeModes.has(probe.mode), `${label}.mode must be equal or different`);
    requireNonEmptyString(probe.productionSelector, `${label}.productionSelector`);
    requireNonEmptyString(probe.prototypeSelector, `${label}.prototypeSelector`);
    requireBoolean(probe.required, `${label}.required`);
    validateProbeOptions(probe, label);
  }

  ensure(Array.isArray(spec.rowProbeMap), "parity-spec.json rowProbeMap must be an array");
  const contractRowIds = contract.parityMatrix.map(({ id }) => id);
  const mappedRowIds = new Set();
  const usedProbeIds = new Set();
  for (const [index, mapping] of spec.rowProbeMap.entries()) {
    const label = `rowProbeMap[${index}]`;
    requireExactKeys(mapping, ["rowId", "probeIds"], label);
    const rowId = requireNonEmptyString(mapping.rowId, `${label}.rowId`);
    ensure(contractRowIds.includes(rowId), `${label}.rowId is not declared by ui-contract.json`);
    ensure(!mappedRowIds.has(rowId), "rowProbeMap row IDs must be unique");
    mappedRowIds.add(rowId);
    for (const probeId of requireUniqueStrings(mapping.probeIds, `${label}.probeIds`)) {
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
  if (spec.version === 2) validateBrowserSetups(spec.browserSetups, contract);
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

function selectRows({
  phase,
  contract,
  changedTargetIds = [],
  changedStates = [],
  changedViewports = [],
  risks = ["normal"],
  matrixScope = "targeted",
}) {
  ensure(phases.has(phase), `phase must be one of: ${[...phases].join(", ")}`);
  ensure(matrixScopes.has(matrixScope), `matrixScope must be one of: ${[...matrixScopes].join(", ")}`);
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

function createBatches(rows, { maxRows = 4, maxBytes = 128 * 1024 } = {}) {
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
    if (current.length >= maxRows || byteLength > maxBytes) {
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
  matrixScope = "targeted",
  maxRows,
  maxBytes,
}) {
  requireNonEmptyString(runId, "runId");
  validateParitySpec(definition.spec, definition.contract);
  const rows = selectRows({
    phase,
    contract: definition.contract,
    changedTargetIds,
    changedStates,
    changedViewports,
    risks,
    matrixScope,
  });
  return {
    runId,
    phase,
    matrixScope,
    selection: { changedTargetIds, changedStates, changedViewports, risks },
    rowIds: rows.map(({ id }) => id),
    batches: createBatches(rows, { maxRows, maxBytes }),
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
  if (probe.kind === "geometry") {
    equal = geometryMatches(production, prototype, probe.options.tolerancePx);
  } else {
    equal = JSON.stringify(production) === JSON.stringify(prototype);
  }
  if (probe.kind === "visibility" && probe.mode === "equal") {
    equal = equal && production === probe.options.expected;
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
    matrixScope = "targeted",
    run,
  }) {
    const { contract, spec } = definition;
    ensure(
      phase === "smoke" || phase === "final",
      "new Browser runs support only final-boundary smoke or final phases",
    );
    requireLoopbackBaseUrl(baseUrls.production, "production");
    requireLoopbackBaseUrl(baseUrls.prototype, "prototype");
    if (this.adapter.requiresBrowserSetups === true && spec.version !== 2) {
      throwParityError(
        "PARITY_BROWSER_SETUP_REQUIRED",
        "in-app Browser execution requires parity-spec.json version 2 browserSetups",
      );
    }
    const rows = selectRows({
      phase,
      contract,
      changedTargetIds,
      changedStates,
      changedViewports,
      risks,
      matrixScope,
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
    const evidence = {
      schemaVersion: 3,
      phase,
      runId: run.runId,
      generatedAt: startedAt,
      goalSha256: run.goalSha256,
      prototypeRevision: definition.prototypeRevision,
      validationProfileDigest: definition.validationProfileDigest,
      matrixScope,
      selection: {
        changedTargetIds,
        changedStates,
        changedViewports,
        risks,
      },
      runtime: run.runtime,
      sources: run.sources,
      capabilities: canary,
      rows: [],
      metrics: undefined,
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
        };
        for (const probeId of probeIdsByRow.get(row.id)) {
          const probe = probeById.get(probeId);
          const production = productionProbeResults.get(probeId);
          const prototype = prototypeProbeResults.get(probeId);
          const comparison = compareProbe(probe, production, prototype);
          const artifacts = [production?.artifactPath, prototype?.artifactPath].filter(Boolean);
          rowEvidence.artifactPaths.push(...artifacts);
          rowEvidence.probes.push({ probeId, kind: probe.kind, ...comparison, artifactPaths: artifacts });
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
            fullMatrixRuns: matrixScope === "full" ? 1 : 0,
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
          error: "PARITY_UNEXPECTED_ERROR",
        });
        evidence.metrics = {
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          shellCommands: Number.isInteger(run.shellCommands) && run.shellCommands >= 0 ? run.shellCommands : 0,
          browserOperations: this.operations,
          fullMatrixRuns: matrixScope === "full" ? 1 : 0,
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
      fullMatrixRuns: matrixScope === "full" ? 1 : 0,
    };
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
        if (failure?.evidence?.capabilities) failure.evidence.capabilities.cleanup = cleanup;
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
  createBatches,
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
  scrollSource,
  selectRows,
  sha256Digest,
  stableNormalize,
  stableStringify,
  runBatch,
  validateParitySpec,
};
