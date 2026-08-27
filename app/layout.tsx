import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { connection } from "next/server";
import {
  MAINTENANCE_REWRITE_HEADER,
  MAINTENANCE_REWRITE_HEADER_VALUE,
} from "@/lib/maintenance-request";
import { NOINDEX_ROBOTS_METADATA } from "@/lib/search-indexing";
import { getLanguageSettings } from "@/lib/server/site-settings";
import {
  DEFAULT_SITE_LOCALE,
  SITE_LOCALES,
  toHtmlLanguageTag,
} from "@/lib/site-settings";
import "./globals.css";
import { ThemeSync } from "./components/ThemeSync";
import { LanguageProvider } from "./i18n/LanguageProvider";

export const metadata: Metadata = {
  title: "未来市公式ウェブサイト",
  description:
    "未来市の公式ウェブサイトです。くらしの手続き、子育て・教育、防災、ごみ・リサイクル、施設案内などの行政情報をご案内します。お困りのことは AI やお電話でご相談いただけます。",
  robots: NOINDEX_ROBOTS_METADATA,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const isMaintenanceRewrite =
    requestHeaders.get(MAINTENANCE_REWRITE_HEADER) ===
    MAINTENANCE_REWRITE_HEADER_VALUE;
  let availableLocales: readonly (typeof SITE_LOCALES)[number][] = SITE_LOCALES;

  if (!isMaintenanceRewrite) {
    await connection();
    const languageSettings = await getLanguageSettings();
    availableLocales = languageSettings.locales
      .filter(({ locale, enabled }) => enabled || locale === "ja")
      .map(({ locale }) => locale);
  }

  return (
    <html
      lang={toHtmlLanguageTag(DEFAULT_SITE_LOCALE)}
      className="theme-loading language-loading scheme-light h-full antialiased dark:scheme-dark"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark';document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('light',!d);}catch(e){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}})();`,
          }}
        />
        <ThemeSync />
        <LanguageProvider availableLocales={availableLocales}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
