import type { Metadata } from "next";

import { FaqIndexView } from "../../components/FaqPageViews";
import { getRequestDictionary } from "../../i18n/server-dictionary";
import { getFaqIndexData } from "../../../lib/faq-content";
import { getRequestTenant } from "../../../lib/server/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getRequestDictionary();
  const title = dictionary.findInfo.lifeInfo.items.faq;

  return {
    title: `${title} | ${dictionary.siteName}`,
    description: dictionary.contentPages.faq.indexLead,
  };
}

export default async function FrequentlyAskedQuestionsPage() {
  const tenant = await getRequestTenant();

  return <FaqIndexView data={getFaqIndexData(tenant.key)} />;
}
