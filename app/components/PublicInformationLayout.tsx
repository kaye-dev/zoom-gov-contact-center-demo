import type { ReactNode } from 'react';

import { Footer } from './Footer';
import { Header } from './Header';
import { ZoomWebChatLauncher } from './ZoomWebChatLauncher';

export async function PublicInformationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <ZoomWebChatLauncher />
    </div>
  );
}
