import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import {
  MAINTENANCE_REWRITE_HEADER,
  MAINTENANCE_REWRITE_HEADER_VALUE,
} from "@/lib/maintenance-request";
import { NOINDEX_ROBOTS_METADATA } from "@/lib/search-indexing";
import { getLanguageSettings } from "@/lib/server/site-settings";
import { getRequestTenant } from "@/lib/server/tenant";
import {
  DEFAULT_SITE_LOCALE,
  SITE_LOCALES,
  toHtmlLanguageTag,
} from "@/lib/site-settings";
import "./globals.css";
import { ThemeSync } from "./components/ThemeSync";
import { LanguageProvider } from "./i18n/LanguageProvider";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();

  return {
    title: tenant.metadata.title,
    description: tenant.metadata.description,
    robots: NOINDEX_ROBOTS_METADATA,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const tenant = await getRequestTenant();
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
      data-tenant={tenant.key}
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
        <LanguageProvider
          availableLocales={availableLocales}
          tenantKey={tenant.key}
        >
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
