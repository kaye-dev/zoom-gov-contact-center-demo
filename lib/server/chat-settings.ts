import { cache } from "react";

import type { ChatSettings } from "@/lib/chat-settings";
import type { PrismaClient } from "@/lib/generated/prisma/client";

import { withPrisma } from "./prisma";

const SITE_CHAT_SETTING_ID = 1;

export const getChatSettings = cache(async (): Promise<ChatSettings> => {
  return withPrisma(async (prisma) => {
    const setting = await prisma.siteChatSetting.findUnique({
      where: { id: SITE_CHAT_SETTING_ID },
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
});

export async function saveChatSettings(
  prisma: PrismaClient,
  settings: ChatSettings,
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.siteChatSetting.upsert({
      where: { id: SITE_CHAT_SETTING_ID },
      create: {
        id: SITE_CHAT_SETTING_ID,
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
