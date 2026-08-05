import { getCurrentSession } from '@/lib/server/auth/server';
import { getPhoneSettings } from '@/lib/server/phone-settings';

import { FooterClient } from './FooterClient';

export async function Footer() {
  const [session, phoneSettings] = await Promise.all([
    getCurrentSession(),
    getPhoneSettings(),
  ]);

  return (
    <FooterClient
      isSignedIn={Boolean(session)}
      representativePhone={phoneSettings.representativePhone}
    />
  );
}
