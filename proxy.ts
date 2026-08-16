import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveFaqLegacyRedirect } from "@/lib/legacy-redirects";
import { X_ROBOTS_TAG_VALUE } from "@/lib/search-indexing";
import { handleMaintenanceRequest } from "@/lib/server/maintenance-request-gate";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
  const legacyDestination = resolveFaqLegacyRedirect(normalizedPathname);

  if (legacyDestination !== null) {
    return createProtectedRedirect(request, legacyDestination, 307);
  }
  if (normalizedPathname !== pathname) {
    return createProtectedRedirect(request, normalizedPathname, 308);
  }

  const response = await handleMaintenanceRequest(request);
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
  response.headers.set("X-Robots-Tag", X_ROBOTS_TAG_VALUE);
  return response;
}

// The inexpensive path/method filter runs before any database read. Keeping
// one static matcher also ensures undefined public URLs receive the same 503
// maintenance response as known public pages.
export const config = {
  matcher: "/:path*",
};
