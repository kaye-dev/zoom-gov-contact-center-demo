import type { Metadata } from "next";

import { FaqIndexView } from "../../components/FaqPageViews";
import { getRequestDictionary } from "../../i18n/server-dictionary";
import { getFaqIndexData } from "../../../lib/faq-content";

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getRequestDictionary();
  const title = dictionary.findInfo.lifeInfo.items.faq;

  return {
    title: `${title} | ${dictionary.siteName}`,
    description: dictionary.contentPages.faq.indexLead,
  };
}

export default function FrequentlyAskedQuestionsPage() {
  return <FaqIndexView data={getFaqIndexData()} />;
}
