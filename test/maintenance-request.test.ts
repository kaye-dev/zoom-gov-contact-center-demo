import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  INTERNAL_MAINTENANCE_PATH,
  shouldEvaluateMaintenance,
} from "../lib/maintenance-request";

const request = (pathname: string, method = "GET") => ({
  method,
  url: `https://city.example.jp${pathname}`,
});

test("maintenance evaluation includes public HTML and unknown public URLs", () => {
  for (const pathname of [
    "/",
    "/life",
    "/life/child-education",
    "/news/example",
    "/docs/privacy-policy",
    "/docs/privacy-policy.html",
    "/not-yet-defined",
    "/not-yet-defined.custom",
  ]) {
    assert.equal(shouldEvaluateMaintenance(request(pathname)), true, pathname);
  }
});

test("maintenance evaluation excludes management, authentication, API, and internals", () => {
  for (const pathname of [
    "/admin",
    "/admin/maintenance-settings",
    "/login",
    "/forgot-password",
    "/change-password",
    "/api",
    "/api/health",
    "/_next/static/app.js",
    "/_vercel/insights",
    "/maintenance-unavailable",
    "/.well-known/security.txt",
  ]) {
    assert.equal(shouldEvaluateMaintenance(request(pathname)), false, pathname);
  }
});

test("maintenance evaluation excludes public assets and raw Markdown", () => {
  for (const pathname of [
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/ai-chat-assistant.png",
    "/assets/site.css",
    "/docs/privacy-policy.md",
    "/downloads/guide.pdf",
  ]) {
    assert.equal(shouldEvaluateMaintenance(request(pathname)), false, pathname);
  }
});

test("maintenance evaluation excludes non-navigation methods", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(shouldEvaluateMaintenance(request("/life", method)), false, method);
  }

  assert.equal(shouldEvaluateMaintenance(request("/life", "HEAD")), true);
});

test("internal rewrite destination is a routable App Router page", () => {
  const segments = INTERNAL_MAINTENANCE_PATH.split("/").filter(Boolean);
  assert.equal(segments.some((segment) => segment.startsWith("_")), false);
  assert.equal(
    existsSync(path.join(process.cwd(), "app", ...segments, "page.tsx")),
    true,
  );
});
