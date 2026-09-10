import assert from "node:assert/strict";
import test from "node:test";
import { classifyAdminApi, OUTREACH_VIEWS, resolveOutreachView, safeOutreachReturnPath } from "../lib/admin-routing";
import { outreachCommonDictionaries } from "../app/i18n/outreach-common";

test("Developer API is global while outreach stays tenant scoped", () => {
  assert.equal(classifyAdminApi("/api/admin/developer-api").kind, "global");
  assert.equal(classifyAdminApi("/api/admin/developer-api/reveal").kind, "global");
  assert.equal(classifyAdminApi("/api/admin/zaad/default-groups/a").kind, "tenant");
  assert.equal(OUTREACH_VIEWS.length, 4);
  for (const site of ["lg", "univ"] as const) for (const value of [null, "contacts", "groups", "residents"]) assert.equal(resolveOutreachView(site, value, null), "contact-lists");
  assert.equal(safeOutreachReturnPath("/admin/zaad?tenant=univ"), "/admin/zaad?tenant=univ");
  assert.equal(safeOutreachReturnPath("//outside.invalid/admin/zaad?tenant=univ"), null);
  assert.equal(safeOutreachReturnPath("/admin/users?tenant=lg"), null);
  for (const dictionary of Object.values(outreachCommonDictionaries)) assert.equal(dictionary.tabs.length, 4);
});

import { resolveOutreachDefaultRedirect, safeAdminCallback, isOutreachDetailPage, outreachParentHref } from "../lib/admin-routing";
test("ENTRY-01/02: default outreach entry preserves URL and only fills an absent tenant", () => {
  for (const method of ["GET", "HEAD"]) {
    const original = new URL("http://localhost:3001/admin/zaad?view=messages&state=message-edit&detail=one");
    const result = resolveOutreachDefaultRedirect(original, method)!;
    assert.equal(result.origin, original.origin);
    assert.equal(result.searchParams.get("tenant"), "lg");
    assert.equal(result.searchParams.get("detail"), "one");
    assert.equal(original.searchParams.has("tenant"), false);
  }
  for (const suffix of ["?tenant=lg", "?tenant=univ", "?tenant=", "?tenant=bad", "?tenant=lg&tenant=univ"]) assert.equal(resolveOutreachDefaultRedirect(new URL(`http://localhost:3001/admin/zaad${suffix}`), "GET"), null);
  for (const [path, method] of [["/admin/zaad", "POST"], ["/api/admin/zaad", "GET"], ["/admin/users", "GET"], ["/admin/zaad/", "GET"]]) assert.equal(resolveOutreachDefaultRedirect(new URL(path, "http://localhost:3001"), method), null);
  assert.equal(safeAdminCallback("/admin/zaad?view=messages"), "/admin/zaad?view=messages&tenant=lg");
  assert.equal(safeAdminCallback("/admin/zaad?tenant=univ"), "/admin/zaad?tenant=univ");
  assert.equal(safeAdminCallback("/admin/zaad?tenant="), "/admin");
  assert.equal(safeAdminCallback("//foreign.invalid/admin/zaad"), "/admin");
});

test("NAV-01: only valid child routes hide the list chrome", () => {
  const states = { "contact-lists": ["default-group-detail", "group-detail", "group-edit", "group-create", "group-sync"], campaigns: ["campaign-detail", "campaign-sync"], "one-time": ["dispatch-create", "dispatch-history", "dispatch-edit", "dispatch-retry", "dispatch-confirm"], messages: ["message-create", "message-edit"] };
  for (const [view, children] of Object.entries(states)) {
    assert.equal(isOutreachDetailPage(view, new URLSearchParams()), false);
    for (const state of children) {
      assert.equal(isOutreachDetailPage(view, new URLSearchParams({ state, detail: "id" })), true, `${view}/${state}`);
      assert.equal(isOutreachDetailPage(view, new URLSearchParams({ state })), state.endsWith("create") || state.endsWith("sync"));
    }
    for (const state of ["bogus", "campaign-confirm", "default-group-bind", "message-preview"]) assert.equal(isOutreachDetailPage(view, new URLSearchParams({ state, detail: "id" })), false);
  }
  assert.equal(isOutreachDetailPage("messages", new URLSearchParams({ state: "group-detail", detail: "id" })), false);
  assert.equal(isOutreachDetailPage("contact-lists", new URLSearchParams({ section: "contacts" })), true);
  assert.equal(isOutreachDetailPage("contact-lists", new URLSearchParams({ section: "contacts", state: "contact-edit", detail: "id" })), false);
  assert.equal(isOutreachDetailPage("campaigns", new URLSearchParams({ workflow: "watch", state: "campaign-detail", detail: "id" })), false);
});

test("NAV-02/CONTACTS-01: breadcrumb keeps industry and view while removing detail/search pagination", () => {
  for (const tenant of ["lg", "univ"] as const) for (const view of OUTREACH_VIEWS) {
    const result = new URL(outreachParentHref(tenant, new URLSearchParams({ tenant, view, state: "group-detail", detail: "id", query: "name", cursor: "cursor", page: "2", trail: "previous", section: "contacts", origin: "SITE", search: "old", filter: "keep" })), "https://example.invalid");
    assert.equal(result.searchParams.get("tenant"), tenant);
    assert.equal(result.searchParams.get("view"), view);
    assert.equal(result.searchParams.get("filter"), "keep");
    for (const key of ["state", "detail", "query", "cursor", "page", "trail", "section", "origin", "search"]) assert.equal(result.searchParams.has(key), false);
  }
  assert.equal(outreachCommonDictionaries.ja.defaultGroups.bulk, "一括同期");
  assert.equal(outreachCommonDictionaries.en.defaultGroups.bulk, "Sync all");
});
