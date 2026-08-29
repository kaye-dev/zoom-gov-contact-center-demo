import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdminRoleNameKey,
  normalizeAdminRoleDescription,
  normalizeAdminRoleName,
} from "../lib/admin-access/normalization";
import {
  ADMIN_ROLE_ERROR_CODES,
  parseAdminRoleMetadata,
} from "../lib/admin-access/validation";

test("role names are trimmed, NFKC normalized, and fully case folded", () => {
  assert.equal(normalizeAdminRoleName("  Ｔｅｓｔ  "), "Test");
  assert.equal(createAdminRoleNameKey("Straße"), "strasse");
  assert.equal(createAdminRoleNameKey(" ＦＵＬＬ　ＡＣＣＥＳＳ "), "full access");
});

test("empty descriptions become null without changing non-empty content", () => {
  assert.equal(normalizeAdminRoleDescription("  \n "), null);
  assert.equal(normalizeAdminRoleDescription("  public users  "), "public users");
});

test("role metadata enforces UTF-16 length limits", () => {
  assert.equal(parseAdminRoleMetadata({ name: "a".repeat(64) }).ok, true);
  assert.deepEqual(parseAdminRoleMetadata({ name: "a".repeat(65) }), {
    ok: false,
    code: ADMIN_ROLE_ERROR_CODES.nameTooLong,
  });
  assert.equal(
    parseAdminRoleMetadata({ name: "role", description: "a".repeat(100) }).ok,
    true,
  );
  assert.deepEqual(
    parseAdminRoleMetadata({ name: "role", description: "a".repeat(101) }),
    { ok: false, code: ADMIN_ROLE_ERROR_CODES.descriptionTooLong },
  );
});

test("role metadata rejects missing and blank names", () => {
  assert.deepEqual(parseAdminRoleMetadata({ description: null }), {
    ok: false,
    code: ADMIN_ROLE_ERROR_CODES.invalidRequest,
  });
  assert.deepEqual(parseAdminRoleMetadata({ name: " \n " }), {
    ok: false,
    code: ADMIN_ROLE_ERROR_CODES.nameRequired,
  });
});
