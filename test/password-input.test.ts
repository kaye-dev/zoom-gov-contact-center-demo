import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dictionaries, locales } from "../app/i18n/dictionaries";

const passwordInputSource = readFileSync(
  new URL("../app/components/PasswordInput.tsx", import.meta.url),
  "utf8",
);

test("shared password input owns accessible visibility controls", () => {
  assert.match(passwordInputSource, /^"use client";/);
  assert.match(passwordInputSource, /useId\(\)/);
  assert.match(passwordInputSource, /useState\(false\)/);
  assert.match(passwordInputSource, /type=\{isVisible \? "text" : "password"\}/);
  assert.match(passwordInputSource, /VisibilityIcon height=\{14\} width=\{14\}/);
  assert.match(passwordInputSource, /VisibilityOffIcon height=\{14\} width=\{14\}/);
  assert.match(passwordInputSource, /hover:text-accent/);
  assert.match(passwordInputSource, /aria-label=\{/);
  assert.match(passwordInputSource, /aria-pressed=\{isVisible\}/);
  assert.match(passwordInputSource, /aria-controls=\{inputId\}/);
  assert.match(passwordInputSource, /visibilityButtonId\?: string/);
  assert.match(passwordInputSource, /visible\?: boolean/);
  assert.match(passwordInputSource, /onVisibleChange\?: \(visible: boolean\) => void/);
  assert.match(passwordInputSource, /visibilityBusy\?: boolean/);
  assert.match(passwordInputSource, /const isVisible = visible \?\? internalVisible/);
  assert.match(passwordInputSource, /onVisibleChange\?\.\(nextVisible\)/);
  assert.match(passwordInputSource, /id=\{visibilityButtonId\}/);
  assert.match(passwordInputSource, /aria-busy=\{visibilityBusy \|\| undefined\}/);
  assert.match(passwordInputSource, /disabled=\{disabled \|\| visibilityBusy\}/);
});

test("every password entry field uses the shared component", () => {
  const formSources = [
    ["../app/login/LoginForm.tsx", 1],
    ["../app/change-password/ChangePasswordForm.tsx", 2],
    ["../app/admin/users/[id]/UserDetailsView.tsx", 2],
  ] as const;

  for (const [path, expectedCount] of formSources) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.equal(source.match(/<PasswordInput\b/g)?.length, expectedCount, path);
    assert.doesNotMatch(source, /type="password"/);
    assert.doesNotMatch(source, /\? "text" : "password"/);
  }
});

test("shared password visibility labels exist in every locale", () => {
  for (const locale of locales) {
    const copy = dictionaries[locale];
    assert.ok(copy.auth.showPassword.length > 0, locale);
    assert.ok(copy.auth.hidePassword.length > 0, locale);
    assert.equal("showPassword" in copy.admin.userManagement, false, locale);
    assert.equal("hidePassword" in copy.admin.userManagement, false, locale);
  }
});
