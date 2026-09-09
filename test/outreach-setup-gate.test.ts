import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OutreachSetupGate } from "../app/admin/zaad/OutreachView";
import { outreachCommonDictionaries } from "../app/i18n/outreach-common";

test("unconfigured outreach renders the required central CTA and help", () => {
  const html = renderToStaticMarkup(React.createElement(OutreachSetupGate, {
    copy: outreachCommonDictionaries.ja,
    canConfigure: true,
    href: "/admin/developer-api?tenant=univ&returnTo=%2Fadmin%2Fzaad%3Ftenant%3Duniv",
  }));
  assert.match(html, />Zoom API 設定<\/a>/);
  assert.match(html, /オートリーチを利用するには、Zoom API 設定が必要です。/);
  assert.match(html, /items-center justify-center/);
  assert.match(html, /returnTo=%2Fadmin%2Fzaad%3Ftenant%3Duniv/);
  assert.doesNotMatch(html, /role="tab|<table|確認用プロトタイプ|Zoom API 未設定/);
});
test("without settings permission the CTA has no navigation or enabled control", () => {
  const html = renderToStaticMarkup(React.createElement(OutreachSetupGate, {
    copy: outreachCommonDictionaries.ja,
    canConfigure: false,
    href: "/admin/developer-api?tenant=univ",
  }));
  assert.match(html, /role="link" aria-disabled="true" tabindex="-1"/);
  assert.match(html, /設定権限を持つ管理者に依頼してください。/);
  assert.doesNotMatch(html, /href=|<button/);
});
test("all supported locales supply the setup and return copy", () => {
  assert.equal(Object.keys(outreachCommonDictionaries).length, 5);
  for (const copy of Object.values(outreachCommonDictionaries)) {
    for (const key of ["setupLabel", "setupHelp", "setupPermission", "returnToOutreach"] as const)
      assert.ok(copy[key].trim().length > 0, key);
    const html = renderToStaticMarkup(React.createElement(OutreachSetupGate, { copy, canConfigure: false, href: "/admin/developer-api" }));
    assert.ok(html.includes(copy.setupLabel));
  }
});
