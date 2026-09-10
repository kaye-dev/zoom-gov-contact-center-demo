import assert from "node:assert/strict";
import test from "node:test";
import type { MouseEvent } from "react";
import { JSDOM } from "jsdom";
import { handleOutreachRowClick } from "../app/admin/zaad/outreach-row-navigation";

test("ROW-01: cells navigate once while embedded actions, portals, selection and modifiers remain independent", () => {
  const dom = new JSDOM('<table><tbody><tr><td id="cell">Name</td><td><button id="name">Name</button><button id="id">Update ID</button><input type="checkbox" id="check"><a id="link" href="#">Link</a></td></tr></tbody></table><button id="portal">Portal action</button>');
  const previousElement = Object.getOwnPropertyDescriptor(globalThis, "Element"), previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "Element", { configurable: true, value: dom.window.Element });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  try {
    let calls = 0;
    const document = dom.window.document, row = document.querySelector("tr")!;
    const event = { target: document.querySelector("#cell"), currentTarget: row, button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    const run = (changes: object = {}, disabled = false) => handleOutreachRowClick({ ...event, ...changes } as unknown as MouseEvent<HTMLTableRowElement>, () => calls++, disabled);
    run(); assert.equal(calls, 1);
    for (const id of ["name", "id", "check", "link", "portal"]) run({ target: document.getElementById(id) });
    run({}, true); run({ defaultPrevented: true }); run({ button: 1 });
    for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) run({ [modifier]: true });
    const range = document.createRange(); range.selectNodeContents(document.querySelector("#cell")!);
    dom.window.getSelection()!.addRange(range); run();
    assert.equal(calls, 1);
  } finally {
    if (previousElement) Object.defineProperty(globalThis, "Element", previousElement); else Reflect.deleteProperty(globalThis, "Element");
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    dom.window.close();
  }
});
