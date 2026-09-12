import { readSiteAccessSettings, siteAccessEnvironment } from "@/lib/server/site-access-settings";
import { resolvePublicSite } from "@/lib/public-site-routing";
import { normalizeRequestHostname } from "@/lib/hostname";
import { siteIsRestricted } from "@/lib/site-access";
import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { buildRobotsForHost } from "@/lib/search-indexing";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  try {
    const settings = await readSiteAccessSettings(siteAccessEnvironment(normalizeRequestHostname(host) ?? ""));
    if (siteIsRestricted(settings, resolvePublicSite(host))) return { rules: { userAgent: "*", disallow: "/" } };
  } catch { return { rules: { userAgent: "*", disallow: "/" } }; }
  return buildRobotsForHost(host);
}
