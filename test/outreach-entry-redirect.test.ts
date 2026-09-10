import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { X_ROBOTS_TAG_VALUE } from "../lib/search-indexing";

test("ENTRY-01: Proxy redirects outreach before rendering, preserving query and owned port", async () => {
  for (const method of ["GET", "HEAD"]) {
    const response = await proxy(new NextRequest("http://localhost:3001/admin/zaad?view=messages&detail=id", { method }));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3001/admin/zaad?view=messages&detail=id&tenant=lg");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-robots-tag"), X_ROBOTS_TAG_VALUE);
  }
});
test("ENTRY-03: explicit industry, API and non-GET requests retain existing behavior", async () => {
  for (const [path, method] of [["/admin/zaad?tenant=univ", "GET"], ["/admin/zaad?tenant=lg", "HEAD"], ["/admin/zaad", "POST"], ["/api/admin/zaad", "GET"]]) {
    const response = await proxy(new NextRequest(`http://localhost:3001${path}`, { method }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
  }
  const alias = await proxy(new NextRequest("http://lg.localhost/admin/zaad", { method: "POST" }));
  assert.equal(alias.status, 400);
  assert.equal((await alias.json()).code, "CANONICAL_ADMIN_ORIGIN_REQUIRED");
  const slash = await proxy(new NextRequest("http://localhost:3001/admin/zaad/?view=messages"));
  assert.equal(slash.status, 308);
  assert.equal(slash.headers.get("location"), "http://localhost:3001/admin/zaad?view=messages");
});

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
test("ENTRY-03: page authenticates first and never loads outreach data for denied or invalid industries", async () => {
  const filename = new URL("../app/admin/zaad/page.tsx", import.meta.url), localRequire = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const scenario of ["anonymous", "no-access", "university-only-default-lg", "invalid", "lg", "univ"]) {
    let dataReads = 0, tenantReads = 0;
    const target = { exports: {} as { default: () => Promise<{ props: { tenant: string } }> } };
    new Function("require", "module", "exports", code)((name: string) => {
      if (name === "next/navigation") return { redirect: (href: string) => { throw new Error(href); } };
      if (name === "@/lib/server/admin-access/server") return { requireAdminAccess: async (resource: string, action: string, callback: string) => { assert.equal(resource, "zaad"); assert.equal(action, "VIEW"); assert.equal(callback, "/admin/zaad?tenant=lg"); if (scenario === "anonymous") throw new Error("LOGIN"); if (scenario === "no-access") throw new Error("DENIED"); return { actor: { id: "actor" } }; } };
      if (name === "@/lib/server/admin-scope") return { getAdminPageTenant: async () => { tenantReads++; return ["lg", "univ"].includes(scenario) ? { ok: true, tenant: { key: scenario }, allowed: [scenario] } : { ok: false, allowed: scenario === "invalid" ? ["lg"] : ["univ"] }; } };
      if (name === "@/lib/server/prisma") return { withPrisma: async (fn: (db: unknown) => unknown) => { dataReads++; return fn({}); } };
      if (name === "@/lib/server/zaad/outreach-scope") return { resolveOutreachScope: async () => ({ departments: ["fixture"] }) };
      if (name === "@/lib/admin-access/authorization") return { canAdminAccess: () => false };
      if (name === "./OutreachView") return { OutreachView: () => null };
      return localRequire(name);
    }, target, target.exports);
    if (["lg", "univ"].includes(scenario)) { assert.equal((await target.exports.default()).props.tenant, scenario); assert.equal(dataReads, 1); }
    else { await assert.rejects(target.exports.default(), /LOGIN|DENIED|access-denied/); assert.equal(dataReads, 0); }
    if (["anonymous", "no-access"].includes(scenario)) assert.equal(tenantReads, 0);
  }
});
