import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminPageTitleHelp } from "../app/components/admin/AdminPageTitleHelp";
import { dictionaries, locales } from "../app/i18n/dictionaries";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pages = [
  ["PHONE", "phone-settings/PhoneSettingsForm", "max-w-4xl", "t.admin.phoneManagement.description"],
  ["CHAT", "chat-settings/ChatSettingsForm", "max-w-5xl", "t.admin.chatManagement.description"],
  ["LANG", "languages/LanguageSettingsForm", "max-w-3xl", "t.admin.languageManagement.description"],
  ["MAINT", "maintenance-settings/MaintenanceSettingsForm", "max-w-5xl", "copy.description"],
  ["ROLES", "roles/RolesView", null, "copy.listDescription"],
  ["DEV", "developer-api/DeveloperApiSettingsForm", "max-w-5xl", "copy.description"],
  ["USER", "users/new/NewUserForm", "max-w-2xl", null],
] as const;

for (const [id, path, maxWidth, description] of pages) {
  test(`ALIGN-${id}: header and body align with the first tab and retain maximum width`, () => {
    const text = source(`app/admin/${path}.tsx`);
    for (const marker of ["header", "body"]) {
      const classes = text.match(new RegExp(`data-admin-page-${marker}\\s+className="([^"]+)"`))?.[1].split(/\s+/);
      assert.ok(classes, marker);
      assert.ok(classes.includes("ml-1"));
      assert.ok(classes.includes("mr-0"));
      assert.ok(!classes.includes("mx-auto"));
      assert.ok(!classes.includes("w-full"));
      if (maxWidth) assert.ok(classes.includes(maxWidth));
    }
    const navigation = id === "DEV" ? "<DeveloperApiSectionTabs" : ["PHONE", "CHAT"].includes(id) ? "<AdminSettingsTabs" : "<AdminSectionNavigation";
    assert.ok(text.indexOf("data-admin-page-header") < text.indexOf(navigation));
    assert.ok(text.indexOf(navigation) < text.indexOf("data-admin-page-body"));
    if (id === "USER") {
      assert.match(text, /<p[^>]*>\s*\{t.admin.createUserDescription\}\s*<\/p>/);
      assert.doesNotMatch(text, /AdminPageTitleHelp/);
    }
  });
  if (description) test(`HELP-${id}: overview is passed only once to the common title`, () => {
    const text = source(`app/admin/${path}.tsx`);
    const help = text.match(/<AdminPageTitleHelp[\s\S]*?\/>/)?.[0];
    assert.ok(help);
    assert.ok(help.includes(`description={${description}}`));
    assert.equal(text.split(description).length - 1, 1);
    assert.match(help, /label=\{t.admin.pageDescriptionLabel.replace\("\{title\}",/);
    assert.doesNotMatch(text, /<h1/);
  });
}

test("HELP-RES: reservation overview moves to Info while existing controls and scroll remain", () => {
  const text = source("app/admin/reservations/ReservationSystemView.tsx");
  assert.match(text, /<AdminPageTitleHelp\s+title=\{copy.title\}\s+description=\{copy.description\}/);
  assert.equal(text.split("copy.description").length - 1, 1);
  for (const marker of ["reservation-booking-list-link", "api-key-management-link", "overflow-y-auto", "calendar"]) {
    assert.ok(text.includes(marker), marker);
  }
});

test("HELP-CONTENT: field guidance, role count, environment and security controls remain", () => {
  const cases = [
    ["phone-settings/PhoneSettingsForm", "representativeDescription", "aiPhoneDescription"],
    ["chat-settings/ChatSettingsForm", "chat-settings-mode-help", "activeModeDescription"],
    ["languages/LanguageSettingsForm", "enabledCountLabel", "japaneseRequired"],
    ["maintenance-settings/MaintenanceSettingsForm", "environmentBadgeClass(environment)", "propagationNote"],
    ["developer-api/DeveloperApiSettingsForm", "server-to-server-oauth", "webhook-only-app"],
    ["roles/RolesView", "`${total} ${copy.roleCount}`", "roles-read-only-reason", "setIsCreateOpen(true)", "<table"],
    ["users/new/NewUserForm", "issuedPasswordDescription", "assignedRolesHelp"],
  ];
  for (const [path, ...markers] of cases) {
    const text = source(`app/admin/${path}.tsx`);
    for (const marker of markers) assert.ok(text.includes(marker), `${path}: ${marker}`);
  }
});

test("RESPONSIVE: tooltip has bounded absolute layout, semantic colors and an unshrinking 44px trigger", () => {
  const help = source("app/components/admin/AdminPageTitleHelp.tsx");
  for (const cls of ["relative flex w-fit max-w-full", "min-w-0 text-2xl font-bold", "h-11 w-11 shrink-0", "cursor-pointer", "absolute left-0 top-full", "max-w-[calc(100vw-2.5rem)]", "bg-fg", "text-surface", "focus-visible:outline-accent"]) {
    assert.ok(help.includes(cls), cls);
  }
  assert.match(source("app/admin/roles/RolesView.tsx"), /relative max-w-full overflow-x-auto/);
  assert.match(source("app/admin/roles/RolesView.tsx"), /min-w-\[880px\]/);
  assert.match(source("app/admin/AdminSectionNavigation.tsx"), /px-1/);
});

test("I18N-LABEL: every locale substitutes exactly one title and renders its accessible description", () => {
  assert.equal(locales.length, 5);
  for (const locale of locales) {
    const copy = dictionaries[locale].admin;
    assert.equal(copy.pageDescriptionLabel.split("{title}").length - 1, 1, locale);
    const title = copy.phoneManagement.title;
    const label = copy.pageDescriptionLabel.replace("{title}", title);
    assert.ok(label.length > title.length);
    assert.ok(!label.includes("{title}"));
    const html = renderToStaticMarkup(createElement(AdminPageTitleHelp, { title, label, description: copy.phoneManagement.description }));
    assert.ok(html.includes(`aria-label="${label}"`), locale);
    assert.ok(html.includes(copy.phoneManagement.description), locale);
  }
});
