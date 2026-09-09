import assert from "node:assert/strict";
import test from "node:test";
import { localAdminRequest, parseAdminTenant, safeAdminCallback, resolveOutreachView } from "../lib/admin-routing";

test("municipal fraud remains in one-time outreach on direct and legacy workflow links", () => {
  for (const view of ["campaigns", "dispatches", "one-time", null])
    assert.equal(resolveOutreachView("lg", view, "fraud"), "one-time");
  for (const workflow of ["watch", "procedure", "service"])
    assert.equal(resolveOutreachView("lg", "campaigns", workflow), "campaigns");
  assert.equal(resolveOutreachView("univ", "campaigns", "fraud"), "campaigns");
  assert.equal(resolveOutreachView("lg", "campaigns", null), "campaigns");
  assert.equal(resolveOutreachView("lg", "groups", null), "contact-lists");
});

test("canonical local navigation preserves explicit tenant and query, rejects alias mutations", () => {
  assert.deepEqual(localAdminRequest("http://univ.localhost:3000/admin/zaad?view=contacts", "GET", false),
    { kind: "redirect", destination: "http://localhost:3000/admin/zaad?view=contacts&tenant=univ" });
  assert.deepEqual(localAdminRequest("http://univ.localhost:3000/admin/zaad?tenant=lg&view=messages", "HEAD", false),
    { kind: "redirect", destination: "http://localhost:3000/admin/zaad?tenant=lg&view=messages" });
  for (const pathname of ["/api/admin/zaad/messages", "/api/auth/get-session", "/api/account/change-password", "/admin/zaad"])
    assert.equal(localAdminRequest(`http://lg.localhost:3000${pathname}`, "POST", false).kind, "reject");
  for (const pathname of ["/api/disaster-radio-subscriptions", "/notifications/register", "/faq"])
    assert.equal(localAdminRequest(`http://lg.localhost:3000${pathname}`, "POST", false).kind, "pass");
  assert.equal(localAdminRequest("https://lg.example/admin", "GET", true).kind, "pass");
  assert.equal(localAdminRequest("http://evil.localhost:3000/admin", "GET", false).kind, "pass");
});

test("invalid tenant is preserved across alias redirect and rejected at canonical", () => {
  for (const query of ["tenant=", "tenant=other", "tenant=lg&tenant=univ"]) {
    const result = localAdminRequest(`http://lg.localhost:3000/admin?${query}`, "GET", false);
    assert.equal(result.kind, "redirect");
    if (result.kind === "redirect") assert.deepEqual(localAdminRequest(result.destination, "GET", false),
      { kind: "reject", status: 400, code: "INVALID_TENANT" });
  }
  assert.equal(parseAdminTenant([]).ok, false);
});

test("callback rejects external, encoded, auth-loop and malformed tenant destinations", () => {
  for (const value of ["//evil.test/admin", "https://evil.test/admin", "/\\evil.test/admin", "/admin/login", "/admin/change-password", "/admin?tenant=", "/admin?tenant=lg&tenant=univ", "/admin?callbackURL=/admin", "/admin/%252f%252fevil.test", "/admin/zaad%0a", ["/admin/zaad"], "/admin/unknown", "/admin/zaad#token"])
    assert.equal(safeAdminCallback(value), "/admin", String(value));
  assert.equal(safeAdminCallback("/admin/zaad?tenant=univ&view=contacts"), "/admin/zaad?tenant=univ&view=contacts");
  assert.equal(safeAdminCallback("http://localhost:3000/admin/zaad?tenant=lg"), "/admin/zaad?tenant=lg");
});

test("outreach settings return preserves the selected tenant and rejects unrelated destinations", async () => {
  const { safeOutreachReturnPath } = await import("../lib/admin-routing");
  assert.equal(safeOutreachReturnPath("/admin/zaad?tenant=univ&view=groups", "univ"), "/admin/zaad?tenant=univ&view=groups");
  assert.equal(safeOutreachReturnPath("/admin/zaad?tenant=lg&view=campaigns&state=default&theme=dark", "lg"), "/admin/zaad?tenant=lg&view=campaigns");
  for (const value of ["https://example.com/admin/zaad?tenant=univ", "//example.com/admin/zaad?tenant=univ", "/admin/zaad?tenant=lg", "/admin/zaad?tenant=univ&tenant=lg", "/admin/users?tenant=univ", "/admin/zaad", "/admin/zaad?tenant=univ&callbackURL=https://example.com", "/admin/%2fzaad?tenant=univ"])
    assert.equal(safeOutreachReturnPath(value, "univ"), null, value);
});

test("reservation booking and API log callbacks retain tenant and filters", () => {
  for (const path of [
    "/admin/reservations/bookings?tenant=lg&service=consultation",
    "/admin/reservations/bookings?tenant=univ",
    "/admin/reservations/api-keys/logs?tenant=lg&method=GET",
    "/admin/reservations/api-keys/logs/log-123?tenant=univ",
  ]) assert.equal(safeAdminCallback(path), path);
  for (const path of [
    "/admin/reservations/bookings/unknown?tenant=lg",
    "/admin/reservations/bookings?tenant=lg&tenant=univ",
  ]) assert.equal(safeAdminCallback(path), "/admin");
});
