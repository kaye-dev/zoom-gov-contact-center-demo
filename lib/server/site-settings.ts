import { cache } from "react";

import {
  SITE_LOCALES,
  fromDatabaseSiteLocale,
  isDatabaseSiteLocale,
  toDatabaseSiteLocale,
  type AiContactDestination,
  type ContactSettings,
  type LanguageSetting,
  type LanguageSettings,
  type SiteLocale,
} from "@/lib/site-settings";

import { prisma } from "./prisma";

const SITE_CONTACT_SETTING_ID = 1;

export const getContactSettings = cache(
  async (): Promise<ContactSettings> => {
    const [representativePhone, destinationRows] = await Promise.all([
      prisma.siteContactSetting.findUnique({
        where: { id: SITE_CONTACT_SETTING_ID },
        select: {
          representativePhoneDisplay: true,
          representativePhoneE164: true,
        },
      }),
      prisma.localizedAiContactSetting.findMany({
        select: {
          locale: true,
          aiPhoneE164: true,
          virtualAgentCampaignUrl: true,
        },
      }),
    ]);

    if (!representativePhone) {
      throw new Error("Site contact settings have not been initialized.");
    }

    const destinations = buildDestinationRecord(destinationRows);

    return {
      representativePhone: {
        display: representativePhone.representativePhoneDisplay,
        e164: representativePhone.representativePhoneE164,
      },
      destinations,
    };
  },
);

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

export async function saveContactSettings(
  settings: ContactSettings,
): Promise<ContactSettings> {
  await prisma.$transaction(async (transaction) => {
    await transaction.siteContactSetting.upsert({
      where: { id: SITE_CONTACT_SETTING_ID },
      create: {
        id: SITE_CONTACT_SETTING_ID,
        representativePhoneDisplay: settings.representativePhone.display,
        representativePhoneE164: settings.representativePhone.e164,
      },
      update: {
        representativePhoneDisplay: settings.representativePhone.display,
        representativePhoneE164: settings.representativePhone.e164,
      },
    });

    for (const locale of SITE_LOCALES) {
      const destination = settings.destinations[locale];
      await transaction.localizedAiContactSetting.upsert({
        where: { locale: toDatabaseSiteLocale(locale) },
        create: {
          locale: toDatabaseSiteLocale(locale),
          aiPhoneE164: destination.aiPhoneE164,
          virtualAgentCampaignUrl: destination.virtualAgentCampaignUrl,
        },
        update: {
          aiPhoneE164: destination.aiPhoneE164,
          virtualAgentCampaignUrl: destination.virtualAgentCampaignUrl,
        },
      });
    }
  });

  return settings;
}

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

function buildDestinationRecord(
  rows: Array<{
    locale: string;
    aiPhoneE164: string | null;
    virtualAgentCampaignUrl: string | null;
  }>,
): Record<SiteLocale, AiContactDestination> {
  if (rows.length !== SITE_LOCALES.length) {
    throw new Error("Localized AI contact settings have not been initialized.");
  }

  const destinations = {} as Record<SiteLocale, AiContactDestination>;
  const locales: SiteLocale[] = [];

  for (const row of rows) {
    if (!isDatabaseSiteLocale(row.locale)) {
      throw new Error(`Unsupported database locale: ${row.locale}`);
    }

    const locale = fromDatabaseSiteLocale(row.locale);
    locales.push(locale);
    destinations[locale] = {
      aiPhoneE164: row.aiPhoneE164,
      virtualAgentCampaignUrl: row.virtualAgentCampaignUrl,
    };
  }

  assertEveryLocaleIsPresent(locales);
  return destinations;
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
