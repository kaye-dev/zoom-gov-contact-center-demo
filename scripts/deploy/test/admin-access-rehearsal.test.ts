import assert from "node:assert/strict";
import { test } from "node:test";

import { createAdminAccessUserSemanticSnapshot } from "../lib/admin-access-rehearsal";

test("admin access user snapshot is canonical and returns only a count and digest", () => {
  const rows = [
    { id: "private-user-z", role: "user" },
    { id: "private-user-a", role: "admin" },
    { id: "private-user-null", role: null },
  ] as const;

  const snapshot = createAdminAccessUserSemanticSnapshot(rows);
  const reordered = createAdminAccessUserSemanticSnapshot([
    rows[2],
    rows[0],
    rows[1],
  ]);

  assert.deepEqual(reordered, snapshot);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.userCount, 3);
  assert.equal(
    snapshot.userRoleDigest,
    "37a43d41f813e47498116a7085aaf0ccaa6ef6e09d6f7684b2909b6a27b3975d",
  );
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("private-user"), false);
  assert.equal(serialized.includes('"admin"'), false);
  assert.equal(serialized.includes('"user"'), false);
});

test("admin access user snapshot changes when a source id or role changes", () => {
  const original = createAdminAccessUserSemanticSnapshot([
    { id: "source-user", role: "admin" },
  ]);
  const changedRole = createAdminAccessUserSemanticSnapshot([
    { id: "source-user", role: "user" },
  ]);
  const changedId = createAdminAccessUserSemanticSnapshot([
    { id: "different-user", role: "admin" },
  ]);

  assert.notEqual(changedRole.userRoleDigest, original.userRoleDigest);
  assert.notEqual(changedId.userRoleDigest, original.userRoleDigest);
});
