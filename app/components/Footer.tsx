import { getCurrentSession } from '@/lib/server/auth/server';
import { getContactSettings } from '@/lib/server/site-settings';

import { FooterClient } from './FooterClient';

export async function Footer() {
  const [session, contactSettings] = await Promise.all([
    getCurrentSession(),
    getContactSettings(),
  ]);

  return (
    <FooterClient
      isSignedIn={Boolean(session)}
      representativePhone={contactSettings.representativePhone}
    />
  );
}
