import { publicRequestUrl } from "@/lib/public-access-request";
import { resolvePublicSite, safePublicReturnTo } from "@/lib/public-site-routing";
import { SITE_ACCESS_CACHE_CONTROL } from "@/lib/site-access";
import { readSiteAccessSettings, SiteAccessError, siteAccessEnvironment } from "@/lib/server/site-access-settings";
import { accessAttemptIdentity, consumeAccessAttempt, isLocalHttp, issueSiteAccessSession, serializeAccessCookie } from "@/lib/server/site-access-session";
import { siteAccessErrorResponse } from "@/lib/server/public-access-gate";
import { boundedBody, requireSameOrigin } from "@/lib/server/zaad/outreach-api";
import { X_ROBOTS_TAG_VALUE } from "@/lib/search-indexing";
import type { SiteAccessStore } from "@/lib/server/site-access-store";

// The injected store keeps runtime tests on their own database, without replacing auth.
export async function verifySiteAccess(request: Request, store?: SiteAccessStore, now = new Date()) {
  try {
    const url = publicRequestUrl(request);
    try { requireSameOrigin(request); } catch { return siteAccessErrorResponse("INVALID_ORIGIN", 403); }
    if (url.protocol !== "https:" && !isLocalHttp(url)) return siteAccessErrorResponse("HTTPS_REQUIRED", 403);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return siteAccessErrorResponse("INVALID_REQUEST", 400);
    const environment = siteAccessEnvironment(url.hostname);
    await consumeAccessAttempt(environment, accessAttemptIdentity(request.headers), store, now);
    let input: unknown;
    try { input = JSON.parse(await boundedBody(request, 4096)); } catch { return siteAccessErrorResponse("INVALID_REQUEST", 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return siteAccessErrorResponse("INVALID_REQUEST", 400);
    const body = input as Record<string, unknown>;
    if (Object.keys(body).some(key => !["code", "returnTo"].includes(key)) || typeof body.code !== "string") return siteAccessErrorResponse("INVALID_REQUEST", 400);
    const settings = await readSiteAccessSettings(environment, store);
    const grant = await issueSiteAccessSession(body.code, resolvePublicSite(url.host), url.hostname, environment, settings, store, now);
    return Response.json({ redirectTo: safePublicReturnTo(body.returnTo) }, { headers: {
      "Set-Cookie": serializeAccessCookie(url, grant.token, grant.expiresAt, now),
      "Cache-Control": SITE_ACCESS_CACHE_CONTROL, "X-Robots-Tag": X_ROBOTS_TAG_VALUE,
    } });
  } catch (error) {
    if (error instanceof SiteAccessError) return siteAccessErrorResponse(error.code, error.status, error.retryAfter);
    return siteAccessErrorResponse("SITE_ACCESS_UNAVAILABLE", 503);
  }
}
