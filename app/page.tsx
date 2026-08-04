import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FindInfo } from './components/FindInfo';
import { HomeHeading } from './components/HomeHeading';
import { News } from './components/News';
import { ZoomWebChatLauncher } from './components/ZoomWebChatLauncher';
import { getPhoneSettings } from '@/lib/server/phone-settings';

export default async function Home() {
  const phoneSettings = await getPhoneSettings();

  return (
    <div className="">
      <Header />
      <main className="">
        <HomeHeading />
        <FindInfo aiPhoneNumbers={phoneSettings.aiPhoneNumbers} />
        <News />
      </main>
      <Footer />
      <ZoomWebChatLauncher />
    </div>
  );
}
