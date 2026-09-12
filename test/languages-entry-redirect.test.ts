import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { resolveAdminDefaultTenantRedirect, resolveOutreachDefaultRedirect } from "../lib/admin-routing";
import { X_ROBOTS_TAG_VALUE } from "../lib/search-indexing";

test("LANG-01: absent tenant redirects with origin, query and response headers intact", async () => {
  for (const origin of ["http://localhost:3001", "https://example.com"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(new NextRequest(`${origin}/admin/languages?theme=dark`, { method }));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), `${origin}/admin/languages?theme=dark&tenant=lg`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-robots-tag"), X_ROBOTS_TAG_VALUE);
    }
  }
  const slash = await proxy(new NextRequest("http://localhost:3001/admin/languages/?theme=dark"));
  assert.equal(slash.status, 308);
  assert.equal(slash.headers.get("location"), "http://localhost:3001/admin/languages?theme=dark");
  assert.equal((await proxy(new NextRequest(slash.headers.get("location")!))).status, 307);
});

test("LANG-02: explicit tenants, non-GET methods and other routes are not defaulted", async () => {
  for (const [path, method] of [["/admin/languages?tenant=lg", "GET"], ["/admin/languages?tenant=univ", "HEAD"], ["/admin/languages", "POST"], ["/api/admin/language-settings", "GET"], ["/admin/maintenance-settings", "GET"]]) {
    const url = new URL(path, "http://localhost:3001");
    assert.equal(resolveAdminDefaultTenantRedirect(url, method), null);
    const response = await proxy(new NextRequest(url, { method }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
  }
  for (const query of ["tenant=", "tenant=unknown", "tenant=lg&tenant=univ"]) {
    const url = new URL(`http://localhost:3001/admin/languages?${query}`);
    assert.equal(resolveAdminDefaultTenantRedirect(url, "GET"), null);
    const response = await proxy(new NextRequest(url));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_TENANT");
  }
  const url = new URL("https://example.com/admin/languages?theme=dark");
  assert.equal(resolveOutreachDefaultRedirect(url, "GET"), null);
  assert.equal(resolveAdminDefaultTenantRedirect(url, "GET")?.search, "?theme=dark&tenant=lg");
  assert.equal(url.search, "?theme=dark");
  assert.equal(resolveOutreachDefaultRedirect(new URL("https://example.com/admin/zaad"), "GET")?.search, "?tenant=lg");
  const alias = await proxy(new NextRequest("http://univ.localhost/admin/languages"));
  assert.equal(alias.status, 307);
  assert.equal(alias.headers.get("location"), "http://localhost:3000/admin/languages?tenant=univ");
});

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
test("LANG-03: page authenticates first and never loads language settings for denied or invalid industries", async () => {
  const filename = new URL("../app/admin/languages/page.tsx", import.meta.url), localRequire = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const scenario of ["anonymous", "no-access", "university-only-default-lg", "invalid", "lg", "univ"]) {
    let dataReads = 0, tenantReads = 0;
    const target = { exports: {} as { default: () => Promise<{ key: string; props: { initialSettings: unknown; canEdit: boolean } }> } };
    new Function("require", "module", "exports", code)((name: string) => {
      if (name === "next/navigation") return { redirect: (href: string) => { throw new Error(href); } };
      if (name === "@/lib/server/admin-access/server") return { requireAdminAccess: async (resource: string, action: string, callback: string) => { assert.equal(resource, "language-settings"); assert.equal(action, "VIEW"); assert.equal(callback, "/admin/languages?tenant=lg"); if (scenario === "anonymous") throw new Error("LOGIN"); if (scenario === "no-access") throw new Error("DENIED"); return { actor: { id: "actor" } }; } };
      if (name === "@/lib/server/admin-scope") return { getAdminPageTenant: async () => { tenantReads++; return ["lg", "univ"].includes(scenario) ? { ok: true, tenant: { key: scenario }, allowed: [scenario] } : { ok: false, allowed: scenario === "invalid" ? ["lg"] : ["univ"] }; } };
      if (name === "@/lib/server/site-settings") return { getLanguageSettings: async (tenant: string) => { dataReads++; assert.equal(tenant, scenario); return { locales: [] }; } };
      if (name === "@/lib/admin-access/authorization") return { canAdminAccess: (_actor: unknown, resource: string, action: string) => { assert.equal(resource, "language-settings"); assert.equal(action, "UPDATE"); return scenario === "lg"; } };
      if (name === "./LanguageSettingsForm") return { LanguageSettingsForm: () => null };
      return localRequire(name);
    }, target, target.exports);
    if (["lg", "univ"].includes(scenario)) { const result = await target.exports.default(); assert.equal(result.key, scenario); assert.deepEqual(result.props.initialSettings, { locales: [] }); assert.equal(result.props.canEdit, scenario === "lg"); assert.equal(dataReads, 1); }
    else { await assert.rejects(target.exports.default(), /LOGIN|DENIED|access-denied/); assert.equal(dataReads, 0); }
    if (["anonymous", "no-access"].includes(scenario)) assert.equal(tenantReads, 0);
  }
});
