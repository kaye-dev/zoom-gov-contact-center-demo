import { getPublicPageContext, requirePublicPageAccess } from "@/lib/server/public-page-access";
import { siteAccessDictionaries } from "./i18n/site-access";
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
  const context = await getPublicPageContext();
  if (context.neutral) {
    const copy = siteAccessDictionaries[DEFAULT_SITE_LOCALE];
    return { title: context.url.pathname === "/access" ? copy.gate.title : copy.frame.title, description: copy.frame.footer, robots: NOINDEX_ROBOTS_METADATA, icons: { icon: { url: "/favicons/demo.svg", type: "image/svg+xml", sizes: "any" } } };
  }
  const tenant = await getRequestTenant();

  return {
    title: tenant.metadata.title,
    description: tenant.metadata.description,
    robots: NOINDEX_ROBOTS_METADATA,
    icons: { icon: { url: `/favicons/${tenant.key}.svg`, type: "image/svg+xml", sizes: "any" } },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const context = await requirePublicPageAccess();
  const tenant = context.neutral ? null : await getRequestTenant();
  const isMaintenanceRewrite =
    requestHeaders.get(MAINTENANCE_REWRITE_HEADER) ===
    MAINTENANCE_REWRITE_HEADER_VALUE;
  let availableLocales: readonly (typeof SITE_LOCALES)[number][] = SITE_LOCALES;
  const reviewThemeEnabled = process.env.NODE_ENV !== "production";

  if (!isMaintenanceRewrite && tenant) {
    await connection();
    const languageSettings = await getLanguageSettings(tenant.key);
    availableLocales = languageSettings.locales
      .filter(({ locale, enabled }) => enabled || locale === "ja")
      .map(({ locale }) => locale);
  }

  return (
    <html
      lang={toHtmlLanguageTag(DEFAULT_SITE_LOCALE)}
      data-tenant={tenant?.key}
      className="theme-loading language-loading scheme-light h-full antialiased dark:scheme-dark"
      suppressHydrationWarning
    >
      <head>
        <script
          id="theme-init"
          async
          blocking="render"
          src={reviewThemeEnabled ? "/theme-init.js?review=1" : "/theme-init.js"}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        <LanguageProvider
          availableLocales={availableLocales}
          tenantKey={tenant?.key ?? "lg"}
        >
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
