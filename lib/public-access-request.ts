import { normalizeRequestHostname } from "./hostname";
import type { TenantKey } from "./tenants";

export type AccessRequestKind = "infrastructure" | "admin" | "bootstrap" | "external" | "public";

const infrastructure = new Set(["/theme-init.js", "/favicon.ico", "/favicons/demo.svg", "/favicons/admin.svg", "/favicons/lg.svg", "/favicons/univ.svg", "/robots.txt", "/api/health"]);
const browsingApis = new Set(["/api/public/consultation-availability", "/api/municipal-notification-options", "/api/university-notification-options"]);

/** Never use a generic extension or /api prefix exclusion for access control. */
export function classifyAccessRequest(url: URL, method: string, development = process.env.NODE_ENV !== "production"): AccessRequestKind {
  const path = url.pathname.replace(/\/+$/u, "") || "/";
  if (path === "/admin" || path.startsWith("/admin/") || /^\/api\/(?:admin|auth)(?:\/|$)/u.test(path) ||
    ["/api/account/change-password", "/api/password-reset-requests", "/login", "/forgot-password", "/change-password"].includes(path)) return "admin";
  if (path === "/access" || path === "/api/site-access/verify") return "bootstrap";
  if (infrastructure.has(path) || path.startsWith("/_next/static/") ||
    (development && (path === "/_next/webpack-hmr" || path.startsWith("/_next/webpack-hmr/")))) return "infrastructure";
  if (path === "/_next/image") {
    // Only bootstrap images can be optimized without authorization. Remote URLs
    // and raw documents must not be retrievable through the image endpoint.
    if (["/favicons/demo.svg", "/favicons/admin.svg", "/favicons/lg.svg", "/favicons/univ.svg"].includes(url.searchParams.get("url") ?? "")) return "infrastructure";
  }
  if (path === "/api" || path.startsWith("/api/")) {
    if ((["GET", "HEAD"].includes(method) && browsingApis.has(path)) || path.startsWith("/api/docs-md/")) return "public";
    return "external";
  }
  return "public";
}

/** Fixed-tenant external endpoints must not inherit an unrelated request Host. */
export function externalRequestTenant(path: string): TenantKey | null {
  if (path === "/api/public/v1" || path.startsWith("/api/public/v1/") ||
    path.startsWith("/api/zaad/municipal/") || path.startsWith("/api/internal/zaad/municipal/") ||
    ["/api/disaster-radio-subscriptions", "/api/municipal-notification-registrations"].includes(path)) return "lg";
  if (path === "/api/zaad/provider-events" || path === "/api/university-notification-registrations") return "univ";
  // Unknown intake can carry a tenant in a key or body. Fail closed for either
  // industry rather than trusting an unverified caller-provided scope.
  return null;
}

export function publicRequestUrl(request: Pick<Request, "url" | "headers">): URL {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host !== null) {
    if (!normalizeRequestHostname(host)) throw new Error("Invalid request host");
    url.host = host;
  }
  return url;
}

export function isPublicNavigation(request: Pick<Request, "headers" | "method">, url: URL): boolean {
  return ["GET", "HEAD"].includes(request.method) &&
    request.headers.get("rsc") !== "1" && !request.headers.has("next-action") &&
    !url.pathname.startsWith("/api/") &&
    (!/\.[^/]+$/u.test(url.pathname) || url.pathname.endsWith(".html")) &&
    (request.headers.get("sec-fetch-mode") === "navigate" || (request.headers.get("accept") ?? "").includes("text/html"));
}
