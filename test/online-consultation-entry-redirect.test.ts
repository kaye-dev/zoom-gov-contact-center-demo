import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import ts from "typescript";
import { proxy } from "../proxy";
import { resolveAdminDefaultTenantRedirect, resolveOutreachDefaultRedirect } from "../lib/admin-routing";
import { X_ROBOTS_TAG_VALUE } from "../lib/search-indexing";

const path = "/admin/online-consultation-settings";

test("CONSULT-01: absent tenant redirects to lg with origin, query and response headers intact", async () => {
  for (const origin of ["http://localhost:3004", "https://example.com"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(new NextRequest(`${origin}${path}?theme=dark`, { method }));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), `${origin}${path}?theme=dark&tenant=lg`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-robots-tag"), X_ROBOTS_TAG_VALUE);
    }
  }
  const slash = await proxy(new NextRequest(`http://localhost:3004${path}/?theme=dark`));
  assert.equal(slash.status, 308);
  assert.equal(slash.headers.get("location"), `http://localhost:3004${path}?theme=dark`);
  const canonical = await proxy(new NextRequest(slash.headers.get("location")!));
  assert.equal(canonical.status, 307);
  assert.equal(canonical.headers.get("location"), `http://localhost:3004${path}?theme=dark&tenant=lg`);
  const url = new URL(`https://example.com${path}?theme=dark`);
  assert.equal(resolveAdminDefaultTenantRedirect(url, "GET")?.search, "?theme=dark&tenant=lg");
  assert.equal(url.search, "?theme=dark");
  assert.equal(resolveOutreachDefaultRedirect(url, "GET"), null);
});

test("CONSULT-02: explicit tenants, invalid values, API methods and local aliases retain their contracts", async () => {
  for (const [pathname, method] of [
    [`${path}?tenant=lg`, "GET"], [`${path}?tenant=univ`, "HEAD"],
    [path, "POST"], [`/api${path}`, "GET"], ["/admin/maintenance-settings", "GET"],
  ]) {
    const url = new URL(pathname, "http://localhost:3004");
    assert.equal(resolveAdminDefaultTenantRedirect(url, method), null);
    const response = await proxy(new NextRequest(url, { method }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
  }
  for (const query of ["tenant=", "tenant=unknown", "tenant=lg&tenant=univ"]) {
    const url = new URL(`http://localhost:3004${path}?${query}`);
    assert.equal(resolveAdminDefaultTenantRedirect(url, "GET"), null);
    const response = await proxy(new NextRequest(url));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_TENANT");
  }
  const alias = await proxy(new NextRequest(`http://univ.localhost${path}`));
  assert.equal(alias.status, 307);
  assert.equal(alias.headers.get("location"), `http://localhost:3000${path}?tenant=univ`);
});

test("CONSULT-03: authentication and scope denial prevent data reads; valid pages retain tenant and edit permission", async () => {
  const filename = new URL("../app/admin/online-consultation-settings/page.tsx", import.meta.url);
  const localRequire = createRequire(filename);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const form = () => null;
  const choice = () => null;
  for (const scenario of ["anonymous", "no-access", "denied", "invalid", "lg", "univ", "readonly"]) {
    let dataReads = 0, tenantReads = 0;
    const tenant = scenario === "univ" ? "univ" : "lg";
    const initialSettings = [{ serviceKey: tenant === "lg" ? "general" : "admissions" }];
    const target = { exports: {} as { default: (props: { searchParams: Promise<{ tenant: string }> }) => Promise<{ type: unknown; key: string; props: { initialSettings: unknown; initialTenant: string; canEdit: boolean; code: string } }> } };
    new Function("require", "module", "exports", code)((name: string) => {
      if (name === "@/lib/server/admin-access/server") return {
        requireAdminAccess: async (resource: string, action: string, callback: string) => {
          assert.equal(resource, "chat-settings"); assert.equal(action, "VIEW"); assert.equal(callback, path);
          if (scenario === "anonymous") throw new Error("LOGIN");
          if (scenario === "no-access") throw new Error("DENIED");
          return { actor: { id: "actor" } };
        },
      };
      if (name === "@/lib/server/admin-settings-tenant") return {
        getAdminSettingsTenant: async (value: string, resource: string) => {
          tenantReads++; assert.equal(value, tenant); assert.equal(resource, "online-consultation-settings");
          if (scenario === "denied" || scenario === "invalid") return {
            ok: false, allowed: [], code: scenario === "denied" ? "ADMIN_ACCESS_DENIED" : "INVALID_TENANT",
          };
          return { ok: true, tenant: { key: tenant }, allowed: [tenant] };
        },
      };
      if (name === "@/lib/server/online-consultation-settings") return {
        getOnlineConsultationSettings: async (key: string) => {
          dataReads++; assert.equal(key, tenant); return initialSettings;
        },
      };
      if (name === "@/lib/admin-access/authorization") return {
        canAdminAccess: (_actor: unknown, resource: string, action: string) => {
          assert.equal(resource, "chat-settings"); assert.equal(action, "UPDATE"); return scenario !== "readonly";
        },
      };
      if (name === "./OnlineConsultationSettingsForm") return { OnlineConsultationSettingsForm: form };
      if (name === "../AdminTenantChoice") return { AdminTenantChoice: choice };
      return localRequire(name);
    }, target, target.exports);
    const render = () => target.exports.default({ searchParams: Promise.resolve({ tenant }) });
    if (scenario === "anonymous" || scenario === "no-access") {
      await assert.rejects(render, /LOGIN|DENIED/);
      assert.equal(tenantReads, 0); assert.equal(dataReads, 0);
    } else if (scenario === "denied" || scenario === "invalid") {
      const result = await render(); assert.equal(result.type, choice);
      assert.equal(result.props.code, scenario === "denied" ? "ADMIN_ACCESS_DENIED" : "INVALID_TENANT");
      assert.equal(dataReads, 0);
    } else {
      const result = await render(); assert.equal(result.type, form); assert.equal(result.key, tenant);
      assert.equal(result.props.initialTenant, tenant); assert.deepEqual(result.props.initialSettings, initialSettings);
      assert.equal(result.props.canEdit, scenario !== "readonly"); assert.equal(dataReads, 1);
    }
  }
});
