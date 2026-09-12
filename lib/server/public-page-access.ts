import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PUBLIC_REQUEST_PATH_HEADER, PUBLIC_REQUEST_METHOD_HEADER, PUBLIC_REQUEST_PROTOCOL_HEADER } from "@/lib/site-access";
import { resolvePublicSite, safePublicReturnTo } from "@/lib/public-site-routing";
import { normalizeRequestHostname } from "@/lib/hostname";
import { requirePublicAccess } from "./public-access-gate";

/** Cached within one render only. The Proxy overwrites the original path headers. */
export const getPublicPageContext = cache(async () => {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  if (!host || !normalizeRequestHostname(host)) throw new Error("Invalid request host");
  const rawPath = requestHeaders.get(PUBLIC_REQUEST_PATH_HEADER) ?? "/";
  const protocol = requestHeaders.get(PUBLIC_REQUEST_PROTOCOL_HEADER) === "http:" ? "http:" : "https:";
  const url = new URL(rawPath.startsWith("/") && !rawPath.startsWith("//") ? rawPath : "/", `${protocol}//${host}`);
  const site = resolvePublicSite(host);
  return { requestHeaders, host, url, site, neutral: url.pathname === "/access" || (site.kind === "entry" && !/^\/admin(?:\/|$)/u.test(url.pathname)) };
});

export const requirePublicPageAccess = cache(async () => {
  const context = await getPublicPageContext();
  const headers = new Headers(context.requestHeaders);
  headers.set("accept", "text/html");
  const url = new URL(context.url);
  const method = headers.get(PUBLIC_REQUEST_METHOD_HEADER) ?? "GET";
  const result = await requirePublicAccess(new Request(url, { headers, method }));
  if (result.response) {
    if (result.response.status === 307 || result.response.status === 401) redirect(`/access?returnTo=${encodeURIComponent(safePublicReturnTo(url.pathname + url.search))}`);
    // Proxy normally returns the 503 first. A direct server render must not
    // continue with protected children after an unavailable access store.
    throw new Error("Site access unavailable");
  }
  return context;
});
