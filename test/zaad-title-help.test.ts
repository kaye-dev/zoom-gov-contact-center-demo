import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { helpReducer, initialHelpState, isHelpOpen } from "../app/admin/zaad/ZaadTitleHelp";

test("HELP-02: hover/focus, pinned activation, Escape/blur/outside dismissal and explicit reopening", () => {
  assert.equal(isHelpOpen(initialHelpState), false);
  let state = helpReducer(initialHelpState, "enter"); assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "focus"); state = helpReducer(state, "leave"); assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "dismiss"); assert.equal(isHelpOpen(state), false);
  state = helpReducer(state, "leave"); assert.equal(isHelpOpen(state), false);
  state = helpReducer(state, "toggle"); assert.equal(state.pinned, true); assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "leave"); assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "toggle"); assert.equal(isHelpOpen(state), false);
  state = helpReducer(state, "enter"); assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "dismiss"); state = helpReducer(state, "focus"); assert.equal(isHelpOpen(state), true);
});

test("HELP-02: local tooltip preserves focus, delays hover close, and binds one accessible description", () => {
  const source = readFileSync(new URL("../app/admin/zaad/ZaadTitleHelp.tsx", import.meta.url), "utf8");
  assert.match(source, /aria-describedby=\{id\}/);
  assert.match(source, /id=\{id\}\s+role="tooltip"/);
  assert.match(source, /event.key === "Escape"/);
  assert.match(source, /setTimeout\(\(\) => dispatch\("leave"\), 120\)/);
  assert.match(source, /onBlur=\{\(\) => dispatch\("dismiss"\)\}/);
  assert.match(source, /addEventListener\("pointerdown", outside\)/);
  assert.match(source, /addEventListener\("focusin", outside\)/);
  assert.match(source, /max-w-\[calc\(100vw-2rem\)\]/);
  assert.doesNotMatch(source, /\.focus\(|\btitle=|aria-haspopup/);
});

test("HELP-03: Material Symbols info is a decorative, local currentColor SVG in a 44px button", () => {
  const icon = readFileSync(new URL("../app/components/svg/InfoIcon.tsx", import.meta.url), "utf8");
  const help = readFileSync(new URL("../app/admin/zaad/ZaadTitleHelp.tsx", import.meta.url), "utf8");
  assert.match(icon, /viewBox="0 -960 960 960"/); assert.match(icon, /fill="currentColor"/);
  assert.match(icon, /aria-hidden="true" focusable="false"/);
  assert.match(help, /h-11 w-11/); assert.match(help, /<InfoIcon className="h-6 w-6"/);
});
