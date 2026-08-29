import type { Metadata } from 'next';

import { DisasterPreventionRadioView } from '../../../components/DisasterPreventionRadioView';
import { defaultLocale, dictionaries } from '../../../i18n/dictionaries';

const dictionary = dictionaries[defaultLocale];
const pageCopy = dictionary.contentPages.disasterRadio;

export const metadata: Metadata = {
  title: `${pageCopy.title} | ${dictionary.cityName}`,
  description: pageCopy.lead,
};

export default function DisasterPreventionRadioPage() {
  return <DisasterPreventionRadioView />;
}
