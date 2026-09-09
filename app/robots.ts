import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { buildRobotsForHost } from "@/lib/search-indexing";

export default async function robots(): Promise<MetadataRoute.Robots> {
  return buildRobotsForHost((await headers()).get("host"));
}
