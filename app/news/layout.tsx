import type { ReactNode } from 'react';

import { PublicInformationLayout } from '../components/PublicInformationLayout';

export default function NewsLayout({ children }: { children: ReactNode }) {
  return <PublicInformationLayout>{children}</PublicInformationLayout>;
}
