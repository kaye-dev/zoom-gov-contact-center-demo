import type { Metadata } from "next";

import { FaqIndexView } from "../../components/FaqPageViews";
import { defaultLocale, dictionaries } from "../../i18n/dictionaries";
import { getFaqIndexData } from "../../../lib/faq-content";

const dictionary = dictionaries[defaultLocale];
const title = dictionary.findInfo.lifeInfo.items.faq;

export const metadata: Metadata = {
  title: `${title} | ${dictionary.cityName}`,
  description: dictionary.contentPages.faq.indexLead,
};

export default function FrequentlyAskedQuestionsPage() {
  return <FaqIndexView data={getFaqIndexData()} />;
}
