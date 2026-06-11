'use client';

import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FindInfo } from './components/FindInfo';
import { useI18n } from './i18n/LanguageProvider';

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="">
      <Header />
      <main className="">
        <h1 className="sr-only">{t.cityName}</h1>
        <FindInfo />
      </main>
      <Footer />
    </div>
  );
}
