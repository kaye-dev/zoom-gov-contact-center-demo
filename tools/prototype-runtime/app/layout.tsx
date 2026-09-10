import type { ReactNode } from "react";
import { PrototypeProviders } from "../PrototypeProviders";
import config from "../preview-config.json";
import "./globals.css";

export default function PrototypeLayout({ children }: { children: ReactNode }) {
  const initialize = `try{localStorage.setItem('theme',${JSON.stringify(config.theme)});localStorage.setItem('locale',${JSON.stringify(config.locale)})}catch{}`;
  return (
    <html lang="ja" data-tenant={config.tenant} className="theme-loading language-loading scheme-light h-full antialiased dark:scheme-dark" suppressHydrationWarning>
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <script dangerouslySetInnerHTML={{ __html: initialize }} />
        <script id="theme-init" async blocking="render" src="/theme-init.js?review=1" />
      </head>
      <body className="min-h-full flex flex-col">
        <PrototypeProviders>{children}</PrototypeProviders>
      </body>
    </html>
  );
}
