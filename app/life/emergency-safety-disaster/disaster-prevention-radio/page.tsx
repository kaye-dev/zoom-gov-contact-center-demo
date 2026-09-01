import type { Metadata } from 'next';

import { DisasterPreventionRadioView } from '../../../components/DisasterPreventionRadioView';
import { defaultLocale, dictionaries } from '../../../i18n/dictionaries';

const dictionary = dictionaries[defaultLocale];
const pageCopy = dictionary.contentPages.disasterRadio;

export const metadata: Metadata = {
  title: `${pageCopy.title} | ${dictionary.cityName}`,
  description: pageCopy.lead,
};

export default async function DisasterPreventionRadioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const reviewState = process.env.NODE_ENV !== 'production' && typeof query.reviewState === 'string'
    ? query.reviewState
    : undefined;
  return <DisasterPreventionRadioView initialReviewState={reviewState} />;
}
