import { classifyAccessRequest, externalRequestTenant, isPublicNavigation, publicRequestUrl } from "@/lib/public-access-request";
import { resolvePublicSite, safePublicReturnTo } from "@/lib/public-site-routing";
import { siteIsRestricted, SITE_ACCESS_CACHE_CONTROL } from "@/lib/site-access";
import { X_ROBOTS_TAG_VALUE } from "@/lib/search-indexing";
import { readSiteAccessSettings, siteAccessEnvironment } from "./site-access-settings";
import { hasSiteAccessSession, readAccessCookie } from "./site-access-session";
import type { SiteAccessStore } from "./site-access-store";

export type PublicAccessResult = { restricted: boolean; response: Response | null };

export function siteAccessErrorResponse(code: string, status: number, retryAfter?: number): Response {
  return Response.json({ code }, { status, headers: { "Cache-Control": SITE_ACCESS_CACHE_CONTROL,
    "X-Robots-Tag": X_ROBOTS_TAG_VALUE, ...(retryAfter === undefined ? {} : { "Retry-After": String(retryAfter) }) } });
}

/** Called by Proxy and again by API/page boundaries. No client-supplied grant headers. */
export async function requirePublicAccess(request: Request, options: { store?: SiteAccessStore; now?: Date; env?: NodeJS.ProcessEnv } = {}): Promise<PublicAccessResult> {
  try {
    const url = publicRequestUrl(request), env = options.env ?? process.env;
    const kind = classifyAccessRequest(url, request.method, env.NODE_ENV !== "production");
    if (["admin", "bootstrap", "infrastructure"].includes(kind)) return { restricted: false, response: null };
    const environment = siteAccessEnvironment(url.hostname, env);
    const settings = await readSiteAccessSettings(environment, options.store);
    if (kind === "external") {
      const tenant = externalRequestTenant(url.pathname.replace(/\/+$/u, ""));
      const restricted = tenant ? siteIsRestricted(settings, { kind: "tenant", tenantKey: tenant }) : settings.some(setting => setting.enabled);
      return { restricted, response: restricted ? siteAccessErrorResponse("SITE_RESTRICTED", 503) : null };
    }
    const fixedViewTenant = url.pathname === "/api/municipal-notification-options" ? "lg"
      : url.pathname === "/api/university-notification-options" ? "univ" : null;
    const site = fixedViewTenant ? { kind: "tenant" as const, tenantKey: fixedViewTenant as "lg" | "univ" } : resolvePublicSite(url.host, env);
    const restricted = siteIsRestricted(settings, site);
    if (!restricted) return { restricted, response: null };
    if (await hasSiteAccessSession(readAccessCookie(request.headers, url), site, url.hostname, environment, settings, options.store, options.now)) return { restricted, response: null };
    if (isPublicNavigation(request, url)) {
      const destination = new URL("/access", url);
      destination.searchParams.set("returnTo", safePublicReturnTo(url.pathname + url.search));
      return { restricted, response: new Response(null, { status: 307, headers: { Location: destination.href,
        "Cache-Control": SITE_ACCESS_CACHE_CONTROL, "X-Robots-Tag": X_ROBOTS_TAG_VALUE } }) };
    }
    return { restricted, response: siteAccessErrorResponse("SITE_ACCESS_REQUIRED", 401) };
  } catch {
    return { restricted: true, response: siteAccessErrorResponse("SITE_ACCESS_UNAVAILABLE", 503) };
  }
}
