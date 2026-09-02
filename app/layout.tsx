import type { Metadata } from "next";
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
  const reviewThemeEnabled = process.env.NODE_ENV !== "production";

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
      <head>
        <script
          id="theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var q=${reviewThemeEnabled ? "new URLSearchParams(location.search).getAll('theme')" : "[]"};var l=location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.hostname==='[::1]';var r=l&&q.length===1&&(q[0]==='dark'||q[0]==='light')?q[0]:null;var t=r||localStorage.getItem('theme');var d=t==='dark';document.documentElement.classList.toggle('review-theme',r!==null);document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('light',!d);}catch(e){document.documentElement.classList.remove('review-theme','dark');document.documentElement.classList.add('light');}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        <LanguageProvider availableLocales={availableLocales}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
