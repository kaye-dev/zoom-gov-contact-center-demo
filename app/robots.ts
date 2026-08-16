import type { MetadataRoute } from "next";

import { resolveCanonicalOrigin } from "@/lib/search-indexing";

export default function robots(): MetadataRoute.Robots {
  const canonicalOrigin = resolveCanonicalOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${canonicalOrigin}/sitemap.xml`,
  };
}
