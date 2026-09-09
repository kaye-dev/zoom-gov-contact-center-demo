import { cache } from "react";

import type { ChatSettings } from "@/lib/chat-settings";
import type { PrismaClient } from "@/lib/generated/prisma/client";

import type { TenantKey } from "@/lib/tenants";

import { withPrisma } from "./prisma";

export const getChatSettings = cache(
  async (tenantKey: TenantKey): Promise<ChatSettings> => {
    return withPrisma(async (prisma) => {
      const setting = await prisma.siteChatSetting.findUnique({
        where: { siteKey: tenantKey },
        select: {
          activeMode: true,
          campaignWebTag: true,
          campaignMemo: true,
          contactCenterEntryIdWebTag: true,
          contactCenterEntryIdMemo: true,
        },
      });

      if (!setting) {
        throw new Error("Site chat settings have not been initialized.");
      }

      return setting;
    });
  },
);

export async function saveChatSettings(
  prisma: PrismaClient,
  tenantKey: TenantKey,
  settings: ChatSettings,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.siteChatSetting.upsert({
      where: { siteKey: tenantKey },
      create: {
        siteKey: tenantKey,
        activeMode: settings.activeMode,
        campaignWebTag: settings.campaignWebTag,
        campaignMemo: settings.campaignMemo,
        contactCenterEntryIdWebTag: settings.contactCenterEntryIdWebTag,
        contactCenterEntryIdMemo: settings.contactCenterEntryIdMemo,
      },
      update: {
        activeMode: settings.activeMode,
        campaignWebTag: settings.campaignWebTag,
        campaignMemo: settings.campaignMemo,
        contactCenterEntryIdWebTag: settings.contactCenterEntryIdWebTag,
        contactCenterEntryIdMemo: settings.contactCenterEntryIdMemo,
      },
    });
  });
}
