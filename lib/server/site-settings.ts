import { cache } from "react";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  SITE_LOCALES,
  fromDatabaseSiteLocale,
  isDatabaseSiteLocale,
  toDatabaseSiteLocale,
  type LanguageSetting,
  type LanguageSettings,
  type SiteLocale,
} from "@/lib/site-settings";

import type { TenantKey } from "@/lib/tenants";

import { withPrisma } from "./prisma";

export const getLanguageSettings = cache(
  async (tenantKey: TenantKey): Promise<LanguageSettings> =>
    withPrisma(async (prisma) => {
    const rows = await prisma.localeDisplaySetting.findMany({
      where: { siteKey: tenantKey },
      orderBy: [{ displayOrder: "asc" }, { locale: "asc" }],
      select: {
        locale: true,
        enabled: true,
      },
    });

    if (rows.length !== SITE_LOCALES.length) {
      throw new Error("Locale display settings have not been initialized.");
    }

    const locales = rows.map(({ locale, enabled }): LanguageSetting => {
      if (!isDatabaseSiteLocale(locale)) {
        throw new Error(`Unsupported database locale: ${locale}`);
      }

      return {
        locale: fromDatabaseSiteLocale(locale),
        enabled,
      };
    });

    assertEveryLocaleIsPresent(locales.map(({ locale }) => locale));

      return { locales };
    }),
);

export async function saveLanguageSettings(
  prisma: PrismaClient,
  tenantKey: TenantKey,
  settings: LanguageSettings,
): Promise<LanguageSettings> {
  await prisma.$transaction(async (transaction) => {
    for (const [displayOrder, setting] of settings.locales.entries()) {
      const locale = toDatabaseSiteLocale(setting.locale);
      await transaction.localeDisplaySetting.upsert({
        where: { siteKey_locale: { siteKey: tenantKey, locale } },
        create: {
          siteKey: tenantKey,
          locale,
          enabled: setting.enabled,
          displayOrder,
        },
        update: {
          enabled: setting.enabled,
          displayOrder,
        },
      });
    }
  });

  return settings;
}

function assertEveryLocaleIsPresent(locales: SiteLocale[]) {
  const uniqueLocales = new Set(locales);
  if (
    uniqueLocales.size !== SITE_LOCALES.length ||
    SITE_LOCALES.some((locale) => !uniqueLocales.has(locale))
  ) {
    throw new Error("Site locale settings are incomplete.");
  }
}
