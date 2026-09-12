import React, { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { LanguageProvider } from "../../app/i18n/LanguageProvider";
import { OutreachFeedbackProvider } from "../../app/admin/zaad/OutreachFeedbackProvider";

export function loadComponent<T>(name: string, mocks: Record<string, unknown>): T {
  const filename = path.resolve(`app/admin/zaad/${name}.tsx`), require = createRequire(filename), target = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)((id: string) => id in mocks ? mocks[id] : require(id), target, target.exports);
  return (target.exports as Record<string, T>)[name];
}
export async function withFeedbackDom(work: (document: Document, render: (element: React.ReactNode, view?: string) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM('<html lang="ja"><body><button id="origin">Origin</button><div id="root"></div></body></html>', { url: "http://localhost/", pretendToBeVisual: true });
  const before = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, React, IS_REACT_ACT_ENVIRONMENT: true })) {
    before.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await work(dom.window.document, (element, view = "messages") => act(async () => root.render(h(LanguageProvider, { availableLocales: ["ja"], tenantKey: "lg", children: h(OutreachFeedbackProvider, { key: view, tenant: "lg", view, children: element }) }))));
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of before) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
}
