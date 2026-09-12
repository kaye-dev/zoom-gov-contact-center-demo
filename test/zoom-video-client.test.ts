import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { startZoomVideo } from "../lib/zoom-video-client";

test("custom video button loads once, uses the selected entry and releases on end or init failure", async () => {
  const dom = new JSDOM("<body></body>", { url: "http://univ.localhost:3000" });
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  const entries: string[] = [];
  const handlers = new Map<string, () => void>();
  let starts = 0, ended = 0, rejectInit = false;
  class Client {
    async init({ entryId }: { entryId: string }) { if (rejectInit) throw new Error("OFFLINE"); entries.push(entryId); }
    startVideo() { starts++; }
    on(event: string, callback: () => void) { handlers.set(event, callback); }
  }
  const config = { scriptSrc: "https://us01ccistatic.zoom.us/us01cci/web-sdk/video-client.js", entryId: "admissions", apiKey: "public-key", environment: "us01" };
  try {
    const first = startZoomVideo(config, () => ended++, "admissions");
    assert.equal(window.universityConsultation?.category, "admissions");
    const script = document.querySelector("script")!;
    assert.ok(script);
    assert.equal(script.type, "module");
    assert.equal(script.hasAttribute("data-apikey"), false);
    assert.equal(script.hasAttribute("data-entry-id"), false);
    window.VideoClient = Client;
    script.dispatchEvent(new dom.window.Event("load"));
    await first;
    await assert.rejects(startZoomVideo(config, () => {}, "admissions"), /ALREADY_ACTIVE/);
    assert.equal(starts, 1);
    handlers.get("video-click-end")!();
    handlers.get("video-end")!();
    assert.equal(ended, 1);
    assert.equal(window.universityConsultation, undefined);
    await startZoomVideo({ ...config, entryId: "careers" }, () => {}, "careers");
    assert.deepEqual(window.universityConsultation, { category: "careers" });
    assert.deepEqual(entries, ["admissions", "careers"]);
    assert.equal(document.querySelectorAll("script").length, 1);
    handlers.get("video-end")!();
    rejectInit = true;
    await assert.rejects(startZoomVideo(config, () => {}, "admissions"), /OFFLINE/);
    rejectInit = false;
    await startZoomVideo(config, () => {}, "admissions");
    handlers.get("video-end")!();
  } finally {
    dom.window.close();
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
