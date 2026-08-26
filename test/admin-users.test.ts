import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADMIN_USER_ERROR_CODES,
  getProtectedAdminActionError,
  isActiveAdmin,
  parseAdminUserPasswordReset,
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

test("admin password resets validate mode, length, confirmation, and session policy", () => {
  const validPassword = "ValidPassword#2026";

  assert.deepEqual(
    parseAdminUserPasswordReset({
      mode: "temporary",
      password: validPassword,
      passwordConfirmation: validPassword,
      revokeSessions: true,
    }),
    {
      ok: true,
      value: {
        mode: "temporary",
        password: validPassword,
        passwordConfirmation: validPassword,
        revokeSessions: true,
      },
    },
  );
  assert.equal(
    parseAdminUserPasswordReset({
      mode: "standard",
      password: validPassword,
      passwordConfirmation: validPassword,
      revokeSessions: false,
    }).ok,
    true,
  );

  for (const payload of [
    null,
    {},
    {
      mode: "unknown",
      password: validPassword,
      passwordConfirmation: validPassword,
      revokeSessions: true,
    },
    {
      mode: "temporary",
      password: "too-short",
      passwordConfirmation: "too-short",
      revokeSessions: true,
    },
    {
      mode: "temporary",
      password: "x".repeat(129),
      passwordConfirmation: "x".repeat(129),
      revokeSessions: true,
    },
    {
      mode: "temporary",
      password: validPassword,
      passwordConfirmation: "DifferentPassword#2026",
      revokeSessions: true,
    },
    {
      mode: "temporary",
      password: validPassword,
      passwordConfirmation: validPassword,
      revokeSessions: "yes",
    },
    {
      mode: "temporary",
      password: validPassword,
      passwordConfirmation: validPassword,
      revokeSessions: true,
      extra: true,
    },
  ]) {
    assert.equal(parseAdminUserPasswordReset(payload).ok, false);
  }
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
  assert.match(source, /app\.post\("\/admin\/users\/:id\/reset-password"/);
  assert.match(source, /auth\.api\.setUserPassword/);
  assert.match(source, /auth\.api\.revokeUserSessions/);
  assert.match(source, /status: "PENDING"/);
  assert.match(source, /status: "REJECTED"/);
  assert.match(source, /status: "APPROVED"/);
  assert.match(source, /status: "CONSUMED"/);
  assert.match(source, /export const PATCH = handler/);
  assert.match(source, /export const DELETE = handler/);
  assert.match(source, /NOT: \{ banned: true \}/);
});

test("all locales include complete user-management copy and errors", () => {
  const expectedErrorCodes = Object.values(ADMIN_USER_ERROR_CODES).sort();

  for (const locale of locales) {
    const authCopy = dictionaries[locale].auth;
    const copy = dictionaries[locale].admin.userManagement;
    assert.ok(authCopy.copyTemporaryPassword.length > 0, locale);
    assert.ok(authCopy.temporaryPasswordCopied.length > 0, locale);
    assert.ok(authCopy.temporaryPasswordCopyFailed.length > 0, locale);
    assert.ok(copy.detailsTitle.length > 0, locale);
    assert.ok(copy.edit.length > 0, locale);
    assert.ok(copy.suspend.length > 0, locale);
    assert.ok(copy.reactivate.length > 0, locale);
    assert.ok(copy.delete.length > 0, locale);
    assert.ok(copy.emailDialogDescription.length > 0, locale);
    assert.ok(copy.deleteDialogDescription.length > 0, locale);
    assert.ok(copy.generateTemporaryPassword.length > 0, locale);
    assert.ok(copy.revokeSessionsDescription.length > 0, locale);
    assert.ok(copy.passwordDialogDescription.length > 0, locale);
    assert.ok(copy.passwordsMatch.length > 0, locale);
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
  assert.match(detailsSource, /generateTemporaryPassword\(\)/);
  assert.match(detailsSource, /setPasswordConfirmation\(generated\)/);
  assert.match(detailsSource, /changePasswordMode/);
  assert.match(detailsSource, /setPassword\(""\)/);
  assert.match(detailsSource, /role="switch"/);
  assert.match(detailsSource, /setConfirmingPassword\(true\)/);
  assert.match(detailsSource, /passwordDialogTitle/);
  assert.match(detailsSource, /PasswordInput/);
  assert.match(detailsSource, /admin-new-password-\$\{passwordMode\}/);
  assert.match(detailsSource, /admin-confirm-password-\$\{passwordMode\}/);
  assert.match(detailsSource, /passwordsMatch/);
  assert.match(detailsSource, /role="status"/);
});

test("new-user temporary passwords can be copied with accessible feedback", () => {
  const formSource = readFileSync(
    new URL("../app/admin/users/new/NewUserForm.tsx", import.meta.url),
    "utf8",
  );
  const copyIconSource = readFileSync(
    new URL("../app/components/svg/ContentCopyIcon.tsx", import.meta.url),
    "utf8",
  );

  assert.match(formSource, /navigator\.clipboard\.writeText\(createdUser\.temporaryPassword\)/);
  assert.match(formSource, /setCopyFeedback\(null\)/);
  assert.match(formSource, /type="button"/);
  assert.match(formSource, /aria-label=\{t\.auth\.copyTemporaryPassword\}/);
  assert.match(formSource, /role=\{copyFeedback\.kind === "error" \? "alert" : "status"\}/);
  assert.match(formSource, /min-h-11 min-w-11 shrink-0 cursor-pointer/);
  assert.match(formSource, /text-fg-muted transition-colors hover:text-accent/);
  assert.match(formSource, /focus-visible:outline-none focus-visible:text-accent/);
  assert.doesNotMatch(formSource, /hover:bg-primary-100/);
  assert.doesNotMatch(formSource, /execCommand/);

  assert.match(copyIconSource, /viewBox="0 -960 960 960"/);
  assert.match(copyIconSource, /M360-240q-33 0-56\.5-23\.5T280-320/);
  assert.match(copyIconSource, /height = 24/);
  assert.match(copyIconSource, /width = 24/);
  assert.match(copyIconSource, /fill="currentColor"/);
  assert.match(copyIconSource, /aria-hidden="true"/);
  assert.match(copyIconSource, /focusable="false"/);
});

test("password visibility controls use the requested Material Symbols SVG paths", () => {
  const visibilitySource = readFileSync(
    new URL("../app/components/svg/VisibilityIcon.tsx", import.meta.url),
    "utf8",
  );
  const visibilityOffSource = readFileSync(
    new URL("../app/components/svg/VisibilityOffIcon.tsx", import.meta.url),
    "utf8",
  );

  assert.match(visibilitySource, /viewBox="0 -960 960 960"/);
  assert.match(visibilitySource, /M480-320q75 0 127\.5-52\.5/);
  assert.match(visibilityOffSource, /viewBox="0 -960 960 960"/);
  assert.match(visibilityOffSource, /m644-428-58-58/);
  assert.match(visibilitySource, /aria-hidden="true"/);
  assert.match(visibilityOffSource, /aria-hidden="true"/);
});
