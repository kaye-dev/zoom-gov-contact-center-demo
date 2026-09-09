import type { Metadata } from 'next';

import { DisasterPreventionRadioView } from '../../../components/DisasterPreventionRadioView';
import { getRequestDictionary } from '../../../i18n/server-dictionary';

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getRequestDictionary();
  const pageCopy = dictionary.contentPages.disasterRadio;

  return {
    title: `${pageCopy.title} | ${dictionary.siteName}`,
    description: pageCopy.lead,
  };
}

export default function DisasterPreventionRadioPage() {
  return <DisasterPreventionRadioView />;
}
