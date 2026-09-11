import assert from "node:assert/strict";
import test from "node:test";
import {
  universityScope,
  outreachTenants,
  scopedWhere,
  type Database,
} from "../lib/server/zaad/university/permissions";
import type { AdminAccessActor } from "../lib/admin-access/types";
import { OutreachError } from "../lib/zaad/university/contracts";
import { resolveOutreachScope } from "../lib/server/zaad/outreach-scope";

const actor: AdminAccessActor = {
  id: "actor", adminAttribute: "user", banned: false, mustChangePassword: false,
  roles: [{ id: "limited", name: "全権アクセス", systemKey: null,
    permissions: [{ resourceKey: "zaad", action: "VIEW", effect: "ALLOW" }] }],
};
const full: AdminAccessActor = { ...actor, roles: [{
  id: "full", name: "Renamed system role", systemKey: "FULL_ACCESS", permissions: [],
}] };

function database(rows: {siteKey:string;accessEnabled:boolean;liveExecution?:boolean;serviceFullAccess?:boolean}[]) {
  const calls: unknown[]=[];
  const db={outreachTenantGrant:{
    findMany:async (query:{where:{siteKey:{in:string[]};userId:string}})=>{calls.push(query);return rows.filter(row=>query.where.siteKey.in.includes(row.siteKey));},
    findUnique:async (query:{where:{siteKey_userId:{siteKey:string;userId:string}}})=>{calls.push(query);return rows.find(row=>row.siteKey===query.where.siteKey_userId.siteKey)??null;},
  }} as unknown as Database;
  return {db,calls};
}
test("TENANT-ISOLATION: explicit university grants do not imply municipal access", async () => {
  const { db, calls } = database([
    { siteKey: "univ", accessEnabled: true },
  ]);
  assert.deepEqual(await outreachTenants(db, actor), ["univ"]);
  const scope = await universityScope(db, "univ", actor);
  assert.deepEqual(scopedWhere(scope), {
    siteKey: "univ",
  });
  await assert.rejects(
    universityScope(db, "lg", actor),
    (error) => error instanceof OutreachError && error.status === 404,
  );
  assert.deepEqual(calls[1], { where: { siteKey_userId: {siteKey: "univ", userId: "actor"} } });
});
test("LEGACY-ISOLATION: no implicit university grant, ALL stays tenant bound", async () => {
  const legacy = database([]);
  assert.deepEqual(await outreachTenants(legacy.db, actor), ["lg"]);
  await assert.rejects(
    universityScope(legacy.db, "univ", actor),
    (error) => error instanceof OutreachError && error.status === 403,
  );
  const univ = database([{ siteKey: "univ", accessEnabled: true, serviceFullAccess: true }]);
  assert.deepEqual(await outreachTenants(univ.db, actor), ["univ"]);
  const both = database([
    { siteKey: "univ", accessEnabled: true, serviceFullAccess: true },
    { siteKey: "lg", accessEnabled: true, serviceFullAccess: true },
  ]);
  assert.deepEqual(await outreachTenants(both.db, actor), ["lg", "univ"]);
});

test("FULL-ACCESS: system role grants the tenant without enabling live execution", async () => {
  const { db } = database([]);
  assert.deepEqual(await outreachTenants(db, full), ["lg", "univ"]);
  const scope = await universityScope(db, "univ", full);
  assert.equal("departments" in scope, false);
  assert.equal(scope.all, true);
  assert.equal(scope.live, false);
  await assert.rejects(universityScope(db, "lg", full), (error) => error instanceof OutreachError && error.status === 404);
  const explicit = database([{ siteKey: "univ", accessEnabled: true, liveExecution: true }]);
  assert.equal((await universityScope(explicit.db, "univ", full)).live, true);
  const other = database([{ siteKey: "lg", accessEnabled: true, serviceFullAccess: true, liveExecution: true }]);
  assert.equal((await universityScope(other.db, "univ", full)).live, false);
});

test("NO-ACCESS: grants never bypass base permission, suspension, password change or explicit deny", async () => {
  const { db } = database([{ siteKey: "univ", accessEnabled: true, serviceFullAccess: true }]);
  for (const denied of [
    { ...actor, roles: [] }, { ...full, banned: true }, { ...full, mustChangePassword: true },
    { ...full, roles: [{ ...full.roles[0], permissions: [{ resourceKey: "zaad", action: "VIEW" as const, effect: "DENY" as const }] }] },
  ]) {
    assert.deepEqual(await outreachTenants(db, denied), []);
    await assert.rejects(universityScope(db, "univ", denied), (error) => error instanceof OutreachError && error.status === 403);
  }
});

test("shared outreach scope grants full access in both tenants without inheriting live permission", async () => {
  for (const siteKey of ["lg", "univ"] as const) {
    const { db } = database([]);
    const resolved = await resolveOutreachScope(db, full, siteKey);
    assert.equal(resolved.siteKey, siteKey);
    assert.equal(resolved.all, true);
    assert.equal(resolved.live, false);
    assert.equal("departments" in resolved, false);
  }
  const { db } = database([{ siteKey: "lg", accessEnabled: true, liveExecution: true }]);
  assert.equal((await resolveOutreachScope(db, full, "lg")).live, true);
  assert.equal((await resolveOutreachScope(db, full, "univ")).live, false);
});

test("shared outreach scope keeps ordinary role grants tenant bound", async () => {
  const { db } = database([{ siteKey: "lg", accessEnabled: true }]);
  const resolved = await resolveOutreachScope(db, actor, "lg");
  assert.equal("departments" in resolved, false);
  assert.equal(resolved.all, false);
  await assert.rejects(resolveOutreachScope(db, actor, "univ"));
  await assert.rejects(resolveOutreachScope(db, { ...full, banned: true }, "lg"));
});

test("explicit deny rows freeze entry and university service access never becomes shared FULL_ACCESS", async()=>{
 const {db}=database([{siteKey:"lg",accessEnabled:false},{siteKey:"univ",accessEnabled:true,serviceFullAccess:true}]);
 assert.deepEqual(await outreachTenants(db,actor),["univ"]);
 assert.equal((await universityScope(db,"univ",actor)).all,true);
 assert.equal((await resolveOutreachScope(db,actor,"univ")).all,false);
 await assert.rejects(resolveOutreachScope(db,actor,"lg"));
});
