import type { MetadataRoute } from "next";

import { buildPublicSitemap } from "@/lib/search-indexing";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildPublicSitemap();
}
