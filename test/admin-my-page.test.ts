import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { adminHomeDestination, safeAdminCallback } from "../lib/admin-routing";
import * as routing from "../lib/admin-routing";
import * as authorization from "../lib/admin-access/authorization";
import * as helpers from "../lib/server/auth/helpers";
import { ADMIN_RESOURCE_KEYS, type AdminAccessActor } from "../lib/admin-access/types";
import { buildAdminNavigation, type AdminNavigationItemKey } from "../app/admin/admin-navigation";
import { defaultTenantDictionaries as dictionaries } from "../app/i18n/build-dictionary";

function source(path: string) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const filename = new URL(`../${path}`, import.meta.url);
  const require = createRequire(filename);
  const code = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const target = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => name in dependencies ? dependencies[name] : require(name), target, target.exports);
  return target.exports as T;
}
const redirect = (href: string): never => { throw new Error(href); };
const account = { id: "self-a", name: "Account A", email: "a@example.com", role: "user", mustChangePassword: false };
const emptyActor: AdminAccessActor = { id: account.id, adminAttribute: "user", banned: false, mustChangePassword: false, roles: [] };

function guards(actor: AdminAccessActor | null, user: typeof account | null = account) {
  const session = user ? { user } : null;
  const common = {
    "next/navigation": { redirect },
    "@/lib/admin-routing": routing,
    "@/lib/server/auth/helpers": helpers,
    "@/lib/admin-access/authorization": authorization,
    "@/lib/server/prisma": { withPrisma: async (fn: (db: object) => unknown) => fn({}) },
    "./queries": { getAdminAccessActor: async (_db: object, id: string) => { assert.equal(id, account.id); return actor; } },
  };
  const auth = load<typeof import("../lib/server/auth/server")>("lib/server/auth/server.ts", {
    ...common, "react": { cache: (fn: unknown) => fn }, "next/headers": { headers: async () => new Headers() },
    "@/lib/auth": { withAuth: async (fn: (auth: object) => unknown) => fn({ api: { getSession: async () => session } }) },
  });
  const server = load<typeof import("../lib/server/admin-access/server")>("lib/server/admin-access/server.ts", {
    ...common, "react": { cache: (fn: unknown) => fn }, "@/lib/server/auth/server": auth,
  });
  const api = load<typeof import("../lib/server/admin-access/api-guard")>("lib/server/admin-access/api-guard.ts", {
    ...common, "@/lib/server/auth/helpers": { ...helpers, getAppSession: async () => session },
  });
  const page = load<{ default: (props: { searchParams: Promise<Record<string, string | string[]>> }) => Promise<{ props: { name: string; email: string; denied: boolean } }> }>("app/admin/my-page/page.tsx", {
    "@/lib/server/admin-access/server": server, "@/lib/server/auth/helpers": helpers, "./MyPage": { MyPage: () => null },
  });
  return { server, api, page };
}

test("T01: admin root preserves only scalar supported entry context and callback accepts my-page", async () => {
  assert.equal(adminHomeDestination({}), "/admin/my-page");
  for (const tenant of ["lg", "univ"]) assert.equal(adminHomeDestination({ tenant, error: "access-denied", userId: "other", callbackURL: "https://outside.invalid" }), `/admin/my-page?tenant=${tenant}&error=access-denied`);
  for (const tenant of ["bad", "", ["lg"], ["lg", "univ"]]) assert.equal(adminHomeDestination({ tenant, error: ["access-denied"] }), "/admin/my-page");
  const page = load<{ default: (props: { searchParams: Promise<object> }) => Promise<never> }>("app/admin/page.tsx", { "next/navigation": { redirect }, "@/lib/admin-routing": routing });
  await assert.rejects(page.default({ searchParams: Promise.resolve({ tenant: "univ" }) }), { message: "/admin/my-page?tenant=univ" });
  for (const path of ["/admin/my-page", "/admin/my-page?tenant=lg", "/admin/users/other"]) assert.equal(safeAdminCallback(path), path);
  for (const path of ["/admin/my-page/other", "//outside.invalid/admin/my-page", "/admin/my-page?callbackURL=/admin/users"]) assert.equal(safeAdminCallback(path), "/admin");
});

test("T02: my-page serializes only the current session's name/email, ignoring other user ids", async () => {
  const { page } = guards(emptyActor);
  assert.deepEqual((await page.default({ searchParams: Promise.resolve({ userId: "other", id: "other", error: "access-denied" }) })).props, { name: account.name, email: account.email, denied: true });
  assert.deepEqual((await page.default({ searchParams: Promise.resolve({ error: ["access-denied"] }) })).props, { name: account.name, email: account.email, denied: false });
});

test("T02: anonymous, suspended and password-change sessions cannot render my-page", async () => {
  for (const [actor, user, destination] of [
    [null, null, "/admin/login?callbackURL=%2Fadmin%2Fmy-page"],
    [{ ...emptyActor, banned: true }, account, "/admin/login?callbackURL=%2Fadmin%2Fmy-page"],
    [emptyActor, { ...account, mustChangePassword: true }, "/admin/change-password?callbackURL=%2Fadmin%2Fmy-page"],
  ] as const) await assert.rejects(guards(actor, user).page.default({ searchParams: Promise.resolve({}) }), { message: destination });
});

test("T03: roleless, empty-role and all-DENY users can see my-page but not protected pages/APIs or business navigation", async () => {
  const actors: AdminAccessActor[] = [emptyActor, { ...emptyActor, roles: [{ id: "empty", name: "Empty", systemKey: null, permissions: [] }] }, { ...emptyActor, roles: [{ id: "deny", name: "Deny", systemKey: null, permissions: ADMIN_RESOURCE_KEYS.map(resourceKey => ({ resourceKey, action: "VIEW", effect: "DENY" })) }] }];
  for (const actor of actors) {
    const { server, api, page } = guards(actor);
    assert.equal((await page.default({ searchParams: Promise.resolve({}) })).props.name, account.name);
    const layout = load<{ default: (props: { children: null }) => Promise<{ props: { visibleItems: AdminNavigationItemKey[] } }> }>("app/admin/layout.tsx", {
      "@/lib/server/admin-access/server": server, "@/lib/server/auth/helpers": helpers, "@/lib/admin-access/authorization": authorization,
      "@/lib/server/prisma": { withPrisma: async (fn: (db: object) => unknown) => fn({}) },
      "@/lib/server/tenant": { getRequestTenant: async () => ({ key: "lg" }) },
      "@/lib/server/zaad/university/permissions": { outreachTenants: async () => [] },
      "@/lib/admin-settings-tenant": { settingsTenantOptions: () => ["lg"] }, "./AdminShell": { AdminShell: () => null },
    });
    assert.deepEqual(buildAdminNavigation((await layout.default({ children: null })).props.visibleItems, dictionaries.ja).primaryItems, []);
    await assert.rejects(server.requireAdminAccess("roles", "VIEW", "/admin/roles"), { message: "/admin/my-page?error=access-denied" });
    const result = await api.authorizeAdminApi({} as never, {} as never, new Headers(), "roles", "VIEW");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  }
  const unauthenticated = await guards(null, null).api.authorizeAdminApi({} as never, {} as never, new Headers(), "roles", "VIEW");
  assert.equal(!unauthenticated.ok && unauthenticated.status, 401);
  const allowed = guards({ ...emptyActor, roles: [{ id: "viewer", name: "Viewer", systemKey: null, permissions: [{ resourceKey: "roles", action: "VIEW", effect: "ALLOW" }] }] });
  assert.equal((await allowed.server.requireAdminAccess("roles", "VIEW", "/admin/roles")).decision.allowed, true);
  await assert.rejects(allowed.server.requireAdminAccess("developer-api", "VIEW", "/admin/developer-api"), /access-denied/u);
});

test("T05-T09/T11: adopted icons keep shared sizing, vector AI and card details", () => {
  const nav = source("app/admin/AdminNavigation.tsx");
  const mapping = { users: "PersonIcon", '"phone-settings"': "WifiCallingBar2Icon", '"chat-settings"': "AiChatIcon", '"online-consultation-settings"': "AiOnlineConsultationIcon", settings: "MaterialSettingsIcon", roles: "RoleCardIcon", '"developer-api"': "CodeBlocksIcon" };
  assert.match(nav, /<Icon className="h-6 w-6 shrink-0"/u);
  for (const [key, icon] of Object.entries(mapping)) {
    assert.ok(nav.includes(`${key}: ${icon}`));
    const svg = source(`app/components/svg/${icon}.tsx`);
    assert.match(svg, /currentColor/u);
    assert.doesNotMatch(svg, /<text|transform=|scale\(|zoom:/u);
  }
  const ai = ["WifiCallingBar2Icon", "AiChatIcon", "AiOnlineConsultationIcon"].map(icon => source(`app/components/svg/${icon}.tsx`));
  for (const svg of ai) {
    assert.ok(svg.includes('d="M13 8.5 15.1 2h1.8L19 8.5h-1.55l-.4-1.4h-2.1l-.4 1.4H13Zm2.32-2.7h1.36L16 3.5l-.68 2.3Z"'));
    assert.ok(svg.includes('d="M20.25 2h1.5v6.5h-1.5Z"'));
  }
  assert.match(ai[0], /strokeWidth="1.75"/u);
  assert.ok(ai[1].includes('d="M11 3H5a2 2 0 0 0-2 2v16l5-3h11a2 2 0 0 0 2-2v-5"'));
  assert.ok(ai[2].includes('d="m16 13.5 5-2.5v9l-5-2.5"'));
  const card = source("app/components/svg/RoleCardIcon.tsx");
  for (const part of ['viewBox="0 0 24 24"', 'cx="8.6" cy="13.7"', 'M8.6 14.65v1.45', 'M10.9 13.3h1.6m-1.6 2.1h1.6', 'M14.7 9.6H18M14.7 12.3h2m1.5 0h1.6M14.7 15h4.5']) assert.ok(card.includes(part));
  for (const icon of ["PersonIcon", "MaterialSettingsIcon", "CodeBlocksIcon", "WifiCallingBar2Icon"]) assert.match(source(`app/components/svg/${icon}.tsx`), /google\/material-design-icons/u);
  assert.match(source("app/components/svg/material-symbols-LICENSE.txt"), /Apache License/u);
});

test("T06: all five locales supply my-page copy and the adapter uses the effective rendered navigation", () => {
  assert.equal(Object.keys(dictionaries).length, 5);
  for (const dictionary of Object.values(dictionaries)) for (const key of ["title", "description", "name", "email", "noAccess", "denied"] as const) assert.ok(dictionary.admin.myPage[key].length > 0);
  assert.match(source("app/admin/my-page/MyPage.tsx"), /hasAccess=\{model.primaryItems.length > 0\}/u);
  assert.doesNotMatch(source("app/admin/my-page/MyPageView.tsx"), /<input|<button|<form/u);
});
