import type { Metadata } from 'next';

import { NewsIndexView } from '../components/InformationPageViews';
import { getRequestDictionary } from '../i18n/server-dictionary';

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getRequestDictionary();

  return {
    title: `${dictionary.contentPages.newsIndexTitle} | ${dictionary.siteName}`,
    description: dictionary.contentPages.newsIndexLead,
  };
}

export default function NewsIndexPage() {
  return <NewsIndexView />;
}
