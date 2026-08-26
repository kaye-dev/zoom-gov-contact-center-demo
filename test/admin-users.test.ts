import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADMIN_USER_ERROR_CODES,
  getProtectedAdminActionError,
  isActiveAdmin,
  parseAdminUserUpdate,
} from "../lib/admin-users";
import { dictionaries, locales } from "../app/i18n/dictionaries";

test("admin user updates accept exactly one supported normalized field", () => {
  assert.deepEqual(parseAdminUserUpdate({ field: "name", value: "  City Admin  " }), {
    ok: true,
    value: { field: "name", value: "City Admin" },
  });
  assert.deepEqual(
    parseAdminUserUpdate({ field: "email", value: "  Admin@Example.COM  " }),
    {
      ok: true,
      value: { field: "email", value: "admin@example.com" },
    },
  );
  assert.deepEqual(parseAdminUserUpdate({ field: "role", value: "admin" }), {
    ok: true,
    value: { field: "role", value: "admin" },
  });

  for (const payload of [
    null,
    {},
    { field: "name", value: "", extra: true },
    { field: "unknown", value: "value" },
    { field: "role", value: "owner" },
    { field: "email", value: "not-an-email" },
  ]) {
    assert.equal(parseAdminUserUpdate(payload).ok, false);
  }
});

test("self and the last active administrator are protected", () => {
  const activeAdmin = { id: "admin-1", role: "admin", banned: false };

  assert.equal(
    getProtectedAdminActionError({
      actorUserId: "admin-1",
      target: activeAdmin,
      activeAdminCount: 2,
    }),
    ADMIN_USER_ERROR_CODES.selfProtected,
  );
  assert.equal(
    getProtectedAdminActionError({
      actorUserId: "admin-2",
      target: activeAdmin,
      activeAdminCount: 1,
    }),
    ADMIN_USER_ERROR_CODES.lastActiveAdmin,
  );
  assert.equal(
    getProtectedAdminActionError({
      actorUserId: "admin-2",
      target: activeAdmin,
      activeAdminCount: 2,
    }),
    null,
  );
  assert.equal(
    getProtectedAdminActionError({
      actorUserId: "admin-2",
      target: { ...activeAdmin, banned: true },
      activeAdminCount: 1,
    }),
    null,
  );
  assert.equal(isActiveAdmin({ role: "admin", banned: null }), true);
  assert.equal(isActiveAdmin({ role: "admin", banned: true }), false);
});

test("admin user routes use Better Auth lifecycle operations", () => {
  const source = readFileSync(
    new URL("../app/api/[[...route]]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /app\.patch\("\/admin\/users\/:id"/);
  assert.match(source, /auth\.api\.adminUpdateUser/);
  assert.match(source, /auth\.api\.setRole/);
  assert.match(source, /auth\.api\.banUser/);
  assert.match(source, /auth\.api\.unbanUser/);
  assert.match(source, /auth\.api\.removeUser/);
  assert.match(source, /export const PATCH = handler/);
  assert.match(source, /export const DELETE = handler/);
  assert.match(source, /NOT: \{ banned: true \}/);
});

test("all locales include complete user-management copy and errors", () => {
  const expectedErrorCodes = Object.values(ADMIN_USER_ERROR_CODES).sort();

  for (const locale of locales) {
    const copy = dictionaries[locale].admin.userManagement;
    assert.ok(copy.detailsTitle.length > 0, locale);
    assert.ok(copy.edit.length > 0, locale);
    assert.ok(copy.suspend.length > 0, locale);
    assert.ok(copy.reactivate.length > 0, locale);
    assert.ok(copy.delete.length > 0, locale);
    assert.ok(copy.emailDialogDescription.length > 0, locale);
    assert.ok(copy.deleteDialogDescription.length > 0, locale);
    assert.deepEqual(Object.keys(copy.errors).sort(), expectedErrorCodes, locale);
    for (const message of Object.values(copy.errors)) {
      assert.ok(message.length > 0, locale);
    }
  }
});

test("user management UI keeps editing and destructive actions behind explicit controls", () => {
  const listSource = readFileSync(
    new URL("../app/admin/users/UsersView.tsx", import.meta.url),
    "utf8",
  );
  const detailsSource = readFileSync(
    new URL(
      "../app/admin/users/[id]/UserDetailsView.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(listSource, /MoreHorizIcon/);
  assert.match(listSource, /pendingAction && confirmation/);
  assert.match(listSource, /user\.banned === true \? "reactivate" : "suspend"/);
  assert.match(detailsSource, /editingField === field/);
  assert.match(detailsSource, /setConfirmingEmail\(true\)/);
  assert.match(detailsSource, /emailDialogTitle/);
});
