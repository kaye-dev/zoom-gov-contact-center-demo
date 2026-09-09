import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { FindInfo } from './components/FindInfo';
import { HomeHeading } from './components/HomeHeading';
import { News } from './components/News';
import { ZoomWebChatLauncher } from './components/ZoomWebChatLauncher';
import { getPhoneSettings } from '@/lib/server/phone-settings';
import { getRequestTenant } from '@/lib/server/tenant';
import { UniversityPortal } from './tenants/univ/UniversityPortal';

export default async function Home() {
  const tenant = await getRequestTenant();
  if (tenant.features.universityPortal) {
    return <UniversityPortal page="home" />;
  }
  const phoneSettings = await getPhoneSettings(tenant.key);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <HomeHeading />
        <FindInfo aiPhoneNumbers={phoneSettings.aiPhoneNumbers} />
        <News />
      </main>
      <Footer />
      <ZoomWebChatLauncher />
    </div>
  );
}
