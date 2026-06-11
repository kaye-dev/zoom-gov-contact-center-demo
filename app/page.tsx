'use client';

import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { useI18n } from './i18n/LanguageProvider';

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="">
      <Header />
      <main className="">
        <h1>{t.cityName}</h1>
      </main>
      <Footer />
    </div>
  );
}
