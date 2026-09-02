import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canAdminAccess,
  evaluateAdminAccess,
  getAllowedAdminPermissionSet,
} from "../lib/admin-access/authorization";
import { getAdminResourceDefinition } from "../lib/admin-access/catalog";
import type {
  AdminAccessActor,
  AdminAccessPermission,
} from "../lib/admin-access/types";

function actor(permissions: AdminAccessPermission[]): AdminAccessActor {
  return {
    id: "zaad-test-actor",
    adminAttribute: "admin",
    banned: false,
    mustChangePassword: false,
    roles: [{
      id: "zaad-test-role",
      name: "ZAAD test role",
      systemKey: null,
      permissions,
    }],
  };
}

const allow = (action: AdminAccessPermission["action"]): AdminAccessPermission => ({
  resourceKey: "zaad",
  action,
  effect: "ALLOW",
});

test("ZAAD catalog exposes VIEW, CREATE, UPDATE, and DELETE", () => {
  assert.deepEqual(getAdminResourceDefinition("zaad"), {
    key: "zaad",
    displayPaths: ["/admin/zaad"],
    supportedActions: ["VIEW", "CREATE", "UPDATE", "DELETE"],
    requiresAdminUser: false,
  });
});

test("ZAAD mutations require VIEW and explicit deny wins", () => {
  assert.equal(
    evaluateAdminAccess(actor([allow("CREATE")]), "zaad", "CREATE").reason,
    "VIEW_REQUIRED",
  );
  assert.equal(
    canAdminAccess(actor([allow("VIEW"), allow("CREATE")]), "zaad", "CREATE"),
    true,
  );
  const denied: AdminAccessActor = {
    ...actor([]),
    roles: [
      {
        id: "zaad-allow-role",
        name: "ZAAD allow role",
        systemKey: null,
        permissions: [allow("VIEW"), allow("UPDATE")],
      },
      {
        id: "zaad-deny-role",
        name: "ZAAD deny role",
        systemKey: null,
        permissions: [{ resourceKey: "zaad", action: "UPDATE", effect: "DENY" }],
      },
    ],
  };
  assert.equal(
    canAdminAccess(denied, "zaad", "UPDATE"),
    false,
  );
});

test("FULL_ACCESS and authority subset calculations include every ZAAD permission", () => {
  const fullAccess: AdminAccessActor = {
    id: "full-access-actor",
    adminAttribute: "admin",
    banned: false,
    mustChangePassword: false,
    roles: [{
      id: "full-access-role",
      name: "Full access",
      systemKey: "FULL_ACCESS",
      permissions: [],
    }],
  };

  const expected = ["zaad:VIEW", "zaad:CREATE", "zaad:UPDATE", "zaad:DELETE"];
  for (const permission of expected) {
    const [, action] = permission.split(":") as ["zaad", AdminAccessPermission["action"]];
    assert.equal(canAdminAccess(fullAccess, "zaad", action), true, permission);
  }
  const allowed = getAllowedAdminPermissionSet(fullAccess);
  for (const permission of expected) assert.equal(allowed.has(permission), true, permission);
});

test("ZAAD page and API routes apply the same resource-specific RBAC actions", () => {
  const page = readFileSync(
    new URL("../app/admin/zaad/page.tsx", import.meta.url),
    "utf8",
  );
  const routes = readFileSync(
    new URL("../lib/server/zaad/api-routes.ts", import.meta.url),
    "utf8",
  );

  assert.match(page, /requireAdminAccess\("zaad", "VIEW", "\/admin\/zaad"\)/u);
  for (const action of ["VIEW", "CREATE", "UPDATE", "DELETE"] as const) {
    assert.match(routes, new RegExp(`withZaadAuth\\(c, "${action}"`, "u"));
  }
  assert.match(
    routes,
    /authorizeAdminApi\(c\.get\("auth"\), prisma, c\.req\.raw\.headers, "zaad", action\)/u,
  );
});
