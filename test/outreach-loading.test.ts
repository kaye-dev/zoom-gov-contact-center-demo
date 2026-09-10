import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { LanguageProvider } from "../app/i18n/LanguageProvider";
import { OutreachView } from "../app/admin/zaad/OutreachView";

const props = { tenant: "lg" as const, allowedTenants: ["lg"] as const, departments: ["resident-support"], permissions: { create: true, update: true, delete: true }, canConfigure: true };

test("LOADING-01: connection gates list requests and preserves toolbar and columns through deferred loading", async () => {
  const dom = new JSDOM('<html lang="ja"><body><div id="root"></div></body></html>', { url: "http://localhost/admin/zaad?tenant=lg&view=messages" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, self: dom.window, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, React, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const oldFetch = globalThis.fetch;
  const pending: { url: string; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = async input => new Promise<Response>(resolve => pending.push({ url: String(input), resolve }));
  const root = createRoot(dom.window.document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {}, hmrRefresh() {} };
  const render = () => root.render(h(AppRouterContext.Provider, { value: router }, h(SearchParamsContext.Provider, { value: new URLSearchParams("tenant=lg&view=messages") }, h(LanguageProvider, { availableLocales: ["ja"], tenantKey: "lg", children: h(OutreachView, props) }))));
  const respond = async (payload: unknown, status = 200) => { const request = pending.shift()!; await act(async () => request.resolve(Response.json(payload, { status, headers: { "X-Admin-Tenant": "lg" } }))); };
  try {
    await act(async () => render());
    assert.equal(pending.length, 1); assert.match(pending[0].url, /\/connection\?/);
    assert.ok(dom.window.document.querySelector('table[aria-busy="true"]'));
    const headers = [...dom.window.document.querySelectorAll("th")].map(node => node.textContent);
    const toolbar = [...dom.window.document.querySelectorAll("button")].filter(node => ["同期", "作成"].includes(node.textContent ?? ""));
    assert.equal(toolbar.length, 2); assert.ok(toolbar.every(button => button.disabled));
    await respond({ tenantKey: "lg", connection: { state: "connected" }, fullAccess: true });
    assert.equal(pending.length, 1); assert.match(pending[0].url, /\/message-catalog\?/);
    assert.deepEqual([...dom.window.document.querySelectorAll("th")].map(node => node.textContent), headers);
    assert.ok(dom.window.document.querySelector('table[aria-busy="true"]'));
    await respond({ tenantKey: "lg", items: [], total: 0, nextCursor: null });
    assert.equal(dom.window.document.querySelector("table")?.getAttribute("aria-busy"), "false");
    assert.equal(dom.window.document.querySelectorAll("tbody tr").length, 0);
    assert.deepEqual([...dom.window.document.querySelectorAll("th")].map(node => node.textContent), headers);
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = oldFetch;
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});

test("CSV-AUTO-01: choosing a file previews five rows and sends every target once", async () => {
  const { OutreachCsvImport } = await import("../app/admin/zaad/OutreachCsvImport");
  const dom = new JSDOM('<html lang="ja"><body><div id="root"></div></body></html>', { url: "http://localhost/admin/zaad?tenant=lg&view=contact-lists&section=contacts&state=csv-upload" });
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, self: dom.window, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, React, IS_REACT_ACT_ENVIRONMENT: true })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const oldFetch = globalThis.fetch;
  const pending: { url: string; init?: RequestInit; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = async (input, init) => new Promise<Response>(resolve => pending.push({ url: String(input), init, resolve }));
  const root = createRoot(dom.window.document.getElementById("root")!);
  let query = new URLSearchParams(dom.window.location.search), dirty = false, saving = false;
  const setDirty = (value: boolean) => { dirty = value; }, setSaving = (value: boolean) => { saving = value; };
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace(href: string) { query = new URL(href, dom.window.location.origin).searchParams; render(); }, prefetch: async () => {}, hmrRefresh() {} };
  const render = () => root.render(h(AppRouterContext.Provider, { value: router }, h(SearchParamsContext.Provider, { value: query }, h(LanguageProvider, { availableLocales: ["ja"], tenantKey: "lg", children: h(OutreachCsvImport, { ...props, setDirty, setSaving, close() {}, saved() {} }) }))));
  const respond = async (payload: unknown, status = 200) => { const request = pending.shift()!; await act(async () => request.resolve(Response.json(payload, { status, headers: { "X-Admin-Tenant": "lg" } }))); };
  const choose = async () => {
    const input = dom.window.document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["name,phone,topicIds\nTest,09000000001,elder-watch"], "contacts.csv", { type: "text/csv" })] });
    await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
  };
  const preview = { tenantKey: "lg", id: "preview-one", previewDigest: "digest", status: "PREVIEW", expiresAt: new Date(Date.now() + 60000).toISOString(), rows: Array.from({ length: 7 }, (_, i) => ({ rowKey: `row-${i}`, rowNumber: i + 2, name: `Test${i}`, phone: "09000000001", topicIds: ["elder-watch"], status: "NEW" })) };
  try {
    await act(async () => render());
    await choose(); assert.equal(pending.length, 1); assert.equal(saving, true);
    assert.match(pending[0].url, /imports\/preview/); assert.equal(pending[0].init?.method, "POST");
    await respond(preview);
    assert.equal(dom.window.document.querySelectorAll("tbody tr").length, 5);
    assert.equal(pending.length, 0); assert.equal(saving, false); assert.equal(dirty, true);
    const button = [...dom.window.document.querySelectorAll("button")].find(node => node.textContent === "取り込む")!;
    assert.ok(button); assert.equal(button.disabled, false);
    await act(async () => { button.click(); button.click(); });
    assert.equal(pending.length, 1); assert.equal(saving, true);
    assert.deepEqual(JSON.parse(String(pending[0].init?.body)).rowKeys, preview.rows.map(row => row.rowKey));
    await respond({ ...preview, status: "COMPLETED", rows: preview.rows.map(row => ({ ...row, status: "IMPORTED" })) });
    assert.match(dom.window.document.body.textContent ?? "", /取込完了.*7/); assert.equal(dirty, false);
    assert.equal(button.disabled, true);
    await choose(); assert.equal(dom.window.document.querySelectorAll("tbody tr").length, 0);
    await respond({ code: "INVALID_CSV_STRUCTURE" }, 400);
    assert.ok(dom.window.document.querySelector('[role="alert"]'));
    assert.equal(dom.window.document.querySelectorAll("tbody tr").length, 0);
    await choose();
    await respond({ ...preview, id: "preview-invalid", rows: preview.rows.map((row, i) => i === 5 ? { ...row, status: "INVALID", errorField: "topicIds", errorCode: "INVALID_TOPIC_IDS" } : row) });
    assert.equal(dom.window.document.querySelectorAll("tbody tr").length, 5);
    assert.equal([...dom.window.document.querySelectorAll("button")].find(node => node.textContent === "取り込む")?.disabled, true);
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = oldFetch;
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});
