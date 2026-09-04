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
      { key: "users", href: "/admin/users" },
      { key: "settings", href: "/admin/phone-settings" },
      { key: "reservations", href: "/admin/reservations" },
      { key: "zaad", href: "/admin/zaad" },
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
      { key: "phone-settings", href: "/admin/phone-settings" },
      { key: "chat-settings", href: "/admin/chat-settings" },
      { key: "language-settings", href: "/admin/languages" },
      {
        key: "maintenance-settings",
        href: "/admin/maintenance-settings",
      },
      { key: "roles", href: "/admin/roles" },
      { key: "developer-api", href: "/admin/developer-api" },
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
      { key: "users", href: "/admin/users/new" },
      { key: "settings", href: "/admin/developer-api" },
      { key: "reservations", href: "/admin/reservations" },
    ],
  );
  assert.deepEqual(model.sections.users?.map(({ key }) => key), ["new-user"]);
  assert.deepEqual(model.sections.settings?.map(({ key }) => key), [
    "developer-api",
  ]);

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
    ["/admin/phone-settings", "settings", "settings", "phone-settings"],
    ["/admin/chat-settings", "settings", "settings", "chat-settings"],
    ["/admin/languages", "settings", "settings", "language-settings"],
    [
      "/admin/maintenance-settings",
      "settings",
      "settings",
      "maintenance-settings",
    ],
    ["/admin/roles", "settings", "settings", "roles"],
    ["/admin/roles/role-1", "settings", "settings", "roles"],
    ["/admin/developer-api", "settings", "settings", "developer-api"],
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

test("every users and settings page places section navigation between header and body", () => {
  for (const file of [
    "../app/admin/users/UsersView.tsx",
    "../app/admin/users/new/NewUserForm.tsx",
    "../app/admin/users/[id]/UserDetailsView.tsx",
    "../app/admin/users/[id]/access/UserAccessView.tsx",
    "../app/admin/password-reset-requests/PasswordResetRequestsView.tsx",
    "../app/admin/phone-settings/PhoneSettingsForm.tsx",
    "../app/admin/chat-settings/ChatSettingsForm.tsx",
    "../app/admin/languages/LanguageSettingsForm.tsx",
    "../app/admin/maintenance-settings/MaintenanceSettingsForm.tsx",
    "../app/admin/roles/RolesView.tsx",
    "../app/admin/roles/[id]/RoleDetailsView.tsx",
    "../app/admin/developer-api/DeveloperApiSettingsForm.tsx",
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
