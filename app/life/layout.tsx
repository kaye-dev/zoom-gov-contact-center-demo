import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getRequestTenant } from '@/lib/server/tenant';

import { PublicInformationLayout } from '../components/PublicInformationLayout';

export default async function LifeLayout({ children }: { children: ReactNode }) {
  if ((await getRequestTenant()).features.universityPortal) notFound();
  return <PublicInformationLayout>{children}</PublicInformationLayout>;
}
