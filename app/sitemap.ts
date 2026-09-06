import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { buildPublicSitemap } from "@/lib/search-indexing";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildPublicSitemap(process.env, (await headers()).get("host"));
}
