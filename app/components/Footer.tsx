import { getCurrentSession } from '@/lib/server/auth/server';

import { FooterClient } from './FooterClient';

export async function Footer() {
  const session = await getCurrentSession();

  return <FooterClient isSignedIn={Boolean(session)} />;
}
