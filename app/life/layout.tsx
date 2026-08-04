import type { ReactNode } from 'react';

import { PublicInformationLayout } from '../components/PublicInformationLayout';

export default function LifeLayout({ children }: { children: ReactNode }) {
  return <PublicInformationLayout>{children}</PublicInformationLayout>;
}
