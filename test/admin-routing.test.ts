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
