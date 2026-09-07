import { consultationServices } from "@/lib/online-consultation-catalog";
import "server-only";
import { withPrisma } from "@/lib/server/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { type OnlineConsultationSetting } from "@/lib/online-consultation-settings";
import type { OnlineConsultationSettingsInput } from "@/lib/online-consultation-settings";
import type { TenantKey } from "@/lib/tenants";

export async function getOnlineConsultationSettings(
  siteKey: TenantKey,
): Promise<OnlineConsultationSetting[]> {
  const rows = await withPrisma((prisma) =>
    prisma.siteOnlineConsultationSetting.findMany({ where: { siteKey } }),
  );
  return consultationServices(siteKey).map((serviceKey) => {
    const row = rows.find((candidate) => candidate.serviceKey === serviceKey);
    return {
      serviceKey,
      enabled: row?.enabled ?? false,
      webClientTag: row?.webClientTag ?? null,
      queueId: row?.queueId ?? null,
      memo: row?.memo ?? "",
    };
  });
}

export async function saveOnlineConsultationSettings(
  prisma: PrismaClient,
  siteKey: TenantKey,
  input: OnlineConsultationSettingsInput,
): Promise<void> {
  await prisma.$transaction(
    input.services.map(({ serviceKey, webClientTag, memo }) =>
      prisma.siteOnlineConsultationSetting.upsert({
        where: { siteKey_serviceKey: { siteKey, serviceKey } },
        create: {
          siteKey,
          serviceKey,
          enabled: true,
          webClientTag,
          ...(memo === undefined ? {} : { memo }),
        },
        update: {
          enabled: true,
          webClientTag,
          ...(memo === undefined ? {} : { memo }),
        },
      }),
    ),
  );
}
