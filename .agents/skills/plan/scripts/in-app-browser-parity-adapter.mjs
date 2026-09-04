import { ParityRunError, sha256Digest, stableNormalize } from "./parity-runner-core.mjs";

const defaultTimeouts = Object.freeze({
  actionMs: 5_000,
  cleanupMs: 2_000,
  cleanupPollMs: 100,
  navigationMs: 10_000,
});
const defaultClock = Object.freeze({
  now: () => globalThis.performance.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});
const performanceEntryLimits = Object.freeze({
  entries: 500,
  methodChars: 32,
  pathChars: 512,
  resourceTypeChars: 64,
});
const projectionLimits = Object.freeze({
  nodes: 1_000,
  serializedChars: 131_072,
  serializedBytes: 262_144,
});
const networkEventMethods = Object.freeze([
  "Network.requestWillBeSent",
  "Network.responseReceived",
]);
const cdpRemediation = Object.freeze({
  settingsPath: "設定 → ブラウザ → 開発者モード",
  setting: "完全な CDP アクセスを有効にする",
  requiresRestart: true,
  requiresOriginApproval: true,
});
const cdpUnavailableMessage =
  "in-app BrowserでCDPを利用できません。Codexデスクトップの「設定 → ブラウザ → 開発者モード → 完全な CDP アクセスを有効にする」をオンにし、アプリを再起動してから、対象のローカルoriginでCDP利用を承認してください。";
const cdpAdvertisementUnknownMessage =
  "in-app BrowserのCDP capability一覧を取得できなかったため、CDPの有効化状態を確認できません。Codexデスクトップの「設定 → ブラウザ → 開発者モード → 完全な CDP アクセスを有効にする」を確認し、アプリを再起動してから、対象のローカルoriginでCDP利用を承認して再実行してください。";
const cdpCommandRejectedMessage =
  "CDPは広告・取得済みですが、DPR変更コマンドが拒否されました。Codexデスクトップの「設定 → ブラウザ → 開発者モード → 完全な CDP アクセスを有効にする」がオンであることと、対象のローカルoriginでCDP利用を承認していることを確認してください。アプリ再起動後も拒否される場合、このin-app Browser backendではDPR変更を利用できません。";

function fail(code, message, evidence) {
  throw new ParityRunError(code, message, evidence);
}

async function runWithDeadline(operation, timeoutMs, { code, message, evidence, onTimeout }) {
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new ParityRunError(code, message, evidence));
      }, timeoutMs);
      Promise.resolve()
        .then(operation)
        .then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
  }
}

function cdpUnavailableEvidence({ operation, cdpAdvertised, cdpAcquired }) {
  const evidence = {
    operation,
    requiredCapability: "cdp",
    cdpAdvertised,
    remediation: { ...cdpRemediation },
  };
  if (typeof cdpAcquired === "boolean") evidence.cdpAcquired = cdpAcquired;
  return evidence;
}

function guardAdapterOperations(adapter) {
  for (const [operation, implementation] of Object.entries(adapter)) {
    if (typeof implementation !== "function") continue;
    adapter[operation] = async (...args) => {
      try {
        return await implementation.apply(adapter, args);
      } catch (error) {
        if (error instanceof ParityRunError) throw error;
        fail(
          "PARITY_UNEXPECTED_ERROR",
          `Unexpected Browser adapter failure during ${operation}`,
          { operation },
        );
      }
    };
  }
  return adapter;
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("PARITY_UNEXPECTED_ERROR", `${label} must be an object`);
  }
  return value;
}

function requireTabId(tab, expected) {
  if (!tab || tab.id !== expected) {
    fail(
      "PARITY_SELECTED_TAB_DRIFT",
      `selected tab mismatch; expected ${expected}, received ${tab?.id ?? "none"}`,
    );
  }
  return tab;
}

function sanitizeUrl(value) {
  try {
    const parsed = new URL(value);
    return {
      origin: parsed.origin,
      pathname: parsed.pathname,
    };
  } catch {
    return { origin: undefined, pathname: undefined };
  }
}

function rawLogKey({ level, message, url }) {
  return JSON.stringify({
    level: level === "warning" ? "warn" : level,
    message: String(message).replace(/\s+at\s+[^\n]+/gu, "").trim(),
    path: url ? sanitizeUrl(url).pathname : undefined,
  });
}

function logsSinceBaseline(entries, baseline) {
  const remaining = new Map();
  for (const entry of baseline) {
    const key = rawLogKey(entry);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return entries.filter((entry) => {
    const key = rawLogKey(entry);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

function normalizeNetworkEntries(entries) {
  return entries
    .map((entry) => stableNormalize(entry))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function normalizeCdpNetworkEvents(events) {
  let oversizedFields = 0;
  const entries = [];
  for (const event of events) {
    if (
      event === null ||
      typeof event !== "object" ||
      !networkEventMethods.includes(event.method) ||
      event.params === null ||
      typeof event.params !== "object" ||
      Array.isArray(event.params)
    ) {
      fail(
        "PARITY_UNEXPECTED_ERROR",
        "CDP network events returned an invalid event payload",
        { operation: "networkEntries" },
      );
    }
    const payload = event.params;
    const rawUrl = payload.request?.url ?? payload.response?.url;
    const path = typeof rawUrl === "string" ? sanitizeUrl(rawUrl).pathname : undefined;
    const resourceType = typeof payload.type === "string" ? payload.type.toLowerCase() : undefined;
    const method = typeof payload.request?.method === "string" ? payload.request.method : undefined;
    const status = typeof payload.response?.status === "number" && Number.isFinite(payload.response.status)
      ? payload.response.status
      : undefined;
    if (typeof path !== "string" || typeof resourceType !== "string") {
      fail(
        "PARITY_UNEXPECTED_ERROR",
        "CDP network events omitted required normalized fields",
        { operation: "networkEntries" },
      );
    }
    if (resourceType === "document") continue;
    if (
      path.length > performanceEntryLimits.pathChars ||
      resourceType.length > performanceEntryLimits.resourceTypeChars ||
      (method !== undefined && method.length > performanceEntryLimits.methodChars)
    ) {
      oversizedFields += 1;
      continue;
    }
    entries.push({
      ...(method === undefined ? {} : { method }),
      path,
      ...(status === undefined ? {} : { status }),
      resourceType,
    });
  }
  if (oversizedFields > 0) {
    fail(
      "PARITY_REQUIRED_PROBE_UNAVAILABLE",
      "CDP network events exceeded the bounded field contract",
      {
        source: "browser-network-log",
        methodCharLimit: performanceEntryLimits.methodChars,
        pathCharLimit: performanceEntryLimits.pathChars,
        resourceTypeCharLimit: performanceEntryLimits.resourceTypeChars,
      },
    );
  }
  return normalizeNetworkEntries(entries);
}

async function normalizeLogs(entries) {
  const normalized = await Promise.all(entries.map(async ({ level, message, url }) => {
    const diagnostic = String(message).replace(/\s+at\s+[^\n]+/gu, "").trim();
    return {
      level: level === "warning" ? "warn" : level,
      messageSha256: await sha256Digest(diagnostic),
      messageBytes: new TextEncoder().encode(diagnostic).byteLength,
      path: url ? sanitizeUrl(url).pathname : undefined,
    };
  }));
  return normalized.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

async function compactStringValue(
  value,
  { kind, attributeName, normalizeWhitespace = false },
) {
  if (value === null) return { isNull: true };
  const normalized = normalizeWhitespace ? String(value).replace(/\s+/gu, " ").trim() : String(value);
  const domain = kind === "attribute"
    ? `parity:attribute:v1\0${attributeName}\0`
    : "parity:text:v1\0";
  return {
    sha256: await sha256Digest(`${domain}${normalized}`),
    bytes: new TextEncoder().encode(normalized).byteLength,
  };
}

async function compactProjectionSnapshot(
  snapshot,
  { source, rootField, allowNullRoot = false },
) {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    typeof snapshot.overflow !== "boolean" ||
    !Number.isInteger(snapshot.nodeCount) ||
    snapshot.nodeCount < 0
  ) {
    fail(
      "PARITY_UNEXPECTED_ERROR",
      `${source} returned an invalid bounded snapshot`,
      { operation: "runProbe" },
    );
  }
  if (snapshot.overflow || snapshot.nodeCount > projectionLimits.nodes) {
    fail(
      "PARITY_REQUIRED_PROBE_UNAVAILABLE",
      `${source} exceeded the bounded projection contract`,
      {
        source,
        nodeLimit: projectionLimits.nodes,
        serializedCharLimit: projectionLimits.serializedChars,
        serializedByteLimit: projectionLimits.serializedBytes,
      },
    );
  }
  const rootValue = snapshot[rootField];
  if (
    typeof snapshot.serialized !== "string" ||
    !(
      typeof rootValue === "string" ||
      (allowNullRoot && rootValue === null)
    ) ||
    (typeof rootValue === "string" && rootValue.length > 64)
  ) {
    fail(
      "PARITY_UNEXPECTED_ERROR",
      `${source} returned invalid compact projection fields`,
      { operation: "runProbe" },
    );
  }
  if (snapshot.serialized.length > projectionLimits.serializedChars) {
    fail(
      "PARITY_REQUIRED_PROBE_UNAVAILABLE",
      `${source} exceeded the bounded character contract`,
      {
        source,
        nodeLimit: projectionLimits.nodes,
        serializedCharLimit: projectionLimits.serializedChars,
        serializedByteLimit: projectionLimits.serializedBytes,
      },
    );
  }
  const serializedBytes = new TextEncoder().encode(snapshot.serialized).byteLength;
  if (serializedBytes > projectionLimits.serializedBytes) {
    fail(
      "PARITY_REQUIRED_PROBE_UNAVAILABLE",
      `${source} exceeded the bounded UTF-8 contract`,
      {
        source,
        nodeLimit: projectionLimits.nodes,
        serializedCharLimit: projectionLimits.serializedChars,
        serializedByteLimit: projectionLimits.serializedBytes,
      },
    );
  }
  return {
    sha256: await sha256Digest(snapshot.serialized),
    nodeCount: snapshot.nodeCount,
    serializedBytes,
    [rootField]: rootValue,
  };
}

function createSingleTabParityAdapter({
  browser,
  tab,
  expectedDpr = 1,
  timeouts = {},
  clock = defaultClock,
  artifactSink,
  sharedViewportState,
}) {
  requireObject(browser, "browser");
  requireObject(tab, "tab");
  if (typeof tab.id !== "string" || tab.id === "") {
    fail("PARITY_COMPARISON_TAB_REQUIRED", "comparison tab must have a stable id");
  }
  const comparisonTabId = tab.id;
  const resolvedTimeouts = { ...defaultTimeouts, ...timeouts };
  const resolvedClock = { ...defaultClock, ...clock };
  for (const field of ["actionMs", "cleanupMs", "cleanupPollMs", "navigationMs"]) {
    if (!Number.isFinite(resolvedTimeouts[field]) || resolvedTimeouts[field] < 0) {
      fail("PARITY_UNEXPECTED_ERROR", `${field} must be a non-negative finite number`);
    }
  }
  if (resolvedTimeouts.cleanupPollMs === 0) {
    fail("PARITY_UNEXPECTED_ERROR", "cleanupPollMs must be greater than zero");
  }
  if (typeof resolvedClock.now !== "function" || typeof resolvedClock.sleep !== "function") {
    fail("PARITY_UNEXPECTED_ERROR", "clock must provide now() and sleep()");
  }
  if (artifactSink !== undefined && typeof artifactSink !== "function") {
    fail("PARITY_ARTIFACT_SINK_UNAVAILABLE", "artifactSink must be a function");
  }
  const state = {
    cdp: undefined,
    cdpOrigin: undefined,
    deviceMetricsApplied: false,
    consoleBaseline: undefined,
    currentOrigin: undefined,
    networkCursor: undefined,
    networkEnabled: false,
    cleanupResult: undefined,
    navigationTimedOut: false,
  };
  const viewportState = sharedViewportState ?? {
    viewport: undefined,
    requestedViewport: undefined,
    viewportApplied: false,
    initialViewport: undefined,
  };

  async function storeArtifact({ probe, context, content, mediaType }) {
    if (typeof artifactSink !== "function") {
      fail(
        "PARITY_ARTIFACT_SINK_UNAVAILABLE",
        `required ${probe.kind} anchor artifact sink is unavailable`,
        { operation: "runProbe", rowId: context.row.id, probeId: probe.id, surface: context.surface },
      );
    }
    const record = await artifactSink({
      kind: probe.kind,
      rowId: context.row.id,
      probeId: probe.id,
      surface: context.surface,
      content,
      mediaType,
    });
    if (
      record === null ||
      typeof record !== "object" ||
      typeof record.path !== "string" ||
      typeof record.sha256 !== "string" ||
      !Number.isInteger(record.bytes)
    ) {
      fail("PARITY_ARTIFACT_SINK_UNAVAILABLE", "artifact sink returned an invalid record");
    }
    return record;
  }

  async function selectedTab() {
    return requireTabId(await browser.tabs.selected(), comparisonTabId);
  }

  function requireUsableAdapter() {
    if (state.navigationTimedOut) {
      fail(
        "PARITY_NAVIGATION_TIMEOUT",
        "comparison tab is quarantined after a navigation timeout",
        { operation: "adapter-reuse" },
      );
    }
  }

  async function comparisonTab(requestedTabId) {
    requireUsableAdapter();
    if (requestedTabId !== comparisonTabId) {
      fail(
        "PARITY_SELECTED_TAB_DRIFT",
        `adapter is bound to ${comparisonTabId}, received ${requestedTabId}`,
      );
    }
    await selectedTab();
    if (state.cleanupResult?.status === "pass") {
      state.cleanupResult = undefined;
      if (!sharedViewportState || viewportState.needsRunReset === true) {
        viewportState.initialViewport = undefined;
        viewportState.requestedViewport = undefined;
        viewportState.needsRunReset = false;
      }
    }
    return tab;
  }

  async function stabilizeContext(requestedTabId, context) {
    await comparisonTab(requestedTabId);
    const descriptor = requireObject(context, "surface context");
    if (descriptor.surface !== "production" && descriptor.surface !== "prototype") {
      fail(
        "PARITY_ORIGIN_CONTEXT_INVALID",
        "surface context must identify production or prototype",
        { operation: "stabilizeContext" },
      );
    }
    if (
      typeof descriptor.authorizationProfile !== "string" ||
      descriptor.authorizationProfile.trim() === "" ||
      descriptor.authorizationProfile === "unknown" ||
      descriptor.authorizationProfile.length > 128 ||
      /[\u0000-\u001f\u007f]/u.test(descriptor.authorizationProfile)
    ) {
      fail(
        "PARITY_AUTHORIZATION_PROFILE_REQUIRED",
        "surface context requires a bounded authorization profile name",
        { operation: "stabilizeContext", surface: descriptor.surface },
      );
    }
    let requestedOrigin;
    try {
      const parsed = new URL(descriptor.origin);
      if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        parsed.origin !== descriptor.origin
      ) {
        throw new TypeError("origin must be canonical");
      }
      requestedOrigin = parsed.origin;
    } catch {
      fail(
        "PARITY_ORIGIN_CONTEXT_INVALID",
        "surface context requires a canonical HTTP(S) origin",
        { operation: "stabilizeContext", surface: descriptor.surface },
      );
    }

    // Bootstrap the Browser capability through the same cached path used by
    // setViewport. Context stabilization must not add a navigation: the row's
    // normal prepareSurface navigation remains the single origin transition.
    await getViewportCapability();
    const currentUrl = await tab.url();
    await comparisonTab(requestedTabId);
    if (typeof currentUrl !== "string" || currentUrl === "") {
      fail(
        "PARITY_CURRENT_STATE_DRIFT",
        "surface context URL readback is unavailable",
        { operation: "stabilizeContext", surface: descriptor.surface },
      );
    }
    let currentOrigin;
    try {
      currentOrigin = new URL(currentUrl).origin;
    } catch {
      fail(
        "PARITY_CURRENT_STATE_DRIFT",
        "surface context URL readback is invalid",
        { operation: "stabilizeContext", surface: descriptor.surface },
      );
    }
    if (state.currentOrigin !== undefined && currentOrigin !== state.currentOrigin) {
      fail(
        "PARITY_CURRENT_STATE_DRIFT",
        "surface context origin changed outside the Browser adapter",
        { operation: "stabilizeContext", surface: descriptor.surface },
      );
    }
    return {
      surface: descriptor.surface,
      requestedOrigin,
      currentOrigin,
      requiresNavigation: currentOrigin !== requestedOrigin,
      authorizationProfileDigest: await sha256Digest(
        `parity:authorization-profile:v1\0${descriptor.authorizationProfile}`,
      ),
    };
  }

  async function getViewportCapability() {
    if (viewportState.viewport) return viewportState.viewport;
    try {
      const advertised = await browser.capabilities.list();
      if (!advertised.some((entry) => (typeof entry === "string" ? entry : entry?.id) === "viewport")) {
        fail("PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE", "Browser viewport capability is not advertised");
      }
      viewportState.viewport = await browser.capabilities.get("viewport");
    } catch (error) {
      if (error instanceof ParityRunError) throw error;
      fail(
        "PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE",
        "Browser viewport capability could not be acquired",
        { operation: "browser.capabilities.viewport" },
      );
    }
    if (
      typeof viewportState.viewport?.set !== "function" ||
      typeof viewportState.viewport?.reset !== "function"
    ) {
      fail("PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE", "Browser viewport capability is incomplete");
    }
    return viewportState.viewport;
  }

  async function getCdpCapability() {
    if (state.cdp) return state.cdp;
    let advertised;
    try {
      advertised = await tab.capabilities.list();
    } catch {
      fail(
        "PARITY_CDP_CAPABILITY_UNAVAILABLE",
        cdpAdvertisementUnknownMessage,
        cdpUnavailableEvidence({ operation: "tab.capabilities.list", cdpAdvertised: null }),
      );
    }
    if (!Array.isArray(advertised)) {
      fail(
        "PARITY_CDP_CAPABILITY_UNAVAILABLE",
        cdpAdvertisementUnknownMessage,
        cdpUnavailableEvidence({ operation: "tab.capabilities.list", cdpAdvertised: null }),
      );
    }
    const cdpAdvertised = advertised.some(
      (entry) => (typeof entry === "string" ? entry : entry?.id) === "cdp",
    );
    if (!cdpAdvertised) {
      fail(
        "PARITY_CDP_CAPABILITY_UNAVAILABLE",
        cdpUnavailableMessage,
        cdpUnavailableEvidence({ operation: "tab.capabilities.list", cdpAdvertised: false }),
      );
    }
    try {
      state.cdp = await tab.capabilities.get("cdp");
      state.cdpOrigin = state.currentOrigin;
    } catch {
      fail(
        "PARITY_CDP_CAPABILITY_UNAVAILABLE",
        cdpUnavailableMessage,
        cdpUnavailableEvidence({
          operation: "tab.capabilities.get",
          cdpAdvertised: true,
          cdpAcquired: false,
        }),
      );
    }
    if (typeof state.cdp?.send !== "function") {
      fail(
        "PARITY_CDP_CAPABILITY_UNAVAILABLE",
        cdpUnavailableMessage,
        cdpUnavailableEvidence({
          operation: "tab.capabilities.get",
          cdpAdvertised: true,
          cdpAcquired: true,
        }),
      );
    }
    return state.cdp;
  }

  async function readCdpNetworkSnapshot(afterSequence) {
    const cdp = await getCdpCapability();
    if (typeof cdp.readEvents !== "function") {
      fail("PARITY_REQUIRED_PROBE_UNAVAILABLE", "CDP network events are unavailable");
    }
    let snapshot;
    try {
      snapshot = await cdp.readEvents({
        ...(afterSequence === undefined ? {} : { afterSequence }),
        methods: networkEventMethods,
        limit: performanceEntryLimits.entries,
      });
    } catch {
      fail(
        "PARITY_REQUIRED_PROBE_UNAVAILABLE",
        "CDP network events could not be read",
        { operation: "cdp.readEvents" },
      );
    }
    if (
      snapshot === null ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot) ||
      !Number.isInteger(snapshot.cursor) ||
      snapshot.cursor < 0 ||
      !Array.isArray(snapshot.events) ||
      snapshot.events.length > performanceEntryLimits.entries ||
      typeof snapshot.hasMore !== "boolean" ||
      typeof snapshot.truncated !== "boolean"
    ) {
      fail(
        "PARITY_UNEXPECTED_ERROR",
        "CDP network events returned an invalid bounded snapshot",
        { operation: "networkEntries" },
      );
    }
    let previousSequence = afterSequence;
    const cursorRelationInvalid =
      (afterSequence !== undefined && snapshot.cursor < afterSequence) ||
      snapshot.events.some((event) => {
        const sequence = event?.sequence;
        const invalid =
          !Number.isInteger(sequence) ||
          sequence <= 0 ||
          sequence > snapshot.cursor ||
          (previousSequence !== undefined && sequence <= previousSequence);
        previousSequence = sequence;
        return invalid;
      });
    if (cursorRelationInvalid) {
      fail(
        "PARITY_UNEXPECTED_ERROR",
        "CDP network events violated the cursor ordering contract",
        { operation: "networkEntries" },
      );
    }
    if (snapshot.hasMore || snapshot.truncated) {
      fail(
        "PARITY_REQUIRED_PROBE_UNAVAILABLE",
        "CDP network events exceeded the bounded history contract",
        {
          source: "browser-network-log",
          entryLimit: performanceEntryLimits.entries,
          observedAtLeast: performanceEntryLimits.entries + 1,
        },
      );
    }
    return snapshot;
  }

  async function enableNetworkObservation() {
    if (state.networkEnabled) return false;
    const cdp = await getCdpCapability();
    state.networkEnabled = true;
    try {
      await cdp.send("Network.enable");
    } catch {
      fail(
        "PARITY_REQUIRED_PROBE_UNAVAILABLE",
        "CDP network observation could not be enabled",
        { operation: "cdp.send", command: "Network.enable" },
      );
    }
    const snapshot = await readCdpNetworkSnapshot();
    state.networkCursor = snapshot.cursor;
    return true;
  }

  async function advanceNetworkCursor() {
    if (!state.networkEnabled) return;
    const snapshot = await readCdpNetworkSnapshot(state.networkCursor);
    state.networkCursor = snapshot.cursor;
  }

  async function disableNetworkObservationForOriginChange() {
    if (!state.networkEnabled) return;
    if (!state.cdp) {
      fail(
        "PARITY_CLEANUP_FAILED",
        "active CDP network observation has no capability to disable before origin change",
        { operation: "cdp.send", command: "Network.disable" },
      );
    }
    try {
      await state.cdp.send("Network.disable");
    } catch {
      fail(
        "PARITY_REQUIRED_PROBE_UNAVAILABLE",
        "CDP network observation could not be disabled before origin change",
        { operation: "cdp.send", command: "Network.disable" },
      );
    }
    state.networkEnabled = false;
    state.networkCursor = undefined;
  }

  async function applyDeviceMetricsOverride(viewport) {
    const cdp = await getCdpCapability();
    // The command may apply the override before rejecting its promise. Keep the
    // cleanup obligation from the moment the external API boundary is crossed.
    state.deviceMetricsApplied = true;
    try {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: expectedDpr,
        mobile: false,
      });
    } catch {
      fail(
        "PARITY_DPR_OVERRIDE_UNAVAILABLE",
        cdpCommandRejectedMessage,
        {
          ...cdpUnavailableEvidence({
            operation: "cdp.send",
            cdpAdvertised: true,
            cdpAcquired: true,
          }),
          command: "Emulation.setDeviceMetricsOverride",
        },
      );
    }
  }

  async function clearDeviceMetricsOverrideForOriginChange() {
    if (!state.deviceMetricsApplied) return;
    if (!state.cdp) {
      fail(
        "PARITY_CLEANUP_FAILED",
        "active CDP device metrics have no capability to clear before origin change",
        { operation: "cdp.send", command: "Emulation.clearDeviceMetricsOverride" },
      );
    }
    try {
      await state.cdp.send("Emulation.clearDeviceMetricsOverride");
    } catch {
      fail(
        "PARITY_CLEANUP_FAILED",
        "CDP device metrics could not be cleared before origin change",
        { operation: "cdp.send", command: "Emulation.clearDeviceMetricsOverride" },
      );
    }
    state.deviceMetricsApplied = false;
  }

  async function captureConsoleBaseline() {
    if (typeof tab.dev?.logs !== "function") {
      state.consoleBaseline = undefined;
      return;
    }
    try {
      state.consoleBaseline = await tab.dev.logs({
        levels: ["warn", "warning", "error"],
        limit: 200,
      });
    } catch {
      state.consoleBaseline = undefined;
    }
  }

  async function navigateAndVerify(requestedTabId, url) {
    await comparisonTab(requestedTabId);
    await runWithDeadline(
      () => tab.goto(url),
      resolvedTimeouts.navigationMs,
      {
        code: "PARITY_NAVIGATION_TIMEOUT",
        message: "comparison tab navigation exceeded the bounded deadline",
        evidence: { operation: "tab.goto", timeoutMs: resolvedTimeouts.navigationMs },
        onTimeout: () => {
          state.navigationTimedOut = true;
        },
      },
    );
    await comparisonTab(requestedTabId);
    await tab.playwright.waitForLoadState({
      state: "domcontentloaded",
      timeoutMs: resolvedTimeouts.navigationMs,
    });
    await comparisonTab(requestedTabId);
    const actual = await tab.url();
    if (!actual || new URL(actual).toString() !== new URL(url).toString()) {
      fail("PARITY_CURRENT_STATE_DRIFT", "navigation readback did not match the requested local URL");
    }
  }

  async function exactlyOne(selector, label, code = "PARITY_REQUIRED_PROBE_UNAVAILABLE") {
    const locator = tab.playwright.locator(selector);
    const count = await locator.count();
    if (count !== 1) {
      fail(
        code,
        `${label} requires exactly one element; received ${count}`,
      );
    }
    return locator;
  }

  async function measureViewport(requestedTabId) {
    await comparisonTab(requestedTabId);
    return tab.playwright.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    }));
  }

  async function assertRequestedViewport(requestedTabId) {
    if (!viewportState.requestedViewport) return undefined;
    const measured = await measureViewport(requestedTabId);
    if (
      measured?.width !== viewportState.requestedViewport.width ||
      measured?.height !== viewportState.requestedViewport.height
    ) {
      fail(
        "PARITY_VIEWPORT_MISMATCH",
        `viewport mismatch after navigation: expected ${viewportState.requestedViewport.width}x${viewportState.requestedViewport.height}`,
      );
    }
    if (measured.dpr !== expectedDpr) {
      fail("PARITY_DPR_MISMATCH", `DPR mismatch after navigation: expected ${expectedDpr}`);
    }
    return measured;
  }

  async function readTheme(selector = "html") {
    await exactlyOne(selector, "theme readback", "PARITY_THEME_SETUP_FAILED");
    return tab.playwright.evaluate((targetSelector) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof Element)) throw new Error("theme readback selector drifted");
      return {
        classes: [...element.classList].sort(),
        colorScheme: getComputedStyle(element).colorScheme,
      };
    }, selector);
  }

  async function setTheme(requestedTabId, theme, context = {}) {
    await comparisonTab(requestedTabId);
    const setup = context.setup;
    if (!setup) {
      fail("PARITY_BROWSER_SETUP_REQUIRED", "parity-spec.json version 2 or 3 browser setup is required");
    }
    if (setup.type === "aria-switch") {
      const control = await exactlyOne(setup.selector, "theme switch", "PARITY_THEME_SETUP_FAILED");
      const expectedChecked = theme === setup.checkedTheme;
      const currentChecked = (await control.getAttribute("aria-checked")) === "true";
      if (currentChecked !== expectedChecked) {
        await comparisonTab(requestedTabId);
        await control.click({ timeoutMs: resolvedTimeouts.actionMs });
        await comparisonTab(requestedTabId);
      }
      const readbackChecked = (await control.getAttribute("aria-checked")) === "true";
      if (readbackChecked !== expectedChecked) {
        fail("PARITY_THEME_SETUP_FAILED", `ARIA theme switch did not apply ${theme}`);
      }
      const readback = await readTheme(setup.readbackSelector);
      if (!readback.classes.includes(theme) || !readback.colorScheme.includes(theme)) {
        fail("PARITY_THEME_SETUP_FAILED", `theme readback did not match ${theme}`);
      }
      return readback;
    }
    if (setup.type === "fixed" && setup.theme !== theme) {
      fail("PARITY_THEME_SETUP_FAILED", `fixed theme ${setup.theme} cannot represent ${theme}`);
    }
    if (setup.type === "query") {
      const currentUrl = new URL((await tab.url()) ?? context.url);
      if (currentUrl.searchParams.get(setup.parameter) !== theme) {
        fail("PARITY_THEME_SETUP_FAILED", `theme query ${setup.parameter} did not match ${theme}`);
      }
    }
    const readback = await readTheme("html");
    if (!readback.classes.includes(theme) || !readback.colorScheme.includes(theme)) {
      fail("PARITY_THEME_SETUP_FAILED", `theme readback did not match ${theme}`);
    }
    return readback;
  }

  async function cleanup() {
    if (state.cleanupResult) {
      if (state.cleanupResult.status === "fail") {
        fail("PARITY_CLEANUP_FAILED", "cached Browser cleanup failed", state.cleanupResult);
      }
      return state.cleanupResult;
    }
    const errors = [];
    if (state.navigationTimedOut) errors.push("comparison tab remains quarantined after navigation timeout");
    let cdpCleared = !state.deviceMetricsApplied;
    let viewportReset = !viewportState.viewportApplied;
    if (state.networkEnabled) {
      if (!state.cdp) {
        errors.push("active CDP network observation has no capability to disable");
      } else {
        try {
          await state.cdp.send("Network.disable");
          state.networkEnabled = false;
          state.networkCursor = undefined;
        } catch {
          errors.push("CDP network disable failed");
        }
      }
    }
    if (state.deviceMetricsApplied) {
      if (!state.cdp) {
        errors.push("active CDP device metrics have no capability to clear");
      } else {
        try {
          await state.cdp.send("Emulation.clearDeviceMetricsOverride");
          cdpCleared = true;
        } catch {
          errors.push("CDP clear failed");
        }
      }
    }
    if (viewportState.viewportApplied && viewportState.viewport) {
      try {
        await viewportState.viewport.reset();
        viewportReset = true;
      } catch {
        errors.push("viewport reset failed");
      }
    }
    state.deviceMetricsApplied = !cdpCleared;
    viewportState.viewportApplied = !viewportReset;
    const cleanupStartedAt = resolvedClock.now();
    const cleanupDeadline = cleanupStartedAt + resolvedTimeouts.cleanupMs;
    let readback;
    let readbackFailed = false;
    const baselineRestored = () =>
      !viewportState.initialViewport ||
      (readback?.width === viewportState.initialViewport.width &&
        readback?.height === viewportState.initialViewport.height &&
        readback?.dpr === viewportState.initialViewport.dpr);
    const measureCleanupReadback = async () => {
      try {
        await selectedTab();
        readback = await tab.playwright.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        }));
        readbackFailed = false;
      } catch {
        readback = undefined;
        readbackFailed = true;
      }
    };
    await measureCleanupReadback();
    while (
      errors.length === 0 &&
      (readbackFailed || !baselineRestored()) &&
      resolvedClock.now() < cleanupDeadline
    ) {
      const remaining = cleanupDeadline - resolvedClock.now();
      await resolvedClock.sleep(Math.min(resolvedTimeouts.cleanupPollMs, remaining));
      await measureCleanupReadback();
    }
    if (readbackFailed) errors.push("cleanup readback failed");
    else if (!baselineRestored()) {
      errors.push("cleanup readback did not restore the initial viewport and DPR");
    }
    state.cleanupResult = {
      status: errors.length === 0 ? "pass" : "fail",
      tabId: comparisonTabId,
      cdpCleared,
      viewportReset,
      baseline: viewportState.initialViewport,
      readback,
    };
    if (errors.length > 0) fail("PARITY_CLEANUP_FAILED", errors.join("; "), state.cleanupResult);
    return state.cleanupResult;
  }

  const adapter = {
    requiresBrowserSetups: true,
    sessionId: browser.browserId ?? "iab",
    comparisonTabId,
    async activateOwnedTab(requestedTabId) {
      requireUsableAdapter();
      if (requestedTabId !== comparisonTabId) {
        fail(
          "PARITY_SELECTED_TAB_DRIFT",
          `adapter is bound to ${comparisonTabId}, received ${requestedTabId}`,
        );
      }
      const selected = await browser.tabs.selected();
      if (selected?.id !== comparisonTabId) {
        const cdp = await getCdpCapability();
        try {
          await cdp.send("Page.bringToFront");
        } catch {
          fail(
            "PARITY_SELECTED_TAB_DRIFT",
            "owned comparison tab could not be activated",
            { operation: "cdp.send", command: "Page.bringToFront" },
          );
        }
      }
      await selectedTab();
    },
    async activateTab(requestedTabId) {
      await comparisonTab(requestedTabId);
    },
    async activeTabId() {
      return (await browser.tabs.selected())?.id;
    },
    stabilizeContext,
    async setViewport(requestedTabId, viewport) {
      await comparisonTab(requestedTabId);
      if (state.cleanupResult?.status === "fail") {
        fail("PARITY_CLEANUP_FAILED", "a failed Browser cleanup prevents adapter reuse", state.cleanupResult);
      }
      if (!viewportState.initialViewport) {
        viewportState.initialViewport = await measureViewport(requestedTabId);
      }
      viewportState.requestedViewport = { width: viewport.width, height: viewport.height };
      const viewportCapability = await getViewportCapability();
      // The capability may apply the override before rejecting its promise. Mark
      // cleanup as necessary before crossing that external API boundary.
      viewportState.viewportApplied = true;
      try {
        await viewportCapability.set({ width: viewport.width, height: viewport.height });
      } catch {
        fail(
          "PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE",
          "Browser viewport override was rejected",
          { operation: "viewport.set" },
        );
      }
      await applyDeviceMetricsOverride(viewportState.requestedViewport);
    },
    measureViewport,
    async navigate(requestedTabId, url) {
      await comparisonTab(requestedTabId);
      await advanceNetworkCursor();
      const targetOrigin = new URL(url).origin;
      const changesObservedOrigin =
        (state.cdp !== undefined && state.cdpOrigin !== targetOrigin) ||
        (state.currentOrigin !== undefined &&
          state.currentOrigin !== targetOrigin &&
          (state.deviceMetricsApplied || state.networkEnabled));
      await captureConsoleBaseline();
      if (changesObservedOrigin) {
        const restoreNetworkObservation = state.networkEnabled;
        await disableNetworkObservationForOriginChange();
        await clearDeviceMetricsOverrideForOriginChange();
        await navigateAndVerify(requestedTabId, url);
        state.currentOrigin = targetOrigin;
        state.cdp = undefined;
        state.cdpOrigin = undefined;
        if (viewportState.requestedViewport) {
          await applyDeviceMetricsOverride(viewportState.requestedViewport);
          await assertRequestedViewport(requestedTabId);
        }
        if (restoreNetworkObservation) await enableNetworkObservation();
      } else {
        await navigateAndVerify(requestedTabId, url);
      }
      state.currentOrigin = targetOrigin;
      await assertRequestedViewport(requestedTabId);
    },
    setTheme,
    async runAction(requestedTabId, action) {
      await comparisonTab(requestedTabId);
      const locator = tab.playwright.locator(action.selector);
      const count = await locator.count();
      if (action.type === "waitForHidden") {
        if (count === 0) {
          await comparisonTab(requestedTabId);
          return;
        }
        if (count !== 1) {
          fail("PARITY_CURRENT_STATE_DRIFT", `waitForHidden requires zero or one element; received ${count}`);
        }
        await comparisonTab(requestedTabId);
        await locator.waitFor({ state: "hidden", timeoutMs: resolvedTimeouts.actionMs });
        await comparisonTab(requestedTabId);
        return;
      }
      if (count !== 1) {
        fail("PARITY_CURRENT_STATE_DRIFT", `${action.type} requires exactly one element; received ${count}`);
      }
      await comparisonTab(requestedTabId);
      if (action.type === "click") await locator.click({ timeoutMs: resolvedTimeouts.actionMs });
      else if (action.type === "press") await locator.press(action.key, { timeoutMs: resolvedTimeouts.actionMs });
      else if (action.type === "focus") await locator.pressSequentially("", { timeoutMs: resolvedTimeouts.actionMs });
      else if (action.type === "fill") await locator.fill(action.value, { timeoutMs: resolvedTimeouts.actionMs });
      else if (action.type === "waitForVisible") {
        await locator.waitFor({ state: "visible", timeoutMs: resolvedTimeouts.actionMs });
      }
      await comparisonTab(requestedTabId);
    },
    async runProbe(requestedTabId, probe, context) {
      await comparisonTab(requestedTabId);
      const selector = context.surface === "production"
        ? probe.productionSelector
        : probe.prototypeSelector;
      try {
        const locator = await exactlyOne(selector, `${probe.kind} probe`);
      if (probe.kind === "route") {
        const pathname = await tab.playwright.evaluate(() => location.pathname);
        const expected = context.surface === "production" ? context.row.route : `/${context.row.entry}`;
        return { value: { matches: pathname === expected, pathname } };
      }
      if (probe.kind === "setup") return { value: { matches: true } };
      if (probe.kind === "state") {
        const visible = await locator.isVisible();
        return { value: { matches: visible === (probe.options.expected === "visible"), visible } };
      }
      if (probe.kind === "viewport") {
        const measured = await tab.playwright.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        }));
        const [width, height] = context.row.viewport.split("x").map(Number);
        return {
          value: {
            matches: measured.width === width && measured.height === height && measured.dpr === expectedDpr,
            ...measured,
          },
        };
      }
      if (probe.kind === "theme") {
        const expectedClass = probe.options.rootClass === "row-theme"
          ? context.row.theme
          : probe.options.rootClass;
        const measured = await tab.playwright.evaluate((rootClass) => {
          const root = document.documentElement;
          return {
            rootClassPresent: root.classList.contains(rootClass),
            colorScheme: getComputedStyle(root).colorScheme,
          };
        }, expectedClass);
        return {
          value: {
            matches: measured.rootClassPresent && measured.colorScheme === context.row.theme,
            ...measured,
          },
        };
      }
      if (probe.kind === "control") {
        const measured = await tab.playwright.evaluate(({ targetSelector, expected }) => {
          const element = document.querySelector(targetSelector);
          if (!(element instanceof Element)) throw new Error("control selector drifted");
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const visible = !(
            element.hidden ||
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0 ||
            rect.width === 0 ||
            rect.height === 0
          );
          const disabled = element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
          const matches = expected === "visible"
            ? visible
            : expected === "hidden"
              ? !visible
              : expected === "disabled"
                ? visible && disabled
                : visible && !disabled;
          return { matches, visible, disabled };
        }, { targetSelector: selector, expected: probe.options.expected });
        return { value: measured };
      }
      if (probe.kind === "overflow") {
        const measured = await tab.playwright.evaluate(({ targetSelector, tolerancePx }) => {
          const element = document.querySelector(targetSelector);
          if (!(element instanceof Element)) throw new Error("overflow selector drifted");
          const rect = element.getBoundingClientRect();
          const documentOverflow = document.documentElement.scrollWidth - window.innerWidth;
          const targetOverflow = Math.max(0, -rect.left, rect.right - window.innerWidth);
          return {
            matches: window.scrollX === 0 && documentOverflow <= tolerancePx && targetOverflow <= tolerancePx,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            documentOverflow,
            targetOverflow,
          };
        }, { targetSelector: selector, tolerancePx: probe.options.tolerancePx });
        return { value: measured };
      }
      if (probe.kind === "screenshot") {
        const rect = await tab.playwright.evaluate((targetSelector) => {
          const element = document.querySelector(targetSelector);
          if (!(element instanceof Element)) throw new Error("screenshot selector drifted");
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }, selector);
        const bytes = await tab.screenshot({ clip: rect });
        const artifact = probe.tier === "anchor"
          ? await storeArtifact({ probe, context, content: bytes, mediaType: "image/png" })
          : undefined;
        return {
          value: {
            sha256: await sha256Digest(bytes),
            width: rect.width,
            height: rect.height,
          },
          ...(artifact ? { artifact, artifactPath: artifact.path } : {}),
        };
      }
      if (probe.kind === "dom") {
        const snapshot = await tab.playwright.evaluate(({ targetSelector, limits }) => {
          const root = document.querySelector(targetSelector);
          if (!(root instanceof Element)) throw new Error("DOM selector drifted");
          let nodeCount = 0;
          let scannedNodes = 0;
          let remainingChars = limits.serializedChars;
          let overflow = false;
          const reserve = (amount) => {
            if (overflow) return false;
            if (amount > remainingChars) {
              overflow = true;
              return false;
            }
            remainingChars -= amount;
            return true;
          };
          const visit = (node) => {
            scannedNodes += 1;
            if (scannedNodes > limits.nodes || nodeCount >= limits.nodes) {
              overflow = true;
              return null;
            }
            if (node.nodeType === 3) {
              const rawText = node.nodeValue ?? "";
              if (!reserve(64 + rawText.length)) return null;
              const text = rawText.replace(/\s+/gu, " ").trim();
              if (!text) return null;
              nodeCount += 1;
              return { type: "text", text };
            }
            if (!(node instanceof Element)) return null;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.visibility === "collapse" ||
              Number(style.opacity) === 0 ||
              rect.width === 0 ||
              rect.height === 0
            ) return null;
            const tag = node.tagName.toLowerCase();
            const display = style.display;
            const visibility = style.visibility;
            const opacity = style.opacity;
            if (!reserve(192 + tag.length + display.length + visibility.length + opacity.length)) {
              return null;
            }
            nodeCount += 1;
            const attributeEntries = [];
            for (const attribute of node.attributes) {
              if (/^(?:nonce|data-reactroot|data-nextjs)/u.test(attribute.name)) continue;
              if (!reserve(16 + attribute.name.length + attribute.value.length)) return null;
              attributeEntries.push([attribute.name, attribute.value]);
            }
            attributeEntries.sort(([left], [right]) => left.localeCompare(right));
            const attributes = {};
            for (const [name, value] of attributeEntries) attributes[name] = value;
            const children = [];
            for (const child of node.childNodes) {
              if (overflow) break;
              const projected = visit(child);
              if (projected) children.push(projected);
            }
            return {
              type: "element",
              tag,
              attributes,
              computedStyle: {
                display,
                visibility,
                opacity,
              },
              rect: { width: rect.width, height: rect.height },
              children,
            };
          };
          const projection = visit(root);
          if (overflow) return { overflow: true, nodeCount };
          const serialized = JSON.stringify(projection);
          if (serialized.length > limits.serializedChars) {
            return { overflow: true, nodeCount };
          }
          return {
            overflow: false,
            nodeCount,
            serialized,
            rootTag: root.tagName.toLowerCase(),
          };
        }, { targetSelector: selector, limits: projectionLimits });
        const value = await compactProjectionSnapshot(snapshot, {
          source: "dom-projection",
          rootField: "rootTag",
        });
        const artifact = probe.tier === "anchor"
          ? await storeArtifact({
              probe,
              context,
              content: snapshot.serialized,
              mediaType: "application/json",
            })
          : undefined;
        return {
          value,
          ...(artifact ? { artifact, artifactPath: artifact.path } : {}),
        };
      }
      if (probe.kind === "accessibility") {
        const snapshot = await tab.playwright.evaluate(({ targetSelector, limits }) => {
          const root = document.querySelector(targetSelector);
          if (!(root instanceof Element)) throw new Error("accessibility selector drifted");
          let nodeCount = 0;
          let scannedNodes = 0;
          let remainingChars = limits.serializedChars;
          let overflow = false;
          const reserve = (amount) => {
            if (overflow) return false;
            if (amount > remainingChars) {
              overflow = true;
              return false;
            }
            remainingChars -= amount;
            return true;
          };
          const retain = (value, overhead = 0) => {
            if (value === null || value === undefined) return value;
            const text = `${value}`;
            return reserve(overhead + text.length) ? text : null;
          };
          const directText = (element) => {
            let result = "";
            for (const child of element.childNodes) {
              scannedNodes += 1;
              if (scannedNodes > limits.nodes) {
                overflow = true;
                return null;
              }
              if (child.nodeType !== 3) continue;
              const rawText = child.nodeValue ?? "";
              if (!reserve(rawText.length)) return null;
              const text = rawText.replace(/\s+/gu, " ").trim();
              if (!text) continue;
              const separator = result ? " " : "";
              if (!reserve(separator.length)) return null;
              result += `${separator}${text}`;
            }
            return result;
          };
          const textByIds = (rawIds) => {
            if (!rawIds) return "";
            if (!reserve(rawIds.length)) return null;
            let result = "";
            for (const id of rawIds.split(/\s+/u)) {
              scannedNodes += 1;
              if (scannedNodes > limits.nodes) {
                overflow = true;
                return null;
              }
              const referenced = document.getElementById(id);
              if (!(referenced instanceof Element)) continue;
              const text = directText(referenced);
              if (text === null) return null;
              if (text) {
                const separator = result ? " " : "";
                if (!reserve(separator.length)) return null;
                result += `${separator}${text}`;
              }
            }
            return result;
          };
          const nativeLabelText = (element) => {
            if (!("labels" in element) || !element.labels) return "";
            let result = "";
            for (const label of element.labels) {
              scannedNodes += 1;
              if (scannedNodes > limits.nodes) {
                overflow = true;
                return null;
              }
              const text = directText(label);
              if (text === null) return null;
              if (text) {
                const separator = result ? " " : "";
                if (!reserve(separator.length)) return null;
                result += `${separator}${text}`;
              }
            }
            return result;
          };
          const implicitRole = (element) => {
            const tag = element.tagName.toLowerCase();
            if (tag === "main") return "main";
            if (tag === "button") return "button";
            if (/^h[1-6]$/u.test(tag)) return "heading";
            if (tag === "input") {
              const type = element.getAttribute("type") ?? "text";
              if (!reserve(type.length)) return null;
              if (["button", "submit", "reset"].includes(type)) return "button";
              if (type === "checkbox") return "checkbox";
              if (type === "radio") return "radio";
              return "textbox";
            }
            return tag;
          };
          const visit = (element) => {
            scannedNodes += 1;
            if (scannedNodes > limits.nodes || nodeCount >= limits.nodes) {
              overflow = true;
              return null;
            }
            const style = getComputedStyle(element);
            const ariaHidden = element.getAttribute("aria-hidden");
            if (ariaHidden !== null && !reserve(8 + ariaHidden.length)) return null;
            if (
              element.hidden ||
              ariaHidden === "true" ||
              style.display === "none" ||
              style.visibility === "hidden"
            ) return null;
            if (!reserve(224)) return null;
            nodeCount += 1;
            const explicitRole = element.getAttribute("role");
            const roleCandidate = explicitRole ?? implicitRole(element);
            if (overflow) return null;
            const role = retain(roleCandidate, 16);
            if (role === null) return null;
            let name = "";
            const ariaLabel = element.getAttribute("aria-label");
            if (ariaLabel) {
              const retained = retain(ariaLabel, 16);
              if (retained === null) return null;
              name = retained;
            } else {
              const labelledName = textByIds(element.getAttribute("aria-labelledby"));
              if (labelledName === null) return null;
              if (labelledName) name = labelledName;
              else {
                const nativeName = nativeLabelText(element);
                if (nativeName === null) return null;
                if (nativeName) name = nativeName;
                else {
                  const ownText = directText(element);
                  if (ownText === null) return null;
                  name = ownText;
                }
              }
            }
            const description = textByIds(element.getAttribute("aria-describedby"));
            if (description === null) return null;
            const expanded = retain(element.getAttribute("aria-expanded"), 8);
            if (overflow) return null;
            const checked = retain(element.getAttribute("aria-checked"), 8);
            if (overflow) return null;
            const ariaDisabled = retain(element.getAttribute("aria-disabled"), 8);
            if (overflow) return null;
            const ariaRequired = retain(element.getAttribute("aria-required"), 8);
            if (overflow) return null;
            const children = [];
            for (const child of element.children) {
              if (overflow) break;
              const projected = visit(child);
              if (projected) children.push(projected);
            }
            return {
              role,
              name,
              description,
              disabled: element.matches(":disabled") || ariaDisabled === "true",
              required: element.matches(":required") || ariaRequired === "true",
              expanded,
              checked,
              children,
            };
          };
          const projection = visit(root);
          if (overflow) return { overflow: true, nodeCount };
          const serialized = JSON.stringify(projection);
          if (serialized.length > limits.serializedChars) {
            return { overflow: true, nodeCount };
          }
          return {
            overflow: false,
            nodeCount,
            serialized,
            rootRole: projection?.role ?? null,
          };
        }, { targetSelector: selector, limits: projectionLimits });
        const value = await compactProjectionSnapshot(snapshot, {
          source: "accessibility-projection",
          rootField: "rootRole",
          allowNullRoot: true,
        });
        const artifact = probe.tier === "anchor"
          ? await storeArtifact({
              probe,
              context,
              content: snapshot.serialized,
              mediaType: "application/json",
            })
          : undefined;
        return {
          value,
          ...(artifact ? { artifact, artifactPath: artifact.path } : {}),
        };
      }
      if (probe.kind === "visibility") return { value: await locator.isVisible() };
      if (probe.kind === "text") {
        return {
          value: await compactStringValue(await locator.innerText(), {
            kind: "text",
            normalizeWhitespace: probe.options.normalizeWhitespace,
          }),
        };
      }
      if (probe.kind === "attribute") {
        return {
          value: await compactStringValue(await locator.getAttribute(probe.options.name), {
            kind: "attribute",
            attributeName: probe.options.name,
          }),
        };
      }
      if (probe.kind === "computedStyle") {
        return {
          value: await tab.playwright.evaluate(
            ({ targetSelector, properties }) => {
              const element = document.querySelector(targetSelector);
              if (!(element instanceof Element)) throw new Error("computed style selector drifted");
              const style = getComputedStyle(element);
              return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
            },
            { targetSelector: selector, properties: probe.options.properties },
          ),
        };
      }
      if (probe.kind === "geometry") {
        return {
          value: await tab.playwright.evaluate((targetSelector) => {
            const element = document.querySelector(targetSelector);
            if (!(element instanceof Element)) throw new Error("geometry selector drifted");
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }, selector),
        };
      }
      if (probe.kind === "focus") {
        return {
          value: await tab.playwright.evaluate((targetSelector) => {
            const element = document.querySelector(targetSelector);
            if (!(element instanceof Element)) throw new Error("focus selector drifted");
            return document.activeElement === element;
          }, selector),
        };
      }
      if (probe.kind === "keyboard") {
        await locator.press(probe.options.key, { timeoutMs: resolvedTimeouts.actionMs });
        await comparisonTab(requestedTabId);
        return { value: { matches: true, key: probe.options.key } };
      }
      if (probe.kind === "console") {
        if (!state.consoleBaseline || typeof tab.dev?.logs !== "function") {
          fail("PARITY_REQUIRED_PROBE_UNAVAILABLE", "Browser console log baseline is unavailable");
        }
        let entries;
        try {
          entries = await tab.dev.logs({ levels: ["warn", "warning", "error"], limit: 200 });
        } catch {
          fail("PARITY_REQUIRED_PROBE_UNAVAILABLE", "Browser console logs are unavailable");
        }
        return { value: await normalizeLogs(logsSinceBaseline(entries, state.consoleBaseline)) };
      }
      if (probe.kind === "network") {
        const entries = context.networkSource === "browser-network-log"
          ? await this.networkEntries(requestedTabId)
          : await this.performanceEntries(requestedTabId);
        return { value: stableNormalize(entries) };
      }
      if (probe.required) {
        fail("PARITY_REQUIRED_PROBE_UNAVAILABLE", `unsupported required probe: ${probe.kind}`);
      }
      return { unsupported: true, reason: `unsupported optional probe: ${probe.kind}` };
      } catch (error) {
        if (!probe.required) {
          return { unsupported: true, reason: `optional ${probe.kind} probe unavailable` };
        }
        throw error;
      }
    },
    async measureScroll(requestedTabId) {
      await comparisonTab(requestedTabId);
      return tab.playwright.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    },
    async performanceEntries(requestedTabId) {
      await comparisonTab(requestedTabId);
      const snapshot = await tab.playwright.evaluate((limits) => {
        const resources = performance.getEntriesByType("resource");
        let oversizedFields = 0;
        const entries = resources.slice(0, limits.entries).map((entry) => {
          const parsed = new URL(entry.name, location.href);
          const path = parsed.pathname;
          const resourceType = entry.initiatorType;
          if (
            path.length > limits.pathChars ||
            resourceType.length > limits.resourceTypeChars
          ) {
            oversizedFields += 1;
            return { path: "", resourceType: "" };
          }
          return { path, resourceType };
        });
        return { total: resources.length, oversizedFields, entries };
      }, performanceEntryLimits);
      if (
        snapshot === null ||
        typeof snapshot !== "object" ||
        !Number.isInteger(snapshot.total) ||
        snapshot.total < 0 ||
        !Number.isInteger(snapshot.oversizedFields) ||
        snapshot.oversizedFields < 0 ||
        !Array.isArray(snapshot.entries) ||
        snapshot.entries.length > performanceEntryLimits.entries ||
        snapshot.entries.some((entry) =>
          entry === null ||
          typeof entry !== "object" ||
          typeof entry.path !== "string" ||
          entry.path.length > performanceEntryLimits.pathChars ||
          typeof entry.resourceType !== "string" ||
          entry.resourceType.length > performanceEntryLimits.resourceTypeChars
        )
      ) {
        fail(
          "PARITY_UNEXPECTED_ERROR",
          "Performance resource timing returned an invalid bounded snapshot",
          { operation: "performanceEntries" },
        );
      }
      if (snapshot.total > performanceEntryLimits.entries) {
        fail(
          "PARITY_REQUIRED_PROBE_UNAVAILABLE",
          "Performance resource timing exceeded the bounded entry limit",
          {
            source: "performance-resource-timing",
            entryLimit: performanceEntryLimits.entries,
            observedAtLeast: performanceEntryLimits.entries + 1,
          },
        );
      }
      if (snapshot.oversizedFields > 0 || snapshot.entries.length !== snapshot.total) {
        fail(
          "PARITY_REQUIRED_PROBE_UNAVAILABLE",
          "Performance resource timing exceeded the bounded field contract",
          {
            source: "performance-resource-timing",
            pathCharLimit: performanceEntryLimits.pathChars,
            resourceTypeCharLimit: performanceEntryLimits.resourceTypeChars,
          },
        );
      }
      return normalizeNetworkEntries(snapshot.entries);
    },
    async networkEntries(requestedTabId) {
      await comparisonTab(requestedTabId);
      if (await enableNetworkObservation()) return [];
      const snapshot = await readCdpNetworkSnapshot(state.networkCursor);
      state.networkCursor = snapshot.cursor;
      return normalizeCdpNetworkEvents(snapshot.events);
    },
    async screenshotDigest(requestedTabId) {
      await comparisonTab(requestedTabId);
      return sha256Digest(await tab.screenshot());
    },
    cleanup,
  };
  return guardAdapterOperations(adapter);
}

const routedTabOperations = Object.freeze([
  "stabilizeContext",
  "setViewport",
  "measureViewport",
  "navigate",
  "setTheme",
  "runAction",
  "runProbe",
  "measureScroll",
  "performanceEntries",
  "networkEntries",
  "screenshotDigest",
]);

function createInAppBrowserParityAdapter(options) {
  const descriptor = requireObject(options, "adapter options");
  const { browser, tab, tabs, ...sharedOptions } = descriptor;
  requireObject(browser, "browser");
  if (tabs === undefined) {
    return createSingleTabParityAdapter({ browser, tab, ...sharedOptions });
  }

  const surfaceTabs = requireObject(tabs, "surface tabs");
  const productionTab = requireObject(surfaceTabs.production, "production tab");
  const prototypeTab = requireObject(surfaceTabs.prototype, "prototype tab");
  for (const [surface, surfaceTab] of [
    ["production", productionTab],
    ["prototype", prototypeTab],
  ]) {
    if (typeof surfaceTab.id !== "string" || surfaceTab.id === "") {
      fail("PARITY_COMPARISON_TAB_REQUIRED", `${surface} tab must have a stable id`);
    }
  }
  if (productionTab.id === prototypeTab.id) {
    fail(
      "PARITY_COMPARISON_TAB_REQUIRED",
      "production and prototype require distinct comparison tabs",
    );
  }

  const sharedViewportState = {
    viewport: undefined,
    requestedViewport: undefined,
    viewportApplied: false,
    initialViewport: undefined,
    needsRunReset: false,
  };
  const tabAdapters = new Map(
    [productionTab, prototypeTab].map((surfaceTab) => [
      surfaceTab.id,
      createSingleTabParityAdapter({
        browser,
        tab: surfaceTab,
        ...sharedOptions,
        sharedViewportState,
      }),
    ]),
  );
  let activeTabId;

  function activeAdapter(requestedTabId) {
    const selected = tabAdapters.get(requestedTabId);
    if (!selected) {
      fail(
        "PARITY_SELECTED_TAB_DRIFT",
        `comparison tab is not owned by this adapter: ${requestedTabId}`,
      );
    }
    if (activeTabId !== requestedTabId) {
      fail(
        "PARITY_SELECTED_TAB_DRIFT",
        `logical tab mismatch; expected ${activeTabId ?? "none"}, received ${requestedTabId}`,
      );
    }
    return selected;
  }

  const adapter = {
    requiresBrowserSetups: true,
    sessionId: browser.browserId ?? "iab",
    comparisonTabId: productionTab.id,
    comparisonTabIds: {
      production: productionTab.id,
      prototype: prototypeTab.id,
    },
    async activateTab(requestedTabId) {
      const selected = tabAdapters.get(requestedTabId);
      if (!selected) {
        fail(
          "PARITY_SELECTED_TAB_DRIFT",
          `comparison tab is not owned by this adapter: ${requestedTabId}`,
        );
      }
      await selected.activateOwnedTab(requestedTabId);
      activeTabId = requestedTabId;
    },
    async activeTabId() {
      return (await browser.tabs.selected())?.id;
    },
    async cleanup() {
      const results = [];
      const failedTabIds = [];
      for (const [tabId, selected] of tabAdapters) {
        try {
          await selected.activateOwnedTab(tabId);
          activeTabId = tabId;
          results.push(await selected.cleanup());
        } catch (error) {
          failedTabIds.push({
            tabId,
            code: error instanceof ParityRunError ? error.code : "PARITY_UNEXPECTED_ERROR",
          });
        }
      }
      if (failedTabIds.length > 0) {
        fail("PARITY_CLEANUP_FAILED", "one or more comparison tabs failed cleanup", {
          status: "fail",
          tabs: results,
          failedTabIds,
        });
      }
      sharedViewportState.needsRunReset = true;
      return { status: "pass", tabs: results };
    },
  };
  for (const operation of routedTabOperations) {
    adapter[operation] = async (requestedTabId, ...args) =>
      activeAdapter(requestedTabId)[operation](requestedTabId, ...args);
  }
  return guardAdapterOperations(adapter);
}

export { createInAppBrowserParityAdapter, normalizeLogs };
