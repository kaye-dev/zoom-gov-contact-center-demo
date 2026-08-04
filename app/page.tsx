import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FindInfo } from './components/FindInfo';
import { HomeHeading } from './components/HomeHeading';
import { News } from './components/News';
import { getContactSettings } from '@/lib/server/site-settings';

export default async function Home() {
  const contactSettings = await getContactSettings();

  return (
    <div className="">
      <Header />
      <main className="">
        <HomeHeading />
        <FindInfo destinations={contactSettings.destinations} />
        <News />
      </main>
      <Footer />
    </div>
  );
}
