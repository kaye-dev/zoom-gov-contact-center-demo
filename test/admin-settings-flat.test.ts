import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderAdmin } from "./admin-ui-render";
import { PhoneSettingsForm } from "../app/admin/phone-settings/PhoneSettingsForm";
import { ChatSettingsForm } from "../app/admin/chat-settings/ChatSettingsForm";
import { DeveloperApiSettingsForm } from "../app/admin/developer-api/DeveloperApiSettingsForm";
import { LanguageSettingsForm } from "../app/admin/languages/LanguageSettingsForm";
import { MaintenanceSettingsForm } from "../app/admin/maintenance-settings/MaintenanceSettingsForm";
import { NewUserForm } from "../app/admin/users/new/NewUserForm";
import { dictionaries, locales } from "../app/i18n/dictionaries";
import { settingsSectionClassName, settingsInputFocusClassName } from "../app/components/admin/settings-form-styles";

function flatGroups(html: string, count: number, visibleLegend = false) {
  const groups = [...html.matchAll(/<fieldset\b[^>]*class="([^"]*)"[^>]*>/g)];
  assert.equal(groups.length, count);
  for (const [, cls] of groups) {
    assert.ok(cls.includes(settingsSectionClassName));
    assert.doesNotMatch(cls, /shadow|bg-surface|rounded/);
  }
  assert.equal((html.match(new RegExp(`<legend class="${visibleLegend ? "mb-4 text-lg font-bold" : "sr-only"}">`, "g")) ?? []).length, count);
}
for (const canEdit of [true, false]) {
  test(`FLAT-01/02 A11Y-01 SAVE-01 phone editable=${canEdit}`, () => {
    const html = renderAdmin(createElement(PhoneSettingsForm, { canEdit,
      orderedLocales: [{ locale: "ja", enabled: true }, { locale: "en", enabled: false }],
      initialSettings: { representativePhone: { display: "03-1234-5678", e164: "+81312345678" }, aiPhoneNumbers: { ja: null, en: null, "zh-Hans": null, "zh-Hant": null, ko: null } },
    }));
    flatGroups(html, 2);
    assert.equal((html.match(/<input/g) ?? []).length, 4);
    assert.match(html, /max-w-4xl/);
    assert.match(html, /md:grid-cols-2/);
    assert.match(html, /border-b border-line-subtle py-4 md:grid-cols-\[12rem_minmax\(0,1fr\)\]/);
    assert.match(html, /aria-describedby="representative-phone-e164-help"/);
    assert.match(html, /aria-describedby="phone-save-scope"/);
    assert.ok(html.includes(dictionaries.ja.admin.settings.pageSaveScope));
    assert.equal(/readOnly=""/i.test(html), !canEdit);
  });
  test(`FLAT-03/04 A11Y-01 SAVE-01 chat editable=${canEdit}`, () => {
    const html = renderAdmin(createElement(ChatSettingsForm, { canEdit, initialSettings: {
      activeMode: "CAMPAIGN", campaignWebTag: "draft", campaignMemo: "memo", contactCenterEntryIdWebTag: "entry", contactCenterEntryIdMemo: null,
    } }));
    flatGroups(html, 3);
    assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
    assert.equal((html.match(/<textarea/g) ?? []).length, 4);
    assert.match(html, /border-accent bg-surface-selected/);
    assert.match(html, /aria-describedby="chat-save-scope"/);
    assert.match(html, /id="chat-campaign-panel"[^>]*hidden=""/);
    assert.match(html, /maxLength="4096"/i);
    assert.match(html, /max-w-5xl/);
  });
  test(`FLAT-05 SAVE-02 API editable=${canEdit}`, () => {
    const html = renderAdmin(createElement(DeveloperApiSettingsForm, { canEdit, initialSettings: {
      accountId: "id", clientId: "client", clientSecretConfigured: true, secretTokenConfigured: true,
    } }));
    flatGroups(html, 2);
    assert.equal((html.match(/type="password"/g) ?? []).length, 2);
    assert.match(html, /id="oauth-fields" class="max-w-xl/);
    assert.match(html, /id="secret-token-field" class="max-w-xl/);
    for (const id of ["server-to-server-oauth", "webhook-only-app"]) {
      assert.ok(html.includes(`aria-describedby="save-${id}-scope"`));
      assert.ok(html.includes(`id="${id}-form"`));
    }
    assert.match(html, /data-reveal-state="masked"/);
    assert.equal((html.match(/value=""/g) ?? []).length, 2);
  });
  test(`FLAT-06 languages editable=${canEdit}`, () => {
    const html = renderAdmin(createElement(LanguageSettingsForm, { canEdit, initialSettings: { locales: locales.map(locale => ({ locale, enabled: true })) } }), "/admin/languages");
    assert.match(html, /<form[^>]*class="min-w-0 space-y-5 border-0 p-0"/);
    assert.equal((html.match(/border-b border-line-subtle py-4 sm:flex-row/g) ?? []).length, 5);
    assert.match(html, /5 \/ 5/);
    assert.ok(html.includes(dictionaries.ja.admin.languageManagement.japaneseRequired));
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 5);
    assert.match(html, /max-w-3xl/);
  });
  test(`FLAT-07 maintenance editable=${canEdit}`, () => {
    const html = renderAdmin(createElement(MaintenanceSettingsForm, {
      environment: "development", allowUpdate: canEdit, initialConfig: { version: 1, mode: "ENABLED", scheduledStartAt: null, scheduledEndAt: null, updatedAt: "2026-09-01T00:00:00Z" }, initialEffective: { active: true, reason: "ENABLED", retryAfter: null }, initialRevision: 1,
    }), "/admin/maintenance-settings");
    flatGroups(html, 2, true);
    assert.match(html, /border-b border-line-subtle pb-4/);
    assert.match(html, /<aside class="[^"]*border-amber/);
    assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
    assert.match(html, /<fieldset disabled="" aria-describedby="maintenance-schedule-description/);
  });
  test(`FLAT-08 user assignable=${canEdit}`, () => {
    const html = renderAdmin(createElement(NewUserForm, { canAssignRoles: canEdit, availableRoles: [{ id: "none", name: "none", description: null, systemKey: "NO_ACCESS" }] }), "/admin/users/new");
    assert.match(html, /<form[^>]*class="min-w-0 space-y-6"/);
    assert.ok(html.includes(dictionaries.ja.admin.createUserDescription));
    assert.equal(html.includes('name="accessRoleId"'), canEdit);
    assert.match(html, /name="email" type="email"|type="email"[^>]*name="email"/);
    assert.match(html, /max-w-2xl/);
  });
}
test("FOCUS-01 single text boundary and forced-colors fallback, I18N-01 all dictionaries", () => {
  assert.match(settingsInputFocusClassName, /focus:border-accent focus:ring-0/);
  assert.match(settingsInputFocusClassName, /forced-colors:focus:-outline-offset-2/);
  for (const locale of locales) {
    assert.ok(dictionaries[locale].admin.settings.pageSaveScope);
    assert.ok(dictionaries[locale].admin.settings.sectionSaveScope);
  }
  for (const p of ["phone-settings/PhoneSettingsForm", "chat-settings/ChatSettingsForm", "developer-api/DeveloperApiSettingsForm", "maintenance-settings/MaintenanceSettingsForm", "users/new/NewUserForm"]) {
    const source = readFileSync(new URL(`../app/admin/${p}.tsx`, import.meta.url), "utf8");
    assert.match(source, /settingsInputFocusClassName/);
    assert.doesNotMatch(source, /focus:ring-2 focus:ring-accent\/30/);
  }
});
