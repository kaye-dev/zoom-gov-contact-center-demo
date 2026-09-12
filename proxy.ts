import { NextRequest, NextResponse } from "next/server";
import { ADMIN_REQUEST_PATH_HEADER, isAdminPath, localAdminRequest, resolveAdminDefaultTenantRedirect } from "@/lib/admin-routing";
import { resolveFaqLegacyRedirect } from "@/lib/legacy-redirects";
import { X_ROBOTS_TAG_VALUE } from "@/lib/search-indexing";
import { handleMaintenanceRequest } from "@/lib/server/maintenance-request-gate";
import { requirePublicAccess } from "@/lib/server/public-access-gate";
import { classifyAccessRequest, publicRequestUrl } from "@/lib/public-access-request";
import { resolvePublicSite } from "@/lib/public-site-routing";
import { PUBLIC_REQUEST_PATH_HEADER, PUBLIC_REQUEST_METHOD_HEADER, PUBLIC_REQUEST_PROTOCOL_HEADER, SITE_ACCESS_CACHE_CONTROL } from "@/lib/site-access";
import { MAINTENANCE_REWRITE_HEADER } from "@/lib/maintenance-request";

export async function proxy(request: NextRequest) {
  const admin = localAdminRequest(request.url, request.method, process.env.NODE_ENV === "production");
  if (admin.kind !== "pass") {
    const response = admin.kind === "redirect"
      ? NextResponse.redirect(admin.destination, 307)
      : NextResponse.json({ code: admin.code }, { status: admin.status });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", X_ROBOTS_TAG_VALUE);
    return response;
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(MAINTENANCE_REWRITE_HEADER);
  requestHeaders.set(PUBLIC_REQUEST_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  requestHeaders.set(PUBLIC_REQUEST_METHOD_HEADER, request.method);
  requestHeaders.set(PUBLIC_REQUEST_PROTOCOL_HEADER, request.nextUrl.protocol);
  requestHeaders.delete(ADMIN_REQUEST_PATH_HEADER);
  if (isAdminPath(request.nextUrl.pathname))
    requestHeaders.set(ADMIN_REQUEST_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  request = new NextRequest(request, { headers: requestHeaders });
  const pathname = request.nextUrl.pathname;
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;

  const access = await requirePublicAccess(request);
  if (access.response) return access.response;
  const url = publicRequestUrl(request);
  const kind = classifyAccessRequest(url, request.method);
  const entry = resolvePublicSite(url.host).kind === "entry";
  if (entry && kind === "public" && pathname !== "/" && !pathname.startsWith("/_next/") && !pathname.startsWith("/api/")) {
    const destination = new URL("/", url);
    const response = NextResponse.redirect(destination, 307);
    response.headers.set("Cache-Control", SITE_ACCESS_CACHE_CONTROL);
    response.headers.set("X-Robots-Tag", X_ROBOTS_TAG_VALUE);
    return response;
  }
  const maintenance = entry || kind === "bootstrap"
    ? NextResponse.next({ request: { headers: request.headers } })
    : await handleMaintenanceRequest(request);
  if (maintenance.status === 503) {
    maintenance.headers.set("X-Robots-Tag", X_ROBOTS_TAG_VALUE);
    maintenance.headers.set("Cache-Control", SITE_ACCESS_CACHE_CONTROL);
    return maintenance;
  }
  const legacyDestination = resolveFaqLegacyRedirect(normalizedPathname);

  if (legacyDestination !== null) {
    return createProtectedRedirect(request, legacyDestination, 307);
  }
  if (normalizedPathname !== pathname) {
    return createProtectedRedirect(request, normalizedPathname, 308);
  }

  const defaultTenantDestination = resolveAdminDefaultTenantRedirect(new URL(request.url), request.method);
  if (defaultTenantDestination) {
    const response = NextResponse.redirect(defaultTenantDestination, 307);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", X_ROBOTS_TAG_VALUE);
    return response;
  }
  const response = maintenance;
  if (isAdminPath(pathname) || kind === "bootstrap" || pathname === "/robots.txt" || access.restricted) response.headers.set("Cache-Control", SITE_ACCESS_CACHE_CONTROL);
  response.headers.set("X-Robots-Tag", X_ROBOTS_TAG_VALUE);
  return response;
}

function createProtectedRedirect(
  request: NextRequest,
  pathname: string,
  status: 307 | 308,
): NextResponse {
  const destination = new URL(request.url);
  destination.pathname = pathname;
  const response = NextResponse.redirect(destination, status);
  response.headers.set("Cache-Control", SITE_ACCESS_CACHE_CONTROL);
  response.headers.set("X-Robots-Tag", X_ROBOTS_TAG_VALUE);
  return response;
}

// The inexpensive path/method filter runs before any database read. Keeping
// one static matcher also ensures undefined public URLs receive the same 503
// maintenance response as known public pages.
export const config = {
  matcher: "/:path*",
};
