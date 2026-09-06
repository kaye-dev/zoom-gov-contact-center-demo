import "server-only";
import { withPrisma } from "@/lib/server/prisma";
import { UNIVERSITY_CONSULTATION_SERVICES, type OnlineConsultationSetting } from "@/lib/online-consultation-settings";

export async function getOnlineConsultationSettings(siteKey: string): Promise<OnlineConsultationSetting[]> {
  const rows = await withPrisma((prisma) =>
    prisma.siteOnlineConsultationSetting.findMany({ where: { siteKey } }),
  );
  return UNIVERSITY_CONSULTATION_SERVICES.map((serviceKey) => {
    const row = rows.find((candidate) => candidate.serviceKey === serviceKey);
    return { serviceKey, enabled: row?.enabled ?? false, webClientTag: row?.webClientTag ?? null, queueId: row?.queueId ?? null };
  });
}
