import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { LanguageProvider } from "../app/i18n/LanguageProvider";
import { OutreachAudioPlayer } from "../app/admin/zaad/OutreachAudioPlayer";

test("MESSAGE-PLAY-01: automatic load, native controls, stable rerender, retry, pause and abort on item change", async () => {
  const dom = new JSDOM('<html lang="ja"><body><div id="root"></div></body></html>', { url: "http://localhost/" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, React, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let pauses = 0, plays = 0;
  dom.window.HTMLMediaElement.prototype.play = async function () { plays++; };
  dom.window.HTMLMediaElement.prototype.pause = function () { pauses++; };
  const revoked: string[] = [], originalRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = value => { revoked.push(value); };
  const pending: { signal: AbortSignal; resolve: (url: string) => void; reject: (error: Error) => void }[] = [];
  const load = (signal: AbortSignal) => new Promise<string>((resolve, reject) => pending.push({ signal, resolve, reject }));
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = (key: string, strict = false) => { const player = h(OutreachAudioPlayer, { key, load }); root.render(h(LanguageProvider, { availableLocales: ["ja"], tenantKey: "lg", children: strict ? h(React.StrictMode, null, player) : player })); };
  try {
    await act(async () => render("one"));
    assert.equal(pending.length, 1);
    assert.ok(dom.window.document.querySelector("audio")!.controls);
    assert.ok(dom.window.document.querySelector('[role="status"]'));
    assert.equal(dom.window.document.querySelector("button"), null);
    await act(async () => render("one"));
    assert.equal(pending.length, 1);
    await act(async () => pending[0].resolve("blob:synthetic-one"));
    const audio = dom.window.document.querySelector("audio")!;
    assert.equal(audio.controls, true); assert.equal(audio.autoplay, false); assert.equal(audio.preload, "metadata");
    audio.pause(); assert.equal(pauses, 1);
    await act(async () => audio.dispatchEvent(new dom.window.Event("error")));
    assert.ok(dom.window.document.querySelector('[role="alert"]'));
    await act(async () => dom.window.document.querySelector("button")!.click());
    assert.equal(pending.length, 2);
    await act(async () => pending[1].reject(new Error("synthetic load failure")));
    assert.equal(dom.window.document.querySelector("button")!.textContent, "再試行");
    await act(async () => dom.window.document.querySelector("button")!.click());
    await act(async () => render("two"));
    assert.equal(pending[2].signal.aborted, true); assert.ok(pauses >= 2);
    assert.ok(revoked.includes("blob:synthetic-one"));
    await act(async () => pending[2].resolve("blob:late-result"));
    assert.ok(revoked.includes("blob:late-result")); assert.equal(dom.window.document.querySelector("audio")!.getAttribute("src"), null);
    assert.equal(pending.length, 4);
    await act(async () => pending[3].resolve("blob:synthetic-two"));
    assert.equal(dom.window.document.querySelector("audio")!.autoplay, false);
    assert.equal(plays, 0);
    await act(async () => dom.window.document.querySelector("audio")!.dispatchEvent(new dom.window.Event("ended")));
    assert.equal(dom.window.document.querySelector("audio")!.getAttribute("src"), "blob:synthetic-two");
    const previous = pending.length;
    await act(async () => render("strict", true));
    assert.equal(pending.length, previous + 2);
    assert.equal(pending[previous].signal.aborted, true);
    await act(async () => pending[previous].resolve("blob:strict-stale"));
    assert.ok(revoked.includes("blob:strict-stale"));
    await act(async () => pending[previous + 1].resolve("blob:strict-current"));
    assert.equal(dom.window.document.querySelector("audio")!.getAttribute("src"), "blob:strict-current");
    assert.equal(plays, 0);
  } finally {
    await act(async () => root.unmount()); URL.revokeObjectURL = originalRevoke;
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});
