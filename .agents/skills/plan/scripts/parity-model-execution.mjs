/** Shared execution and evidence closure for contract 3/profile 5. No Node APIs. */
import { compileVerificationModel, modelDigest, serialize, VerificationModelError } from "./parity-verification-model.mjs";
import { estimateVerification } from "./parity-estimate.mjs";
const fail = (code, message, details) => { throw new VerificationModelError(code, message, details); };
const requireValue = (condition, message, code = "PARITY_REQUIREMENT_GAP") => { if (!condition) fail(code, message); };
export async function modelPreflight(input, options = {}) {
  const compiled = await compileVerificationModel(input);
  const estimate = await estimateVerification(input, options);
  requireValue(compiled.status === "complete", "Verification model exceeds compiler resources", "PARITY_MODEL_RESOURCE_LIMIT");
  requireValue(estimate.status === "complete", "Verification scale must be redesigned before Browser operations", estimate.diagnostics[0]?.code ?? "PARITY_SCALE_REDESIGN_REQUIRED");
  return { compiled, estimate };
}
export function assertionMatches(actual, expected, assertion) {
  if (assertion.kind === "geometry" && assertion.tolerancePx !== undefined) {
    return Number.isFinite(assertion.tolerancePx) && assertion.tolerancePx >= 0 && Object.keys(expected).length > 0 && Object.keys(expected).every((key) => Number.isFinite(actual?.[key]) && Number.isFinite(expected[key]) && Math.abs(actual[key] - expected[key]) <= assertion.tolerancePx);
  }
  return serialize(actual ?? null) === serialize(expected);
}
export async function validateLayerResult(result, expected, compiledCase) {
  const test = expected.test;
  requireValue(test && result?.status === "pass" && result.path === test.path && result.caseId === test.caseId && result.layer === compiledCase.layer, "Structured test case was not executed");
  requireValue(result.reuseKey === compiledCase.reuseKey && serialize(result.input) === serialize(test.input) && serialize(result.environment) === serialize(test.environment) && serialize(result.assertion) === serialize(expected.assertion) && serialize(result.expected) === serialize(expected.expected), "Test conditions or result binding differs");
  requireValue(expected.requiredCapabilities.every((capability) => result.capabilities?.includes(capability)), "Test result lacks required observation capability");
  const { digest, ...payload } = result;
  requireValue(digest === await modelDigest(payload), "Structured result digest differs");
  return result;
}
function surfaceUrl(conditions, surface) {
  const url = new URL(conditions.surfaces[surface]);
  for (const [key, value] of Object.entries(conditions.query ?? {})) url.searchParams.set(key, String(value));
  const setup = conditions.themeSetup?.[surface] ?? conditions.themeSetup;
  if (setup?.type === "query") url.searchParams.set(setup.parameter, conditions.theme);
  url.searchParams.sort();
  return url.href;
}
function assertLocalSurface(url, surface) {
  const parsed = new URL(url);
  requireValue(parsed.protocol === "http:" && !parsed.username && !parsed.password, "Model Browser URL must be credential-free local HTTP", "PARITY_MODEL_INVALID");
  const port = Number(parsed.port);
  requireValue(surface === "production" ? (parsed.hostname === "localhost" || /^[a-z0-9-]+\.localhost$/u.test(parsed.hostname)) && port >= 3000 && port <= 3005 : parsed.hostname === "127.0.0.1" && port >= 4000 && port <= 4005, "Model Browser URL must use an owned development surface", "PARITY_MODEL_INVALID");
}

export async function executeVerificationPlan(runner, { modelInput, definition, tabs, caseIds, layerResults = [], proofResults = [], baseline = null, run = {}, cleanup = true }) {
  const baseInput = modelInput ?? { contract: definition.contract, profile: definition.spec, requirements: definition.requirements, sourceDigests: definition.sourceDigests, compilerDigest: definition.compilerDigest };
  const input = { ...baseInput, proofResults: proofResults.length ? proofResults : baseInput.proofResults ?? [] };
  // All model/scale checks precede activation, canary, and even cleanup.
  const { compiled, estimate } = await modelPreflight(input, { baseline, context: "implement" });
  const selected = caseIds ? compiled.cases.filter((item) => caseIds.includes(item.id)) : compiled.cases;
  requireValue(!caseIds || selected.length === new Set(caseIds).size, "Execution includes unknown cases");
  const browserCases = selected.filter((item) => item.layer === "browser");
  if (browserCases.length) {
    requireValue(tabs?.production && tabs?.prototype && tabs.production !== tabs.prototype, "Distinct owned Browser tabs are required", "PARITY_COMPARISON_TAB_REQUIRED");
    for (const item of browserCases) for (const surface of ["production", "prototype"]) assertLocalSurface(surfaceUrl(item.conditions, surface), surface);
    for (const method of ["runModelAssertion", "captureModelArtifact", "setModelEnvironment"]) requireValue(typeof runner.adapter[method] === "function", `Common Browser adapter lacks ${method}`, "PARITY_REQUIRED_PROBE_UNAVAILABLE");
  }
  const result = { schemaVersion: 6, kind: "verification-model", phase: "final", runId: run.runId ?? "model-run", generatedAt: new Date().toISOString(), semanticDigest: compiled.semanticDigest, executionPlanDigest: compiled.executionPlanDigest, inputDigests: compiled.inputDigests, compilerVersion: compiled.compilerVersion, estimate, caseResults: [], layerResults: [], artifacts: [], visualAudit: [], proofResults: compiled.proofResults, substitutionCoverage: compiled.substitutionCoverage, capabilities: null, cleanup: null, status: "incomplete" };
  let startedBrowser = false;
  let executionFailure;
  try {
    if (browserCases.length) {
      startedBrowser = true;
      const bootstrap = typeof runner.adapter.bootstrapStatus === "function" ? await runner.call("bootstrapStatus") : null;
      const generation = bootstrap ? `${bootstrap.sessionId}:${bootstrap.generation}` : runner.adapter.sessionId;
      if (runner.modelCanaryGeneration !== generation) { runner.canary = undefined; runner.modelCanaryGeneration = generation; }
      result.capabilities = await runner.capabilityCanary({ tabId: tabs.production, viewport: { width: 390, height: 844 }, dpr: 1, requiresNetwork: browserCases.some((item) => item.assertions.some((entry) => entry.assertion.kind === "network")), url: surfaceUrl(browserCases[0].conditions, "production") });
      requireValue(result.capabilities.status === "pass", "Current generation canary did not pass");
      result.capabilities = { ...result.capabilities, bootstrap };
    }
    for (const item of selected) {
      const record = { caseId: item.id, caseKey: item.caseKey, reuseKey: item.reuseKey, obligationIds: item.obligationIds, coverageKeys: item.coverageKeys, layer: item.layer, assertions: [], artifacts: [], status: "pass" };
      if (item.layer !== "browser") {
        for (const assertion of item.assertions) {
          const source = layerResults.find((entry) => entry.caseId === assertion.test?.caseId && entry.path === assertion.test?.path && entry.reuseKey === item.reuseKey);
          await validateLayerResult(source, assertion, item);
          record.assertions.push({ assertionDigest: await modelDigest(assertion), surface: "test", status: "pass", resultDigest: source.digest, actual: source.actual ?? source.expected });
          result.layerResults.push(source);
        }
      } else {
        for (const surface of ["production", "prototype"]) {
          const tabId = tabs[surface]; const conditions = item.conditions;
          await runner.activate(tabId, `${item.id}/${surface}`);
          const url = surfaceUrl(conditions, surface);
          if (typeof runner.adapter.stabilizeContext === "function") await runner.call("stabilizeContext", tabId, { surface, origin: new URL(url).origin, authorizationProfile: conditions.authorization.profile });
          await runner.call("navigate", tabId, url);
          if (typeof runner.adapter.setModelViewport === "function") await runner.call("setModelViewport", tabId, conditions.viewport, conditions.dpr);
          else await runner.call("setViewport", tabId, conditions.viewport);
          await runner.call("setModelEnvironment", tabId, conditions);
          const measured = await runner.call("measureViewport", tabId);
          requireValue(measured.width === conditions.viewport.width && measured.height === conditions.viewport.height && measured.dpr === conditions.dpr, "Model viewport/DPR did not apply", "PARITY_VIEWPORT_MISMATCH");
          await runner.call("setTheme", tabId, conditions.theme, { surface, targetId: item.targetId, url, setup: conditions.themeSetup?.[surface] ?? conditions.themeSetup });
          for (const action of [...conditions.reset, ...conditions.setup]) await runner.call("runAction", tabId, action);
          const actualScroll = await runner.call("measureScroll", tabId);
          requireValue(actualScroll.x === conditions.scroll.x && actualScroll.y === conditions.scroll.y, "Model scroll condition differs");
          const identity = item.stateIdentity;
          const identityActual = await runner.call("runModelAssertion", tabId, { kind: identity.kind ?? "text", selector: identity.selector, ...(identity.options ?? {}) });
          requireValue(assertionMatches(identityActual.value, identity.expected, identity), `State identity not reached: ${item.id}`);
          for (const checkpoint of conditions.checkpoints) {
            for (const action of checkpoint.actions) await runner.call("runAction", tabId, action);
            if (checkpoint.wait?.selector) await runner.call("runAction", tabId, { type: checkpoint.wait.state === "hidden" ? "waitForHidden" : "waitForVisible", selector: checkpoint.wait.selector });
            const assertions = item.assertions.filter((entry) => entry.checkpointId === checkpoint.id);
            for (const assertion of assertions) {
              const digest = await modelDigest(assertion);
              if (assertion.assertion.kind === "screenshot") { record.assertions.push({ assertionDigest: digest, checkpointId: checkpoint.id, surface, status: "pending-visual", actual: null }); continue; }
              const observed = await runner.call("runModelAssertion", tabId, assertion.assertion, { surface, conditions, checkpointId: checkpoint.id });
              const pass = !observed.unsupported && assertionMatches(observed.value, assertion.expected, assertion.assertion);
              record.assertions.push({ assertionDigest: digest, checkpointId: checkpoint.id, surface, status: pass ? "pass" : "fail", actual: observed.value ?? null, capabilities: observed.capabilities ?? [] });
              requireValue(pass, `Expected observation failed: ${item.id}/${checkpoint.id}`, "PARITY_REQUIRED_PROBE_FAILED");
              requireValue(assertion.requiredCapabilities.every((capability) => observed.capabilities?.includes(capability)), "Observed result lacks required capability", "PARITY_REQUIRED_PROBE_UNAVAILABLE");
            }
            const obligationIds = item.assertionLinks.filter((entry) => entry.assertion.checkpointId === checkpoint.id).map(({ obligationId }) => obligationId);
            const requests = [...new Set(compiled.obligations.filter((entry) => obligationIds.includes(entry.id)).flatMap((entry) => entry.artifactRequests))];
            for (const kind of requests) {
              const identity = { caseKey: item.caseKey, surface, checkpointId: checkpoint.id, phase: "final", conditionsDigest: await modelDigest(conditions), kind };
              const artifact = await runner.call("captureModelArtifact", tabId, kind, { row: { id: item.id.replaceAll(":", "-") }, surface, probeId: (await modelDigest({ checkpointId: checkpoint.id, kind })).slice(7, 31) });
              const bound = { ...artifact, identity, identityDigest: await modelDigest(identity), caseId: item.id };
              record.artifacts.push(bound); result.artifacts.push(bound);
            }
          }
        }
      }
      result.caseResults.push(record);
    }
    result.status = result.caseResults.some((item) => item.assertions.some((entry) => entry.status === "pending-visual")) ? "pending-visual" : "pass";
    return result;
  } catch (error) {
    executionFailure = error;
    throw error;
  } finally {
    if (startedBrowser && cleanup) {
      try {
        result.cleanup = await runner.call("cleanup");
        requireValue(result.cleanup?.status === "pass", "Browser cleanup did not pass", "PARITY_CLEANUP_FAILED");
      } catch (cleanupError) {
        if (!executionFailure) throw cleanupError;
        executionFailure.cleanupFailure = { code: cleanupError.code ?? "PARITY_CLEANUP_FAILED" };
      }
    } else if (!startedBrowser) result.cleanup = { status: "pass", reason: "No Browser operations" };
  }
}

/** Recompute the full obligation closure; a single parent/command pass cannot close children. */
export async function validateModelEvidence(input, evidence, { partial = false, allowPendingVisual = false } = {}) {
  const { compiled } = await modelPreflight({ ...input, proofResults: evidence?.proofResults ?? [] }, { context: "implement" });
  requireValue(evidence?.schemaVersion === 6 && evidence.kind === "verification-model", "Model evidence schema is invalid");
  requireValue(evidence.semanticDigest === compiled.semanticDigest, "Evidence semantic binding is stale", "PARITY_CURRENT_STATE_DRIFT");
  requireValue(evidence.cleanup?.status === "pass", "Evidence cleanup is incomplete", "PARITY_CLEANUP_FAILED");
  if (evidence.caseResults.some((item) => item.layer === "browser")) {
    const canaries = [...(evidence.generationCanaries ?? [evidence.capabilities])];
    if (evidence.importBindings?.some((entry) => entry.browserCaseIds.length > 0)) {
      requireValue(evidence.currentGenerationCanary, "Reused Browser evidence needs a current generation canary", "PARITY_BROWSER_SETUP_REQUIRED");
      canaries.push(evidence.currentGenerationCanary);
    }
    requireValue(canaries.length > 0 && canaries.every((item) => item?.status === "pass" && item.viewport?.width === 390 && item.viewport?.height === 844 && item.viewport?.dpr === 1 && /^sha256:[a-f0-9]{64}$/u.test(item.screenshot) && item.bootstrap?.status === "ready" && item.bootstrap.sessionId === item.sessionId && item.bootstrap.generation && item.bootstrap.documents?.length > 0), "Current Browser generation lacks documentation/canary evidence");
  }
  const resultIds = new Set(); const passedKeys = new Set(); const passedObligations = new Set();
  for (const result of evidence.caseResults) {
    const item = compiled.cases.find((entry) => entry.id === result.caseId);
    requireValue(item && !resultIds.has(result.caseId), "Unknown or duplicate case result"); resultIds.add(result.caseId);
    requireValue(result.caseKey === item.caseKey && result.reuseKey === item.reuseKey && result.status === "pass", "Case result is stale or failed");
    for (const expected of item.assertions) {
      const digest = await modelDigest(expected);
      const surfaces = item.layer === "browser" ? ["production", "prototype"] : ["test"];
      for (const surface of surfaces) {
        const observed = result.assertions.filter((entry) => entry.assertionDigest === digest && entry.surface === surface);
        requireValue(observed.length === 1, "Missing/duplicate checkpoint assertion");
        if (item.layer !== "browser") {
          const layerResult = evidence.layerResults.find((entry) => entry.digest === observed[0].resultDigest);
          await validateLayerResult(layerResult, expected, item);
        } else if (expected.assertion.kind !== "screenshot") {
          requireValue(observed[0].status === "pass" && assertionMatches(observed[0].actual, expected.expected, expected.assertion), "Assertion expected value is not satisfied");
          requireValue(expected.requiredCapabilities.every((capability) => observed[0].capabilities?.includes(capability)), "Assertion observation capability is missing");
        }
      }
    }
    for (const id of item.obligationIds) {
      const obligation = compiled.obligations.find((entry) => entry.id === id);
      if (obligation.layer === "visual") {
        for (const criterionId of obligation.criterionIds) {
          const audit = evidence.visualAudit?.find((entry) => entry.caseId === item.id && entry.obligationId === id && entry.criterionId === criterionId);
          if (allowPendingVisual && !audit) continue;
          requireValue(audit?.status === "pass" && audit.viewer === "codex" && typeof audit.reviewedAt === "string" && audit.reviewedAt.length > 0, "Current visual criterion was not viewed and assessed");
          const artifacts = evidence.artifacts.filter((entry) => entry.caseId === item.id && entry.identity?.checkpointId === obligation.checkpointId && entry.kind === "screenshot");
          requireValue(artifacts.length === 2 && ["production", "prototype"].every((surface) => artifacts.some((entry) => entry.surface === surface)), "Visual criterion requires its current image pair");
          requireValue(serialize([...audit.artifactDigests].sort()) === serialize(artifacts.map((entry) => entry.sha256).sort()), "Visual audit refers to another image");
          for (const artifact of artifacts) {
            requireValue(artifact.bytes > 0 && /^sha256:[a-f0-9]{64}$/u.test(artifact.sha256), "Invalid visual artifact");
            requireValue(artifact.identityDigest === await modelDigest(artifact.identity) && artifact.identity.caseKey === item.caseKey && artifact.identity.conditionsDigest === await modelDigest(item.conditions) && artifact.identity.phase === "final", "Image conditions or checkpoint differ");
          }
        }
      }
      passedObligations.add(id);
    }
    item.coverageKeys.forEach((key) => passedKeys.add(key));
  }
  for (const coverage of compiled.substitutionCoverage) {
    const certificate = compiled.substitutions.find((entry) => entry.id === coverage.certificateId);
    requireValue(certificate.consumerIntegrationObligationIds.every((id) => passedObligations.has(id)), "Representative proof lacks consumer connection results");
    coverage.obligationIds.forEach((id) => passedObligations.add(id));
    coverage.coverageKeys.forEach((key) => passedKeys.add(key));
  }
  requireValue(serialize(evidence.substitutionCoverage ?? []) === serialize(compiled.substitutionCoverage), "Evidence substitution closure differs", "PARITY_SUBSTITUTION_INVALID");
  if (!partial) {
    requireValue(compiled.cases.every((item) => resultIds.has(item.id)), "Required cases are missing");
    requireValue(compiled.obligations.every((item) => passedObligations.has(item.id)), "Required obligation child is missing");
    requireValue(compiled.requiredCoverageKeys.every((key) => passedKeys.has(key)), "Required tuple is missing");
  }
  return { status: "pass", caseCount: resultIds.size, obligationCount: passedObligations.size, originalCriterionCount: compiled.originalCriteria.length, requiredCoverageCount: passedKeys.size, semanticDigest: compiled.semanticDigest };
}

/** Stage scope is a subset of the full contract, never plan-smoke selection. */
export function selectModelStage(compiled, unitIds) {
  requireValue(Array.isArray(unitIds) && unitIds.length > 0 && new Set(unitIds).size === unitIds.length, "Stage requires unique unit IDs");
  const available = new Set(compiled.cases.flatMap((item) => item.unitIds));
  requireValue(unitIds.every((id) => available.has(id)), "Stage includes an unknown unit");
  const selected = compiled.cases.filter((item) => item.unitIds.some((id) => unitIds.includes(id)));
  requireValue(selected.every((item) => item.unitIds.every((id) => unitIds.includes(id))), "Shared executions require all their owning units in the stage");
  return { unitIds: [...unitIds].sort(), caseIds: selected.map(({ id }) => id), obligationIds: [...new Set(selected.flatMap((item) => item.obligationIds))].sort() };
}

/** Rebind only equal content/conditions/expectations; preserve the old evidence. */
export async function reusableModelResults(currentInput, previousInput, previousEvidence, { caseIds } = {}) {
  await validateModelEvidence(previousInput, previousEvidence, { partial: true });
  const { compiled } = await modelPreflight(currentInput, { context: "implement" });
  const unknown = Object.values(compiled.dependencies).some((entry) => entry.unknown);
  const knownEnvironment = (value) => value !== null && value !== undefined && value !== "" && value !== "unknown" && value !== "pending" && (typeof value !== "object" || Object.values(value).every(knownEnvironment));
  const reused = [], invalidated = [];
  for (const result of previousEvidence.caseResults) {
    const current = compiled.cases.find((item) => item.caseKey === result.caseKey);
    if (!current) { invalidated.push(result.caseId); continue; }
    if (caseIds && !caseIds.includes(current.id)) continue;
    if (!current || current.reuseKey !== result.reuseKey || unknown || (!Object.keys(current.conditions.environment).length || !knownEnvironment(current.conditions.environment))) { invalidated.push(result.caseId); continue; }
    const copy = { ...result, obligationIds: current.obligationIds, coverageKeys: current.coverageKeys };
    const candidate = { ...previousEvidence, semanticDigest: compiled.semanticDigest, inputDigests: compiled.inputDigests, executionPlanDigest: compiled.executionPlanDigest, caseResults: [copy], substitutionCoverage: compiled.substitutionCoverage };
    // New visual criteria or substitution/consumer requirements must independently
    // close; an old assertion cannot implicitly certify newly added observations.
    try { await validateModelEvidence(currentInput, candidate, { partial: true }); reused.push(copy); }
    catch (error) {
      if (!["PARITY_REQUIREMENT_GAP", "PARITY_SUBSTITUTION_INVALID"].includes(error.code)) throw error;
      invalidated.push(result.caseId);
    }
  }
  return { reused, invalidated, semanticDigest: compiled.semanticDigest, executionPlanDigest: compiled.executionPlanDigest };
}
