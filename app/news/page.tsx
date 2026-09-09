import type { Metadata } from "next";

import { NewsIndexView } from "../components/InformationPageViews";
import { getRequestDictionary } from "../i18n/server-dictionary";
import { getRequestTenant } from "@/lib/server/tenant";
import { UniversityPortal } from "@/app/tenants/univ/UniversityPortal";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  if (tenant.features.universityPortal) {
    return {
      title: `ニュース | ${tenant.metadata.shortName}`,
      description: tenant.metadata.description,
    };
  }
  const dictionary = await getRequestDictionary();

  return {
    title: `${dictionary.contentPages.newsIndexTitle} | ${dictionary.siteName}`,
    description: dictionary.contentPages.newsIndexLead,
  };
}

export default async function NewsIndexPage() {
  if ((await getRequestTenant()).features.universityPortal)
    return <UniversityPortal page="news" />;
  return <NewsIndexView />;
}
