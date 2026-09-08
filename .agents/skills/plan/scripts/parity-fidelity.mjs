// Data-only profile v4 contracts. No Browser, filesystem, or Node dependencies.
const check = (condition, message) => { if (!condition) throw new Error(`PARITY_FIDELITY_INVALID: ${message}`); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const canonical = (value) => JSON.stringify(normalize(value));
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  return object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
}
function keys(value, expected, label) {
  check(object(value) && canonical(Object.keys(value).sort()) === canonical([...expected].sort()), `${label}: expected keys ${expected}`);
}
function list(value, label, allowEmpty = false) {
  check(Array.isArray(value) && (allowEmpty || value.length > 0), `${label}: expected array`);
  return value;
}
function ids(value, label, allowEmpty = false) {
  list(value, label, allowEmpty);
  check(value.every(text) && new Set(value).size === value.length, `${label}: duplicate or empty ID`);
  return value;
}
function index(items, label, allowEmpty = false) {
  list(items, label, allowEmpty);
  ids(items.map(item => item.id), label, allowEmpty);
  return new Map(items.map(item => [item.id, item]));
}
function references(values, inventory, label, allowEmpty = false) {
  ids(values, label, allowEmpty);
  check(values.every(id => inventory.has(id)), `${label}: unresolved reference`);
}
function combinations(values, size) {
  if (size === 0) return [[]];
  return values.flatMap((value, i) => combinations(values.slice(i + 1), size - 1).map(rest => [value, ...rest]));
}
function factorValues(row, group) {
  return Object.fromEntries(group.factors.map(factor => [factor.id,
    factor.source === "property" ? factor.mapping[row.state] : row[factor.source],
  ]));
}
function tuples(values, strength) {
  return combinations(Object.keys(values).sort(), strength).map(names => canonical(names.map(name => [name, values[name]])));
}
export function interactionCandidates(contract, group) {
  return contract.parityMatrix.filter(row => group.targetIds.includes(row.targetId) && group.states.includes(row.state))
    .map(row => ({ row, values: factorValues(row, group) }))
    .filter(({ values }) => !group.exclusions.some(exclusion => Object.entries(exclusion.values).every(([key, value]) => values[key] === value)))
    .map(candidate => ({ ...candidate, tuples: tuples(candidate.values, group.strength) }));
}
export function validateFidelityProfile(spec, contract, { validateAction, validateQuery } = {}) {
  const f = spec.fidelity;
  keys(f, ["requirements", "phaseComparisons", "interactionGroups", "runtimeChecks", "visualChecks", "staticChecks"], "fidelity");
  const requirements = index(f.requirements, "requirements");
  const probes = new Map(spec.probes.map(probe => [probe.id, probe]));
  const rows = new Map(contract.parityMatrix.map(row => [row.id, row]));
  const mapped = new Map(spec.rowProbeMap.map(row => [row.rowId, new Set(row.probeIds)]));
  const runtime = index(f.runtimeChecks, "runtimeChecks", true);
  const visual = index(f.visualChecks, "visualChecks");
  const statics = index(f.staticChecks, "staticChecks");
  const groups = index(f.interactionGroups, "interactionGroups", true);
  const phases = new Map();
  for (const phase of list(f.phaseComparisons, "phaseComparisons")) {
    keys(phase, ["probeId", "smoke", "final", "expected"], "phaseComparison");
    check(probes.has(phase.probeId) && !phases.has(phase.probeId), "phaseComparison: unknown or duplicate probe");
    check(phase.smoke === probes.get(phase.probeId).mode || (phase.smoke === "capture" && probes.get(phase.probeId).kind === "screenshot"), "smoke comparison must preserve declared baseline mode or explicitly capture a screenshot");
    check(["equal", "expected", "capture"].includes(phase.final), "final must compare equality, expected values, or visual capture");
    if (phase.final === "expected") keys(phase.expected, ["production", "prototype"], "expected");
    else check(phase.expected === null, "unexpected comparison values");
    if (phase.final === "capture") check(probes.get(phase.probeId).kind === "screenshot", "capture is only for screenshots");
    phases.set(phase.probeId, phase);
  }
  check(phases.size === probes.size, "every probe needs an explicit final comparison");
  for (const requirement of requirements.values()) {
    keys(requirement, ["id", "expected", "probeIds", "runtimeCheckIds", "visualCheckIds", "staticCheckIds", "interactionGroupIds", "noInteractionReason"], "requirement");
    check(/^REQ-[A-Za-z0-9-]+$/.test(requirement.id) && text(requirement.expected), "requirement needs stable REQ ID and expected outcome");
    for (const [field, inventory] of [["probeIds", probes], ["runtimeCheckIds", runtime], ["visualCheckIds", visual], ["staticCheckIds", statics], ["interactionGroupIds", groups]]) {
      references(requirement[field], inventory, `${requirement.id}.${field}`, true);
    }
    check(["probeIds", "runtimeCheckIds", "visualCheckIds", "staticCheckIds"].some(field => requirement[field].length > 0), "requirement has no executable or visual check");
    check(requirement.interactionGroupIds.length ? requirement.noInteractionReason === null : text(requirement.noInteractionReason), "requirement needs interaction groups or a no-interaction rationale");
    for (const [field, inventory] of [["runtimeCheckIds", runtime], ["visualCheckIds", visual], ["interactionGroupIds", groups]]) {
      for (const id of requirement[field]) check(inventory.get(id).requirementIds.includes(requirement.id), "requirement mapping must be reciprocal");
    }
    for (const id of requirement.probeIds) check(probes.get(id).required, "requirement probe must be required");
  }
  for (const group of groups.values()) {
    keys(group, ["id", "requirementIds", "targetIds", "states", "factors", "strength", "reason", "exclusions", "requiredProbeIds"], "interactionGroup");
    references(group.requirementIds, requirements, "group.requirementIds");
    references(group.targetIds, new Map(contract.comparisonTargets.map(t => [t.id, t])), "group.targetIds");
    references(group.states, new Map(contract.parityMatrix.map(row => [row.state, row.state])), "group.states");
    references(group.requiredProbeIds, probes, "group.requiredProbeIds");
    const factors = index(group.factors, "factors");
    check(Number.isInteger(group.strength) && group.strength >= 2 && group.strength <= factors.size, "invalid t-way strength");
    check(text(group.reason), "interaction strength needs a reason");
    const scoped = contract.parityMatrix.filter(row => group.targetIds.includes(row.targetId) && group.states.includes(row.state));
    check(scoped.length > 0, "interaction group has no contract rows");
    for (const factor of factors.values()) {
      keys(factor, ["id", "source", "mapping", "rationale"], "factor");
      check(["targetId", "state", "viewport", "theme", "property"].includes(factor.source), "unknown factor source");
      check(text(factor.rationale), "factor needs equivalence/boundary rationale");
      if (factor.source === "property") {
        keys(factor.mapping, [...new Set(scoped.map(row => row.state))], "property mapping");
        check(Object.values(factor.mapping).every(text), "empty property value");
      } else keys(factor.mapping, [], "contract factors must reference, not duplicate, values");
    }
    const coordinates = scoped.map(row => factorValues(row, group));
    const exclusionKeys = new Set();
    for (const exclusion of list(group.exclusions, "exclusions", true)) {
      keys(exclusion, ["values", "reason"], "exclusion");
      check(object(exclusion.values) && Object.keys(exclusion.values).length > 0 && text(exclusion.reason), "exclusion needs values and rationale");
      for (const [id, value] of Object.entries(exclusion.values)) {
        check(factors.has(id) && coordinates.some(values => values[id] === value), "exclusion references unknown value");
      }
      const key = canonical(exclusion.values);
      check(!exclusionKeys.has(key), "duplicate exclusion");
      exclusionKeys.add(key);
      check(coordinates.some(values => Object.entries(exclusion.values).every(([id, value]) => values[id] === value)), "exclusion never matches a contract row");
    }
    const candidates = interactionCandidates(contract, group);
    check(candidates.length > 0, "exclusions remove every feasible case");
    for (const { row } of candidates) for (const id of group.requiredProbeIds) {
      check(probes.get(id).required && mapped.get(row.id).has(id), "interaction expected-result probe must be required and mapped");
    }
    for (const id of group.requirementIds) check(requirements.get(id).interactionGroupIds.includes(group.id), "interaction mapping must be reciprocal");
  }
  for (const runtimeCheck of runtime.values()) {
    keys(runtimeCheck, ["id", "requirementIds", "rowId", "query", "persistence", "steps"], "runtimeCheck");
    references(runtimeCheck.requirementIds, requirements, "runtime requirementIds");
    check(rows.has(runtimeCheck.rowId), "runtime row not in contract");
    check(object(runtimeCheck.query) && !Object.keys(runtimeCheck.query).some(key => /^(state|review.*|fixture.*)$/i.test(key)), "runtime cannot use simulated state query");
    validateQuery?.(runtimeCheck.query, "runtime query");
    check(typeof runtimeCheck.persistence === "boolean", "runtime persistence must be boolean");
    let changed = false, reloadAfterChange = false;
    for (const step of list(runtimeCheck.steps, "runtime steps")) {
      keys(step, ["action", "assertions"], "runtime step");
      if (step.action.type === "reload") {
        keys(step.action, ["type"], "reload action");
        reloadAfterChange ||= changed;
      } else validateAction?.(step.action, "runtime action");
      if (["click", "fill", "press"].includes(step.action.type)) changed = true;
      for (const assertion of list(step.assertions, "runtime assertions")) {
        keys(assertion, ["probeId", "expected"], "runtime assertion");
        const probe = probes.get(assertion.probeId);
        check(probe?.required && !["screenshot", "dom", "accessibility"].includes(probe.kind), "runtime needs bounded required value assertions");
      }
    }
    check(!runtimeCheck.persistence || reloadAfterChange, "persistence requires an action followed by reload and assertion");
    for (const id of runtimeCheck.requirementIds) check(requirements.get(id).runtimeCheckIds.includes(runtimeCheck.id), "runtime mapping must be reciprocal");
  }
  for (const visualCheck of visual.values()) {
    keys(visualCheck, ["id", "requirementIds", "rowId", "probeId", "criteria"], "visualCheck");
    references(visualCheck.requirementIds, requirements, "visual requirementIds");
    check(rows.has(visualCheck.rowId) && mapped.get(visualCheck.rowId).has(visualCheck.probeId), "visual row/probe not mapped");
    check(probes.get(visualCheck.probeId)?.kind === "screenshot", "visual check requires screenshot probe");
    ids(visualCheck.criteria, "visual criteria");
    for (const id of visualCheck.requirementIds) check(requirements.get(id).visualCheckIds.includes(visualCheck.id), "visual mapping must be reciprocal");
  }
  for (const target of contract.comparisonTargets) {
    const targetRows = contract.parityMatrix.filter(row => row.targetId === target.id);
    const inspected = f.visualChecks.map(item => rows.get(item.rowId)).filter(row => row.targetId === target.id);
    check(inspected.length > 0, `visual checks missing target ${target.id}`);
    for (const theme of new Set(targetRows.map(row => row.theme))) check(inspected.some(row => row.theme === theme), `visual checks missing ${target.id}/${theme}`);
    for (const mobile of [true, false]) {
      const predicate = row => (Number(row.viewport.split("x")[0]) < 1024) === mobile;
      if (targetRows.some(predicate)) check(inspected.some(predicate), `visual checks missing ${target.id}/${mobile ? "mobile" : "desktop"}`);
    }
  }
  for (const item of statics.values()) {
    keys(item, ["id", "command", "scope"], "staticCheck");
    check(text(item.command), "static command missing");
    ids(item.scope, "static scope");
  }
  return f;
}

export function supplementInteractionRows(contract, spec, baseRows) {
  if (spec.version !== 4) return baseRows;
  const selected = new Set(baseRows.map(row => row.id));
  for (const item of [...spec.fidelity.visualChecks, ...spec.fidelity.runtimeChecks]) selected.add(item.rowId);
  const groups = spec.fidelity.interactionGroups.map(group => {
    const candidates = interactionCandidates(contract, group);
    const missing = new Set(candidates.flatMap(candidate => candidate.tuples));
    return { candidates, missing };
  });
  const consume = id => { for (const group of groups) for (const candidate of group.candidates) if (candidate.row.id === id) candidate.tuples.forEach(tuple => group.missing.delete(tuple)); };
  selected.forEach(consume);
  const candidates = [...contract.parityMatrix].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  while (groups.some(group => group.missing.size)) {
    let best, bestScore = 0;
    for (const row of candidates) {
      if (selected.has(row.id)) continue;
      const score = groups.reduce((sum, group) => sum + (group.candidates.find(candidate => candidate.row.id === row.id)?.tuples.filter(tuple => group.missing.has(tuple)).length ?? 0), 0);
      if (score > bestScore) { best = row; bestScore = score; }
    }
    check(best, "uncovered feasible tuples have no executable case");
    selected.add(best.id); consume(best.id);
  }
  return contract.parityMatrix.filter(row => selected.has(row.id));
}

export function interactionCoverage(contract, spec, evidenceRows) {
  return spec.fidelity.interactionGroups.map(group => {
    const candidates = interactionCandidates(contract, group);
    const required = new Set(candidates.flatMap(candidate => candidate.tuples));
    const covered = new Set();
    for (const { row, tuples: values } of candidates) {
      const observed = evidenceRows.find(item => item.rowId === row.id);
      if (observed?.status === "pass" && group.requiredProbeIds.every(id => observed.probes?.some(probe => probe.probeId === id && probe.status === "pass"))) values.forEach(value => covered.add(value));
    }
    return { id: group.id, strength: group.strength, feasibleTuples: required.size, passedTuples: covered.size, missingTuples: [...required].filter(tuple => !covered.has(tuple)).sort(), status: covered.size === required.size ? "pass" : "fail" };
  });
}

// Browser text/attribute observations are domain-separated fingerprints. Keep
// expected literals private too, and apply the same representation during replay.
// The Browser supplies WebCrypto; synchronous evidence readers supply Node SHA-256.
export function normalizeExpectedProbeValue(probe, expected, observed, hashString) {
  if (!["text", "attribute"].includes(probe.kind)) return expected;
  if (expected === null && observed?.isNull === true) return { isNull: true };
  if (typeof expected !== "string" || typeof observed?.sha256 !== "string" || !hashString) return expected;
  const value = probe.kind === "text" && probe.options?.normalizeWhitespace
    ? expected.replace(/\s+/gu, " ").trim() : expected;
  const domain = probe.kind === "attribute"
    ? `parity:attribute:v1\0${probe.options.name}\0` : "parity:text:v1\0";
  const digest = hashString(`${domain}${value}`);
  const compact = sha256 => ({ sha256, bytes: new TextEncoder().encode(value).byteLength });
  return digest && typeof digest.then === "function" ? digest.then(compact) : compact(digest);
}

export function compareFidelityProbe(probe, production, prototype, spec, phase, legacyCompare, hashString) {
  const rule = spec.fidelity.phaseComparisons.find(item => item.probeId === probe.id);
  const mode = phase === "final" ? rule.final : rule.smoke;
  if (mode === "capture") return { status: production?.artifact && prototype?.artifact ? "pass" : "fail", production: "visual-capture", prototype: "visual-capture" };
  if (phase !== "final") return legacyCompare(probe, production, prototype);
  if (rule.final === "equal") return legacyCompare({ ...probe, mode: "equal" }, production, prototype);
  const expected = [
    normalizeExpectedProbeValue(probe, rule.expected.production, production?.value, hashString),
    normalizeExpectedProbeValue(probe, rule.expected.prototype, prototype?.value, hashString),
  ];
  const compare = ([left, right]) => {
    const pass = !production?.unsupported && !prototype?.unsupported && canonical(production?.value) === canonical(left) && canonical(prototype?.value) === canonical(right);
    return { status: pass ? "pass" : "fail", production: production?.value, prototype: prototype?.value, ...(pass ? {} : { reason: "surface expected value mismatch" }) };
  };
  return expected.some(value => value && typeof value.then === "function")
    ? Promise.all(expected).then(compare) : compare(expected);
}

export function validateRuntimeResults(spec, evidenceRows, hashString) {
  const observed = evidenceRows.flatMap(row => (row.runtimeChecks ?? []).map(result => ({ ...result, rowId: row.rowId })));
  const indexed = index(observed, "runtime results", spec.fidelity.runtimeChecks.length === 0);
  check(indexed.size === spec.fidelity.runtimeChecks.length, "runtime results incomplete or extra");
  for (const expected of spec.fidelity.runtimeChecks) {
    const result = indexed.get(expected.id);
    check(result?.status === "pass" && result.rowId === expected.rowId, "runtime result missing, failed, or attached to wrong row");
    check(canonical(result.query) === canonical(expected.query), "runtime query drift");
    check(result.steps.length === expected.steps.length, "runtime steps incomplete");
    expected.steps.forEach((step, i) => {
      const actual = result.steps[i];
      check(canonical(actual.action) === canonical(step.action) && actual.status === "pass", "runtime action drift or failure");
      check(actual.assertions.length === step.assertions.length, "runtime assertions incomplete");
      step.assertions.forEach((assertion, j) => check(actual.assertions[j].probeId === assertion.probeId && actual.assertions[j].status === "pass" && canonical(actual.assertions[j].value) === canonical(normalizeExpectedProbeValue(spec.probes.find(probe => probe.id === assertion.probeId), assertion.expected, actual.assertions[j].value, hashString)), "runtime expected result mismatch"));
    });
  }
  return "pass";
}

export function validateFidelityAudit(audit, evidence, spec, hashString) {
  keys(audit, ["binding", "staticChecks", "requirements", "visualChecks"], "audit");
  const expectedBinding = Object.fromEntries(["goalSha256", "prototypeRevision", "validationProfileDigest", "sources"].map(key => [key, evidence[key]]));
  check(canonical(audit.binding) === canonical(expectedBinding), "audit binding is stale");
  const statics = index(audit.staticChecks, "static evidence");
  check(statics.size === spec.fidelity.staticChecks.length, "static checks missing or extra");
  for (const expected of spec.fidelity.staticChecks) {
    const actual = statics.get(expected.id);
    check(actual?.exitCode === 0 && actual.command === expected.command && canonical(actual.scope) === canonical(expected.scope) && /^sha256:[a-f0-9]{64}$/.test(actual.logDigest), "static check not successful or command/scope/log missing");
  }
  validateRuntimeResults(spec, evidence.rows, hashString);
  const visual = index(audit.visualChecks, "visual evidence");
  check(visual.size === spec.fidelity.visualChecks.length, "visual evidence incomplete or extra");
  for (const expected of spec.fidelity.visualChecks) {
    const actual = visual.get(expected.id);
    check(actual?.status === "pass" && actual.contentVerified === true, "visual content is blank, missing, or not inspected");
    const artifacts = (evidence.artifactIndex ?? []).filter(item => item.rowId === expected.rowId && item.probeId === expected.probeId && item.kind === "screenshot");
    check(artifacts.length === 2 && new Set(artifacts.map(item => item.surface)).size === 2 && artifacts.every(item => item.bytes > 0), "visual screenshot pair unavailable");
    check(canonical([...actual.artifactDigests].sort()) === canonical(artifacts.map(item => item.sha256).sort()), "visual reviewed artifact drift");
    check(actual.criteriaResults?.length === expected.criteria.length, "visual criteria incomplete");
    expected.criteria.forEach((criterion, i) => check(actual.criteriaResults[i].criterion === criterion && actual.criteriaResults[i].status === "pass" && text(actual.criteriaResults[i].note), "visual criterion failed or uninspected"));
  }
  const requirements = index(audit.requirements, "requirement evidence");
  check(requirements.size === spec.fidelity.requirements.length, "requirement audit incomplete or extra");
  for (const expected of spec.fidelity.requirements) {
    const actual = requirements.get(expected.id);
    const expectedIds = [...expected.probeIds, ...expected.runtimeCheckIds, ...expected.visualCheckIds, ...expected.staticCheckIds, ...expected.interactionGroupIds].sort();
    check(actual?.status === "pass" && text(actual.note) && canonical([...actual.evidenceIds].sort()) === canonical(expectedIds), "requirement not closed by its declared checks");
    for (const probeId of expected.probeIds) check(evidence.rows.some(row => row.status === "pass" && row.probes.some(probe => probe.probeId === probeId && probe.status === "pass")), "requirement probe not executed successfully");
  }
  return { static: "pass", runtime: "pass", requirements: "pass", visual: "pass" };
}
