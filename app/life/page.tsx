import type { Metadata } from 'next';

import { LifeIndexView } from '../components/InformationPageViews';
import { defaultLocale, dictionaries } from '../i18n/dictionaries';

export const metadata: Metadata = {
  title: `${dictionaries[defaultLocale].contentPages.lifeIndexTitle} | ${dictionaries[defaultLocale].cityName}`,
  description: dictionaries[defaultLocale].contentPages.lifeIndexLead,
};

export default function LifeIndexPage() {
  return <LifeIndexView />;
}
