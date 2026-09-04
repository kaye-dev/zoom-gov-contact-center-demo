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
const expectedCdpRemediation = {
  settingsPath: "設定 → ブラウザ → 開発者モード",
  setting: "完全な CDP アクセスを有効にする",
  requiresRestart: true,
  requiresOriginApproval: true,
};

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
    activations: [] as string[],
    actions: [] as string[],
    elements: new Map<string, { count?: number; visible?: boolean; text?: string; attributes?: Record<string, string | null> }>([
      ["html", { text: "fixture", attributes: {} }],
      ["main", { text: "Fixture content", attributes: { "data-state": "ready" } }],
      ["#theme-toggle", { text: "theme", attributes: { "aria-checked": "false" } }],
      ["#field", { text: "", attributes: {} }],
      ["#hidden", { text: "", visible: false, attributes: {} }],
      ["#detached", { text: "", visible: true, attributes: {} }],
      ["#multiple", { count: 2, text: "", attributes: {} }],
      ["button", { text: "Submit", attributes: {} }],
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
      } else if (method === "Page.bringToFront") {
        state.selectedId = tab.id;
        state.activations.push(tab.id);
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
        if (source.includes("location.pathname")) return new URL(state.url).pathname;
        if (source.includes("rootClassPresent")) {
          const rootClass = arg as string;
          return { rootClassPresent: rootClass === state.theme, colorScheme: state.theme };
        }
        if (source.includes("control selector drifted")) {
          return { matches: true, visible: true, disabled: false };
        }
        if (source.includes("overflow selector drifted")) {
          return { matches: true, scrollX: 0, scrollY: 0, documentOverflow: 0, targetOverflow: 0 };
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

function createPrototypeTab(fixture: ReturnType<typeof createFakeBrowser>) {
  let currentUrl = "about:blank";
  const navigation: string[] = [];
  const baseEvaluate = fixture.tab.playwright.evaluate.bind(fixture.tab.playwright);
  const prototypeCdp = {
    async send(method: string, params?: Record<string, unknown>) {
      if (method === "Page.bringToFront") {
        fixture.state.selectedId = "prototype";
        fixture.state.activations.push("prototype");
        return;
      }
      return fixture.cdp.send(method, params);
    },
    readEvents: fixture.cdp.readEvents.bind(fixture.cdp),
  };
  return {
    tab: {
      ...fixture.tab,
      id: "prototype",
      capabilities: {
        async list() {
          return [{ id: "cdp" }];
        },
        async get(id: string) {
          assert.equal(id, "cdp");
          fixture.state.cdpGet += 1;
          return prototypeCdp;
        },
      },
      playwright: {
        ...fixture.tab.playwright,
        async evaluate(fn: (...args: never[]) => unknown, arg?: unknown) {
          if (fn.toString().includes("location.pathname")) {
            return new URL(currentUrl).pathname;
          }
          return baseEvaluate(fn, arg);
        },
      },
      async goto(url: string) {
        currentUrl = url;
        navigation.push(url);
        const selectedTheme = new URL(url).searchParams.get("theme");
        if (selectedTheme) fixture.state.theme = selectedTheme;
      },
      async url() {
        return currentUrl;
      },
    },
    navigation,
    currentUrl: () => currentUrl,
  };
}

const contract = {
  comparisonConditions: {
    viewports: ["390x844", "1280x800"],
    dpr: 1,
    scroll: { x: 0, y: 0 },
    themes: ["light", "dark"],
    authorization: "none",
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

test("IAB-01 pure ESM import and distinct-tab final run", async () => {
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
  const prototype = createPrototypeTab(fixture);
  const adapter = createInAppBrowserParityAdapter({
    browser: fixture.browser,
    tabs: { production: fixture.tab, prototype: prototype.tab },
  });
  const evidence = await new BrowserParityRunner(adapter).run({
    definition: { contract, spec, prototypeRevision: digest, validationProfileDigest: digest },
    phase: "final",
    changedTargetIds: ["main"],
    changedStates: ["default"],
    changedViewports: ["390x844"],
    tabs: { production: fixture.tab.id, prototype: prototype.tab.id },
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
  assert.deepEqual(
    evidence.capabilities.surfaceContexts.map(({ surface }: { surface: string }) => surface),
    ["production", "prototype"],
  );
  for (const surfaceContext of evidence.capabilities.surfaceContexts) {
    assert.equal(surfaceContext.authorizationProfile, "none");
    assert.equal(
      surfaceContext.authorizationProfileDigest,
      await sha256Digest("parity:authorization-profile:v1\0none"),
    );
  }
  assert.deepEqual(fixture.state.loadStateOptions, { state: "domcontentloaded", timeoutMs: 10_000 });
  assert.equal(new URL(evidence.rows[0].actualConditions.urls.production).search, "");
  assert.match(fixture.state.navigation[0], /localhost:3142/u);
  assert.match(prototype.navigation[0], /127\.0\.0\.1:4142/u);
});

test("IAB-01b production/prototypeを別tab contextでnavigate・cache・cleanupする", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const { BrowserParityRunner, sha256Digest } = await coreModulePromise;
  const fixture = createFakeBrowser();
  const prototype = createPrototypeTab(fixture);
  const adapter = createInAppBrowserParityAdapter({
    browser: fixture.browser,
    tabs: { production: fixture.tab, prototype: prototype.tab },
  });
  const input = {
    definition: { contract, spec, prototypeRevision: digest, validationProfileDigest: digest },
    phase: "final",
    changedTargetIds: ["main"],
    changedStates: ["default"],
    tabs: { production: fixture.tab.id, prototype: prototype.tab.id },
    baseUrls: { production: "http://localhost:3000", prototype: "http://127.0.0.1:3100" },
    run: {
      runId: "run-multi-tab",
      goalSha256: digest,
      runtime: { owner: "fixture", checkout: "/fixture" },
      sources: [],
    },
  };
  const evidence = await new BrowserParityRunner(adapter).run(input);

  assert.equal(evidence.rows[0].status, "pass");
  assert.deepEqual(adapter.comparisonTabIds, {
    production: "comparison",
    prototype: "prototype",
  });
  assert.equal(fixture.state.navigation.length, 1);
  assert.equal(prototype.navigation.length, 1);
  assert.equal(new URL(prototype.currentUrl()).origin, "http://127.0.0.1:3100");
  assert.deepEqual(
    evidence.capabilities.surfaceContexts,
    [
      {
        sessionId: "iab-fixture",
        tabId: "comparison",
        surface: "production",
        origin: "http://localhost:3000",
        authorizationProfile: "none",
        authorizationProfileDigest: await sha256Digest("parity:authorization-profile:v1\0none"),
      },
      {
        sessionId: "iab-fixture",
        tabId: "prototype",
        surface: "prototype",
        origin: "http://127.0.0.1:3100",
        authorizationProfile: "none",
        authorizationProfileDigest: await sha256Digest("parity:authorization-profile:v1\0none"),
      },
    ],
  );
  assert.equal(evidence.capabilities.cleanup.status, "pass");
  assert.deepEqual(
    evidence.capabilities.cleanup.tabs.map(({ tabId }: { tabId: string }) => tabId),
    ["comparison", "prototype"],
  );
  assert.ok(fixture.state.activations.includes("prototype"));
  assert.equal(fixture.state.selectedId, "prototype");
  const reused = await new BrowserParityRunner(adapter).run(input);
  assert.equal(reused.capabilities.cleanup.status, "pass");

  assert.throws(
    () => createInAppBrowserParityAdapter({
      browser: fixture.browser,
      tabs: { production: fixture.tab, prototype: fixture.tab },
    }),
    (error: unknown) => assertSanitizedParityError(error, "PARITY_COMPARISON_TAB_REQUIRED"),
  );
});

test("IAB-01c parallel Browser sessionのcleanupは他sessionを変更しない", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const first = createFakeBrowser();
  const second = createFakeBrowser();
  first.browser.browserId = "iab-parallel-a";
  second.browser.browserId = "iab-parallel-b";
  const firstAdapter = createInAppBrowserParityAdapter({ browser: first.browser, tab: first.tab });
  const secondAdapter = createInAppBrowserParityAdapter({ browser: second.browser, tab: second.tab });
  await Promise.all([
    firstAdapter.navigate("comparison", "http://localhost:3142/fixture"),
    secondAdapter.navigate("comparison", "http://localhost:3242/fixture"),
  ]);
  await Promise.all([
    firstAdapter.setViewport("comparison", { width: 390, height: 844 }),
    secondAdapter.setViewport("comparison", { width: 1280, height: 900 }),
  ]);
  const secondBeforeCleanup = structuredClone(second.state);
  assert.equal((await firstAdapter.cleanup()).status, "pass");
  assert.deepEqual(second.state, secondBeforeCleanup);
  assert.equal(first.state.viewportReset, 1);
  assert.equal(first.state.cdpClear, 1);
  assert.equal((await secondAdapter.cleanup()).status, "pass");
  assert.equal(second.state.viewportReset, 1);
  assert.equal(second.state.cdpClear, 1);
});

test("IAB-02 390x844 DPR1 canary and cleanup", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const fixture = createFakeBrowser();
  const adapter = createInAppBrowserParityAdapter({
    browser: fixture.browser,
    tab: fixture.tab,
    clock: {
      now: () => 0,
      async sleep() {
        assert.fail("cleanup happy path must not wait");
      },
    },
  });
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
        remediation: expectedCdpRemediation,
      });
      return true;
    },
  );
  await noCdp.cleanup();

  const unknownCdp = createFakeBrowser();
  unknownCdp.tab.capabilities.list = async () => {
    throw new Error("Bearer list-secret Cookie: cdp=list https://localhost/?token=list");
  };
  const unknownCdpAdapter = createInAppBrowserParityAdapter({
    browser: unknownCdp.browser,
    tab: unknownCdp.tab,
  });
  await assert.rejects(
    unknownCdpAdapter.setViewport("comparison", { width: 390, height: 844 }),
    (error: unknown) => {
      assertSanitizedParityError(error, "PARITY_CDP_CAPABILITY_UNAVAILABLE", [
        "Bearer",
        "Cookie",
        "list-secret",
        "token=",
      ]);
      const candidate = error as { message?: string; evidence?: Record<string, unknown> };
      assert.match(candidate.message ?? "", /CDPの有効化状態を確認できません/u);
      assert.deepEqual(candidate.evidence, {
        operation: "tab.capabilities.list",
        requiredCapability: "cdp",
        cdpAdvertised: null,
        remediation: expectedCdpRemediation,
      });
      return true;
    },
  );
  assert.equal((await unknownCdpAdapter.cleanup()).status, "pass");
  assert.equal(unknownCdp.state.viewportReset, 1);

  const malformedCdp = createFakeBrowser();
  malformedCdp.tab.capabilities.list = async () => undefined as never;
  const malformedCdpAdapter = createInAppBrowserParityAdapter({
    browser: malformedCdp.browser,
    tab: malformedCdp.tab,
  });
  await assert.rejects(
    malformedCdpAdapter.setViewport("comparison", { width: 390, height: 844 }),
    (error: unknown) => {
      const candidate = error as {
        code?: string;
        message?: string;
        evidence?: Record<string, unknown>;
      };
      assert.equal(candidate.code, "PARITY_CDP_CAPABILITY_UNAVAILABLE");
      assert.match(candidate.message ?? "", /CDPの有効化状態を確認できません/u);
      assert.deepEqual(candidate.evidence, {
        operation: "tab.capabilities.list",
        requiredCapability: "cdp",
        cdpAdvertised: null,
        remediation: expectedCdpRemediation,
      });
      return true;
    },
  );
  assert.equal((await malformedCdpAdapter.cleanup()).status, "pass");
  assert.equal(malformedCdp.state.viewportReset, 1);

  const unavailableCdp = createFakeBrowser();
  unavailableCdp.tab.capabilities.get = async (id: string) => {
    assert.equal(id, "cdp");
    throw new Error("Bearer get-secret Cookie: cdp=get https://localhost/?token=get");
  };
  const unavailableCdpAdapter = createInAppBrowserParityAdapter({
    browser: unavailableCdp.browser,
    tab: unavailableCdp.tab,
  });
  await assert.rejects(
    unavailableCdpAdapter.setViewport("comparison", { width: 390, height: 844 }),
    (error: unknown) => {
      assertSanitizedParityError(error, "PARITY_CDP_CAPABILITY_UNAVAILABLE", [
        "Bearer",
        "Cookie",
        "get-secret",
        "token=",
      ]);
      const candidate = error as { message?: string; evidence?: Record<string, unknown> };
      assert.match(candidate.message ?? "", /完全な CDP アクセスを有効にする/u);
      assert.deepEqual(candidate.evidence, {
        operation: "tab.capabilities.get",
        requiredCapability: "cdp",
        cdpAdvertised: true,
        remediation: expectedCdpRemediation,
        cdpAcquired: false,
      });
      return true;
    },
  );
  assert.equal((await unavailableCdpAdapter.cleanup()).status, "pass");
  assert.equal(unavailableCdp.state.viewportReset, 1);

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
    (error: unknown) => {
      assertSanitizedParityError(error, "PARITY_DPR_OVERRIDE_UNAVAILABLE", [
        "Bearer",
        "Cookie",
        "partial-secret",
        "token=",
      ]);
      const candidate = error as { message?: string; evidence?: Record<string, unknown> };
      assert.match(candidate.message ?? "", /対象のローカルoriginでCDP利用を承認/u);
      assert.deepEqual(candidate.evidence, {
        operation: "cdp.send",
        requiredCapability: "cdp",
        cdpAdvertised: true,
        remediation: expectedCdpRemediation,
        cdpAcquired: true,
        command: "Emulation.setDeviceMetricsOverride",
      });
      return true;
    },
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

test("IAB-03a unresolved tab.gotoはbounded navigation deadlineで停止する", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const fixture = createFakeBrowser();
  const originalGoto = fixture.tab.goto.bind(fixture.tab);
  let releaseNavigation!: () => void;
  const navigationGate = new Promise<void>((resolve) => {
    releaseNavigation = resolve;
  });
  let navigationFinished: Promise<void> | undefined;
  fixture.tab.goto = (url: string) => {
    navigationFinished = navigationGate.then(() => originalGoto(url));
    return navigationFinished;
  };
  const adapter = createInAppBrowserParityAdapter({
    browser: fixture.browser,
    tab: fixture.tab,
    timeouts: { navigationMs: 5 },
  });
  await assert.rejects(
    adapter.navigate("comparison", "http://localhost:3142/fixture?theme=light"),
    (error: unknown) => {
      const value = error as { code?: string; evidence?: Record<string, unknown>; message?: string };
      assert.equal(value.code, "PARITY_NAVIGATION_TIMEOUT");
      assert.deepEqual(value.evidence, { operation: "tab.goto", timeoutMs: 5 });
      assert.doesNotMatch(value.message ?? "", /localhost|theme=/u);
      return true;
    },
  );
  assert.equal(fixture.state.navigation.length, 0);
  await assert.rejects(
    adapter.navigate("comparison", "http://localhost:3142/another"),
    (error: unknown) => (error as { code?: string }).code === "PARITY_NAVIGATION_TIMEOUT",
  );
  await assert.rejects(
    adapter.cleanup(),
    (error: unknown) => (error as { code?: string }).code === "PARITY_CLEANUP_FAILED",
  );
  releaseNavigation();
  await navigationFinished;
  assert.equal(fixture.state.navigation.length, 1, "the late operation can settle but its adapter stays quarantined");
  await assert.rejects(
    adapter.activateTab("comparison"),
    (error: unknown) => (error as { code?: string }).code === "PARITY_NAVIGATION_TIMEOUT",
  );
});

test("IAB-03b 実adapterのsurface context安定化はkeyごとに一度だけ実operationを行う", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const { BrowserParityRunner } = await coreModulePromise;
  const fixture = createFakeBrowser();
  const originalUrl = fixture.tab.url.bind(fixture.tab);
  const originalCapabilityList = fixture.browser.capabilities.list.bind(
    fixture.browser.capabilities,
  );
  const originalCapabilityGet = fixture.browser.capabilities.get.bind(
    fixture.browser.capabilities,
  );
  let urlReadOperations = 0;
  let capabilityListOperations = 0;
  let capabilityGetOperations = 0;
  fixture.tab.url = async () => {
    urlReadOperations += 1;
    return originalUrl();
  };
  fixture.browser.capabilities.list = async () => {
    capabilityListOperations += 1;
    return originalCapabilityList();
  };
  fixture.browser.capabilities.get = async (id: string) => {
    capabilityGetOperations += 1;
    return originalCapabilityGet(id);
  };

  const runner = new BrowserParityRunner(
    createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab }),
  );
  const base = {
    tabId: "comparison",
    row: contract.parityMatrix[0],
    setup: {
      query: {},
      actions: [],
      browser: { type: "fixed", theme: "light" },
    },
    dpr: 1,
    expectedScroll: { x: 0, y: 0 },
  };

  await runner.prepareSurface({
    ...base,
    surface: "production",
    authorizationProfile: "admin",
    baseUrl: "http://localhost:3000/",
  });
  assert.equal(urlReadOperations, 2, "context readback + row navigation readback");
  assert.equal(fixture.state.navigation.length, 1);
  assert.equal(capabilityListOperations, 1);
  assert.equal(capabilityGetOperations, 1);

  await runner.prepareSurface({
    ...base,
    surface: "production",
    authorizationProfile: "admin",
    baseUrl: "http://localhost:3000/",
  });
  assert.equal(urlReadOperations, 3, "same context skips its stabilization readback");
  assert.equal(fixture.state.navigation.length, 2);

  await runner.prepareSurface({
    ...base,
    surface: "production",
    authorizationProfile: "auditor",
    baseUrl: "http://localhost:3000/",
  });
  assert.equal(urlReadOperations, 5, "authorization profile creates one new context");
  assert.equal(fixture.state.navigation.length, 3);

  await runner.prepareSurface({
    ...base,
    surface: "production",
    authorizationProfile: "auditor",
    baseUrl: "http://localhost:3142/",
  });
  assert.equal(urlReadOperations, 7, "origin creates one new context");
  assert.equal(fixture.state.navigation.length, 4);

  await runner.prepareSurface({
    ...base,
    surface: "prototype",
    authorizationProfile: "auditor",
    baseUrl: "http://127.0.0.1:4142/",
  });
  assert.equal(urlReadOperations, 9, "surface creates one new context");
  assert.equal(fixture.state.navigation.length, 5, "stabilization adds no navigation");
  assert.equal(capabilityListOperations, 1, "capability bootstrap is reused");
  assert.equal(capabilityGetOperations, 1, "capability bootstrap is reused");
  assert.equal((await runner.adapter.cleanup()).status, "pass");
});

test("IAB-03c 実adapterのcontext安定化失敗はcacheせずrunnerが再試行できる", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const { BrowserParityRunner } = await coreModulePromise;
  const fixture = createFakeBrowser();
  const originalUrl = fixture.tab.url.bind(fixture.tab);
  const originalCapabilityList = fixture.browser.capabilities.list.bind(
    fixture.browser.capabilities,
  );
  const originalCapabilityGet = fixture.browser.capabilities.get.bind(
    fixture.browser.capabilities,
  );
  let urlReadOperations = 0;
  let capabilityListOperations = 0;
  let capabilityGetOperations = 0;
  fixture.tab.url = async () => {
    urlReadOperations += 1;
    if (urlReadOperations === 1) {
      throw new Error("Bearer context-secret Cookie: context=secret");
    }
    return originalUrl();
  };
  fixture.browser.capabilities.list = async () => {
    capabilityListOperations += 1;
    return originalCapabilityList();
  };
  fixture.browser.capabilities.get = async (id: string) => {
    capabilityGetOperations += 1;
    return originalCapabilityGet(id);
  };

  const runner = new BrowserParityRunner(
    createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab }),
  );
  const input = {
    tabId: "comparison",
    row: contract.parityMatrix[0],
    surface: "production",
    setup: {
      query: {},
      actions: [],
      browser: { type: "fixed", theme: "light" },
    },
    authorizationProfile: "admin",
    baseUrl: "http://localhost:3000/",
    dpr: 1,
    expectedScroll: { x: 0, y: 0 },
  };

  await assert.rejects(
    runner.prepareSurface(input),
    (error: unknown) => assertSanitizedParityError(
      error,
      "PARITY_UNEXPECTED_ERROR",
      ["Bearer", "Cookie", "context-secret"],
    ),
  );
  assert.equal(urlReadOperations, 1);
  assert.equal(fixture.state.navigation.length, 0);

  await runner.prepareSurface(input);
  assert.equal(urlReadOperations, 3, "retry repeats stabilization, then navigation readback");
  assert.equal(fixture.state.navigation.length, 1);
  assert.equal(capabilityListOperations, 1, "successful partial bootstrap is reused");
  assert.equal(capabilityGetOperations, 1, "successful partial bootstrap is reused");

  await runner.prepareSurface(input);
  assert.equal(urlReadOperations, 4, "successful retry caches the context");
  assert.equal(fixture.state.navigation.length, 2);
  assert.equal((await runner.adapter.cleanup()).status, "pass");
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

  await t.test("single origin-transition navigation failure still clears viewport state", async () => {
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
      if (gotoCount === 2) {
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
    assert.equal(fixture.state.cdpGet, 1);
    assert.equal(freshCommands.length, 0);
    assert.equal(fixture.state.viewportReset, 1);
  });
});

test("IAB-07b cleanupは不一致時だけbounded backoffする", async (t) => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;

  await t.test("default deadlineはwall clockを参照しない", async () => {
    const fixture = createFakeBrowser();
    const originalDateNow = Date.now;
    Date.now = () => {
      throw new Error("wall clock must not drive cleanup deadlines");
    };
    try {
      const adapter = createInAppBrowserParityAdapter({
        browser: fixture.browser,
        tab: fixture.tab,
        timeouts: { cleanupMs: 10, cleanupPollMs: 1 },
      });
      await adapter.setViewport("comparison", { width: 390, height: 844 });
      assert.equal((await adapter.cleanup()).status, "pass");
    } finally {
      Date.now = originalDateNow;
    }
  });

  await t.test("eventual readbackは最初のretryでpassする", async () => {
    const fixture = createFakeBrowser();
    fixture.viewport.reset = async () => {
      fixture.state.viewportReset += 1;
    };
    let now = 0;
    const waits: number[] = [];
    const adapter = createInAppBrowserParityAdapter({
      browser: fixture.browser,
      tab: fixture.tab,
      timeouts: { cleanupMs: 2_000, cleanupPollMs: 100 },
      clock: {
        now: () => now,
        async sleep(milliseconds: number) {
          waits.push(milliseconds);
          now += milliseconds;
          fixture.state.width = 1280;
          fixture.state.height = 720;
        },
      },
    });
    await adapter.setViewport("comparison", { width: 390, height: 844 });
    assert.equal((await adapter.cleanup()).status, "pass");
    assert.deepEqual(waits, [100]);
  });

  await t.test("terminal mismatchは2秒で停止する", async () => {
    const fixture = createFakeBrowser();
    fixture.viewport.reset = async () => {
      fixture.state.viewportReset += 1;
    };
    let now = 0;
    const waits: number[] = [];
    const adapter = createInAppBrowserParityAdapter({
      browser: fixture.browser,
      tab: fixture.tab,
      timeouts: { cleanupMs: 2_000, cleanupPollMs: 500 },
      clock: {
        now: () => now,
        async sleep(milliseconds: number) {
          waits.push(milliseconds);
          now += milliseconds;
        },
      },
    });
    await adapter.setViewport("comparison", { width: 390, height: 844 });
    await assert.rejects(
      adapter.cleanup(),
      (error: unknown) => (error as { code?: string }).code === "PARITY_CLEANUP_FAILED",
    );
    assert.equal(waits.reduce((total, value) => total + value, 0), 2_000);
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

test("IAB-09 coverage probeとanchor artifactはcompact recordだけを返す", async () => {
  const { createInAppBrowserParityAdapter } = await adapterModulePromise;
  const fixture = createFakeBrowser();
  const artifacts: Array<Record<string, unknown>> = [];
  const artifactSink = async (input: Record<string, unknown>) => {
    artifacts.push(input);
    return {
      path: `.codex/parity-runs/run/artifacts/${input.rowId}--${input.probeId}--${input.surface}.bin`,
      sha256: digest,
      bytes: input.content instanceof Uint8Array
        ? input.content.byteLength
        : new TextEncoder().encode(String(input.content)).byteLength,
      kind: input.kind,
      mediaType: input.mediaType,
      surface: input.surface,
      rowId: input.rowId,
      probeId: input.probeId,
    };
  };
  const adapter = createInAppBrowserParityAdapter({
    browser: fixture.browser,
    tab: fixture.tab,
    artifactSink,
  });
  await adapter.navigate("comparison", "http://localhost:3142/fixture");
  await adapter.setViewport("comparison", { width: 390, height: 844 });
  const context = {
    row: {
      id: "main-ready-mobile-light",
      targetId: "main",
      route: "/fixture",
      entry: "prototype.html",
      state: "ready",
      viewport: "390x844",
      theme: "light",
    },
    surface: "production",
    networkSource: "not-required",
  };
  const coverageProbes = [
    { id: "route", kind: "route", options: {}, selector: "main" },
    { id: "setup", kind: "setup", options: {}, selector: "main" },
    { id: "state", kind: "state", options: { expected: "visible" }, selector: "main" },
    { id: "viewport", kind: "viewport", options: {}, selector: "main" },
    { id: "theme", kind: "theme", options: { rootClass: "row-theme", colorScheme: "row-theme" }, selector: "main" },
    { id: "control", kind: "control", options: { expected: "enabled" }, selector: "button" },
    { id: "overflow", kind: "overflow", options: { tolerancePx: 0 }, selector: "main" },
  ];
  for (const definition of coverageProbes) {
    const result = await adapter.runProbe("comparison", {
      id: definition.id,
      kind: definition.kind,
      mode: "equal",
      productionSelector: definition.selector,
      prototypeSelector: definition.selector,
      required: true,
      tier: "coverage",
      options: definition.options,
    }, context);
    assert.equal(result.value.matches, true, definition.kind);
  }

  for (const kind of ["screenshot", "dom", "accessibility"]) {
    const result = await adapter.runProbe("comparison", {
      id: `anchor-${kind}`,
      kind,
      mode: "equal",
      productionSelector: "main",
      prototypeSelector: "main",
      required: true,
      tier: "anchor",
      options: {},
    }, context);
    assert.match(result.artifact.path, /^\.codex\/parity-runs\/run\/artifacts\//u);
    assert.equal(Object.hasOwn(result, "content"), false);
    assert.equal(Object.hasOwn(result.artifact, "content"), false);
  }
  assert.equal(artifacts.length, 3);

  const keyboard = await adapter.runProbe("comparison", {
    id: "anchor-keyboard",
    kind: "keyboard",
    mode: "equal",
    productionSelector: "button",
    prototypeSelector: "button",
    required: true,
    tier: "anchor",
    options: { key: "Enter" },
  }, context);
  assert.deepEqual(keyboard.value, { matches: true, key: "Enter" });
  assert.ok(fixture.state.actions.includes("press:button:Enter"));

  const withoutSink = createInAppBrowserParityAdapter({ browser: fixture.browser, tab: fixture.tab });
  await assert.rejects(
    withoutSink.runProbe("comparison", {
      id: "anchor-screenshot",
      kind: "screenshot",
      mode: "equal",
      productionSelector: "main",
      prototypeSelector: "main",
      required: true,
      tier: "anchor",
      options: {},
    }, context),
    (error: unknown) => (error as { code?: string }).code === "PARITY_ARTIFACT_SINK_UNAVAILABLE",
  );
});
