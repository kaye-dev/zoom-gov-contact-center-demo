import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement as h, StrictMode, useEffect } from "react";
import { readFileSync } from "node:fs";
import { Feedback, InlineFeedback, type FeedbackTone } from "../app/components/admin/Feedback";
import { FeedbackToast } from "../app/components/admin/FeedbackToast";
import { ModalDialog } from "../app/components/admin/ModalDialog";
import { useOutreachFeedback } from "../app/admin/zaad/OutreachFeedbackProvider";
import { withFeedbackDom } from "./helpers/outreach-feedback-dom";

function luminance(hex: string) {
  const channels = hex.match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
test("T02/T04 adopted palette passes text contrast in both themes and keeps responsive/forced-colors rules", () => {
  const css = readFileSync("app/styles/ui-foundation.css", "utf8");
  for (const tone of ["success", "info", "warning", "error"]) {
    const bg = [...css.matchAll(new RegExp(`--feedback-${tone}-bg: #([a-f0-9]+)`, "g"))].map(match => luminance(match[1]));
    const fg = [...css.matchAll(new RegExp(`--feedback-${tone}-fg: #([a-f0-9]+)`, "g"))].map(match => luminance(match[1]));
    assert.equal(bg.length, 2); assert.equal(fg.length, 2);
    for (let i = 0; i < 2; i++) assert.ok((Math.max(bg[i], fg[i]) + .05) / (Math.min(bg[i], fg[i]) + .05) >= 4.5, tone);
  }
  assert.match(css, /feedback-toast[^}]+left:50%[^}]+safe-area-inset-bottom/u);
  assert.match(css, /min-width:1024px[^}]+left:1\.5rem[^}]+transform:none/u);
  assert.match(css, /forced-colors:active[^}]+CanvasText[^}]+background:Canvas/u);
});
test("T01/T02 inline spacing belongs to one wrapper; tones have text and an icon", async () => withFeedbackDom(async (document, render) => {
  for (const tone of ["success", "info", "warning", "error"] as FeedbackTone[]) {
    await render(h(InlineFeedback, { tone, children: "Result" }));
    const notice = document.querySelector('[data-feedback-tone]')!;
    assert.equal(notice.getAttribute("role"), tone === "error" ? "alert" : "status");
    assert.equal(notice.getAttribute("aria-atomic"), "true");
    assert.ok(notice.querySelector('[aria-hidden="true"]'));
    assert.equal(document.querySelectorAll('[data-inline-feedback]').length, 1);
    assert.ok(document.querySelector('[data-inline-feedback]')!.classList.contains("py-5"));
    assert.ok(!notice.classList.contains("py-5"));
  }
  await render(null); assert.equal(document.querySelector('[data-inline-feedback]'), null);
}));
test("T05/T06 toast pauses its remaining time for hover, focus, visibility and modal; dismiss restores focus", async context => withFeedbackDom(async (document, render) => {
  let now = 0, nextId = 0, closed = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  context.mock.method(Date, "now", () => now);
  context.mock.method(window, "setTimeout", (callback: () => void, ms: number) => { const id = ++nextId; timers.set(id, { at: now + ms, callback }); return id; });
  context.mock.method(window, "clearTimeout", (id: number) => { timers.delete(id); });
  const tick = async (ms: number) => act(async () => { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); } });
  const toast = h(FeedbackToast, { id: "first", tone: "success", closeLabel: "Dismiss", onClose: () => closed++, children: "Saved" });
  document.getElementById("origin")!.focus();
  await render(h(React.Fragment, null, toast)); assert.equal(document.activeElement?.id, "origin");
  await tick(1000);
  const root = document.querySelector<HTMLElement>('.feedback-toast')!;
  await act(async () => root.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true })));
  await tick(7000); assert.equal(closed, 0);
  await act(async () => root.dispatchEvent(new window.MouseEvent("mouseout", { bubbles: true })));
  await tick(1000);
  const close = root.querySelector<HTMLButtonElement>('button')!;
  await act(async () => close.focus()); await tick(7000); assert.equal(closed, 0);
  await act(async () => document.getElementById("origin")!.focus());
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await tick(7000); assert.equal(closed, 0); assert.equal(root.hidden, true);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await render(h(React.Fragment, null, toast, h(ModalDialog, { title: "Dialog", description: "Confirm", onRequestClose: () => {}, children: h("button", null, "Cancel") })));
  await tick(7000); assert.equal(closed, 0); assert.equal(document.querySelector<HTMLElement>('.feedback-toast')!.hidden, true);
  await render(h(React.Fragment, null, toast));
  await tick(3999); assert.equal(closed, 0);
  await tick(1); assert.equal(closed, 1);
  await render(h(FeedbackToast, { id: "second", tone: "warning", closeLabel: "Dismiss", onClose: () => closed++, children: "Check result" }));
  await tick(10000); assert.equal(closed, 1);
  await act(async () => document.querySelector<HTMLButtonElement>('.feedback-toast button')!.focus());
  await act(async () => document.querySelector<HTMLButtonElement>('.feedback-toast button')!.click());
  assert.equal(closed, 2); assert.equal(document.activeElement?.id, "origin");
}));
test("T05 provider deduplicates StrictMode effects, displays FIFO and clears on tab change", async () => withFeedbackDom(async (document, render) => {
  let late: ReturnType<typeof useOutreachFeedback> = () => {};
  function Emit() {
    const notify = useOutreachFeedback(); late = notify;
    useEffect(() => { notify({ id: "a", messageKey: "messageUi.saved" }); notify({ id: "b", messageKey: "messageEdit.unlinked" }); }, [notify]);
    return null;
  }
  await render(h(StrictMode, null, h(Emit)));
  assert.equal(document.querySelectorAll('.feedback-toast').length, 1);
  assert.ok(document.querySelector('.feedback-toast')!.textContent!.includes("保存"));
  await act(async () => document.querySelector<HTMLButtonElement>('.feedback-toast button')!.click());
  assert.ok(document.querySelector('.feedback-toast')!.textContent!.includes("解除"));
  const old = late;
  await render(null, "campaigns");
  await act(async () => old({ id: "late", messageKey: "messageUi.saved" }));
  assert.equal(document.querySelector('.feedback-toast'), null);
}));
test("T06 feedback accepts input description and focus refs without nested live regions", async () => withFeedbackDom(async (document, render) => {
  const ref = React.createRef<HTMLDivElement>();
  await render(h("form", null, h("input", { defaultValue: "keep", "aria-describedby": "error" }), h(Feedback, { tone: "error", id: "error", ref, tabIndex: -1, children: "Retry" })));
  ref.current!.focus(); assert.equal(document.activeElement, ref.current);
  assert.equal(document.querySelector<HTMLInputElement>('input')!.value, "keep");
  assert.equal(document.querySelectorAll('[role="alert"]').length, 1);
}));
