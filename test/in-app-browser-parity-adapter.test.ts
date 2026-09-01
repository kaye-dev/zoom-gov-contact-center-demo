import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const adapterPath = path.resolve(
  import.meta.dirname,
  "../.agents/skills/plan/scripts/in-app-browser-parity-adapter.mjs",
);
const corePath = path.resolve(
  import.meta.dirname,
  "../.agents/skills/plan/scripts/parity-runner-core.mjs",
);
const adapterModulePromise = import(pathToFileURL(adapterPath).href);
const coreModulePromise = import(pathToFileURL(corePath).href);
const digest = `sha256:${"a".repeat(64)}`;

function assertSanitizedParityError(
  error: unknown,
  code: string,
  forbidden: string[] = [],
) {
  const candidate = error as { code?: string; message?: string; evidence?: unknown };
  assert.equal(candidate.code, code);
  const serialized = JSON.stringify({
    code: candidate.code,
    message: candidate.message,
    evidence: candidate.evidence,
  });
  for (const secret of forbidden) assert.doesNotMatch(serialized, new RegExp(secret, "iu"));
  return true;
}

function createFakeBrowser() {
  const state = {
    selectedId: "comparison",
    url: "about:blank",
    width: 1280,
    height: 720,
    dpr: 2,
    theme: "light",
    focused: false,
    cdpGet: 0,
    cdpSet: 0,
    cdpClear: 0,
    cdpNetworkEnable: 0,
    cdpNetworkDisable: 0,
    viewportSet: 0,
    viewportReset: 0,
    loadStateOptions: undefined as undefined | { state?: string; timeoutMs?: number },
    logs: [] as Array<{ level: string; message: string; url?: string }>,
    resources: [] as Array<{ path: string; resourceType: string }>,
    networkEvents: [] as Array<{
      method: string;
      params?: Record<string, unknown>;
      sequence: number;
      source: { tabId: number };
    }>,
    networkReadOptions: [] as Array<{
      afterSequence?: number;
      methods?: readonly string[];
      limit?: number;
    }>,
    navigation: [] as string[],
    actions: [] as string[],
    elements: new Map<string, { count?: number; visible?: boolean; text?: string; attributes?: Record<string, string | null> }>([
      ["html", { text: "fixture", attributes: {} }],
      ["main", { text: "Fixture content", attributes: { "data-state": "ready" } }],
      ["#theme-toggle", { text: "theme", attributes: { "aria-checked": "false" } }],
      ["#field", { text: "", attributes: {} }],
      ["#hidden", { text: "", visible: false, attributes: {} }],
      ["#detached", { text: "", visible: true, attributes: {} }],
      ["#multiple", { count: 2, text: "", attributes: {} }],
    ]),
  };
  const cdp = {
    async send(method: string, params?: Record<string, unknown>) {
      if (method === "Emulation.setDeviceMetricsOverride") {
        state.cdpSet += 1;
        state.width = Number(params?.width);
        state.height = Number(params?.height);
        state.dpr = Number(params?.deviceScaleFactor);
      } else if (method === "Emulation.clearDeviceMetricsOverride") {
        state.cdpClear += 1;
        state.dpr = 2;
      } else if (method === "Network.enable") {
        state.cdpNetworkEnable += 1;
      } else if (method === "Network.disable") {
        state.cdpNetworkDisable += 1;
      }
    },
    async readEvents(options: {
      afterSequence?: number;
      methods?: readonly string[];
      limit?: number;
    } = {}) {
      state.networkReadOptions.push(options);
      const currentCursor = state.networkEvents.reduce(
        (maximum, event) => Math.max(maximum, event.sequence),
        0,
      );
      if (options.afterSequence === undefined) {
        return {
          cursor: currentCursor,
          events: [],
          hasMore: false,
          truncated: false,
        };
      }
      const afterSequence = options.afterSequence;
      const matching = state.networkEvents.filter((event) =>
        event.sequence > afterSequence &&
        (options.methods === undefined || options.methods.includes(event.method)),
      );
      const events = matching.slice(0, options.limit ?? matching.length);
      return {
        cursor: events.at(-1)?.sequence ?? afterSequence,
        events,
        hasMore: events.length < matching.length,
        truncated: false,
      };
    },
  };
  const viewport = {
    async set(value: { width: number; height: number }) {
      state.viewportSet += 1;
      state.width = value.width;
      state.height = value.height;
    },
    async reset() {
      state.viewportReset += 1;
      state.width = 1280;
      state.height = 720;
    },
  };
  const locator = (selector: string) => {
    const element = state.elements.get(selector);
    return {
      async count() {
        return element?.count ?? (element ? 1 : 0);
      },
      async click() {
        state.actions.push(`click:${selector}`);
        if (selector === "#theme-toggle" && element) {
          const checked = element.attributes?.["aria-checked"] !== "true";
          element.attributes = { ...element.attributes, "aria-checked": checked ? "true" : "false" };
          state.theme = checked ? "dark" : "light";
        }
      },
      async fill(value: string) {
        state.actions.push(`fill:${selector}:${value}`);
        if (element) element.text = value;
      },
      async press(value: string) {
        state.actions.push(`press:${selector}:${value}`);
      },
      async pressSequentially(value: string) {
        state.actions.push(`focus:${selector}:${value}`);
        state.focused = true;
      },
      async waitFor({ state: expected }: { state: string }) {
        state.actions.push(`wait:${selector}:${expected}`);
        if (expected === "hidden" && selector === "#detached") {
          state.elements.delete(selector);
          return;
        }
        if (expected === "visible" && element?.visible === false) throw new Error("not visible");
        if (expected === "hidden" && element?.visible !== false) throw new Error("not hidden");
      },
      async isVisible() {
        return element?.visible !== false;
      },
      async innerText() {
        return element?.text ?? "";
      },
      async getAttribute(name: string) {
        return element?.attributes?.[name] ?? null;
      },
      async evaluate(fn: (...args: never[]) => unknown, arg?: unknown) {
        const source = fn.toString();
        if (source.includes("classList")) {
          return { classes: [state.theme], colorScheme: state.theme };
        }
        if (source.includes("nodeType")) {
          return { type: "element", tag: "main", attributes: {}, children: [] };
        }
        if (source.includes("aria-labelledby")) {
          return { role: "main", name: "Fixture content", description: "", children: [] };
        }
        if (source.includes("activeElement")) return state.focused;
        if (source.includes("properties.map")) {
          return Object.fromEntries((arg as string[]).map((property) => [property, property === "color" ? "rgb(0, 0, 0)" : "block"]));
        }
        if (source.includes("getBoundingClientRect")) return { x: 0, y: 0, width: 320, height: 120 };
        return null;
      },
    };
  };
  const tab = {
    id: "comparison",
    capabilities: {
      async list() {
        return [{ id: "cdp" }];
      },
      async get(id: string) {
        assert.equal(id, "cdp");
        state.cdpGet += 1;
        return cdp;
      },
    },
    playwright: {
      locator,
      async evaluate(fn: (...args: never[]) => unknown, arg?: unknown) {
        const source = fn.toString();
        if (source.includes("devicePixelRatio")) {
          return { width: state.width, height: state.height, dpr: state.dpr };
        }
        if (source.includes("scrollX")) return { x: 0, y: 0 };
        if (source.includes("theme readback selector drifted")) {
          return { classes: [state.theme], colorScheme: state.theme };
        }
        if (source.includes("DOM selector drifted")) {
          return {
            overflow: false,
            nodeCount: 1,
            serialized: JSON.stringify({ type: "element", tag: "main" }),
            rootTag: "main",
          };
        }
        if (source.includes("accessibility selector drifted")) {
          return {
            overflow: false,
            nodeCount: 1,
            serialized: JSON.stringify({ role: "main", name: "Fixture content" }),
            rootRole: "main",
          };
        }
        if (source.includes("computed style selector drifted")) {
          const properties = (arg as { properties: string[] }).properties;
          return Object.fromEntries(properties.map((property) => [
            property,
            property === "color" ? "rgb(0, 0, 0)" : "block",
          ]));
        }
        if (source.includes("focus selector drifted")) return state.focused;
        if (
          source.includes("screenshot selector drifted") ||
          source.includes("geometry selector drifted")
        ) {
          return { x: 0, y: 0, width: 320, height: 120 };
        }
        if (source.includes("getEntriesByType")) {
          const limits = arg as { entries: number; pathChars: number; resourceTypeChars: number };
          let oversizedFields = 0;
          const entries = state.resources.slice(0, limits.entries).map((entry) => {
            const path = new URL(entry.path, "http://localhost/").pathname;
            if (
              path.length > limits.pathChars ||
              entry.resourceType.length > limits.resourceTypeChars
            ) {
              oversizedFields += 1;
              return { path: "", resourceType: "" };
            }
            return { path, resourceType: entry.resourceType };
          });
          return { total: state.resources.length, oversizedFields, entries };
        }
        return null;
      },
      async waitForLoadState(options: { state?: string; timeoutMs?: number }) {
        state.loadStateOptions = options;
      },
    },
    dev: {
      async logs() {
        return [...state.logs];
      },
    },
    async goto(url: string) {
      state.url = url;
      state.navigation.push(url);
      const selectedTheme = new URL(url).searchParams.get("theme");
      if (selectedTheme) state.theme = selectedTheme;
    },
    async url() {
      return state.url;
    },
    async screenshot() {
      return new Uint8Array([1, 2, 3, 4]);
    },
  };
  const browser = {
    browserId: "iab-fixture",
    tabs: {
      async selected() {
        return state.selectedId === tab.id ? tab : { id: state.selectedId };
      },
    },
    capabilities: {
      async list() {
        return [{ id: "viewport" }];
      },
      async get(id: string) {
        assert.equal(id, "viewport");
        return viewport;
      },
    },
  };
  return { browser, tab, state, cdp, viewport };
}

const contract = {
  comparisonConditions: {
    viewports: ["390x844", "1280x800"],
    dpr: 1,
    scroll: { x: 0, y: 0 },
    themes: ["light", "dark"],
  },
  comparisonTargets: [{ id: "main" }],
  parityMatrix: [
    {
      id: "main-default-mobile-light",
      targetId: "main",
      entry: "prototype.html",
      route: "/fixture",
      surface: "page",
      state: "default",
      viewport: "390x844",
      theme: "light",
      breakpoint: "mobile",
    },
  ],
};

const allProbes = [
  ["screenshot", {}],
  ["dom", {}],
  ["accessibility", {}],
  ["visibility", { expected: "visible" }],
  ["text", { normalizeWhitespace: true }],
  ["attribute", { name: "data-state" }],
  ["computedStyle", { properties: ["color", "display"] }],
  ["geometry", { tolerancePx: 0 }],
  ["focus", {}],
  ["console", {}],
  ["network", {}],
].map(([kind, options]) => ({
  id: `probe-${kind}`,
  kind,
  mode: "equal",
  productionSelector: kind === "focus" ? "#field" : "main",
  prototypeSelector: kind === "focus" ? "#field" : "main",
  required: true,
  options,
}));

const spec = {
  version: 2,
  stateSetups: [{
    targetId: "main",
    state: "default",
    production: { query: {}, actions: [{ type: "focus", selector: "#field" }] },
    prototype: { query: {}, actions: [{ type: "focus", selector: "#field" }] },
  }],
  browserSetups: [{
    targetId: "main",
    production: { type: "query", parameter: "theme" },
    prototype: { type: "query", parameter: "theme" },
  }],
  probes: allProbes,
  rowProbeMap: [{
    rowId: "main-default-mobile-light",
    probeIds: allProbes.map(({ id }) => id),
  }],
};

test("IAB-01 pure ESM import and single-tab run", async () => {
  const [adapterSource, coreSource] = await Promise.all([readFile(adapterPath, "utf8"), readFile(corePath, "utf8")]);
  for (const source of [adapterSource, coreSource]) {
    assert.doesNotMatch(source, /from ["']node:|\bprocess\b|node:fs/u);
  }
  const domProjectionSource = adapterSource.slice(
    adapterSource.indexOf('if (probe.kind === "dom")'),
    adapterSource.indexOf('if (probe.kind === "accessibility")'),
  );
  const accessibilityProjectionSource = adapterSource.slice(
    adapterSource.indexOf('if (probe.kind === "accessibility")'),
    adapterSource.indexOf('if (probe.kind === "visibility")'),
  );
  for (const source of [domProjectionSource, accessibilityProjectionSource]) {
    assert.ok(source.indexOf("let remainingChars") < source.indexOf("JSON.stringify(projection)"));
    assert.ok(source.indexOf("scannedNodes += 1") < source.indexOf("JSON.stringify(projection)"));
    assert.ok(source.indexOf("rawText.length") < source.indexOf("rawText.replace"));
  }
  assert.doesNotMatch(accessibilityProjectionSource, /element\.textContent|label\.textContent/u);
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const { BrowserParityRunner, sha256Digest } = await coreModulePromise;
  const foreignRealmBytes = runInNewContext("new Uint8Array([1, 2, 3, 4])");
  assert.equal(
    await sha256Digest(foreignRealmBytes),
    await sha256Digest(new Uint8Array([1, 2, 3, 4])),
  );
  const fixture = createFakeBrowser();
  const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
  const evidence = await new BrowserParityRunner(adapter).run({
    definition: { contract, spec, prototypeRevision: digest, validationProfileDigest: digest },
    phase: "final",
    changedTargetIds: ["main"],
    changedStates: ["default"],
    changedViewports: ["390x844"],
    tabs: { production: "comparison", prototype: "comparison" },
    baseUrls: { production: "http://localhost:3142/", prototype: "http://127.0.0.1:4142/" },
    run: {
      runId: "iab-01",
      goalSha256: digest,
      runtime: { owner: "fixture", checkout: "/fixture" },
      sources: [],
    },
  });
  assert.equal(evidence.rows[0].status, "pass");
  assert.equal(evidence.capabilities.cleanup.status, "pass");
  assert.equal(evidence.capabilities.sessionId, "iab-fixture");
  assert.deepEqual(fixture.state.loadStateOptions, { state: "domcontentloaded", timeoutMs: 10_000 });
  assert.equal(new URL(evidence.rows[0].actualConditions.urls.production).search, "");
  assert.match(fixture.state.navigation[0], /localhost:3142/u);
  assert.match(fixture.state.navigation.at(-1) ?? "", /127\.0\.0\.1:4142/u);
});

test("IAB-02 390x844 DPR1 canary and cleanup", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const fixture = createFakeBrowser();
  const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
  await adapter.navigate("comparison", "http://localhost:3142/fixture");
  await adapter.setViewport("comparison", { width: 390, height: 844 });
  assert.deepEqual(await adapter.measureViewport("comparison"), { width: 390, height: 844, dpr: 1 });
  const cleanup = await adapter.cleanup();
  assert.equal(cleanup.status, "pass");
  assert.equal(fixture.state.cdpSet, 1);
  assert.equal(fixture.state.cdpClear, 1);
  assert.equal(fixture.state.viewportReset, 1);
  assert.deepEqual(cleanup.baseline, { width: 1280, height: 720, dpr: 2 });
  assert.deepEqual(cleanup.readback, cleanup.baseline);

  const missingViewport = createFakeBrowser();
  missingViewport.browser.capabilities.list = async () => [];
  await assert.rejects(
    createInAppBrowserParityAdapter({ browser: missingViewport.browser, tab: missingViewport.tab })
      .setViewport("comparison", { width: 390, height: 844 }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE",
  );

  const missingCdp = createFakeBrowser();
  missingCdp.tab.capabilities.list = async () => [];
  const noCdp = createInAppBrowserParityAdapter({ browser: missingCdp.browser, tab: missingCdp.tab });
  await assert.rejects(
    noCdp.setViewport("comparison", { width: 390, height: 844 }),
    (error: unknown) => {
      const candidate = error as {
        code?: string;
        message?: string;
        evidence?: Record<string, unknown>;
      };
      assert.equal(candidate.code, "PARITY_CDP_CAPABILITY_UNAVAILABLE");
      assert.match(candidate.message ?? "", /完全な CDP アクセスを有効にする/u);
      assert.deepEqual(candidate.evidence, {
        operation: "tab.capabilities.list",
        requiredCapability: "cdp",
        cdpAdvertised: false,
        remediation: {
          settingsPath: "設定 → ブラウザ → 開発者モード",
          setting: "完全な CDP アクセスを有効にする",
          requiresRestart: true,
          requiresOriginApproval: true,
        },
      });
      return true;
    },
  );
  await noCdp.cleanup();

  const rejected = createFakeBrowser();
  const rejectedOriginal = rejected.cdp.send.bind(rejected.cdp);
  rejected.cdp.send = async (method: string, params?: Record<string, unknown>) => {
    if (method === "Emulation.setDeviceMetricsOverride") {
      await rejectedOriginal(method, params);
      throw new Error("Bearer partial-secret Cookie: session=partial https://localhost/?token=partial");
    }
    return rejectedOriginal(method, params);
  };
  const broken = createInAppBrowserParityAdapter({ browser: rejected.browser, tab: rejected.tab });
  await assert.rejects(
    broken.setViewport("comparison", { width: 390, height: 844 }),
    (error: unknown) => assertSanitizedParityError(error, "PARITY_DPR_OVERRIDE_UNAVAILABLE", [
      "Bearer",
      "Cookie",
      "partial-secret",
      "token=",
    ]),
  );
  const brokenCleanup = await broken.cleanup();
  assert.equal(rejected.state.cdpClear, 1);
  assert.equal(rejected.state.viewportReset, 1);
  assert.equal(brokenCleanup.status, "pass");

  const partialViewport = createFakeBrowser();
  partialViewport.viewport.set = async ({ width, height }: { width: number; height: number }) => {
    partialViewport.state.viewportSet += 1;
    partialViewport.state.width = width;
    partialViewport.state.height = height;
    throw new Error("Bearer viewport-secret Cookie: viewport=secret https://localhost/?token=viewport");
  };
  const partialViewportAdapter = createInAppBrowserParityAdapter({
    browser: partialViewport.browser,
    tab: partialViewport.tab,
  });
  await assert.rejects(
    partialViewportAdapter.setViewport("comparison", { width: 390, height: 844 }),
    (error: unknown) => assertSanitizedParityError(error, "PARITY_VIEWPORT_CAPABILITY_UNAVAILABLE", [
      "Bearer",
      "Cookie",
      "viewport-secret",
      "token=",
    ]),
  );
  const partialViewportCleanup = await partialViewportAdapter.cleanup();
  assert.equal(partialViewport.state.viewportReset, 1);
  assert.equal(partialViewportCleanup.status, "pass");

  const { BrowserParityRunner } = await coreModulePromise;
  const wrongViewport = createFakeBrowser();
  wrongViewport.cdp.send = async (method: string, params?: Record<string, unknown>) => {
    if (method === "Emulation.setDeviceMetricsOverride") {
      wrongViewport.state.width = Number(params?.width) + 1;
      wrongViewport.state.height = Number(params?.height);
      wrongViewport.state.dpr = 1;
    } else {
      wrongViewport.state.width = 1280;
      wrongViewport.state.height = 720;
      wrongViewport.state.dpr = 2;
    }
  };
  const wrongViewportAdapter = createInAppBrowserParityAdapter({ browser: wrongViewport.browser, tab: wrongViewport.tab });
  await assert.rejects(
    new BrowserParityRunner(wrongViewportAdapter).capabilityCanary({
      tabId: "comparison",
      viewport: { width: 390, height: 844 },
      dpr: 1,
      requiresNetwork: false,
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_VIEWPORT_MISMATCH",
  );
  await wrongViewportAdapter.cleanup();

  const wrongDpr = createFakeBrowser();
  wrongDpr.cdp.send = async (method: string, params?: Record<string, unknown>) => {
    if (method === "Emulation.setDeviceMetricsOverride") {
      wrongDpr.state.width = Number(params?.width);
      wrongDpr.state.height = Number(params?.height);
      wrongDpr.state.dpr = 2;
    }
  };
  const wrongDprAdapter = createInAppBrowserParityAdapter({ browser: wrongDpr.browser, tab: wrongDpr.tab });
  await assert.rejects(
    new BrowserParityRunner(wrongDprAdapter).capabilityCanary({
      tabId: "comparison",
      viewport: { width: 390, height: 844 },
      dpr: 1,
      requiresNetwork: false,
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_DPR_MISMATCH",
  );
  await wrongDprAdapter.cleanup();

  const clearFailure = createFakeBrowser();
  const clearOriginal = clearFailure.cdp.send.bind(clearFailure.cdp);
  clearFailure.cdp.send = async (method: string, params?: Record<string, unknown>) => {
    if (method === "Emulation.clearDeviceMetricsOverride") {
      throw new Error("Bearer clear-secret Cookie: clear=secret https://localhost/?token=clear-secret");
    }
    return clearOriginal(method, params);
  };
  const uncleared = createInAppBrowserParityAdapter({ browser: clearFailure.browser, tab: clearFailure.tab });
  await uncleared.setViewport("comparison", { width: 390, height: 844 });
  await assert.rejects(
    uncleared.cleanup(),
    (error: unknown) => assertSanitizedParityError(error, "PARITY_CLEANUP_FAILED", [
      "Bearer",
      "Cookie",
      "clear-secret",
      "token=",
    ]),
  );
  assert.equal(clearFailure.state.viewportReset, 1);
});

test("IAB-03 single-tab surface ordering and selection drift", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const fixture = createFakeBrowser();
  const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
  assert.equal(await adapter.activeTabId(), "comparison");
  fixture.state.selectedId = "other";
  await assert.rejects(
    adapter.activateTab("comparison"),
    (error: unknown) => (error as { code?: string }).code === "PARITY_SELECTED_TAB_DRIFT",
  );

  const externalFailure = createFakeBrowser();
  externalFailure.tab.goto = async () => {
    throw new Error("Bearer nav-secret Cookie: session=nav https://localhost/fixture?token=nav-secret");
  };
  const guarded = createInAppBrowserParityAdapter({
    browser: externalFailure.browser,
    tab: externalFailure.tab,
  });
  await assert.rejects(
    guarded.navigate("comparison", "http://localhost:3142/fixture?theme=light"),
    (error: unknown) => assertSanitizedParityError(error, "PARITY_UNEXPECTED_ERROR", [
      "Bearer",
      "Cookie",
      "nav-secret",
      "token=",
    ]),
  );
});

test("IAB-04 contextual theme setup and readback", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const fixture = createFakeBrowser();
  const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
  await fixture.tab.goto("http://localhost:3142/fixture?theme=dark");
  await adapter.setTheme("comparison", "dark", {
    targetId: "main",
    surface: "production",
    setup: { type: "query", parameter: "theme" },
    url: "http://localhost:3142/fixture?theme=dark",
  });
  fixture.state.theme = "light";
  await adapter.setTheme("comparison", "dark", {
    targetId: "main",
    surface: "production",
    setup: { type: "aria-switch", selector: "#theme-toggle", checkedTheme: "dark", readbackSelector: "html" },
    url: "http://localhost:3142/fixture",
  });
  assert.equal(fixture.state.elements.get("#theme-toggle")?.attributes?.["aria-checked"], "true");
  const missingControl = createFakeBrowser();
  missingControl.state.elements.delete("#theme-toggle");
  await assert.rejects(
    createInAppBrowserParityAdapter({ browser: missingControl.browser, tab: missingControl.tab }).setTheme(
      "comparison",
      "dark",
      {
        targetId: "main",
        surface: "production",
        setup: { type: "aria-switch", selector: "#theme-toggle", checkedTheme: "dark", readbackSelector: "html" },
        url: "http://localhost:3142/fixture",
      },
    ),
    (error: unknown) => (error as { code?: string }).code === "PARITY_THEME_SETUP_FAILED",
  );
  await assert.rejects(
    adapter.setTheme("comparison", "dark", {
      targetId: "main",
      surface: "prototype",
      setup: { type: "fixed", theme: "light" },
      url: "http://127.0.0.1:4142/prototype.html",
    }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_THEME_SETUP_FAILED",
  );
});

test("IAB-05 action and probe mapping", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const fixture = createFakeBrowser();
  const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
  for (const action of [
    { type: "click", selector: "main" },
    { type: "press", selector: "#field", key: "Enter" },
    { type: "focus", selector: "#field" },
    { type: "fill", selector: "#field", value: "value" },
    { type: "waitForVisible", selector: "main" },
    { type: "waitForHidden", selector: "#hidden" },
    { type: "waitForHidden", selector: "#detached" },
    { type: "waitForHidden", selector: "#missing" },
  ]) {
    await adapter.runAction("comparison", action);
  }
  await assert.rejects(adapter.runAction("comparison", { type: "click", selector: "#multiple" }));
  await assert.rejects(adapter.runAction("comparison", { type: "click", selector: "#missing" }));
  await adapter.navigate("comparison", "http://localhost:3142/fixture?theme=light");
  const compactProbeResults: Record<string, unknown> = {};
  for (const probe of allProbes) {
    const result = await adapter.runProbe("comparison", probe, {
      surface: "production",
      networkSource: "performance-resource-timing",
    });
    assert.ok("value" in result, `${probe.kind} did not return a value`);
    compactProbeResults[String(probe.kind)] = result;
  }
  assert.match(JSON.stringify(compactProbeResults.text), /sha256:[a-f0-9]{64}/u);
  assert.match(JSON.stringify(compactProbeResults.attribute), /sha256:[a-f0-9]{64}/u);
  assert.doesNotMatch(JSON.stringify(compactProbeResults.text), /Fixture content|resident@example\.jp/u);
  assert.doesNotMatch(JSON.stringify(compactProbeResults.attribute), /ready|resident@example\.jp/u);
  const optional = { ...allProbes[0], id: "optional", required: false, productionSelector: "#missing" };
  assert.deepEqual(
    await adapter.runProbe("comparison", optional, { surface: "production", networkSource: "performance-resource-timing" }),
    { unsupported: true, reason: "optional screenshot probe unavailable" },
  );
  await assert.rejects(
    adapter.runProbe("comparison", { ...optional, required: true }, { surface: "production", networkSource: "performance-resource-timing" }),
    (error: unknown) => (error as { code?: string }).code === "PARITY_REQUIRED_PROBE_UNAVAILABLE",
  );

  const projectionOverflow = createFakeBrowser();
  const projectionEvaluate = projectionOverflow.tab.playwright.evaluate.bind(
    projectionOverflow.tab.playwright,
  );
  projectionOverflow.tab.playwright.evaluate = async (
    fn: (...args: never[]) => unknown,
    arg?: unknown,
  ) => {
    if (fn.toString().includes("DOM selector drifted")) {
      return {
        overflow: true,
        nodeCount: 1_000,
        serialized: "resident@example.jp token=projection-secret",
        rootTag: "main",
      };
    }
    return projectionEvaluate(fn, arg);
  };
  const projectionOverflowAdapter = createInAppBrowserParityAdapter({
    browser: projectionOverflow.browser,
    tab: projectionOverflow.tab,
  });
  await assert.rejects(
    projectionOverflowAdapter.runProbe(
      "comparison",
      allProbes.find(({ kind }) => kind === "dom"),
      { surface: "production", networkSource: "performance-resource-timing" },
    ),
    (error: unknown) => assertSanitizedParityError(
      error,
      "PARITY_REQUIRED_PROBE_UNAVAILABLE",
      ["resident@example.jp", "projection-secret", "token="],
    ),
  );

  await adapter.navigate("comparison", "http://localhost:3142/fixture?theme=light");
  fixture.state.logs.push({
    level: "error",
    message: "Bearer should-not-appear",
    url: "http://localhost:3142/fixture?token=should-not-appear",
  });
  const consoleResult = await adapter.runProbe("comparison", allProbes.find(({ kind }) => kind === "console"), {
    surface: "production",
    networkSource: "performance-resource-timing",
  });
  assert.doesNotMatch(JSON.stringify(consoleResult), /Bearer|should-not-appear|token=/u);

  fixture.state.resources = [
    { path: "/z.js", resourceType: "script" },
    { path: "/a.css", resourceType: "link" },
  ];
  assert.deepEqual(await adapter.performanceEntries("comparison"), [
    { path: "/a.css", resourceType: "link" },
    { path: "/z.js", resourceType: "script" },
  ]);

  fixture.state.resources = Array.from({ length: 501 }, (_, index) => ({
    path: `/resource-${index}.js?token=resource-secret`,
    resourceType: "script",
  }));
  await assert.rejects(
    adapter.performanceEntries("comparison"),
    (error: unknown) => {
      assertSanitizedParityError(error, "PARITY_REQUIRED_PROBE_UNAVAILABLE", [
        "resource-secret",
        "token=",
      ]);
      assert.deepEqual((error as { evidence?: unknown }).evidence, {
        source: "performance-resource-timing",
        entryLimit: 500,
        observedAtLeast: 501,
      });
      return true;
    },
  );

  fixture.state.resources = [{
    path: `/${"x".repeat(513)}?token=oversized-secret`,
    resourceType: "script",
  }];
  await assert.rejects(
    adapter.performanceEntries("comparison"),
    (error: unknown) => assertSanitizedParityError(error, "PARITY_REQUIRED_PROBE_UNAVAILABLE", [
      "oversized-secret",
      "token=",
      "x{64}",
    ]),
  );

  assert.deepEqual(await adapter.networkEntries("comparison"), []);
  assert.equal(fixture.state.cdpNetworkEnable, 1);
  assert.deepEqual(fixture.state.networkReadOptions.at(-1), {
    methods: ["Network.requestWillBeSent", "Network.responseReceived"],
    limit: 500,
  });
  fixture.state.networkEvents = [
    {
      method: "Network.requestWillBeSent",
      params: {
        type: "Document",
        request: { method: "GET", url: "http://localhost:3142/fixture?token=document-secret" },
      },
      sequence: 1,
      source: { tabId: 1 },
    },
    {
      method: "Network.requestWillBeSent",
      params: {
        type: "Stylesheet",
        request: { method: "GET", url: "http://localhost:3142/fixture.css?token=css-secret" },
      },
      sequence: 2,
      source: { tabId: 1 },
    },
    {
      method: "Network.responseReceived",
      params: {
        type: "Stylesheet",
        response: { status: 200, url: "http://localhost:3142/fixture.css?token=css-secret" },
      },
      sequence: 3,
      source: { tabId: 1 },
    },
  ];
  assert.deepEqual(await adapter.networkEntries("comparison"), [
    { method: "GET", path: "/fixture.css", resourceType: "stylesheet" },
    { path: "/fixture.css", resourceType: "stylesheet", status: 200 },
  ]);
  assert.doesNotMatch(
    JSON.stringify(await adapter.networkEntries("comparison")),
    /document-secret|css-secret|token=/u,
  );
  assert.deepEqual(fixture.state.networkReadOptions.at(-1), {
    afterSequence: 3,
    methods: ["Network.requestWillBeSent", "Network.responseReceived"],
    limit: 500,
  });
  const networkCleanup = await adapter.cleanup();
  assert.equal(networkCleanup.status, "pass");
  assert.equal(fixture.state.cdpNetworkDisable, 1);

  const currentPositionNetwork = createFakeBrowser();
  currentPositionNetwork.state.networkEvents = [{
    method: "Network.requestWillBeSent",
    params: {
      type: "Script",
      request: { method: "GET", url: "http://localhost:3142/old.js" },
    },
    sequence: 10,
    source: { tabId: 1 },
  }];
  const currentPositionNetworkAdapter = createInAppBrowserParityAdapter({
    browser: currentPositionNetwork.browser,
    tab: currentPositionNetwork.tab,
  });
  assert.deepEqual(await currentPositionNetworkAdapter.networkEntries("comparison"), []);
  currentPositionNetwork.state.networkEvents.push({
    method: "Network.requestWillBeSent",
    params: {
      type: "Script",
      request: { method: "GET", url: "http://localhost:3142/current.js" },
    },
    sequence: 11,
    source: { tabId: 1 },
  });
  assert.deepEqual(await currentPositionNetworkAdapter.networkEntries("comparison"), [{
    method: "GET",
    path: "/current.js",
    resourceType: "script",
  }]);
  assert.deepEqual(currentPositionNetwork.state.networkReadOptions, [
    {
      methods: ["Network.requestWillBeSent", "Network.responseReceived"],
      limit: 500,
    },
    {
      afterSequence: 10,
      methods: ["Network.requestWillBeSent", "Network.responseReceived"],
      limit: 500,
    },
  ]);
  assert.equal((await currentPositionNetworkAdapter.cleanup()).status, "pass");

  const originScopedNetwork = createFakeBrowser();
  const originScopedNetworkAdapter = createInAppBrowserParityAdapter({
    browser: originScopedNetwork.browser,
    tab: originScopedNetwork.tab,
  });
  await originScopedNetworkAdapter.navigate(
    "comparison",
    "http://localhost:3142/fixture",
  );
  assert.deepEqual(await originScopedNetworkAdapter.networkEntries("comparison"), []);
  await originScopedNetworkAdapter.navigate(
    "comparison",
    "http://127.0.0.1:4142/prototype.html",
  );
  assert.deepEqual(originScopedNetwork.state.navigation, [
    "http://localhost:3142/fixture",
    "http://127.0.0.1:4142/prototype.html",
    "http://127.0.0.1:4142/prototype.html",
  ]);
  assert.equal(originScopedNetwork.state.cdpNetworkEnable, 2);
  assert.equal(originScopedNetwork.state.cdpNetworkDisable, 1);
  assert.deepEqual(await originScopedNetworkAdapter.networkEntries("comparison"), []);
  assert.equal((await originScopedNetworkAdapter.cleanup()).status, "pass");
  assert.equal(originScopedNetwork.state.cdpNetworkDisable, 2);

  const orderedEvent = (sequence: number) => ({
    method: "Network.requestWillBeSent",
    params: {
      type: "Script",
      request: { method: "GET", url: `http://localhost:3142/event-${sequence}.js` },
    },
    sequence,
    source: { tabId: 1 },
  });
  const cursorRelationCases = [
    { name: "cursor regression", snapshot: { cursor: 9, events: [] } },
    { name: "stale event", snapshot: { cursor: 20, events: [orderedEvent(10)] } },
    { name: "event beyond cursor", snapshot: { cursor: 20, events: [orderedEvent(21)] } },
    {
      name: "duplicate sequence",
      snapshot: { cursor: 20, events: [orderedEvent(11), orderedEvent(11)] },
    },
    {
      name: "non-monotonic sequence",
      snapshot: { cursor: 20, events: [orderedEvent(12), orderedEvent(11)] },
    },
  ];
  for (const { name, snapshot } of cursorRelationCases) {
    const relationFixture = createFakeBrowser();
    relationFixture.cdp.readEvents = async (options: { afterSequence?: number } = {}) =>
      options.afterSequence === undefined
        ? { cursor: 10, events: [], hasMore: false, truncated: false }
        : { ...snapshot, hasMore: false, truncated: false };
    const relationAdapter = createInAppBrowserParityAdapter({
      browser: relationFixture.browser,
      tab: relationFixture.tab,
    });
    assert.deepEqual(await relationAdapter.networkEntries("comparison"), [], name);
    await assert.rejects(
      relationAdapter.networkEntries("comparison"),
      (error: unknown) => assertSanitizedParityError(error, "PARITY_UNEXPECTED_ERROR"),
      name,
    );
    assert.equal((await relationAdapter.cleanup()).status, "pass", name);
  }

  const overflowingNetwork = createFakeBrowser();
  overflowingNetwork.cdp.readEvents = async () => ({
    cursor: 500,
    events: [],
    hasMore: true,
    truncated: false,
  });
  const overflowingNetworkAdapter = createInAppBrowserParityAdapter({
    browser: overflowingNetwork.browser,
    tab: overflowingNetwork.tab,
  });
  await assert.rejects(
    overflowingNetworkAdapter.networkEntries("comparison"),
    (error: unknown) => {
      assertSanitizedParityError(error, "PARITY_REQUIRED_PROBE_UNAVAILABLE");
      assert.deepEqual((error as { evidence?: unknown }).evidence, {
        source: "browser-network-log",
        entryLimit: 500,
        observedAtLeast: 501,
      });
      return true;
    },
  );
  assert.equal((await overflowingNetworkAdapter.cleanup()).status, "pass");

  const malformedNetwork = createFakeBrowser();
  malformedNetwork.cdp.readEvents = async () => [] as never;
  const malformedNetworkAdapter = createInAppBrowserParityAdapter({
    browser: malformedNetwork.browser,
    tab: malformedNetwork.tab,
  });
  await assert.rejects(
    malformedNetworkAdapter.networkEntries("comparison"),
    (error: unknown) => assertSanitizedParityError(error, "PARITY_UNEXPECTED_ERROR"),
  );
  assert.equal((await malformedNetworkAdapter.cleanup()).status, "pass");

  const oversizedNetwork = createFakeBrowser();
  const oversizedNetworkAdapter = createInAppBrowserParityAdapter({
    browser: oversizedNetwork.browser,
    tab: oversizedNetwork.tab,
  });
  assert.deepEqual(await oversizedNetworkAdapter.networkEntries("comparison"), []);
  oversizedNetwork.state.networkEvents = [{
    method: "Network.requestWillBeSent",
    params: {
      type: "Script",
      request: {
        method: "GET",
        url: `http://localhost:3142/${"x".repeat(513)}?token=network-oversized-secret`,
      },
    },
    sequence: 1,
    source: { tabId: 1 },
  }];
  await assert.rejects(
    oversizedNetworkAdapter.networkEntries("comparison"),
    (error: unknown) => assertSanitizedParityError(error, "PARITY_REQUIRED_PROBE_UNAVAILABLE", [
      "network-oversized-secret",
      "token=",
      "x{64}",
    ]),
  );
  assert.equal((await oversizedNetworkAdapter.cleanup()).status, "pass");
});

test("IAB-06 DOM and accessibility projections fail closed at every bounded limit", async (t) => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const projectionCases = [
    {
      name: "overflow marker",
      snapshot: {
        overflow: true,
        nodeCount: 1_000,
        serialized: "resident@example.jp token=projection-overflow-secret",
      },
      forbidden: ["resident@example.jp", "projection-overflow-secret", "token="],
    },
    {
      name: "node count 1001",
      snapshot: {
        overflow: false,
        nodeCount: 1_001,
        serialized: "resident@example.jp token=projection-node-secret",
      },
      forbidden: ["resident@example.jp", "projection-node-secret", "token="],
    },
    {
      name: "serialized chars 131073",
      snapshot: {
        overflow: false,
        nodeCount: 1,
        serialized: `${"x".repeat(131_073)} token=projection-char-secret`,
      },
      forbidden: ["projection-char-secret", "token=", "x{64}"],
    },
    {
      name: "UTF-8 bytes over 262144",
      snapshot: {
        overflow: false,
        nodeCount: 1,
        serialized: `${"界".repeat(87_382)} token=projection-byte-secret`,
      },
      forbidden: ["projection-byte-secret", "token=", "界{32}"],
    },
  ];

  for (const kind of ["dom", "accessibility"] as const) {
    for (const projectionCase of projectionCases) {
      await t.test(`${kind}: ${projectionCase.name}`, async () => {
        const fixture = createFakeBrowser();
        const originalEvaluate = fixture.tab.playwright.evaluate.bind(fixture.tab.playwright);
        fixture.tab.playwright.evaluate = async (
          fn: (...args: never[]) => unknown,
          arg?: unknown,
        ) => {
          const source = fn.toString();
          const marker = kind === "dom" ? "DOM selector drifted" : "accessibility selector drifted";
          if (source.includes(marker)) {
            return {
              ...projectionCase.snapshot,
              ...(kind === "dom" ? { rootTag: "main" } : { rootRole: "main" }),
            };
          }
          return originalEvaluate(fn, arg);
        };
        const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
        const probe = allProbes.find((candidate) => candidate.kind === kind);
        assert.ok(probe);
        await assert.rejects(
          adapter.runProbe(
            "comparison",
            probe,
            { surface: "production", networkSource: "performance-resource-timing" },
          ),
          (error: unknown) => {
            assertSanitizedParityError(
              error,
              "PARITY_REQUIRED_PROBE_UNAVAILABLE",
              projectionCase.forbidden,
            );
            assert.deepEqual((error as { evidence?: unknown }).evidence, {
              source: kind === "dom" ? "dom-projection" : "accessibility-projection",
              nodeLimit: 1_000,
              serializedCharLimit: 131_072,
              serializedByteLimit: 262_144,
            });
            return true;
          },
        );
      });
    }
  }

  await t.test("page evaluator rejects one huge raw text node before normalization", async () => {
    for (const kind of ["dom", "accessibility"] as const) {
      const fixture = createFakeBrowser();
      const originalEvaluate = fixture.tab.playwright.evaluate.bind(fixture.tab.playwright);
      fixture.tab.playwright.evaluate = async (
        fn: (...args: never[]) => unknown,
        arg?: unknown,
      ) => {
        const source = fn.toString();
        const marker = kind === "dom" ? "DOM selector drifted" : "accessibility selector drifted";
        if (!source.includes(marker)) return originalEvaluate(fn, arg);
        const rawText = {
          length: 131_073,
          replace() {
            throw new Error("raw text normalization must not run after the budget is exhausted");
          },
        };
        const textNode = { nodeType: 3, nodeValue: rawText };
        class FakeElement {
          attributes: Array<{ name: string; value: string }> = [];
          children: FakeElement[] = [];
          childNodes: unknown[] = [textNode];
          hidden = false;
          tagName = "MAIN";

          getAttribute() {
            return null;
          }

          getBoundingClientRect() {
            return { width: 320, height: 120 };
          }

          matches() {
            return false;
          }
        }
        const root = new FakeElement();
        return runInNewContext(`(${source})(args)`, {
          args: arg,
          document: {
            getElementById() {
              return null;
            },
            querySelector() {
              return root;
            },
          },
          Element: FakeElement,
          getComputedStyle() {
            return { display: "block", opacity: "1", visibility: "visible" };
          },
        });
      };
      const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
      const probe = allProbes.find((candidate) => candidate.kind === kind);
      assert.ok(probe);
      await assert.rejects(
        adapter.runProbe(
          "comparison",
          probe,
          { surface: "production", networkSource: "performance-resource-timing" },
        ),
        (error: unknown) => assertSanitizedParityError(error, "PARITY_REQUIRED_PROBE_UNAVAILABLE"),
      );
    }
  });
});

test("IAB-07 cross-origin navigation reacquires CDP, reapplies DPR, and remains cleanup-safe", async (t) => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;

  await t.test("network-disabled origin change reacquires CDP and reloads with measured DPR", async () => {
    const fixture = createFakeBrowser();
    const firstCdp = fixture.cdp;
    const freshCommands: string[] = [];
    const freshCdp = {
      async send(method: string, params?: Record<string, unknown>) {
        freshCommands.push(method);
        return firstCdp.send(method, params);
      },
      async readEvents(options: Parameters<typeof firstCdp.readEvents>[0] = {}) {
        return firstCdp.readEvents(options);
      },
    };
    fixture.tab.capabilities.get = async (id: string) => {
      assert.equal(id, "cdp");
      fixture.state.cdpGet += 1;
      return fixture.state.cdpGet === 1 ? firstCdp : freshCdp;
    };
    const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
    await adapter.navigate("comparison", "http://localhost:3142/fixture");
    await adapter.setViewport("comparison", { width: 390, height: 844 });
    await adapter.navigate("comparison", "http://127.0.0.1:4142/prototype.html");

    assert.equal(fixture.state.cdpGet, 2);
    assert.equal(fixture.state.cdpNetworkEnable, 0);
    assert.equal(fixture.state.cdpNetworkDisable, 0);
    assert.ok(freshCommands.includes("Emulation.setDeviceMetricsOverride"));
    assert.deepEqual(await adapter.measureViewport("comparison"), {
      width: 390,
      height: 844,
      dpr: 1,
    });
    assert.deepEqual(fixture.state.navigation, [
      "http://localhost:3142/fixture",
      "http://127.0.0.1:4142/prototype.html",
      "http://127.0.0.1:4142/prototype.html",
    ]);
    assert.equal((await adapter.cleanup()).status, "pass");
    assert.ok(freshCommands.includes("Emulation.clearDeviceMetricsOverride"));
    assert.equal(fixture.state.viewportReset, 1);
  });

  await t.test("fresh-origin CDP acquisition failure still permits terminal cleanup", async () => {
    const fixture = createFakeBrowser();
    fixture.tab.capabilities.get = async (id: string) => {
      assert.equal(id, "cdp");
      fixture.state.cdpGet += 1;
      if (fixture.state.cdpGet === 1) return fixture.cdp;
      throw new Error("Bearer fresh-cdp-secret Cookie: cdp=secret https://localhost/?token=fresh-cdp");
    };
    const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
    await adapter.navigate("comparison", "http://localhost:3142/fixture");
    await adapter.setViewport("comparison", { width: 390, height: 844 });
    await assert.rejects(
      adapter.navigate("comparison", "http://127.0.0.1:4142/prototype.html"),
      (error: unknown) => assertSanitizedParityError(error, "PARITY_CDP_CAPABILITY_UNAVAILABLE", [
        "Bearer",
        "Cookie",
        "fresh-cdp-secret",
        "token=",
      ]),
    );
    const cleanup = await adapter.cleanup();
    assert.equal(cleanup.status, "pass");
    assert.equal(fixture.state.viewportReset, 1);
  });

  await t.test("final reload failure still clears fresh CDP metrics and viewport", async () => {
    const fixture = createFakeBrowser();
    const firstCdp = fixture.cdp;
    const freshCommands: string[] = [];
    const freshCdp = {
      async send(method: string, params?: Record<string, unknown>) {
        freshCommands.push(method);
        return firstCdp.send(method, params);
      },
      async readEvents(options: Parameters<typeof firstCdp.readEvents>[0] = {}) {
        return firstCdp.readEvents(options);
      },
    };
    fixture.tab.capabilities.get = async (id: string) => {
      assert.equal(id, "cdp");
      fixture.state.cdpGet += 1;
      return fixture.state.cdpGet === 1 ? firstCdp : freshCdp;
    };
    const originalGoto = fixture.tab.goto.bind(fixture.tab);
    let gotoCount = 0;
    fixture.tab.goto = async (url: string) => {
      gotoCount += 1;
      await originalGoto(url);
      if (gotoCount === 3) {
        throw new Error("Bearer reload-secret Cookie: reload=secret https://localhost/?token=reload");
      }
    };
    const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
    await adapter.navigate("comparison", "http://localhost:3142/fixture");
    await adapter.setViewport("comparison", { width: 390, height: 844 });
    await assert.rejects(
      adapter.navigate("comparison", "http://127.0.0.1:4142/prototype.html"),
      (error: unknown) => assertSanitizedParityError(error, "PARITY_UNEXPECTED_ERROR", [
        "Bearer",
        "Cookie",
        "reload-secret",
        "token=",
      ]),
    );
    const cleanup = await adapter.cleanup();
    assert.equal(cleanup.status, "pass");
    assert.equal(fixture.state.cdpGet, 2);
    assert.ok(freshCommands.includes("Emulation.clearDeviceMetricsOverride"));
    assert.equal(fixture.state.viewportReset, 1);
  });
});

test("IAB-08 selection drift is checked between bootstrap/reload and waitForHidden completion", async (t) => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;

  await t.test("goto drift stops before the load-state Browser operation", async () => {
    const fixture = createFakeBrowser();
    const originalGoto = fixture.tab.goto.bind(fixture.tab);
    let loadStateCalls = 0;
    fixture.tab.goto = async (url: string) => {
      await originalGoto(url);
      fixture.state.selectedId = "other";
    };
    fixture.tab.playwright.waitForLoadState = async () => {
      loadStateCalls += 1;
    };
    const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
    await assert.rejects(
      adapter.navigate("comparison", "http://localhost:3142/fixture"),
      (error: unknown) => (error as { code?: string }).code === "PARITY_SELECTED_TAB_DRIFT",
    );
    assert.equal(loadStateCalls, 0);
    fixture.state.selectedId = "comparison";
    assert.equal((await adapter.cleanup()).status, "pass");
  });

  await t.test("origin bootstrap stops before final reload after selection drift", async () => {
    const fixture = createFakeBrowser();
    const firstCdp = fixture.cdp;
    const freshCdp = {
      send: firstCdp.send.bind(firstCdp),
      readEvents: firstCdp.readEvents.bind(firstCdp),
    };
    fixture.tab.capabilities.get = async (id: string) => {
      assert.equal(id, "cdp");
      fixture.state.cdpGet += 1;
      if (fixture.state.cdpGet === 2) fixture.state.selectedId = "other";
      return fixture.state.cdpGet === 1 ? firstCdp : freshCdp;
    };
    const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
    await adapter.navigate("comparison", "http://localhost:3142/fixture");
    await adapter.setViewport("comparison", { width: 390, height: 844 });
    await assert.rejects(
      adapter.navigate("comparison", "http://127.0.0.1:4142/prototype.html"),
      (error: unknown) => (error as { code?: string }).code === "PARITY_SELECTED_TAB_DRIFT",
    );
    assert.deepEqual(fixture.state.navigation, [
      "http://localhost:3142/fixture",
      "http://127.0.0.1:4142/prototype.html",
    ]);
    fixture.state.selectedId = "comparison";
    assert.equal((await adapter.cleanup()).status, "pass");
  });

  await t.test("waitForHidden count zero rechecks selected tab", async () => {
    const fixture = createFakeBrowser();
    const originalLocator = fixture.tab.playwright.locator.bind(fixture.tab.playwright);
    fixture.tab.playwright.locator = (selector: string) => {
      const locator = originalLocator(selector);
      if (selector !== "#missing") return locator;
      return {
        ...locator,
        async count() {
          const count = await locator.count();
          fixture.state.selectedId = "other";
          return count;
        },
      };
    };
    const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
    await assert.rejects(
      adapter.runAction("comparison", { type: "waitForHidden", selector: "#missing" }),
      (error: unknown) => (error as { code?: string }).code === "PARITY_SELECTED_TAB_DRIFT",
    );
  });

  await t.test("waitForHidden completion rechecks selected tab", async () => {
    const fixture = createFakeBrowser();
    const originalLocator = fixture.tab.playwright.locator.bind(fixture.tab.playwright);
    fixture.tab.playwright.locator = (selector: string) => {
      const locator = originalLocator(selector);
      if (selector !== "#hidden") return locator;
      return {
        ...locator,
        async waitFor(options: { state: string }) {
          await locator.waitFor(options);
          fixture.state.selectedId = "other";
        },
      };
    };
    const adapter = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
    await assert.rejects(
      adapter.runAction("comparison", { type: "waitForHidden", selector: "#hidden" }),
      (error: unknown) => (error as { code?: string }).code === "PARITY_SELECTED_TAB_DRIFT",
    );
  });
});
