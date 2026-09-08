import assert from "node:assert/strict";
import test from "node:test";
import {
  universityScope,
  outreachTenants,
  scopedWhere,
  requireDepartment,
  type Database,
} from "../lib/server/zaad/university/permissions";
import type { AdminAccessActor } from "../lib/admin-access/types";
import { DEPARTMENTS } from "../lib/zaad/university/contracts";
import { OutreachError } from "../lib/zaad/university/contracts";

const actor: AdminAccessActor = {
  id: "actor", adminAttribute: "user", banned: false, mustChangePassword: false,
  roles: [{ id: "limited", name: "全権アクセス", systemKey: null,
    permissions: [{ resourceKey: "zaad", action: "VIEW", effect: "ALLOW" }] }],
};
const full: AdminAccessActor = { ...actor, roles: [{
  id: "full", name: "Renamed system role", systemKey: "FULL_ACCESS", permissions: [],
}] };

function database(
  rows: { siteKey: string; departmentKey: string; liveExecution?: boolean }[],
) {
  const calls: unknown[] = [];
  const db = {
    universityZaadGrant: {
      findMany: async (query: {
        where: { siteKey: string | { in: string[] }; userId: string };
      }) => {
        calls.push(query);
        return rows.filter((row) =>
          typeof query.where.siteKey === "string"
            ? row.siteKey === query.where.siteKey
            : query.where.siteKey.in.includes(row.siteKey),
        );
      },
    },
  } as unknown as Database;
  return { db, calls };
}
test("TENANT-DEPARTMENT-ISOLATION: explicit university grants do not imply municipal access", async () => {
  const { db, calls } = database([
    { siteKey: "univ", departmentKey: "student-affairs" },
  ]);
  assert.deepEqual(await outreachTenants(db, actor), ["univ"]);
  const scope = await universityScope(db, "univ", actor);
  assert.deepEqual(scopedWhere(scope), {
    siteKey: "univ",
    departmentKey: { in: ["student-affairs"] },
  });
  assert.throws(
    () => requireDepartment(scope, "facilities"),
    (error) => error instanceof OutreachError && error.status === 404,
  );
  await assert.rejects(
    universityScope(db, "lg", actor),
    (error) => error instanceof OutreachError && error.status === 404,
  );
  assert.deepEqual(calls[1], { where: { siteKey: "univ", userId: "actor" } });
});
test("LEGACY-ISOLATION: no implicit university grant, ALL stays tenant bound", async () => {
  const legacy = database([]);
  assert.deepEqual(await outreachTenants(legacy.db, actor), ["lg"]);
  await assert.rejects(
    universityScope(legacy.db, "univ", actor),
    (error) => error instanceof OutreachError && error.status === 403,
  );
  const univ = database([{ siteKey: "univ", departmentKey: "ALL" }]);
  assert.deepEqual(await outreachTenants(univ.db, actor), ["univ"]);
  const both = database([
    { siteKey: "univ", departmentKey: "ALL" },
    { siteKey: "lg", departmentKey: "ALL" },
  ]);
  assert.deepEqual(await outreachTenants(both.db, actor), ["lg", "univ"]);
});

test("FULL-ACCESS: system role grants every department without enabling live execution", async () => {
  const { db } = database([]);
  assert.deepEqual(await outreachTenants(db, full), ["lg", "univ"]);
  const scope = await universityScope(db, "univ", full);
  assert.deepEqual(scope.departments, [...DEPARTMENTS]);
  assert.equal(scope.all, true);
  assert.equal(scope.live, false);
  await assert.rejects(universityScope(db, "lg", full), (error) => error instanceof OutreachError && error.status === 404);
  const explicit = database([{ siteKey: "univ", departmentKey: "student-affairs", liveExecution: true }]);
  assert.equal((await universityScope(explicit.db, "univ", full)).live, true);
  const other = database([{ siteKey: "lg", departmentKey: "ALL", liveExecution: true }]);
  assert.equal((await universityScope(other.db, "univ", full)).live, false);
});

test("NO-ACCESS: grants never bypass base permission, suspension, password change or explicit deny", async () => {
  const { db } = database([{ siteKey: "univ", departmentKey: "ALL" }]);
  for (const denied of [
    { ...actor, roles: [] }, { ...full, banned: true }, { ...full, mustChangePassword: true },
    { ...full, roles: [{ ...full.roles[0], permissions: [{ resourceKey: "zaad", action: "VIEW" as const, effect: "DENY" as const }] }] },
  ]) {
    assert.deepEqual(await outreachTenants(db, denied), []);
    await assert.rejects(universityScope(db, "univ", denied), (error) => error instanceof OutreachError && error.status === 403);
  }
});
