import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, Fragment, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AdminPageTitleHelp,
  helpReducer,
  initialHelpState,
  isHelpOpen,
} from "../app/components/admin/AdminPageTitleHelp";

const source = readFileSync(new URL("../app/components/admin/AdminPageTitleHelp.tsx", import.meta.url), "utf8");

test("HELP-STATE: hover, focus, pin, dismissal and explicit reopening", () => {
  assert.equal(isHelpOpen(initialHelpState), false);
  let state = helpReducer(initialHelpState, "enter");
  assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "leave");
  assert.equal(isHelpOpen(state), false);
  state = helpReducer(state, "focus");
  state = helpReducer(state, "leave");
  assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "dismiss");
  assert.equal(isHelpOpen(state), false);
  state = helpReducer(state, "leave");
  assert.equal(isHelpOpen(state), false);
  state = helpReducer(state, "toggle");
  assert.equal(state.pinned, true);
  state = helpReducer(state, "leave");
  assert.equal(isHelpOpen(state), true);
  state = helpReducer(state, "toggle");
  assert.equal(isHelpOpen(state), false);
  for (const event of ["enter", "focus", "toggle"] as const) {
    const dismissed = helpReducer(state, "dismiss");
    assert.equal(isHelpOpen(helpReducer(dismissed, event)), true, event);
  }
  assert.deepEqual(initialHelpState, { hover: false, focus: false, pinned: false, dismissed: false });
});

test("HELP-STATE: DOM handlers preserve focus, delay hover leave and clean up listeners", () => {
  assert.match(source, /pointerType === "touch"/);
  assert.match(source, /setTimeout\(\(\) => dispatch\("leave"\), 120\)/);
  assert.match(source, /onBlur=\{\(\) => dispatch\("dismiss"\)\}/);
  assert.match(source, /onFocus=\{\(\) => dispatch\("focus"\)\}/);
  assert.match(source, /onClick=\{\(\) => dispatch\("toggle"\)\}/);
  assert.match(source, /event.key === "Escape"/);
  assert.match(source, /group.current\?\.contains\(event.target\)/);
  for (const [event, handler] of [["pointerdown", "outside"], ["focusin", "outside"], ["keydown", "escape"]]) {
    assert.ok(source.includes(`addEventListener("${event}", ${handler})`));
    assert.ok(source.includes(`removeEventListener("${event}", ${handler})`));
  }
  assert.match(source, /useEffect\(\(\) => \(\) => clearTimeout\(closeTimer.current\), \[\]\)/);
  assert.doesNotMatch(source, /\.focus\(|aria-haspopup|\btitle=|@\/app\/admin\/zaad/);
});

test("HELP-SSR: independent IDs, one hidden description per title, button semantics and typed props", () => {
  const props = { title: "電話管理", description: "概要", label: "電話管理について" } satisfies ComponentProps<typeof AdminPageTitleHelp>;
  const html = renderToStaticMarkup(createElement(Fragment, null,
    createElement(AdminPageTitleHelp, props), createElement(AdminPageTitleHelp, props),
  ));
  const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) assert.ok(html.includes(`id="${id}" role="tooltip" class="sr-only">概要</div>`));
  assert.equal((html.match(/type="button"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-label="電話管理について"/g) ?? []).length, 2);
  assert.equal((html.match(/<h1/g) ?? []).length, 2);
  assert.match(html, /aria-hidden="true" focusable="false"/);
});


test("HELP-REVIEW: field help supports an initially open, dismissible state", async () => {
  const { AdminFieldHelp } = await import("../app/components/admin/AdminFieldHelp");
  const html = renderToStaticMarkup(createElement(AdminFieldHelp, {
    id: "tenant-help", label: "業種", description: "対象を選択します。", defaultOpen: true,
  }));
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /対象を選択します。/);
  assert.equal(isHelpOpen(helpReducer({ ...initialHelpState, pinned: true }, "dismiss")), false);
});

test("FIELD-HELP-PORTAL: SSR keeps one accessible description without requiring document", async () => {
  const { AdminFieldHelp } = await import("../app/components/admin/AdminFieldHelp");
  for (const portal of [false, true]) {
    const html = renderToStaticMarkup(createElement(AdminFieldHelp, {
      id: "sync-status-help", label: "同期状態について", description: "同期完了は配信開始を意味しません。", portal, defaultOpen: true,
    }));
    assert.equal((html.match(/id="sync-status-help"/g) ?? []).length, 1);
    assert.match(html, /aria-describedby="sync-status-help"/);
    assert.match(html, /role="tooltip"/);
    assert.match(html, /同期完了は配信開始を意味しません。/);
    assert.ok(html.includes(portal ? 'class="sr-only"' : 'absolute left-0'));
  }
});

test("FIELD-HELP-PORTAL: placement fits at viewport edges and flips above the table header", async () => {
  const { fieldHelpPosition } = await import("../app/components/admin/AdminFieldHelp");
  assert.deepEqual(fieldHelpPosition({ right: 980, top: 300, bottom: 332 }, 320, 64, { width: 1280, height: 720 }), { left: 660, top: 340 });
  assert.deepEqual(fieldHelpPosition({ right: 30, top: 700, bottom: 732 }, 320, 64, { width: 390, height: 844 }), { left: 20, top: 740 });
  assert.deepEqual(fieldHelpPosition({ right: 800, top: 800, bottom: 832 }, 320, 64, { width: 390, height: 844 }), { left: 50, top: 728 });
});
