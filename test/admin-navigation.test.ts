import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAdminNavigation,
  resolveAdminNavigationState,
  type AdminNavigationItemKey,
} from "../app/admin/admin-navigation";
import { dictionaries } from "../app/i18n/dictionaries";

const allItems: AdminNavigationItemKey[] = [
  "users",
  "new-user",
  "password-reset-requests",
  "phone-settings",
  "chat-settings",
  "language-settings",
  "maintenance-settings",
  "roles",
  "developer-api",
  "reservations",
  "zaad",
];

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("full-access navigation model exposes flat primary and ordered section links", () => {
  const model = buildAdminNavigation(allItems, dictionaries.ja);

  assert.deepEqual(
    model.primaryItems.map(({ key, href }) => ({ key, href })),
    [
      { key: "dashboard", href: "/admin" },
      { key: "reservations", href: "/admin/reservations" },
      { key: "zaad", href: "/admin/zaad" },
      { key: "users", href: "/admin/users" },
      { key: "roles", href: "/admin/roles" },
      { key: "phone-settings", href: "/admin/phone-settings" },
      { key: "chat-settings", href: "/admin/chat-settings" },
      { key: "developer-api", href: "/admin/developer-api" },
      { key: "settings", href: "/admin/languages" },
    ],
  );
  assert.deepEqual(
    model.sections.users?.map(({ key, href }) => ({ key, href })),
    [
      { key: "users", href: "/admin/users" },
      { key: "new-user", href: "/admin/users/new" },
      {
        key: "password-reset-requests",
        href: "/admin/password-reset-requests",
      },
    ],
  );
  assert.deepEqual(
    model.sections.settings?.map(({ key, href }) => ({ key, href })),
    [
      { key: "language-settings", href: "/admin/languages" },
      {
        key: "maintenance-settings",
        href: "/admin/maintenance-settings",
      },
    ],
  );
});

test("navigation model filters permissions and chooses the first allowed section target", () => {
  const model = buildAdminNavigation(
    ["new-user", "developer-api", "reservations"],
    dictionaries.ja,
  );

  assert.deepEqual(
    model.primaryItems.map(({ key, href }) => ({ key, href })),
    [
      { key: "dashboard", href: "/admin" },
      { key: "reservations", href: "/admin/reservations" },
      { key: "users", href: "/admin/users/new" },
      { key: "developer-api", href: "/admin/developer-api" },
    ],
  );
  assert.deepEqual(model.sections.users?.map(({ key }) => key), ["new-user"]);
  assert.equal(model.sections.settings, undefined);
  const rolesOnly = buildAdminNavigation(["roles"], dictionaries.ja);
  assert.deepEqual(rolesOnly.primaryItems.map(({ key }) => key), ["dashboard", "roles"]);
  assert.deepEqual(rolesOnly.sections, {});

  const standalone = buildAdminNavigation(["zaad"], dictionaries.ja);
  assert.deepEqual(standalone.primaryItems.map(({ key }) => key), [
    "dashboard",
    "zaad",
  ]);
  assert.deepEqual(standalone.sections, {});
});

test("route matcher selects at most one primary and section destination", () => {
  const cases = [
    ["/admin", "dashboard", null, null],
    ["/admin/users", "users", "users", "users"],
    ["/admin/users/new", "users", "users", "new-user"],
    ["/admin/users/user-1", "users", "users", "users"],
    ["/admin/users/user-1/access", "users", "users", "users"],
    [
      "/admin/password-reset-requests",
      "users",
      "users",
      "password-reset-requests",
    ],
    ["/admin/phone-settings", "phone-settings", null, null],
    ["/admin/chat-settings", "chat-settings", null, null],
    ["/admin/languages", "settings", "settings", "language-settings"],
    [
      "/admin/maintenance-settings",
      "settings",
      "settings",
      "maintenance-settings",
    ],
    ["/admin/roles", "roles", null, null],
    ["/admin/roles/role-1", "roles", null, null],
    ["/admin/roles/role-1/members", "roles", null, null],
    ["/admin/developer-api", "developer-api", null, null],
    ["/admin/reservations/bookings", "reservations", null, null],
    ["/admin/zaad", "zaad", null, null],
  ] as const;

  for (const [pathname, primaryKey, sectionKey, sectionItemKey] of cases) {
    assert.deepEqual(resolveAdminNavigationState(pathname), {
      primaryKey,
      sectionKey,
      sectionItemKey,
    });
  }
  assert.deepEqual(resolveAdminNavigationState("/admin/unknown"), {
    primaryKey: null,
    sectionKey: null,
    sectionItemKey: null,
  });
});

test("the admin root renders the dashboard instead of redirecting away", () => {
  const page = source("../app/admin/page.tsx");

  assert.match(page, /return <AdminHome \/>/u);
  assert.doesNotMatch(page, /redirect\(/u);
});

test("PHONE-ALIGN-11: phone header and form align to first tab text without changing full-width navigation", () => {
  const phone = source("../app/admin/phone-settings/PhoneSettingsForm.tsx");
  const tabs = source("../app/admin/AdminSectionNavigation.tsx");
  assert.match(phone, /data-admin-page-header\s+className="ml-1 mr-0 max-w-4xl/);
  assert.match(phone, /data-admin-page-body className="ml-1 mr-0 mt-6 max-w-4xl/);
  assert.doesNotMatch(phone, /mx-auto/);
  assert.match(tabs, /px-1/);
});

test("every users and settings page places section navigation between header and body", () => {
  for (const file of [
    "../app/admin/users/UsersView.tsx",
    "../app/admin/users/new/NewUserForm.tsx",
    "../app/admin/users/[id]/UserDetailsView.tsx",
    "../app/admin/users/[id]/access/UserAccessView.tsx",
    "../app/admin/password-reset-requests/PasswordResetRequestsView.tsx",
    "../app/admin/languages/LanguageSettingsForm.tsx",
    "../app/admin/maintenance-settings/MaintenanceSettingsForm.tsx",
    "../app/admin/roles/RolesView.tsx",
    "../app/admin/roles/[id]/RoleDetailsView.tsx",
  ]) {
    const view = source(file);
    const header = view.indexOf("data-admin-page-header");
    const section = view.indexOf("<AdminSectionNavigation />", header);
    const body = view.indexOf("data-admin-page-body", section);

    assert.ok(header >= 0, `${file}: header`);
    assert.ok(section > header, `${file}: section navigation`);
    assert.ok(body > section, `${file}: body`);
    assert.match(
      view,
      /data-admin-page-chrome[^>]*className="space-y-4"/u,
      file,
    );
    assert.match(view, /data-admin-page-body/u, file);
    assert.match(view, /mt-6/u, file);
  }
});
