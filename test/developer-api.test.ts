import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DeveloperApiSectionTabs, type DeveloperApiSection } from "../app/admin/developer-api/DeveloperApiSectionTabs";
import { AdminSettingsTabs } from "../app/admin/AdminSettingsTabs";

import { dictionaries, locales } from "../app/i18n/dictionaries";
import {
  DEVELOPER_API_ERROR_CODES,
  parseDeveloperApiSecretReveal,
  parseDeveloperApiSettings,
} from "../lib/developer-api-settings";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Developer API tabs select one accessible panel and support keyboard navigation", () => {
  const copy = dictionaries.ja.admin.developerApiManagement;
  let selected: DeveloperApiSection = "server-to-server-oauth";
  let focused = "";
  let prevented = false;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    getElementById: (id: string) => ({ focus: () => { focused = id; } }),
  } });
  try {
    const props = {
      activeSection: selected,
      onSelect: (section: DeveloperApiSection) => { selected = section; },
      label: copy.title, oauthLabel: copy.oauthTitle, webhookLabel: copy.webhookTitle,
    };
    const tabs = AdminSettingsTabs(DeveloperApiSectionTabs(props).props).props.children.props.children;
    tabs[1].props.onClick();
    assert.equal(selected, "webhook-only-app");
    for (const [index, key, expected] of [
      [0, "ArrowRight", "webhook-only-app"],
      [0, "ArrowLeft", "webhook-only-app"],
      [1, "ArrowRight", "server-to-server-oauth"],
      [1, "Home", "server-to-server-oauth"],
      [0, "End", "webhook-only-app"],
    ] as const) {
      prevented = false;
      tabs[index].props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
      assert.equal(selected, expected);
      assert.equal(focused, `${expected}-tab`);
      assert.equal(prevented, true);
    }
    prevented = false;
    tabs[0].props.onKeyDown({ key: "Tab", preventDefault: () => { prevented = true; } });
    assert.equal(prevented, false);
    for (const activeSection of ["server-to-server-oauth", "webhook-only-app"] as const) {
      const html = renderToStaticMarkup(createElement(DeveloperApiSectionTabs, { ...props, activeSection }));
      assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
      assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
      assert.match(html, new RegExp(`id="${activeSection}-tab"[^>]*aria-selected="true"[^>]*aria-controls="${activeSection}-panel"[^>]*tabindex="0"`));
    }
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
  const form = read("../app/admin/developer-api/DeveloperApiSettingsForm.tsx");
  for (const section of ["server-to-server-oauth", "webhook-only-app"]) {
    assert.ok(form.includes(`id="${section}-panel" role="tabpanel" aria-labelledby="${section}-tab" tabIndex={0} hidden={activeSection !== "${section}"}`));
    assert.ok(form.includes(`onSubmit={submit("${section}")}`));
  }
});

test("Developer API navigation and page use the approved route and sections", () => {
  const navigation = read("../app/admin/admin-navigation.ts");
  const page = read("../app/admin/developer-api/page.tsx");
  const form = read("../app/admin/developer-api/DeveloperApiSettingsForm.tsx");
  const route = read("../app/api/[[...route]]/route.ts");
  assert.match(
    navigation,
    /key: "developer-api",\s*href: "\/admin\/developer-api"/u,
  );
  assert.match(page, /requireAdminAccess\(\s*"developer-api",\s*"VIEW"/u);
  assert.match(
    route,
    /app\.put\("\/admin\/developer-api"[\s\S]*?"developer-api",\s*"UPDATE"/u,
  );
  assert.match(
    route,
    /app\.post\("\/admin\/developer-api\/reveal"[\s\S]*?"developer-api",\s*"VIEW"/u,
  );
  assert.match(form, /id="server-to-server-oauth"/u);
  assert.match(form, /id="webhook-only-app"/u);
  assert.ok(form.indexOf('id="account-id"') < form.indexOf('id="client-id"'));
  assert.ok(form.indexOf('id="client-id"') < form.indexOf('id="client-secret"'));
  assert.match(form, /id="oauth-fields" className="max-w-xl space-y-5"/u);
  assert.match(form, /visibilityButtonId="client-secret-visibility"/u);
  assert.match(form, /visibilityButtonId="secret-token-visibility"/u);
  assert.match(form, /id="server-to-server-oauth-form"/u);
  assert.match(form, /id="webhook-only-app-form"/u);
  assert.match(form, /id="save-server-to-server-oauth"/u);
  assert.match(form, /id="save-webhook-only-app"/u);
  assert.match(form, /const SECRET_PLACEHOLDER = "••••••••••••"/u);
  assert.match(form, /fetch\("\/api\/admin\/developer-api\/reveal"/u);
  assert.match(form, /origin: "stored"/u);
  assert.match(form, /current\.origin === "stored"\s*\? MASKED_SECRET/u);
  assert.match(form, /origin: "replacement"/u);
  assert.match(form, /clientSecret\.origin === "replacement"/u);
  assert.match(form, /secretToken\.origin === "replacement"/u);
  assert.match(form, /setClientSecret\(MASKED_SECRET\)/u);
  assert.match(form, /setSecretToken\(MASKED_SECRET\)/u);
  assert.match(form, /data-reveal-state=\{secretRevealState\(/u);
  assert.equal(
    form.match(/readOnly=\{\s*!canEdit \|\| Boolean\(submitting\[/gu)?.length,
    4,
  );
  assert.match(
    form,
    /Boolean\(submitting\["server-to-server-oauth"\]\) \|\|\s*\(!canEdit && !settings\.clientSecretConfigured\)/u,
  );
  assert.match(
    form,
    /Boolean\(submitting\["webhook-only-app"\]\) \|\|\s*\(!canEdit && !settings\.secretTokenConfigured\)/u,
  );
  assert.equal(form.match(/disabled=\{!canEdit \|\| Boolean\(submitting\[/gu)?.length, 2);
  assert.match(form, /id="server-to-server-oauth-feedback"/u);
  assert.match(form, /id="webhook-only-app-feedback"/u);
  assert.doesNotMatch(form, /client-secret-help|secret-token-help/u);
  assert.match(form, /SettingsSaveScope scope="section"/u);
  assert.match(form, /aria-describedby=\{`\$\{id\}-scope`\}/u);
});

test("Developer API reveal parser accepts one supported field only", () => {
  assert.deepEqual(parseDeveloperApiSecretReveal({ field: "clientSecret" }), {
    ok: true,
    value: { field: "clientSecret" },
  });
  assert.deepEqual(parseDeveloperApiSecretReveal({ field: "secretToken" }), {
    ok: true,
    value: { field: "secretToken" },
  });

  for (const input of [
    null,
    {},
    { field: "unknown" },
    { field: "clientSecret", extra: true },
    { field: ["clientSecret"] },
  ]) {
    assert.deepEqual(parseDeveloperApiSecretReveal(input), {
      ok: false,
      code: DEVELOPER_API_ERROR_CODES.invalidRequest,
    });
  }
});

test("Developer API parser trims identifiers but preserves non-empty secrets", () => {
  assert.deepEqual(
    parseDeveloperApiSettings({
      section: "server-to-server-oauth",
      accountId: " account ",
      clientId: " client ",
      clientSecret: " secret with spaces ",
    }),
    {
      ok: true,
      value: {
        section: "server-to-server-oauth",
        accountId: "account",
        clientId: "client",
        clientSecret: " secret with spaces ",
      },
    },
  );
  assert.deepEqual(parseDeveloperApiSettings({ section: "server-to-server-oauth", accountId: "a", clientId: "c" }), {
    ok: true,
    value: { section: "server-to-server-oauth", accountId: "a", clientId: "c" },
  });
  assert.deepEqual(parseDeveloperApiSettings({ section: "webhook-only-app", secretToken: " token " }), {
    ok: true,
    value: { section: "webhook-only-app", secretToken: " token " },
  });
});

test("Developer API parser rejects empty, oversized, null, and unknown values", () => {
  for (const input of [
    { section: "server-to-server-oauth", accountId: "", clientId: "c" },
    { section: "server-to-server-oauth", accountId: "a", clientId: " ", clientSecret: "x" },
    { section: "server-to-server-oauth", accountId: "a", clientId: "c", clientSecret: "" },
    { section: "server-to-server-oauth", accountId: "a", clientId: "c", secretToken: "x" },
    { section: "webhook-only-app", secretToken: null },
    { section: "webhook-only-app", secretToken: "x".repeat(4097) },
    { section: "webhook-only-app", accountId: "a" },
    { section: "unknown" },
  ]) {
    const result = parseDeveloperApiSettings(input);
    assert.equal(result.ok, false);
  }
  assert.deepEqual(parseDeveloperApiSettings({ section: "server-to-server-oauth", accountId: "", clientId: "c" }), {
    ok: false,
    code: DEVELOPER_API_ERROR_CODES.invalidAccountId,
  });
});

test("Developer API copy and permission resource exist in every locale", () => {
  for (const locale of locales) {
    const copy = dictionaries[locale];
    assert.equal(copy.admin.developerApi, "Developer API", locale);
    assert.ok(copy.admin.developerApiManagement.description.length > 0, locale);
    assert.ok(copy.admin.accessControl.resourceTitles["developer-api"].length > 0, locale);
    for (const code of Object.values(DEVELOPER_API_ERROR_CODES)) {
      assert.ok(copy.admin.developerApiManagement.errors[code].length > 0, `${locale}:${code}`);
    }
  }
});
