import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FindInfo } from './components/FindInfo';
import { HomeHeading } from './components/HomeHeading';
import { News } from './components/News';
import { ZoomWebChatLauncher } from './components/ZoomWebChatLauncher';
import { getPhoneSettings } from '@/lib/server/phone-settings';
import { getRequestTenant } from '@/lib/server/tenant';

export default async function Home() {
  const tenant = await getRequestTenant();
  const phoneSettings = await getPhoneSettings(tenant.key);

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
