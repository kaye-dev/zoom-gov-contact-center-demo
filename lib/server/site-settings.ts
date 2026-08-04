import { cache } from "react";

import {
  SITE_LOCALES,
  fromDatabaseSiteLocale,
  isDatabaseSiteLocale,
  toDatabaseSiteLocale,
  type LanguageSetting,
  type LanguageSettings,
  type SiteLocale,
} from "@/lib/site-settings";

import { prisma } from "./prisma";

export const getLanguageSettings = cache(
  async (): Promise<LanguageSettings> => {
    const rows = await prisma.localeDisplaySetting.findMany({
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
  },
);

export async function saveLanguageSettings(
  settings: LanguageSettings,
): Promise<LanguageSettings> {
  await prisma.$transaction(async (transaction) => {
    for (const [displayOrder, setting] of settings.locales.entries()) {
      const locale = toDatabaseSiteLocale(setting.locale);
      await transaction.localeDisplaySetting.upsert({
        where: { locale },
        create: {
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
