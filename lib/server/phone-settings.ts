import { cache } from "react";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { PhoneSettings } from "@/lib/phone-settings";
import {
  SITE_LOCALES,
  fromDatabaseSiteLocale,
  isDatabaseSiteLocale,
  toDatabaseSiteLocale,
  type SiteLocale,
} from "@/lib/site-settings";

import { withPrisma } from "./prisma";

const SITE_PHONE_SETTING_ID = 1;

export const getPhoneSettings = cache(async (): Promise<PhoneSettings> => {
  return withPrisma(async (prisma) => {
    const [sitePhoneSetting, localizedRows] = await Promise.all([
      prisma.sitePhoneSetting.findUnique({
        where: { id: SITE_PHONE_SETTING_ID },
        select: {
          representativePhoneDisplay: true,
          representativePhoneE164: true,
        },
      }),
      prisma.localizedAiPhoneSetting.findMany({
        select: {
          locale: true,
          aiPhoneE164: true,
        },
      }),
    ]);

    if (!sitePhoneSetting) {
      throw new Error("Site phone settings have not been initialized.");
    }

    return {
      representativePhone: {
        display: sitePhoneSetting.representativePhoneDisplay,
        e164: sitePhoneSetting.representativePhoneE164,
      },
      aiPhoneNumbers: buildAiPhoneNumberRecord(localizedRows),
    };
  });
});

export async function savePhoneSettings(
  prisma: PrismaClient,
  settings: PhoneSettings,
): Promise<PhoneSettings> {
  await prisma.$transaction(async (transaction) => {
    await transaction.sitePhoneSetting.upsert({
      where: { id: SITE_PHONE_SETTING_ID },
      create: {
        id: SITE_PHONE_SETTING_ID,
        representativePhoneDisplay: settings.representativePhone.display,
        representativePhoneE164: settings.representativePhone.e164,
      },
      update: {
        representativePhoneDisplay: settings.representativePhone.display,
        representativePhoneE164: settings.representativePhone.e164,
      },
    });

    for (const locale of SITE_LOCALES) {
      const databaseLocale = toDatabaseSiteLocale(locale);
      const aiPhoneE164 = settings.aiPhoneNumbers[locale];

      await transaction.localizedAiPhoneSetting.upsert({
        where: { locale: databaseLocale },
        create: { locale: databaseLocale, aiPhoneE164 },
        update: { aiPhoneE164 },
      });
    }
  });

  return settings;
}

function buildAiPhoneNumberRecord(
  rows: Array<{ locale: string; aiPhoneE164: string | null }>,
): Record<SiteLocale, string | null> {
  if (rows.length !== SITE_LOCALES.length) {
    throw new Error("Localized AI phone settings have not been initialized.");
  }

  const aiPhoneNumbers = {} as Record<SiteLocale, string | null>;
  const locales = new Set<SiteLocale>();

  for (const row of rows) {
    if (!isDatabaseSiteLocale(row.locale)) {
      throw new Error(`Unsupported database locale: ${row.locale}`);
    }

    const locale = fromDatabaseSiteLocale(row.locale);
    if (locales.has(locale)) {
      throw new Error(`Duplicate localized AI phone setting: ${locale}`);
    }

    locales.add(locale);
    aiPhoneNumbers[locale] = row.aiPhoneE164;
  }

  if (SITE_LOCALES.some((locale) => !locales.has(locale))) {
    throw new Error("Localized AI phone settings are incomplete.");
  }

  return aiPhoneNumbers;
}
