/** Pure, browser-independent verification compiler. No filesystem or runtime access. */
export const COMPILER_VERSION = "1.0.0";
export const RESOURCE_LIMITS = Object.freeze({ candidates: 1_000_000, cases: 100_000, bytes: 256 * 1024 * 1024 });
const layers = new Set(["unit", "component", "api", "db", "browser", "visual", "static"]);
const actions = new Set(["click", "press", "focus", "fill", "waitForVisible", "waitForHidden", "reload", "hover", "tap"]);
export class VerificationModelError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "VerificationModelError"; this.code = code; this.details = details; }
}
const fail = (code, message, details) => { throw new VerificationModelError(code, message, details); };
const valid = (condition, message, code = "PARITY_MODEL_INVALID") => { if (!condition) fail(code, message); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  valid(value === null || ["string", "boolean", "number"].includes(typeof value), "Non-JSON model value");
  valid(typeof value !== "number" || Number.isFinite(value), "Non-finite number");
  return value;
}
export const serialize = (value) => JSON.stringify(canonical(value));
export async function modelDigest(value) {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialize(value))));
  return `sha256:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
const list = (value, label, nonempty = false) => {
  valid(Array.isArray(value) && (!nonempty || value.length > 0), `${label} must be an array${nonempty ? " with entries" : ""}`);
  return value;
};
const string = (value, label) => { valid(typeof value === "string" && value.trim().length > 0, `${label} must be nonempty`); return value; };
const unique = (values, label) => { valid(new Set(values).size === values.length, `Duplicate ${label}`); return values; };
function indexed(values, label) { return new Map(unique(list(values, label).map((item) => string(item.id, `${label}.id`)), label).map((id, i) => [id, values[i]])); }
function hasFields(value, fields, label, code = "PARITY_MODEL_INVALID") {
  valid(object(value), `${label} must be an object`, code);
  for (const field of fields) valid(Object.hasOwn(value, field), `${label}.${field} is required`, code);
}
function subset(actual, expected, label) { for (const item of actual) valid(expected.has(item), `${label}: ${item}`, "PARITY_REQUIREMENT_GAP"); }

/** Finite declarative predicates. No eval, implicit truthiness, or fallback state. */
export function matches(expression, values) {
  if (expression === null) return true;
  valid(object(expression) && Object.keys(expression).length === 1, "Invalid finite constraint");
  const [operator, operands] = Object.entries(expression)[0];
  if (operator === "all" || operator === "any") {
    list(operands, operator, true);
    return operator === "all" ? operands.every((entry) => matches(entry, values)) : operands.some((entry) => matches(entry, values));
  }
  valid(["eq", "in", "lt", "lte", "gt", "gte"].includes(operator), `Unsupported constraint ${operator}`);
  valid(Array.isArray(operands) && operands.length === 2 && Object.hasOwn(values, operands[0]), "Unknown constraint factor");
  const [factor, expected] = operands;
  const actual = values[factor];
  if (operator === "eq") return serialize(actual) === serialize(expected);
  if (operator === "in") return list(expected, "in", true).some((item) => serialize(item) === serialize(actual));
  valid(typeof actual === "number" && typeof expected === "number", "Ordered comparison needs numeric factors");
  return ({ lt: actual < expected, lte: actual <= expected, gt: actual > expected, gte: actual >= expected })[operator];
}
function* combinations(values, size, start = 0, prefix = []) {
  if (size === 0) { yield prefix; return; }
  for (let i = start; i <= values.length - size; i++) yield* combinations(values, size - 1, i + 1, [...prefix, values[i]]);
}
function* product(factors, names = Object.keys(factors).sort(), index = 0, values = {}) {
  if (index === names.length) { yield values; return; }
  const name = names[index];
  for (const value of factors[name]) yield* product(factors, names, index + 1, { ...values, [name]: value });
}
function resolve(value, factors) {
  if (object(value) && Object.keys(value).length === 1 && Object.hasOwn(value, "factor")) {
    valid(Object.hasOwn(factors, value.factor), `Unknown binding ${value.factor}`); return factors[value.factor];
  }
  if (Array.isArray(value)) return value.map((entry) => resolve(entry, factors));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry, factors)]));
  return value;
}
function normalizedUrl(raw) {
  string(raw, "surface URL");
  const url = new URL(raw, "http://verification.invalid");
  url.searchParams.sort();
  return raw.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.href;
}
export function executionConditions(scenario, factors, targetId) {
  const conditions = resolve(scenario.conditions, factors);
  hasFields(conditions, ["route", "surfaces", "fixture", "authorization", "locale", "timezone", "setup", "reset", "isolation", "viewport", "dpr", "scroll", "theme", "environment", "props", "portal", "ancestor", "dictionary"], "scenario.conditions");
  hasFields(conditions.fixture, ["id", "seed", "dataDigest"], "fixture");
  hasFields(conditions.authorization, ["profile", "role", "tenant"], "authorization");
  hasFields(conditions.surfaces, ["production", "prototype"], "surfaces");
  return { ...conditions, targetId, type: scenario.type, route: normalizedUrl(conditions.route),
    surfaces: Object.fromEntries(Object.entries(conditions.surfaces).map(([key, value]) => [key, normalizedUrl(value)])),
    checkpoints: resolve(scenario.checkpoints, factors).map(({ id, actions: steps, wait }) => ({ id, actions: steps, wait })),
  };
}

export function validateVerificationSchema(contract, profile, requirements) {
  valid(contract?.version === 3 && profile?.version === 5, "Verification model requires contract 3/profile 5");
  hasFields(contract, ["productionBaseline", "comparisonConditions", "visualInvariants", "comparisonTargets", "requirementsBundle"], "contract");
  hasFields(profile, ["groups", "scenarios", "obligations", "originalCriteria", "substitutions", "boundaryInventory", "interactionObligations", "sourceInventory", "sourceImpactMap", "costPolicy", "operationCategories"], "profile");
  hasFields(requirements, ["requirements", "obligations", "originalCriteria", "risks", "boundaries", "runtimeSteps", "tuples"], "requirements bundle");
  const targets = indexed(contract.comparisonTargets, "targets");
  valid(targets.size > 0, "No targets");
  for (const target of targets.values()) {
    const states = indexed(target.states, `${target.id}.states`);
    list(target.applicableStateIds, "applicableStateIds", true);
    unique(target.applicableStateIds, "applicable states");
    for (const id of target.applicableStateIds) {
      const state = states.get(id);
      valid(state && state.identity && state.when !== undefined && !state.fallback, `Missing state identity/applicability ${target.id}/${id}`);
      hasFields(state.identity, ["selector", "expected"], "state.identity");
      list(state.scenarioIds, "state.scenarioIds", true);
    }
    valid(states.size === target.applicableStateIds.length, "Undefined or inapplicable state must not enter model");
  }
  const scenarios = indexed(profile.scenarios, "scenarios");
  for (const scenario of scenarios.values()) {
    valid(targets.has(scenario.targetId) && ["snapshot", "flow"].includes(scenario.type), "Invalid scenario target/type");
    list(scenario.checkpoints, "scenario.checkpoints", true);
    unique(scenario.checkpoints.map(({ id }) => id), "checkpoint IDs");
    for (const checkpoint of scenario.checkpoints) {
      hasFields(checkpoint, ["id", "actions", "wait"], "checkpoint");
      for (const action of list(checkpoint.actions, "actions")) valid(actions.has(action.type), `Unsupported action ${action.type}`);
    }
    if (scenario.type === "snapshot") valid(scenario.checkpoints.every((item) => item.actions.length === 0), "Snapshot cannot stand in for flow");
  }
  const obligations = indexed(profile.obligations, "obligations");
  valid(serialize(profile.interactionObligations) === serialize(requirements.tuples), "Required interaction inventory changed", "PARITY_REQUIREMENT_GAP");
  for (const interaction of profile.interactionObligations) {
    hasFields(interaction, ["id", "groupId", "factors", "strength", "when", "reason"], "interaction obligation");
    const group = profile.groups.find((item) => item.id === interaction.groupId);
    valid(group && group.interactions.some((item) => item.strength >= interaction.strength && interaction.factors.every((factor) => item.factors.includes(factor))), "Required tuple strength is not retained", "PARITY_REQUIREMENT_GAP");
  }
  const authoritative = indexed(requirements.obligations, "authoritative obligations");
  valid(obligations.size === authoritative.size, "Obligation inventory differs from input bundle", "PARITY_REQUIREMENT_GAP");
  for (const obligation of obligations.values()) {
    hasFields(obligation, ["requirementIds", "layer", "targetId", "scenarioId", "when", "checkpointId", "assertion", "expected", "requiredCapabilities", "sourcePaths", "riskIds", "boundaryIds", "runtimeStepIds", "criterionIds", "tupleIds", "artifactRequests"], `obligation ${obligation.id}`);
    valid(layers.has(obligation.layer) && targets.has(obligation.targetId), "Invalid obligation layer/target");
    valid(serialize(obligation) === serialize(authoritative.get(obligation.id) ?? null), `Altered obligation ${obligation.id}`, "PARITY_REQUIREMENT_GAP");
    const scenario = scenarios.get(obligation.scenarioId);
    valid(scenario?.targetId === obligation.targetId && scenario.checkpoints.some((item) => item.id === obligation.checkpointId), "Unreachable obligation checkpoint");
    hasFields(obligation.assertion, ["kind", "selector", "pure"], "assertion");
    valid(["visibility", "text", "attribute", "value", "disabled", "count", "geometry", "computedStyle", "focus", "route", "overflow", "console", "network", "screenshot"].includes(obligation.assertion.kind), "Unsupported model assertion kind");
    if (obligation.assertion.kind === "screenshot") valid(obligation.layer === "visual", "Screenshot assertion requires a visual obligation");
    valid(typeof obligation.assertion.pure === "boolean", "Assertion purity must be explicit");
    if (!["browser", "visual"].includes(obligation.layer)) hasFields(obligation.test, ["path", "caseId", "command", "input", "environment", "capabilities"], "layer test");
    for (const request of obligation.artifactRequests) valid(["screenshot", "dom", "accessibility"].includes(request), "Unknown artifact request");
    if (obligation.layer === "visual") valid(obligation.artifactRequests.includes("screenshot") && obligation.criterionIds.length > 0, "Visual obligation needs image and criterion");
  }
  for (const [field, ids] of Object.entries({ requirements: "requirementIds", risks: "riskIds", boundaries: "boundaryIds", runtimeSteps: "runtimeStepIds", tuples: "tupleIds" })) {
    const covered = new Set([...obligations.values()].flatMap((item) => item[ids]));
    subset(list(requirements[field], field).map((item) => typeof item === "string" ? item : item.id), covered, `Missing ${field}`);
  }
  valid(serialize(profile.originalCriteria) === serialize(requirements.originalCriteria), "Original criteria altered", "PARITY_REQUIREMENT_GAP");
  for (const criterion of profile.originalCriteria) {
    hasFields(criterion, ["id", "text", "textDigest", "requirementIds", "conditions", "childObligationIds"], "originalCriterion");
    list(criterion.childObligationIds, "criterion children", true);
    subset(criterion.childObligationIds, new Set(obligations.keys()), "Missing criterion child");
    for (const id of criterion.childObligationIds) valid(obligations.get(id).criterionIds.includes(criterion.id), "Criterion child reverse mapping missing", "PARITY_REQUIREMENT_GAP");
  }
  indexed(profile.groups, "groups");
  for (const group of profile.groups) {
    valid(targets.has(group.targetId), "Unknown group target");
    string(group.unitId, "unitId");
    hasFields(group, ["factors", "constraints", "interactions", "seeds", "scenarioIds", "obligationIds"], "group");
    for (const [name, values] of Object.entries(group.factors)) unique(list(values, `factor ${name}`, true).map(serialize), `factor ${name}`);
    list(group.interactions, "interactions", true);
    const coveredFactors = new Set();
    for (const interaction of group.interactions) {
      string(interaction.reason, "interaction reason");
      valid(Number.isInteger(interaction.strength) && interaction.strength >= 1 && interaction.strength <= 4 && interaction.strength <= interaction.factors.length, "Invalid interaction strength");
      unique(interaction.factors, "interaction factors");
      for (const factor of interaction.factors) { valid(Object.hasOwn(group.factors, factor), "Unknown interaction factor"); coveredFactors.add(factor); }
    }
    valid(Object.keys(group.factors).every((factor) => coveredFactors.has(factor)), "Factor lacks reasoned interaction coverage");
    subset(group.obligationIds, new Set(obligations.keys()), "Unknown group obligation");
    subset(group.scenarioIds, new Set(scenarios.keys()), "Unknown group scenario");
  }
  const categories = ["save-reload", "conflict", "input-boundary", "dirty-cancel-confirm", "failure-retention", "double-submit", "stale-response"];
  for (const category of categories) {
    const entry = profile.operationCategories[category];
    valid(entry && typeof entry.applicable === "boolean", `Missing operation category ${category}`);
    if (!entry.applicable) string(entry.reason, "Nonapplicability reason");
    else {
      const linked = list(entry.obligationIds, "operation obligations", true).map((id) => obligations.get(id));
      valid(linked.every(Boolean) && linked.some((item) => ["unit", "api", "db"].includes(item.layer)) && linked.some((item) => item.layer === "browser" && scenarios.get(item.scenarioId).type === "flow"), `Missing domain/UI connection ${category}`, "PARITY_REQUIREMENT_GAP");
    }
  }
  return { targets, scenarios, obligations };
}

function sourceClosures(profile, obligations) {
  const sources = indexed(profile.sourceInventory, "sourceInventory");
  const impacts = indexed(profile.sourceImpactMap, "sourceImpactMap");
  valid(sources.size === impacts.size && [...sources.keys()].every((id) => impacts.has(id)), "sourceImpactMap must cover source inventory");
  const closure = (paths) => {
    const visited = new Set(); let unknown = false;
    const visit = (id) => {
      if (visited.has(id)) return;
      const source = sources.get(id); valid(source, `Unknown source ${id}`);
      visited.add(id); string(source.digest, "source.digest");
      if (source.unresolved === true) unknown = true;
      for (const dependency of list(source.dependencies, "source dependencies")) visit(dependency);
    };
    paths.forEach(visit);
    return { sources: [...visited].sort().map((id) => ({ id, digest: sources.get(id).digest })), unknown };
  };
  const byObligation = Object.fromEntries([...obligations].map(([id, obligation]) => [id, closure(obligation.sourcePaths)]));
  const allTargets = new Set([...obligations.values()].map((item) => item.targetId));
  for (const [id, impact] of impacts) {
    valid(["target", "shared", "global", "unknown"].includes(impact.scope), `Invalid impact scope ${id}`);
    const actual = [...new Set([...obligations.values()].filter((item) => byObligation[item.id].sources.some((source) => source.id === id)).map((item) => item.targetId))].sort();
    if (impact.scope === "unknown") { valid(sources.get(id).unresolved === true, "Unknown impact needs unresolved dependency"); continue; }
    valid(serialize([...impact.targetIds].sort()) === serialize(actual), `Incorrect transitive consumers ${id}`);
    if (impact.scope === "target") valid(actual.length === 1, "target scope must have one consumer");
    if (impact.scope === "shared") valid(actual.length > 1, "shared scope needs multiple consumers");
    if (impact.scope === "global") { string(impact.reason, "global source reason"); valid(actual.length === allTargets.size, "global scope lacks all consumers"); }
  }
  return byObligation;
}

function tupleKeys(group, values) {
  const result = new Set();
  for (const interaction of group.interactions) for (const names of combinations([...interaction.factors].sort(), interaction.strength)) {
    result.add(serialize(names.map((name) => [name, values[name]])));
  }
  return [...result].sort();
}

export async function compileVerificationModel({ contract, profile, requirements, sourceDigests = {}, proofResults = [], compilerDigest = null, mode = "coverage", context = "plan" }) {
  const { targets, scenarios, obligations } = validateVerificationSchema(contract, profile, requirements);
  valid(["coverage", "full"].includes(mode), "Invalid model selection mode");
  if (mode === "full") valid(["release", "ci", "scheduled", "explicit"].includes(context), "Full selection requires explicit full context");
  for (const criterion of profile.originalCriteria) valid(criterion.textDigest === await modelDigest(criterion.text), `Criterion text digest changed ${criterion.id}`, "PARITY_REQUIREMENT_GAP");
  const inputDigests = { contract: await modelDigest(contract), profile: await modelDigest(profile), requirements: await modelDigest(requirements) };
  valid(contract.requirementsBundle.digest === inputDigests.requirements, "Requirements bundle digest differs", "PARITY_REQUIREMENT_GAP");
  const currentProfile = { ...profile, sourceInventory: profile.sourceInventory.map((source) => ({ ...source, digest: sourceDigests[source.id] ?? source.digest })) };
  const dependencies = sourceClosures(currentProfile, obligations);
  inputDigests.sources = await modelDigest(currentProfile.sourceInventory);
  inputDigests.compiler = compilerDigest ?? await modelDigest(COMPILER_VERSION);
  let candidateCount = 0n;
  const groupCounts = profile.groups.map((group) => {
    const count = Object.values(group.factors).reduce((total, values) => total * BigInt(values.length), 1n);
    candidateCount += count; return { id: group.id, targetId: group.targetId, unitId: group.unitId, candidateCount: count.toString() };
  });
  if (candidateCount > BigInt(RESOURCE_LIMITS.candidates)) return {
    version: 1, compilerVersion: COMPILER_VERSION, status: "resource-limit", inputDigests, candidateCount: candidateCount.toString(), applicableCount: null, executionCount: null, cases: null,
    groups: groupCounts, diagnostics: [{ code: "PARITY_MODEL_RESOURCE_LIMIT", unresolvedGroups: groupCounts.map(({ id }) => id), reason: "Symbolic candidates exceed evaluation budget; split groups", limits: RESOURCE_LIMITS }],
  };
  let evaluations = 0;
  const accountEvaluation = (groupId) => {
    evaluations++;
    if (evaluations > RESOURCE_LIMITS.candidates) fail("PARITY_MODEL_RESOURCE_LIMIT", "Candidate evaluation budget exceeded; split the model", { groupId, candidateCount: candidateCount.toString(), evaluations, limits: RESOURCE_LIMITS });
  };
  const selected = []; const requiredCoverageKeys = new Set(); const coveredObligations = new Set(); let applicableCount = 0; let bytes = 0;
  for (const group of [...profile.groups].sort((a, b) => a.id.localeCompare(b.id))) {
    const candidates = [];
    const target = targets.get(group.targetId);
    for (const factors of product(group.factors)) {
      accountEvaluation(group.id);
      if (!matches(group.constraints, factors)) continue;
      const stateId = factors.state;
      valid(typeof stateId === "string" && target.applicableStateIds.includes(stateId), `Inapplicable state ${group.targetId}/${stateId}`);
      const state = target.states.find(({ id }) => id === stateId);
      if (!matches(state.when, factors)) continue;
      const applicable = group.obligationIds.map((id) => obligations.get(id)).filter((item) => matches(item.when, factors));
      const activeScenarios = group.scenarioIds.filter((id) => state.scenarioIds.includes(id));
      valid(activeScenarios.length > 0, "State has no reachable scenario");
      const active = applicable.filter((item) => activeScenarios.includes(item.scenarioId));
      valid(active.length > 0, "Candidate has no applicable obligation");
      applicableCount++;
      const tuples = tupleKeys(group, factors).map((key) => `tuple:${group.id}:${key}`);
      const tokens = new Set([...tuples, ...active.map((item) => `obligation:${item.id}`)]);
      tokens.forEach((token) => requiredCoverageKeys.add(token));
      const candidate = { groupId: group.id, targetId: group.targetId, unitId: group.unitId, factors, obligationIds: active.map(({ id }) => id).sort(), tokens, stateIdentity: resolve(state.identity, factors) };
      bytes += serialize({ ...candidate, tokens: [...tokens] }).length * 2;
      if (bytes > RESOURCE_LIMITS.bytes) fail("PARITY_MODEL_RESOURCE_LIMIT", "Working set limit exceeded", { groupId: group.id, candidateCount: candidateCount.toString(), unresolvedTokens: [...tokens], limits: RESOURCE_LIMITS });
      candidates.push(candidate);
    }
    const remaining = new Set(candidates.flatMap((item) => [...item.tokens]));
    const pick = (candidate) => { if (selected.includes(candidate)) return; if (selected.length >= RESOURCE_LIMITS.cases) fail("PARITY_MODEL_RESOURCE_LIMIT", "Selected case budget exceeded", { groupId: group.id, candidateCount: candidateCount.toString() }); selected.push(candidate); candidate.tokens.forEach((token) => remaining.delete(token)); };
    for (const seed of group.seeds) {
      string(seed.reason, "seed reason");
      const matching = candidates.filter((item) => matches(seed.when, item.factors));
      valid(matching.length > 0, `Unreachable seed ${group.id}`, "PARITY_REQUIREMENT_GAP");
      matching.forEach(pick);
    }
    if (mode === "full") candidates.forEach(pick);
    else while (remaining.size > 0) {
      let best; let score = 0;
      for (const candidate of candidates) {
        accountEvaluation(group.id);
        const count = [...candidate.tokens].filter((token) => remaining.has(token)).length;
        if (count > score) { score = count; best = candidate; }
      }
      valid(best, "Unreachable coverage obligation", "PARITY_REQUIREMENT_GAP"); pick(best);
      if (selected.length > RESOURCE_LIMITS.cases) fail("PARITY_MODEL_RESOURCE_LIMIT", "Selected case limit exceeded", { groupId: group.id, unresolvedTokens: [...remaining] });
    }
    Object.assign(groupCounts.find(({ id }) => id === group.id), { applicableCount: candidates.length, selectedCount: selected.filter((item) => item.groupId === group.id).length, tupleCount: new Set(candidates.flatMap((item) => [...item.tokens].filter((token) => token.startsWith("tuple:")))).size });
  }
  for (const selectedCase of selected) selectedCase.obligationIds.forEach((id) => coveredObligations.add(id));
  subset([...obligations.keys()], coveredObligations, "Unreachable original obligation");
  const executions = new Map(); let executionCandidateCount = 0; let conditionDuplicateCandidates = 0;
  const conditionKeys = new Set();
  for (const candidate of selected) {
    for (const scenarioId of [...new Set(candidate.obligationIds.map((id) => obligations.get(id).scenarioId))].sort()) {
      const scenario = scenarios.get(scenarioId);
      const conditions = executionConditions(scenario, candidate.factors, candidate.targetId);
      const executionKey = await modelDigest(conditions);
      const linked = candidate.obligationIds.map((id) => obligations.get(id)).filter((item) => item.scenarioId === scenarioId);
      // Separate non-Browser layers and impure observations. A test exit code is never a Browser result.
      for (const layer of [...new Set(linked.map((item) => item.layer === "visual" ? "browser" : item.layer))].sort()) {
        const groupObligations = linked.filter((item) => (item.layer === "visual" ? "browser" : item.layer) === layer);
        executionCandidateCount++;
        const conditionKey = `${executionKey}:${layer}`;
        if (conditionKeys.has(conditionKey)) conditionDuplicateCandidates++; conditionKeys.add(conditionKey);
        const pure = groupObligations.every((item) => item.assertion.pure) && conditions.isolation === "reset-between-executions";
        const key = pure ? conditionKey : `${conditionKey}:${candidate.groupId}:${serialize(candidate.factors)}:${serialize(groupObligations.map(({ id }) => id).sort())}`;
        let execution = executions.get(key);
        if (!execution) {
          execution = { targetId: candidate.targetId, unitIds: [], groupIds: [], layer, executionKey, conditions, stateIdentity: candidate.stateIdentity, assertions: [], assertionLinks: [], factorAssignments: [], obligationIds: [], coverageKeys: [], artifactRequests: [], dependencySources: [], separationKey: pure ? null : key, separationReason: pure ? null : "Observation purity or side-effect isolation is unproven" };
          executions.set(key, execution);
        }
        execution.factorAssignments.push(candidate.factors);
        execution.unitIds.push(candidate.unitId); execution.groupIds.push(candidate.groupId); execution.coverageKeys.push(...candidate.tokens);
        for (const obligation of groupObligations) {
          const assertion = { checkpointId: obligation.checkpointId, assertion: resolve(obligation.assertion, candidate.factors), expected: resolve(obligation.expected, candidate.factors), requiredCapabilities: obligation.requiredCapabilities, test: obligation.test ?? null };
          const conflict = execution.assertions.find((entry) => entry.checkpointId === assertion.checkpointId && serialize(entry.assertion) === serialize(assertion.assertion) && serialize(entry.expected) !== serialize(assertion.expected));
          valid(!conflict, `Contradictory expectation ${obligation.id}`);
          execution.assertions.push(assertion); execution.assertionLinks.push({ obligationId: obligation.id, assertion }); execution.obligationIds.push(obligation.id); execution.artifactRequests.push(...obligation.artifactRequests);
          execution.dependencySources.push(...dependencies[obligation.id].sources);
        }
      }
    }
  }
  const cases = [];
  for (const execution of executions.values()) {
    for (const field of ["unitIds", "groupIds", "obligationIds", "coverageKeys", "artifactRequests"]) execution[field] = [...new Set(execution[field])].sort();
    for (const field of ["assertions", "assertionLinks", "factorAssignments", "dependencySources"]) execution[field] = [...new Map(execution[field].map((entry) => [serialize(entry), entry])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => entry);
    const caseKey = await modelDigest({ executionKey: execution.executionKey, layer: execution.layer, assertions: execution.assertions, stateIdentity: execution.stateIdentity, separationKey: execution.separationKey });
    const reuseKey = await modelDigest({ caseKey, compilerDigest: inputDigests.compiler, dependencySources: execution.dependencySources, artifactRequests: execution.artifactRequests });
    cases.push({ ...execution, id: `${execution.targetId}:${caseKey.slice(7, 31)}`, caseKey, reuseKey });
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  const compiled = { version: 1, compilerVersion: COMPILER_VERSION, status: "complete", inputDigests, candidateCount: candidateCount.toString(), applicableCount, executionCandidateCount, conditionDuplicateCandidates, executionCount: cases.length, safeMergedCount: executionCandidateCount - cases.length, groups: groupCounts, evaluations, cases, obligations: profile.obligations, originalCriteria: profile.originalCriteria, requiredCoverageKeys: [...requiredCoverageKeys].sort(), dependencies, diagnostics: [] };
  const semanticProfile = { ...profile };
  delete semanticProfile.costPolicy;
  delete semanticProfile.batchPolicy;
  for (const field of ["groups", "scenarios", "obligations", "originalCriteria", "substitutions", "boundaryInventory", "interactionObligations", "sourceInventory", "sourceImpactMap"]) semanticProfile[field] = [...semanticProfile[field]].sort((a, b) => a.id.localeCompare(b.id));
  compiled.semanticDigest = await modelDigest({ contract: { ...contract, comparisonTargets: [...contract.comparisonTargets].sort((a, b) => a.id.localeCompare(b.id)) }, profile: semanticProfile });
  compiled.executionPlanDigest = await modelDigest({ cases, mode });
  compiled.substitutions = await verifySubstitutions(currentProfile, compiled, { context, results: proofResults });
  validateBoundaryCoverage(profile, compiled);
  compiled.allCases = compiled.cases;
  compiled.substitutionCoverage = [];
  for (const certificate of profile.substitutions) {
    const verified = compiled.substitutions.find((item) => item.id === certificate.id);
    if (verified.status !== "certified") continue;
    for (const item of compiled.cases) {
      if (!item.obligationIds.every((id) => certificate.originalObligationIds.includes(id)) ||
        !certificate.originalConditions.some((conditions) => serialize(conditions) === serialize(item.conditions)) ||
        !item.assertions.every((assertion) => certificate.observationPoints.includes(assertion.checkpointId) && certificate.expectedResults.some((expected) => serialize(expected) === serialize(assertion.expected)))) continue;
      const applicable = item.assertions.every((assertion) => certificate.applicability.some((scope) => {
        const conditions = item.conditions;
        const expectedScope = { targetId: item.targetId, state: scope.state, props: conditions.props, tenant: conditions.authorization.tenant, role: conditions.authorization.role, locale: conditions.locale, dictionary: conditions.dictionary, fixture: conditions.fixture, viewport: conditions.viewport, dpr: conditions.dpr, theme: conditions.theme, portal: conditions.portal, ancestor: conditions.ancestor, scroll: conditions.scroll, actions: conditions.checkpoints.flatMap((checkpoint) => checkpoint.actions), checkpointId: assertion.checkpointId };
        return item.factorAssignments.some((factors) => factors.state === scope.state) && serialize(scope) === serialize(expectedScope);
      }));
      valid(applicable, "Certificate applicability does not include the full original conditions", "PARITY_SUBSTITUTION_INVALID");
      compiled.substitutionCoverage.push({ caseId: item.id, certificateId: certificate.id, obligationIds: item.obligationIds, coverageKeys: item.coverageKeys, resultDigests: verified.resultDigests });
    }
  }
  const replacedIds = new Set(compiled.substitutionCoverage.map((item) => item.caseId));
  compiled.cases = compiled.cases.filter((item) => !replacedIds.has(item.id));
  compiled.executionCount = compiled.cases.length;
  compiled.executionPlanDigest = await modelDigest({ cases: compiled.cases, substitutionCoverage: compiled.substitutionCoverage, mode });
  compiled.proofResults = proofResults;
  return compiled;
}

/** Validate certificates against independent inputs; pending checks never authorize omission. */
export async function verifySubstitutions(profile, compiled, { results = [], context = "plan" } = {}) {
  const certificates = indexed(profile.substitutions, "substitutions");
  const obligations = indexed(profile.obligations, "obligations");
  const criteria = indexed(profile.originalCriteria, "originalCriteria");
  const sources = indexed(profile.sourceInventory, "sourceInventory");
  const fields = ["kind", "originalObligationIds", "originalCriterionIds", "requirementIds", "originalConditions", "expectedResults", "observationPoints", "retainedRiskIds", "retainedBoundaryIds", "retainedTupleIds", "retainedRuntimeIds", "applicability", "evidenceSources", "representativeCaseIds", "selectionReason", "consumerIntegrationObligationIds", "replacementChecks", "residualRisks", "invalidation", "fallbackObligationIds", "dependsOn"];
  const visiting = new Set(); const visited = new Set();
  const visit = (id) => {
    valid(certificates.has(id) && !visiting.has(id), `Cyclic/unknown substitution ${id}`, "PARITY_SUBSTITUTION_INVALID");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of certificates.get(id).dependsOn ?? []) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const id of certificates.keys()) visit(id);
  const output = [];
  for (const certificate of certificates.values()) {
    const code = "PARITY_SUBSTITUTION_INVALID";
    hasFields(certificate, fields, `substitution ${certificate.id}`, code);
    valid(["factor-split", "component-representative", "layer-transfer", "image-share"].includes(certificate.kind), "Unknown substitution kind", code);
    list(certificate.originalObligationIds, "original obligations", true);
    subset(certificate.originalObligationIds, new Set(obligations.keys()), "Certificate original missing");
    subset(certificate.originalCriterionIds, new Set(criteria.keys()), "Certificate criterion missing");
    subset(certificate.fallbackObligationIds, new Set(obligations.keys()), "Certificate fallback missing");
    subset(certificate.originalObligationIds, new Set(certificate.fallbackObligationIds), "Original fallback missing");
    const originals = certificate.originalObligationIds.map((id) => obligations.get(id));
    for (const [originalField, retainedField] of [["requirementIds", "requirementIds"], ["riskIds", "retainedRiskIds"], ["boundaryIds", "retainedBoundaryIds"], ["tupleIds", "retainedTupleIds"], ["runtimeStepIds", "retainedRuntimeIds"]]) {
      subset(originals.flatMap((item) => item[originalField]), new Set(certificate[retainedField]), "Certificate drops required coverage");
    }
    list(certificate.applicability, "finite applicability", true);
    for (const scope of certificate.applicability) {
      hasFields(scope, ["targetId", "state", "props", "tenant", "role", "locale", "dictionary", "fixture", "viewport", "dpr", "theme", "portal", "ancestor", "scroll", "actions", "checkpointId"], "certificate applicability", code);
      valid(Object.values(scope).every((value) => value !== "*" && value !== undefined), "Unbounded substitution applicability", code);
    }
    string(certificate.selectionReason, "representative selection reason");
    const sourceIds = new Set(certificate.evidenceSources.map(({ path }) => path));
    for (const evidence of certificate.evidenceSources) {
      hasFields(evidence, ["path", "symbol", "digest", "dependencies", "equivalence"], "certificate evidence", code);
      const current = sources.get(evidence.path);
      valid(current?.digest === evidence.digest && current.unresolved !== true, `Stale/unresolved certificate source ${evidence.path}`, code);
      valid(serialize([...evidence.dependencies].sort()) === serialize([...current.dependencies].sort()), "Certificate dependency closure changed", code);
      subset(current.dependencies, sourceIds, "Certificate dependency not covered");
    }
    for (const original of originals) subset(compiled.dependencies[original.id].sources.map(({ id }) => id), sourceIds, "Certificate omits source dependency");
    subset(certificate.consumerIntegrationObligationIds, new Set(obligations.keys()), "Consumer connection missing");
    if (certificate.kind === "component-representative") {
      const consumers = new Set(profile.obligations.filter((item) => item.sourcePaths.some((source) => sourceIds.has(source))).map((item) => item.targetId));
      const linked = new Set(certificate.consumerIntegrationObligationIds.map((id) => obligations.get(id).targetId));
      subset(consumers, linked, "Unverified consumer");
    }
    for (const risk of certificate.residualRisks) { string(risk.description, "residual risk"); subset(risk.obligationIds, new Set(obligations.keys()), "Residual risk missing"); }
    list(certificate.invalidation, "invalidation", true);
    list(certificate.replacementChecks, "replacement checks", true);
    const requiredCapabilities = new Set(originals.flatMap((item) => item.requiredCapabilities));
    const supported = new Set(certificate.replacementChecks.flatMap((item) => item.capabilities));
    subset(requiredCapabilities, supported, "Replacement lacks observation capability");
    let pending = false; const resultDigests = [];
    for (const check of certificate.replacementChecks) {
      hasFields(check, ["path", "caseId", "layer", "command", "input", "assertion", "expected", "environment", "capabilities", "resultDigest"], "replacement check", code);
      valid(layers.has(check.layer), "Unknown replacement layer", code);
      const source = sources.get(check.path); valid(source, "Replacement test missing from inventory", code);
      const result = results.find((entry) => check.resultDigest !== null ? entry.digest === check.resultDigest : entry.path === check.path && entry.caseId === check.caseId && serialize(entry.input) === serialize(check.input) && serialize(entry.environment) === serialize(check.environment));
      if (!result && check.resultDigest === null) { pending = true; continue; }
      valid(result && result.status === "pass" && result.caseId === check.caseId && result.path === check.path && result.layer === check.layer && result.sourceDigest === source.digest && serialize(result.input) === serialize(check.input) && serialize(result.expected) === serialize(check.expected) && serialize(result.assertion) === serialize(check.assertion) && serialize(result.environment) === serialize(check.environment), "Missing/fake/stale replacement result", code);
      const { digest: ignored, ...payload } = result;
      void ignored;
      valid(await modelDigest(payload) === result.digest, "Replacement result digest mismatch", code);
      subset(check.capabilities, new Set(result.capabilities), "Actual result lacks capability");
      valid(serialize(result.dependencyDigests) === serialize(Object.fromEntries(certificate.evidenceSources.map((entry) => [entry.path, entry.digest]))), "Replacement result dependency closure differs", code);
      resultDigests.push(result.digest);
    }
    if (certificate.kind === "factor-split") {
      hasFields(certificate, ["tupleMapping", "calibration", "coupledProperties"], "factor split", code);
      valid(certificate.coupledProperties.length === 0, "Layout/theme interaction cannot be split", code);
      subset(certificate.retainedTupleIds, new Set(certificate.tupleMapping.map(({ original }) => original)), "Original tuple mapping missing");
      valid(certificate.tupleMapping.every((entry) => entry.replacement.length > 0), "Empty tuple replacement", code);
      valid(certificate.calibration.capabilities.includes("real-browser-layout") && certificate.calibration.capabilities.includes("real-browser-focus"), "Factor split requires real Browser calibration", code);
      if (certificate.calibration.resultDigest === null) pending = true;
      else valid(results.some((entry) => entry.digest === certificate.calibration.resultDigest && entry.status === "pass"), "Missing calibration result", code);
    }
    output.push({ id: certificate.id, semanticDigest: await modelDigest(certificate), status: pending ? "pending" : "certified", originalObligationIds: certificate.originalObligationIds, fallbackObligationIds: certificate.fallbackObligationIds, consumerIntegrationObligationIds: certificate.consumerIntegrationObligationIds, resultDigests, unresolvedReasons: pending ? ["Replacement or calibration has not run; original fallback remains required"] : [], context });
  }
  return output;
}

/** Content/dependency-based invalidation; HEAD is deliberately provenance only. */
export function invalidationForSources(compiled, changedSources) {
  return changedSources.map((source) => {
    const unknown = Object.values(compiled.dependencies).some((entry) => entry.unknown);
    const obligationIds = Object.entries(compiled.dependencies).filter(([, entry]) => unknown || entry.sources.some(({ id }) => id === source)).map(([id]) => id).sort();
    return { source, obligationIds, caseIds: compiled.cases.filter((item) => item.obligationIds.some((id) => obligationIds.includes(id))).map(({ id }) => id), conservative: unknown };
  });
}


export function validateBoundaryCoverage(profile, compiled) {
  for (const boundary of profile.boundaryInventory) {
    hasFields(boundary, ["id", "axis", "unit", "operator", "value", "step", "when", "targetIds", "sourcePaths", "sides"], "boundary");
    valid(["width", "height", "container-width", "container-height", "effective-zoom", "native-zoom"].includes(boundary.axis), "Unknown boundary axis");
    valid(["lt", "lte", "gt", "gte"].includes(boundary.operator) && Number.isFinite(boundary.value) && boundary.step > 0, "Invalid boundary comparison");
    valid(boundary.sides.length === 2 && new Set(boundary.sides.map((side) => side.matches)).size === 2, "Boundary requires both sides", "PARITY_REQUIREMENT_GAP");
    for (const side of boundary.sides) {
      hasFields(side, ["matches", "value", "obligationIds", "expected"], "boundary side");
      valid(typeof side.matches === "boolean" && Number.isFinite(side.value), "Invalid boundary point");
      const actual = matches({ [boundary.operator]: ["point", boundary.value] }, { point: side.value });
      valid(actual === side.matches, "Boundary point is on wrong comparison side");
      list(side.obligationIds, "boundary side obligations", true);
      for (const id of side.obligationIds) {
        const obligation = compiled.obligations.find((item) => item.id === id);
        valid(obligation?.boundaryIds.includes(boundary.id), "Boundary side lacks obligation", "PARITY_REQUIREMENT_GAP");
        valid(serialize(obligation.expected) === serialize(side.expected), "Boundary expectation is not asserted", "PARITY_REQUIREMENT_GAP");
        const cases = compiled.cases.filter((item) => item.obligationIds.includes(id));
        valid(cases.some((item) => boundary.targetIds.includes(item.targetId) && item.factorAssignments.some((factors) => matches(boundary.when, factors)) && (item.conditions.viewport[boundary.axis] ?? item.conditions.environment[boundary.axis]) === side.value), "Boundary side is not executed", "PARITY_REQUIREMENT_GAP");
        subset(boundary.sourcePaths, new Set(compiled.dependencies[id].sources.map((source) => source.id)), "Boundary source missing from obligation closure");
      }
    }
  }
}
