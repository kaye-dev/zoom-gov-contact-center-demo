import { getCurrentSession } from '@/lib/server/auth/server';
import { getRequestTenant } from '@/lib/server/tenant';
import { getPhoneSettings } from '@/lib/server/phone-settings';

import { FooterClient } from './FooterClient';

export async function Footer() {
  const tenant = await getRequestTenant();
  const [session, phoneSettings] = await Promise.all([
    getCurrentSession(),
    getPhoneSettings(tenant.key),
  ]);

  return (
    <FooterClient
      isSignedIn={Boolean(session)}
      representativePhone={phoneSettings.representativePhone}
    />
  );
}
