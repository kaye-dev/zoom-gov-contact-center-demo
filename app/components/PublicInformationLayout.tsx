import type { ReactNode } from 'react';

import { Footer } from './Footer';
import { Header } from './Header';

export async function PublicInformationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
