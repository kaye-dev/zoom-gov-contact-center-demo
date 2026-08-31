import assert from "node:assert/strict";
import test from "node:test";

import {
  canAdminAccess,
  evaluateAdminAccess,
} from "../lib/admin-access/authorization";
import type {
  AdminAccessActor,
  AdminAccessPermission,
  AdminAccessRoleSource,
} from "../lib/admin-access/types";

function role(
  id: string,
  permissions: AdminAccessPermission[] = [],
  systemKey: AdminAccessRoleSource["systemKey"] = null,
): AdminAccessRoleSource {
  return { id, name: id, systemKey, permissions };
}

function actor(
  roles: AdminAccessRoleSource[],
  overrides: Partial<AdminAccessActor> = {},
): AdminAccessActor {
  return {
    id: "actor",
    adminAttribute: "admin",
    banned: false,
    mustChangePassword: false,
    roles,
    ...overrides,
  };
}

const allowRolesView: AdminAccessPermission = {
  resourceKey: "roles",
  action: "VIEW",
  effect: "ALLOW",
};

test("missing roles and missing permission rows are implicit deny", () => {
  assert.equal(evaluateAdminAccess(actor([]), "roles", "VIEW").reason, "IMPLICIT_DENY");
  assert.equal(evaluateAdminAccess(actor([role("empty")]), "roles", "VIEW").allowed, false);
});

test("allows from multiple roles are combined and sources are stable", () => {
  const decision = evaluateAdminAccess(
    actor([role("z-role", [allowRolesView]), role("a-role", [allowRolesView])]),
    "roles",
    "VIEW",
  );
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.allowSources.map(({ id }) => id), ["a-role", "z-role"]);
});

test("an explicit deny overrides every explicit allow", () => {
  const decision = evaluateAdminAccess(
    actor([
      role("allow", [allowRolesView]),
      role("deny", [{ ...allowRolesView, effect: "DENY" }]),
    ]),
    "roles",
    "VIEW",
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "EXPLICIT_DENY");
  assert.deepEqual(decision.allowSources.map(({ id }) => id), ["allow"]);
  assert.deepEqual(decision.denySources.map(({ id }) => id), ["deny"]);
});

test("mutations require effective view even when another role allows the action", () => {
  const update = { resourceKey: "roles", action: "UPDATE", effect: "ALLOW" } as const;
  const withoutView = evaluateAdminAccess(actor([role("editor", [update])]), "roles", "UPDATE");
  assert.equal(withoutView.allowed, false);
  assert.equal(withoutView.reason, "VIEW_REQUIRED");

  const withView = evaluateAdminAccess(
    actor([role("viewer", [allowRolesView]), role("editor", [update])]),
    "roles",
    "UPDATE",
  );
  assert.equal(withView.allowed, true);
});

test("unsupported actions are always denied", () => {
  const decision = evaluateAdminAccess(
    actor([role("full", [], "FULL_ACCESS")]),
    "phone-settings",
    "DELETE",
  );
  assert.equal(decision.supported, false);
  assert.equal(decision.reason, "UNSUPPORTED");
});

test("admin user gate is independent from access-role allows", () => {
  const nonAdmin = actor([role("full", [], "FULL_ACCESS")], {
    adminAttribute: "user",
  });
  assert.equal(evaluateAdminAccess(nonAdmin, "users", "VIEW").reason, "ADMIN_USER_REQUIRED");
  assert.equal(evaluateAdminAccess(nonAdmin, "roles", "VIEW").allowed, true);
});

test("FULL_ACCESS is dynamic but a custom explicit deny still wins", () => {
  const full = role("full", [], "FULL_ACCESS");
  const deny = role("deny", [{ ...allowRolesView, effect: "DENY" }]);
  const fullDecision = evaluateAdminAccess(actor([full]), "roles", "VIEW");
  assert.equal(fullDecision.allowed, true);
  assert.equal(fullDecision.allowSources[0]?.systemKey, "FULL_ACCESS");
  assert.equal(evaluateAdminAccess(actor([full, deny]), "roles", "VIEW").allowed, false);
});

test("reservation updates require reservation view and FULL_ACCESS includes the new resource", () => {
  const update = {
    resourceKey: "reservations",
    action: "UPDATE",
    effect: "ALLOW",
  } as const;
  assert.equal(
    evaluateAdminAccess(actor([role("editor", [update])]), "reservations", "UPDATE").reason,
    "VIEW_REQUIRED",
  );
  assert.equal(
    canAdminAccess(actor([role("full", [], "FULL_ACCESS")]), "reservations", "UPDATE"),
    true,
  );
});

test("banned and password-change-pending actors are rejected by the request guard", () => {
  const full = role("full", [], "FULL_ACCESS");
  const suspended = evaluateAdminAccess(
    actor([full], { banned: true }),
    "roles",
    "VIEW",
  );
  assert.equal(suspended.allowed, false);
  assert.equal(suspended.reason, "ACCOUNT_SUSPENDED");
  assert.equal(canAdminAccess(actor([full], { banned: true }), "roles", "VIEW"), false);

  const passwordPending = evaluateAdminAccess(
    actor([full], { mustChangePassword: true }),
    "roles",
    "UPDATE",
  );
  assert.equal(passwordPending.allowed, false);
  assert.equal(passwordPending.reason, "PASSWORD_CHANGE_REQUIRED");
  assert.equal(
    canAdminAccess(actor([full], { mustChangePassword: true }), "roles", "VIEW"),
    false,
  );
});
