import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AdminSettingsPanel, AdminSettingsTabs, validateSettingsTabs } from "../app/admin/AdminSettingsTabs";
import { PhoneSettingsForm } from "../app/admin/phone-settings/PhoneSettingsForm";
import { ChatSettingsForm } from "../app/admin/chat-settings/ChatSettingsForm";
import { buildAdminNavigation } from "../app/admin/admin-navigation";
import { LanguageProvider } from "../app/i18n/LanguageProvider";
import { dictionaries, locales } from "../app/i18n/dictionaries";

const router = { bfcacheId: "settings-tabs-test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
const renderPage = (children: ReactNode) => {
  const languageProps = { availableLocales: locales, children };
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
    createElement(LanguageProvider, languageProps)));
};

test("phone and chat are independently permission-filtered and translated primary destinations", () => {
  for (const locale of locales) {
    const t = dictionaries[locale];
    for (const [key, label] of [["phone-settings", t.admin.phoneSettings], ["chat-settings", t.admin.chatSettings]] as const) {
      const model = buildAdminNavigation([key], t);
      assert.deepEqual(model.primaryItems.map(({ key }) => key), ["dashboard", key]);
      assert.deepEqual(model.sections, {});
      assert.equal(model.primaryItems[1].label, label);
    }
    assert.ok(t.admin.chatManagement.methodTab);
    assert.ok(t.admin.chatManagement.campaignTab);
  }
  const settings = buildAdminNavigation(["maintenance-settings", "chat-settings"], dictionaries.ja);
  assert.equal(settings.primaryItems.find(({ key }) => key === "settings")?.href, "/admin/maintenance-settings");
  assert.deepEqual(settings.sections.settings?.map(({ key }) => key), ["maintenance-settings"]);
});

test("phone renders the requested two tabs with each existing field in its own mounted panel", () => {
  for (const canEdit of [true, false]) {
    const html = renderPage(createElement(PhoneSettingsForm, {
      canEdit, orderedLocales: [{ locale: "ja", enabled: true }],
      initialSettings: { representativePhone: { display: "03-1234-5678", e164: "+81312345678" }, aiPhoneNumbers: { ja: "+81311111111", en: null, "zh-Hans": null, "zh-Hant": null, ko: null } },
    }));
    assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
    assert.match(html, /id="representative-phone-tab"[^>]*aria-selected="true"[^>]*>代表電話<\/button>/);
    assert.match(html, /id="ai-phone-tab"[^>]*>AI 電話相談<\/button>/);
    const representative = html.split('id="representative-phone-panel"')[1].split('id="ai-phone-panel"')[0];
    assert.match(representative, /id="representative-phone-display"/);
    assert.match(representative, /id="representative-phone-e164"/);
    assert.doesNotMatch(representative, /id="ai-phone-ja"/);
    assert.match(html, /id="ai-phone-panel"[^>]*hidden=""[\s\S]*id="ai-phone-ja"/);
    assert.equal(/readonly=""/i.test(html), !canEdit);
    assert.match(html, /<form noValidate=""/i);
  }
});

test("chat renders three separate mounted panels and defaults to method regardless of configured mode", () => {
  for (const activeMode of ["DISABLED", "CAMPAIGN", "CONTACT_CENTER_ENTRY_ID"] as const) {
    const html = renderPage(createElement(ChatSettingsForm, { canEdit: true, initialSettings: {
      activeMode, campaignWebTag: "campaign-draft", campaignMemo: "campaign memo", contactCenterEntryIdWebTag: "entry-draft", contactCenterEntryIdMemo: "entry memo",
    } }));
    assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
    assert.match(html, /id="chat-method-tab"[^>]*aria-selected="true"[^>]*>利用方式<\/button>/);
    assert.match(html, /id="chat-campaign-tab"[^>]*>キャンペーン<\/button>/);
    assert.match(html, /id="chat-entry-id-tab"[^>]*>Contact Center Entry ID<\/button>/);
    const mode = html.split('id="chat-method-panel"')[1].split('id="chat-campaign-panel"')[0];
    assert.equal((mode.match(/type="radio"/g) ?? []).length, 3);
    assert.doesNotMatch(mode, /<textarea/);
    const campaign = html.split('id="chat-campaign-panel"')[1].split('id="chat-entry-id-panel"')[0];
    assert.match(campaign, /hidden=""/);
    assert.match(campaign, />campaign-draft<\/textarea>/);
    assert.doesNotMatch(campaign, /entry-draft/);
    assert.match(html, /id="chat-entry-id-panel"[^>]*hidden=""[\s\S]*>entry-draft<\/textarea>/);
  }
});

test("shared tabs support click, wrapping arrows, Home/End and retain hidden panel content", () => {
  const items = ["chat-method", "chat-campaign", "chat-entry-id"].map((key) => ({ key, label: key }));
  let selected = items[0].key;
  let focused = "";
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    getElementById: (id: string) => ({ focus: () => { focused = id; } }),
  } });
  try {
    const tabs = AdminSettingsTabs({ activeSection: selected, onSelect: (key) => { selected = key; }, label: "Chat", items }).props.children.props.children;
    for (const [index, key, expected] of [[0, "ArrowLeft", 2], [2, "ArrowRight", 0], [0, "ArrowRight", 1], [1, "Home", 0], [0, "End", 2]] as const) {
      let prevented = false;
      tabs[index].props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
      assert.equal(selected, items[expected].key);
      assert.equal(focused, `${selected}-tab`);
      assert.equal(prevented, true);
    }
    for (const [index, item] of items.entries()) {
      tabs[index].props.onClick();
      assert.equal(selected, item.key);
      const html = renderToStaticMarkup(createElement(AdminSettingsTabs, { activeSection: selected, onSelect() {}, label: "Chat", items }));
      assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
      for (const panel of items) {
        const panelProps = { section: panel.key, activeSection: selected, children: "draft value" };
        const markup = renderToStaticMarkup(createElement(AdminSettingsPanel, panelProps));
        assert.equal(markup.includes('hidden=""'), selected !== panel.key);
        assert.ok(markup.includes("draft value"));
        assert.ok(markup.includes(`aria-labelledby="${panel.key}-tab"`));
      }
    }
    tabs[0].props.onKeyDown({ key: "Tab", preventDefault() { assert.fail("Tab must not be trapped"); } });
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("cross-tab validation reveals only the first invalid panel before focus and native reporting", () => {
  const calls: string[] = [];
  const field = (section: string, valid: boolean, willValidate = true) => ({
    validity: { valid }, willValidate,
    closest: () => ({ dataset: { settingsSection: section } }),
    focus: () => calls.push(`focus:${section}`),
    reportValidity: () => calls.push(`report:${section}`),
  });
  const form = { elements: [field("ignored", false, false), field("chat-method", true), field("chat-campaign", false), field("chat-entry-id", false)] } as unknown as HTMLFormElement;
  assert.equal(validateSettingsTabs(form, (section) => calls.push(`reveal:${section}`)), false);
  assert.deepEqual(calls, ["reveal:chat-campaign", "focus:chat-campaign", "report:chat-campaign"]);
  calls.length = 0;
  assert.equal(validateSettingsTabs({ elements: [field("representative-phone", true), field("ai-phone", true)] } as unknown as HTMLFormElement, () => assert.fail()), true);
  assert.deepEqual(calls, []);
});

test("form saves remain page-scoped and validation happens before network calls", () => {
  for (const [path, initial] of [["phone-settings/PhoneSettingsForm", "representative-phone"], ["chat-settings/ChatSettingsForm", "chat-method"]]) {
    const source = readFileSync(new URL(`../app/admin/${path}.tsx`, import.meta.url), "utf8");
    assert.ok(source.includes(`useState("${initial}")`));
    assert.match(source, /<form noValidate onSubmit=\{submit\}/);
    assert.ok(source.indexOf("validateSettingsTabs(event.currentTarget, setActiveSection)") < source.indexOf("await fetch("));
    assert.match(source, /body: JSON.stringify\(settings\)/);
    assert.match(source, /if \(!canEdit\) return/);
    assert.doesNotMatch(source, /<AdminSectionNavigation/);
  }
});
