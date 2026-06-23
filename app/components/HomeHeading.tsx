'use client';

import { useI18n } from '../i18n/LanguageProvider';

export function HomeHeading() {
  const { t } = useI18n();

  return <h1 className="sr-only">{t.cityName}</h1>;
}
