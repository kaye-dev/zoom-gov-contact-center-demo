import assert from "node:assert/strict";
import test from "node:test";

import type { AppSession } from "../lib/server/auth/helpers";
import { getSettingsAuthorizationFailure } from "../lib/server/settings-authorization";
import { SETTINGS_ERROR_CODES } from "../lib/site-settings";

function session(
  role: "user" | "admin",
  mustChangePassword = false,
): NonNullable<AppSession> {
  return {
    user: {
      id: "user-id",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      createdAt: new Date("2026-08-11T00:00:00.000Z"),
      updatedAt: new Date("2026-08-11T00:00:00.000Z"),
      role,
      mustChangePassword,
    },
    session: {
      id: "session-id",
      userId: "user-id",
      token: "session-token",
      expiresAt: new Date("2026-08-12T00:00:00.000Z"),
      createdAt: new Date("2026-08-11T00:00:00.000Z"),
      updatedAt: new Date("2026-08-11T00:00:00.000Z"),
    },
  } as NonNullable<AppSession>;
}

test("settings authorization rejects unauthenticated requests", () => {
  assert.deepEqual(getSettingsAuthorizationFailure(null), {
    status: 401,
    body: { error: SETTINGS_ERROR_CODES.authenticationRequired },
  });
});

test("settings authorization rejects non-administrators", () => {
  assert.deepEqual(getSettingsAuthorizationFailure(session("user")), {
    status: 403,
    body: { error: SETTINGS_ERROR_CODES.administratorRequired },
  });
});

test("settings authorization rejects administrators awaiting a password change", () => {
  assert.deepEqual(
    getSettingsAuthorizationFailure(session("admin", true)),
    {
      status: 403,
      body: { error: SETTINGS_ERROR_CODES.passwordChangeRequired },
    },
  );
});

test("settings authorization accepts password-ready administrators", () => {
  assert.equal(
    getSettingsAuthorizationFailure(session("admin", false)),
    null,
  );
});
