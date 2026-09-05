import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { TableRowActions, type TableRowAction } from "../app/components/admin/TableRowActions";
import { activateRowAction, captureRowActionFocus, createRowActionSubmissionGuard, handleRowActionMenuKey, menuFocusIndex, placeRowActionMenu, returnsFocusToTrigger, rowActionPresentation } from "../app/components/admin/table-row-actions";

test("ROW-01 0/1/2/3 visible actions, including disabled; hidden filtered by caller", () => {
  for (const count of [0, 1, 2, 3]) for (const disabled of [true, false]) {
    let selected = 0;
    const items: TableRowAction[] = Array.from({ length: count }, (_, i) => ({ id: String(i), label: `Action ${i}`, disabled, onSelect: () => selected++ }));
    const html = renderToStaticMarkup(createElement(TableRowActions, { items, label: "Row actions", open: false, onOpenChange() {} }));
    assert.equal(rowActionPresentation(count), count === 0 ? "empty" : count === 1 ? "direct" : "menu");
    assert.equal(html.includes('aria-haspopup="menu"'), count >= 2);
    assert.equal(html.includes("Action 0"), count === 1);
    assert.equal(selected, 0);
    if (count === 0) assert.equal(html, "<span>—</span>");
    if (count >= 2) assert.match(html, /min-h-10 min-w-10/);
  }
  const items = [{ id: "visible", label: "Edit", href: "/edit", visible: true }, { id: "hidden", label: "Hidden", href: "/secret", visible: false }].filter(item => item.visible);
  const html = renderToStaticMarkup(createElement(TableRowActions, { items, label: "Row", open: false, onOpenChange() {} }));
  assert.match(html, /href="\/edit"/);
  assert.doesNotMatch(html, /secret|Hidden|aria-haspopup/);
});

test("ROW-02 actual keyboard handler moves focus, wraps, exits and never activates disabled", () => {
  let current: HTMLElement | null = null;
  const calls: string[] = [];
  const elements = [0, 1, 2].map(i => ({ focus() { current = elements[i]; calls.push(`focus:${i}`); } }) as HTMLElement);
  const trigger = { focus() { calls.push("trigger"); } } as HTMLButtonElement;
  for (const [key, index] of [["ArrowDown", 0], ["ArrowDown", 1], ["End", 2], ["ArrowDown", 0], ["ArrowUp", 2], ["Home", 0]] as const) {
    let prevented = false;
    handleRowActionMenuKey({ key, preventDefault() { prevented = true; }, stopPropagation() {} }, elements, current, () => assert.fail(), trigger);
    assert.equal(current, elements[index]);
    assert.ok(prevented);
  }
  handleRowActionMenuKey({ key: "Tab", preventDefault() { assert.fail("native Tab must not be trapped"); }, stopPropagation() {} }, elements, current, reason => calls.push(reason), trigger);
  assert.deepEqual(calls.slice(-2), ["tab", "trigger"]);
  handleRowActionMenuKey({ key: "Escape", preventDefault() {}, stopPropagation() { calls.push("stop"); } }, elements, current, reason => calls.push(reason), trigger);
  assert.deepEqual(calls.slice(-2), ["stop", "escape"]);
  assert.equal(menuFocusIndex("x", 0, 3), null);
  assert.equal(menuFocusIndex("Home", 0, 0), null);
  let actions = 0;
  assert.equal(activateRowAction(true, () => actions++), false);
  assert.equal(actions, 0);
  assert.equal(activateRowAction(false, () => actions++), true);
  assert.equal(actions, 1);
});

test("ROW-03 measured placement handles all edges, long translations and short viewports", () => {
  for (const width of [390, 1440]) for (const height of [160, 844]) {
    for (const top of [8, height - 48]) for (const right of [48, width - 8]) {
      for (const size of [{ width: 176, height: 90 }, { width: 560, height: 900 }]) {
        const p = placeRowActionMenu({ top, bottom: top + 40, right }, size, { width, height });
        assert.ok(p.left >= 8);
        assert.ok(p.left + p.width <= width - 8);
        assert.ok(p.top >= 8);
        assert.ok(p.top + Math.min(size.height, p.maxHeight) <= height - 8);
      }
    }
  }
  assert.equal(placeRowActionMenu({ top: 700, bottom: 740, right: 380 }, { width: 176, height: 150 }, { width: 390, height: 844 }).top, 546);
});

test("ROW-04 close reasons and deleted-row/dialog focus restoration", () => {
  for (const reason of ["escape", "select", "tab", "outside", "scroll", "resize"] as const) assert.equal(returnsFocusToTrigger(reason), ["escape", "select"].includes(reason));
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const calls: string[] = [];
  const queue: Array<() => void> = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { requestAnimationFrame: (fn: () => void) => queue.push(fn) } });
  try {
    const next = { isConnected: true, focus() { calls.push("next"); } };
    const heading = { focus() { calls.push("heading"); } };
    const trigger = { isConnected: true, focus() { calls.push("trigger"); }, closest() { return { querySelectorAll() { return [trigger, next]; }, querySelector() { return heading; } }; } };
    const restore = captureRowActionFocus(trigger as unknown as HTMLButtonElement);
    restore(); queue.shift()!();
    assert.deepEqual(calls, ["trigger"]);
    restore(true); queue.shift()!();
    assert.equal(calls.at(-1), "next");
    trigger.isConnected = false; next.isConnected = false;
    restore(); queue.shift()!();
    assert.equal(calls.at(-1), "heading");
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("ROW-05 synchronous guard blocks pending/replayed success and permits failed retry", () => {
  const guard = createRowActionSubmissionGuard();
  assert.equal(guard.begin("a"), true);
  assert.equal(guard.begin("a"), false);
  assert.equal(guard.begin("b"), false);
  guard.end("a", false);
  assert.equal(guard.begin("a"), true);
  guard.end("a", true);
  assert.equal(guard.begin("a"), false);
  assert.equal(guard.begin("b"), true);
  for (const path of ["roles/RolesView", "zaad/ZaadView", "password-reset-requests/PasswordResetRequestsView"]) {
    const source = readFileSync(new URL(`../app/admin/${path}.tsx`, import.meta.url), "utf8");
    assert.match(source, /open=\{openRowId ===/);
    assert.match(source, /onOpenChange=\{\(open\) => setOpenRowId\(open \?/);
  }
});

// Compile-time contract: navigation and callbacks are mutually exclusive.
const valid: TableRowAction = { id: "edit", label: "Edit", href: "/edit" };
// @ts-expect-error An action cannot navigate and mutate simultaneously.
const invalid: TableRowAction = { id: "edit", label: "Edit", href: "/edit", onSelect() {} };
void valid; void invalid;
