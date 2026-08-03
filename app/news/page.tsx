import type { Metadata } from 'next';

import { NewsIndexView } from '../components/InformationPageViews';
import { defaultLocale, dictionaries } from '../i18n/dictionaries';

export const metadata: Metadata = {
  title: `${dictionaries[defaultLocale].contentPages.newsIndexTitle} | ${dictionaries[defaultLocale].cityName}`,
  description: dictionaries[defaultLocale].contentPages.newsIndexLead,
};

export default function NewsIndexPage() {
  return <NewsIndexView />;
}
