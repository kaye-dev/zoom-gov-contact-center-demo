#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prototypeRevisionInRepository } from "./prototype-revision.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");
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
    requireNonEmptyString(key, `${label} key`);
    ensure(typeof item === "string", `${label}.${key} must be a string`);
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
  ensure(typeof action.value === "string", `${label}.value must be a string`);
}

function validateSurfaceSetup(surface, label) {
  requireExactKeys(surface, ["query", "actions"], label);
  requireQuery(surface.query, `${label}.query`);
  ensure(Array.isArray(surface.actions), `${label}.actions must be an array`);
  surface.actions.forEach((action, index) => validateAction(action, `${label}.actions[${index}]`));
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
  requireExactKeys(spec, ["version", "stateSetups", "probes", "rowProbeMap"], "parity-spec.json");
  ensure(spec.version === 1, "parity-spec.json version must be 1");
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
    ensure(parsed.hostname === "localhost" && parsed.port === "3000", "production base URL must use localhost:3000");
  } else {
    ensure(parsed.hostname === "127.0.0.1" && parsed.port !== "", "prototype base URL must use 127.0.0.1 with an explicit port");
  }
  return parsed;
}

function targetUrl(baseUrl, row, surface, setup) {
  const relative = surface === "production" ? row.route : row.entry;
  return appendQuery(new URL(relative, baseUrl).toString(), setup.query);
}

function requireAdapter(adapter) {
  ensure(isPlainObject(adapter), "browser adapter must be an object");
  for (const method of requiredAdapterMethods) {
    ensure(typeof adapter[method] === "function", `browser adapter is missing ${method}()`);
  }
}

class ParityRunError extends Error {
  constructor(message, evidence) {
    super(message);
    this.name = "ParityRunError";
    this.evidence = evidence;
  }
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
    return this.adapter[method](...args);
  }

  async assertActiveTab(tabId, label) {
    const active = await this.call("activeTabId");
    ensure(active === tabId, `${label}: active tab mismatch; expected ${tabId}, received ${active}`);
  }

  async activate(tabId, label) {
    await this.call("activateTab", tabId);
    await this.assertActiveTab(tabId, label);
  }

  async capabilityCanary({ tabId, viewport, dpr, requiresNetwork }) {
    if (this.canary) return this.canary;
    await this.activate(tabId, "capability canary");
    await this.call("setViewport", tabId, viewport);
    await this.assertActiveTab(tabId, "capability canary viewport");
    const measured = await this.call("measureViewport", tabId);
    ensure(
      measured?.width === viewport.width && measured?.height === viewport.height,
      `capability canary viewport mismatch: expected ${viewport.width}x${viewport.height}`,
    );
    ensure(measured.dpr === dpr, `capability canary DPR mismatch: expected ${dpr}`);
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
    ensure(!requiresNetwork || networkSource, "network capability requires PerformanceResourceTiming or browser network logs");
    this.canary = {
      status: "pass",
      tabId,
      viewport: measured,
      networkSource: networkSource ?? "not-required",
      sessionId: this.adapter.sessionId ?? "unknown",
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
    await this.call("setTheme", tabId, row.theme);
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
    const label = `${row.id}/${surface}/${probe.id}`;
    await this.activate(tabId, label);
    try {
      return await this.call("runProbe", tabId, probe, { row, surface, networkSource });
    } catch (error) {
      throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async run({
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
    const firstViewport = parseViewport(rows[0].viewport);
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
          setup: setup.production,
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
          setup: setup.prototype,
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
              production: productionConditions.url,
              prototype: prototypeConditions.url,
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
          throw new ParityRunError(`parity row failed: ${row.id}`, evidence);
        }
      } catch (error) {
        if (error instanceof ParityRunError) throw error;
        evidence.rows.push({
          rowId: row.id,
          status: "fail",
          actualConditions: null,
          probes: [],
          artifactPaths: [],
          error: error instanceof Error ? error.message : String(error),
        });
        evidence.metrics = {
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedMs,
          shellCommands: Number.isInteger(run.shellCommands) && run.shellCommands >= 0 ? run.shellCommands : 0,
          browserOperations: this.operations,
          fullMatrixRuns: matrixScope === "full" ? 1 : 0,
        };
        throw new ParityRunError(`parity row could not be executed: ${row.id}`, evidence);
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
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function requireSha256(value, label) {
  ensure(/^sha256:[0-9a-f]{64}$/u.test(value), `${label} must be sha256:<64hex>`);
}

async function loadParityDefinition(requestedDirectory, requestedRoot = repositoryRoot) {
  const root = await realpath(requestedRoot);
  ensure(root === requestedRoot, "repository root must not traverse symlinks");
  const match = /^plans\/([a-z0-9][a-z0-9-]*)\/prototype$/u.exec(requestedDirectory);
  ensure(match && !["tmp", "reviews"].includes(match[1]), "target must be plans/<slug>/prototype");
  const prototypeRoot = path.join(root, requestedDirectory);
  const beforeRevision = await prototypeRevisionInRepository(requestedDirectory, root);
  const [contractText, specText] = await Promise.all([
    readFile(path.join(prototypeRoot, "ui-contract.json"), "utf8"),
    readFile(path.join(prototypeRoot, "parity-spec.json"), "utf8"),
  ]);
  let contract;
  let spec;
  try {
    contract = JSON.parse(contractText);
  } catch {
    throw new Error("ui-contract.json must contain valid JSON");
  }
  try {
    spec = JSON.parse(specText);
  } catch {
    throw new Error("parity-spec.json must contain valid JSON");
  }
  validateParitySpec(spec, contract);
  const afterRevision = await prototypeRevisionInRepository(requestedDirectory, root);
  ensure(beforeRevision === afterRevision, "prototype changed while loading parity definition");
  return {
    slug: match[1],
    prototypeRoot,
    contract,
    spec,
    prototypeRevision: afterRevision,
    validationProfileDigest: sha256(specText),
  };
}

function createApprovalEvidence({
  runId,
  goalSha256,
  prototypeRevision,
  validationProfileDigest,
  invokedAt = new Date().toISOString(),
}) {
  requireNonEmptyString(runId, "runId");
  requireSha256(goalSha256, "goalSha256");
  requireSha256(prototypeRevision, "prototypeRevision");
  requireSha256(validationProfileDigest, "validationProfileDigest");
  ensure(!Number.isNaN(Date.parse(invokedAt)), "invokedAt must be an ISO-compatible timestamp");
  return {
    schemaVersion: 1,
    basis: "explicit-$implement-invocation",
    runId,
    invokedAt,
    goalSha256,
    prototypeRevision,
    validationProfileDigest,
  };
}

function validateApprovalEvidence(evidence) {
  requireExactKeys(
    evidence,
    [
      "schemaVersion",
      "basis",
      "runId",
      "invokedAt",
      "goalSha256",
      "prototypeRevision",
      "validationProfileDigest",
    ],
    "approval evidence",
  );
  ensure(evidence.schemaVersion === 1, "approval evidence schemaVersion must be 1");
  ensure(evidence.basis === "explicit-$implement-invocation", "approval evidence basis is invalid");
  requireNonEmptyString(evidence.runId, "approval evidence runId");
  ensure(!Number.isNaN(Date.parse(evidence.invokedAt)), "approval evidence invokedAt must be a timestamp");
  requireSha256(evidence.goalSha256, "approval evidence goalSha256");
  requireSha256(evidence.prototypeRevision, "approval evidence prototypeRevision");
  requireSha256(evidence.validationProfileDigest, "approval evidence validationProfileDigest");
  return evidence;
}

function requireTimestamp(value, label) {
  ensure(typeof value === "string" && !Number.isNaN(Date.parse(value)), `${label} must be a timestamp`);
}

function requireStringArray(value, label) {
  ensure(Array.isArray(value), `${label} must be an array`);
  value.forEach((item, index) => requireNonEmptyString(item, `${label}[${index}]`));
}

function validateMeasuredUrl(value, surface, expectedRoute, label) {
  let actual;
  try {
    actual = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  const parsed = requireLoopbackBaseUrl(actual.origin, surface);
  ensure(actual.origin === parsed.origin, `${label} has an invalid origin`);
  ensure(actual.username === "" && actual.password === "", `${label} must not contain credentials`);
  ensure(actual.hash === "", `${label} must not contain a fragment`);
  ensure(actual.pathname === expectedRoute, `${label} route does not match the manifest row`);
}

function validateRowEvidence(rowEvidence, manifestRow, contract, expectedProbes) {
  const label = `parity evidence row ${manifestRow.id}`;
  ensure(isPlainObject(rowEvidence), `${label} must be an object`);
  ensure(rowEvidence.rowId === manifestRow.id, `${label} rowId does not match the manifest`);
  ensure(rowEvidence.status === "pass" || rowEvidence.status === "fail", `${label} status must be pass or fail`);
  requireStringArray(rowEvidence.artifactPaths, `${label}.artifactPaths`);
  ensure(Array.isArray(rowEvidence.probes), `${label}.probes must be an array`);

  if (rowEvidence.actualConditions === null) {
    requireExactKeys(rowEvidence, ["rowId", "status", "actualConditions", "probes", "artifactPaths", "error"], label);
    ensure(rowEvidence.status === "fail", `${label} without actual conditions must fail`);
    ensure(rowEvidence.probes.length === 0, `${label} without actual conditions must not contain probes`);
    requireNonEmptyString(rowEvidence.error, `${label}.error`);
    return;
  }

  requireExactKeys(rowEvidence, ["rowId", "status", "actualConditions", "probes", "artifactPaths"], label);
  requireExactKeys(
    rowEvidence.actualConditions,
    ["state", "theme", "viewport", "dpr", "urls", "scroll"],
    `${label}.actualConditions`,
  );
  for (const field of ["state", "theme", "viewport"]) {
    ensure(
      rowEvidence.actualConditions[field] === manifestRow[field],
      `${label}.actualConditions.${field} does not match the manifest`,
    );
  }
  ensure(
    rowEvidence.actualConditions.dpr === contract.comparisonConditions.dpr,
    `${label}.actualConditions.dpr does not match the contract`,
  );
  requireExactKeys(rowEvidence.actualConditions.urls, ["production", "prototype"], `${label}.actualConditions.urls`);
  validateMeasuredUrl(rowEvidence.actualConditions.urls.production, "production", manifestRow.route, `${label}.urls.production`);
  validateMeasuredUrl(rowEvidence.actualConditions.urls.prototype, "prototype", `/${manifestRow.entry}`, `${label}.urls.prototype`);
  requireExactKeys(rowEvidence.actualConditions.scroll, ["production", "prototype"], `${label}.actualConditions.scroll`);
  for (const surface of ["production", "prototype"]) {
    const measured = rowEvidence.actualConditions.scroll[surface];
    requireExactKeys(measured, ["x", "y", "source"], `${label}.scroll.${surface}`);
    ensure(measured.source === scrollSource, `${label}.scroll.${surface} must identify window measurements`);
    ensure(
      measured.x === contract.comparisonConditions.scroll.x &&
        measured.y === contract.comparisonConditions.scroll.y,
      `${label}.scroll.${surface} does not match the contract`,
    );
  }

  const expectedProbeById = expectedProbes
    ? new Map(expectedProbes.map((probe) => [probe.id, probe]))
    : undefined;
  const actualProbeIds = rowEvidence.probes.map((probe, index) => {
    const probeLabel = `${label}.probes[${index}]`;
    ensure(isPlainObject(probe), `${probeLabel} must be an object`);
    const allowedKeys = new Set([
      "probeId",
      "kind",
      "status",
      "production",
      "prototype",
      "reason",
      "artifactPaths",
    ]);
    ensure(Object.keys(probe).every((key) => allowedKeys.has(key)), `${probeLabel} contains an unknown field`);
    const probeId = requireNonEmptyString(probe.probeId, `${probeLabel}.probeId`);
    ensure(probeKinds.has(probe.kind), `${probeLabel}.kind is invalid`);
    ensure(["pass", "fail", "skipped"].includes(probe.status), `${probeLabel}.status is invalid`);
    if (expectedProbeById) {
      const expectedProbe = expectedProbeById.get(probeId);
      ensure(expectedProbe, `${probeLabel}.probeId is not mapped to this row`);
      ensure(probe.kind === expectedProbe.kind, `${probeLabel}.kind does not match parity-spec.json`);
      ensure(!(expectedProbe.required && probe.status === "skipped"), `${probeLabel} required probe must not be skipped`);
    }
    requireStringArray(probe.artifactPaths, `${probeLabel}.artifactPaths`);
    if (probe.status === "skipped") {
      requireNonEmptyString(probe.reason, `${probeLabel}.reason`);
    } else {
      ensure(Object.hasOwn(probe, "production"), `${probeLabel}.production is required`);
      ensure(Object.hasOwn(probe, "prototype"), `${probeLabel}.prototype is required`);
    }
    return probeId;
  });
  ensure(new Set(actualProbeIds).size === actualProbeIds.length, `${label} probe IDs must be unique`);
  if (expectedProbes) {
    ensure(
      JSON.stringify([...actualProbeIds].sort()) ===
        JSON.stringify(expectedProbes.map(({ id }) => id).sort()),
      `${label} probes do not match parity-spec.json`,
    );
  }
  const probeArtifactPaths = rowEvidence.probes.flatMap(({ artifactPaths }) => artifactPaths).sort();
  ensure(
    JSON.stringify(probeArtifactPaths) === JSON.stringify([...rowEvidence.artifactPaths].sort()),
    `${label} artifact paths do not match its probe results`,
  );
  const hasFailure = rowEvidence.probes.some(({ status }) => status === "fail");
  ensure(rowEvidence.status === (hasFailure ? "fail" : "pass"), `${label} status does not match its probe results`);
}

function validateParityEvidence(evidence, contract, spec) {
  if (spec) validateParitySpec(spec, contract);
  ensure(isPlainObject(evidence), "parity evidence must be an object");
  ensure(
    evidence.schemaVersion === 1 || evidence.schemaVersion === 2 || evidence.schemaVersion === 3,
    "parity evidence schemaVersion must be 1, 2, or 3",
  );
  const legacyFullMatrixEvidence = evidence.schemaVersion === 1;
  requireExactKeys(
    evidence,
    [
      "schemaVersion",
      "phase",
      "runId",
      "generatedAt",
      "goalSha256",
      "prototypeRevision",
      "validationProfileDigest",
      ...(legacyFullMatrixEvidence ? [] : ["matrixScope", "selection"]),
      "runtime",
      "sources",
      "capabilities",
      "rows",
      "metrics",
    ],
    "parity evidence",
  );
  ensure(phases.has(evidence.phase), "parity evidence phase is invalid");
  if (evidence.schemaVersion === 3) {
    ensure(
      evidence.phase === "smoke" || evidence.phase === "final",
      "parity evidence schemaVersion 3 supports only final-boundary smoke or final runs",
    );
  }
  requireNonEmptyString(evidence.runId, "parity evidence runId");
  requireTimestamp(evidence.generatedAt, "parity evidence generatedAt");
  requireSha256(evidence.goalSha256, "parity evidence goalSha256");
  requireSha256(evidence.prototypeRevision, "parity evidence prototypeRevision");
  requireSha256(evidence.validationProfileDigest, "parity evidence validationProfileDigest");
  let matrixScope = "full";
  let changedTargetIds = [];
  let changedStates = [];
  let changedViewports = [];
  let risks = ["normal"];
  if (legacyFullMatrixEvidence) {
    ensure(
      fullMatrixPhases.has(evidence.phase),
      "legacy parity evidence is supported only for pre-edit and final full-matrix runs",
    );
  } else {
    ensure(matrixScopes.has(evidence.matrixScope), "parity evidence matrixScope is invalid");
    matrixScope = evidence.matrixScope;
    requireExactKeys(
      evidence.selection,
      ["changedTargetIds", "changedStates", "changedViewports", "risks"],
      "parity evidence selection",
    );
    changedTargetIds = requireUniqueStrings(
      evidence.selection.changedTargetIds,
      "parity evidence selection.changedTargetIds",
      { allowEmpty: true },
    );
    changedStates = requireUniqueStrings(
      evidence.selection.changedStates,
      "parity evidence selection.changedStates",
      { allowEmpty: true },
    );
    changedViewports = requireUniqueStrings(
      evidence.selection.changedViewports,
      "parity evidence selection.changedViewports",
      { allowEmpty: true },
    );
    risks = requireUniqueStrings(evidence.selection.risks, "parity evidence selection.risks");
  }
  ensure(isPlainObject(evidence.runtime), "parity evidence runtime must be an object");
  ensure(Array.isArray(evidence.sources), "parity evidence sources must be an array");
  ensure(
    evidence.runtime.owner === contract.productionBaseline.runtimeOwner,
    "parity evidence runtime owner does not match ui-contract.json",
  );
  ensure(
    evidence.runtime.checkout === contract.productionBaseline.checkout,
    "parity evidence runtime checkout does not match ui-contract.json",
  );
  const sourcePaths = evidence.sources.map((source, index) => {
    ensure(isPlainObject(source), `parity evidence sources[${index}] must be an object`);
    const sourcePath = requireNonEmptyString(source.path, `parity evidence sources[${index}].path`);
    requireSha256(source.sha256, `parity evidence sources[${index}].sha256`);
    return sourcePath;
  });
  ensure(new Set(sourcePaths).size === sourcePaths.length, "parity evidence source paths must be unique");
  ensure(
    JSON.stringify([...sourcePaths].sort()) ===
      JSON.stringify([...contract.productionBaseline.sources].sort()),
    "parity evidence sources do not match productionBaseline.sources",
  );
  ensure(isPlainObject(evidence.capabilities), "parity evidence capabilities must be an object");
  ensure(evidence.capabilities.status === "pass", "parity evidence capability canary must pass");
  ensure(Array.isArray(evidence.rows), "parity evidence rows must be an array");
  requireExactKeys(
    evidence.metrics,
    ["startedAt", "finishedAt", "durationMs", "shellCommands", "browserOperations", "fullMatrixRuns"],
    "parity evidence metrics",
  );
  requireTimestamp(evidence.metrics.startedAt, "metrics.startedAt");
  requireTimestamp(evidence.metrics.finishedAt, "metrics.finishedAt");
  for (const field of ["durationMs", "shellCommands", "browserOperations", "fullMatrixRuns"]) {
    ensure(
      Number.isInteger(evidence.metrics[field]) && evidence.metrics[field] >= 0,
      `metrics.${field} must be a non-negative integer`,
    );
  }
  ensure(
    evidence.metrics.fullMatrixRuns === (matrixScope === "full" ? 1 : 0),
    "metrics.fullMatrixRuns does not match matrixScope",
  );
  const rowIds = evidence.rows.map(({ rowId }) => rowId);
  ensure(new Set(rowIds).size === rowIds.length, "parity evidence row IDs must be unique");
  const manifestRows = new Map(contract.parityMatrix.map((row) => [row.id, row]));
  ensure(rowIds.every((rowId) => manifestRows.has(rowId)), "parity evidence contains an unknown row ID");
  ensure(
    evidence.rows.every(({ status }) => status === "pass" || status === "fail"),
    "executed parity evidence rows must be pass or fail",
  );
  const expected = selectRows({
    phase: evidence.phase,
    contract,
    changedTargetIds,
    changedStates,
    changedViewports,
    risks,
    matrixScope,
  }).map(({ id }) => id).sort();
  ensure(
    JSON.stringify([...rowIds].sort()) === JSON.stringify(expected),
    "parity evidence rows do not match its declared selection",
  );
  const probesByRow = spec
    ? new Map(
        spec.rowProbeMap.map(({ rowId, probeIds }) => [
          rowId,
          probeIds.map((probeId) => spec.probes.find(({ id }) => id === probeId)),
        ]),
      )
    : undefined;
  for (const row of evidence.rows) {
    validateRowEvidence(row, manifestRows.get(row.rowId), contract, probesByRow?.get(row.rowId));
  }
  return evidence;
}

function validateEvidenceBundle({ approval, preEdit, implementation, contract, spec, current }) {
  validateApprovalEvidence(approval);
  validateParityEvidence(implementation, contract, spec);
  ensure(implementation.phase === "final", "implementation evidence has the wrong phase");
  if (implementation.schemaVersion === 3) {
    ensure(preEdit === undefined, "schemaVersion 3 completion evidence must not include pre-edit parity");
    ensure(
      implementation.rows.every(({ status }) => status === "pass"),
      "final evidence must contain only passing rows",
    );
  } else {
    ensure(preEdit !== undefined, "legacy evidence requires pre-edit parity");
    validateParityEvidence(preEdit, contract, spec);
    ensure(preEdit.phase === "pre-edit", "pre-edit evidence has the wrong phase");
    ensure(preEdit.schemaVersion === implementation.schemaVersion, "pre-edit and final schemaVersion must match");
    const preEditScope = preEdit.schemaVersion === 1 ? "full" : preEdit.matrixScope;
    const implementationScope = implementation.schemaVersion === 1 ? "full" : implementation.matrixScope;
    ensure(preEditScope === implementationScope, "pre-edit and final matrixScope must match");
    const legacySelection = {
      changedTargetIds: [],
      changedStates: [],
      changedViewports: [],
      risks: ["normal"],
    };
    const preEditSelection = preEdit.schemaVersion === 1 ? legacySelection : preEdit.selection;
    const implementationSelection = implementation.schemaVersion === 1 ? legacySelection : implementation.selection;
    ensure(
      JSON.stringify(stableNormalize(preEditSelection)) ===
        JSON.stringify(stableNormalize(implementationSelection)),
      "pre-edit and final selections must match",
    );
    ensure(
      preEdit.rows.every(({ status }) => status === "pass") &&
        implementation.rows.every(({ status }) => status === "pass"),
      "pre-edit and final evidence must contain only passing rows",
    );
  }
  for (const field of ["runId", "goalSha256", "prototypeRevision", "validationProfileDigest"]) {
    if (preEdit) ensure(preEdit[field] === approval[field], `pre-edit ${field} does not match approval`);
    ensure(implementation[field] === approval[field], `final ${field} does not match approval`);
  }
  for (const field of ["goalSha256", "prototypeRevision", "validationProfileDigest"]) {
    ensure(current[field] === approval[field], `final evidence invalidated by current ${field}`);
  }
  ensure(
    JSON.stringify(stableNormalize(implementation.sources)) ===
      JSON.stringify(stableNormalize(current.sources)),
    "final evidence invalidated by current sources",
  );
  ensure(
    JSON.stringify(stableNormalize(implementation.runtime)) ===
      JSON.stringify(stableNormalize(current.runtime)),
    "final evidence invalidated by current runtime conditions",
  );
  return preEdit ? { approval, preEdit, implementation } : { approval, implementation };
}

async function writeRunEvidence({ repositoryRootPath = repositoryRoot, slug, runId, name, evidence }) {
  ensure(/^[a-z0-9][a-z0-9-]*$/u.test(slug) && !["tmp", "reviews"].includes(slug), "invalid plan slug");
  ensure(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId), "invalid run ID");
  ensure(["approval.json", "pre-edit-parity.json", "implementation-parity.json"].includes(name), "invalid evidence file name");
  const root = await realpath(repositoryRootPath);
  const planRoot = path.join(root, "plans", slug);
  const metadata = await lstat(planRoot);
  ensure(metadata.isDirectory() && !metadata.isSymbolicLink(), "plan directory must be a real directory");
  ensure((await realpath(planRoot)) === planRoot, "plan directory must not traverse symlinks");
  const evidenceRoot = path.join(planRoot, "evidence");
  try {
    const evidenceMetadata = await lstat(evidenceRoot);
    ensure(evidenceMetadata.isDirectory() && !evidenceMetadata.isSymbolicLink(), "evidence root must be a real directory");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    await mkdir(evidenceRoot);
  }
  ensure((await realpath(evidenceRoot)) === evidenceRoot, "evidence root must not traverse symlinks");
  const destination = path.join(evidenceRoot, runId);
  try {
    const destinationMetadata = await lstat(destination);
    ensure(destinationMetadata.isDirectory() && !destinationMetadata.isSymbolicLink(), "run evidence path must be a real directory");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    await mkdir(destination);
  }
  ensure((await realpath(destination)) === destination, "evidence directory must not traverse symlinks");
  const target = path.join(destination, name);
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  return path.relative(root, target).split(path.sep).join("/");
}

function parseCliArguments(argv) {
  ensure(argv.length >= 2, "usage: parity-runner.mjs <validate|select> plans/<slug>/prototype [options]");
  const [command, target, ...rest] = argv;
  ensure(command === "validate" || command === "select", "command must be validate or select");
  const options = {
    phase: "smoke",
    changedTargetIds: [],
    changedStates: [],
    changedViewports: [],
    risks: ["normal"],
    matrixScope: "targeted",
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const value = rest[index + 1];
    ensure(value, `${argument} requires a value`);
    if (argument === "--phase") options.phase = value;
    else if (argument === "--target") options.changedTargetIds.push(value);
    else if (argument === "--state") options.changedStates.push(value);
    else if (argument === "--viewport") options.changedViewports.push(value);
    else if (argument === "--matrix-scope") options.matrixScope = value;
    else if (argument === "--risk") {
      if (options.risks.length === 1 && options.risks[0] === "normal") options.risks = [];
      options.risks.push(value);
    } else throw new Error(`unknown option: ${argument}`);
    index += 1;
  }
  return { command, target, options };
}

async function main() {
  const { command, target, options } = parseCliArguments(process.argv.slice(2));
  const definition = await loadParityDefinition(target);
  const output = {
    prototypeRevision: definition.prototypeRevision,
    validationProfileDigest: definition.validationProfileDigest,
    rowCount: definition.contract.parityMatrix.length,
  };
  if (command === "select") {
    output.rows = selectRows({ contract: definition.contract, ...options }).map(({ id }) => id);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return (await realpath(process.argv[1])) === (await realpath(fileURLToPath(import.meta.url)));
  } catch {
    return false;
  }
}

if (await isMainModule()) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export {
  BrowserParityRunner,
  ParityRunError,
  compareProbe,
  createApprovalEvidence,
  isVisibleSnapshot,
  loadParityDefinition,
  normalizeDomSnapshot,
  selectRows,
  stableNormalize,
  validateApprovalEvidence,
  validateEvidenceBundle,
  validateParityEvidence,
  validateParitySpec,
  writeRunEvidence,
};
