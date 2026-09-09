import type {
  DemoRecord,
  PrismaClient,
} from "@/lib/generated/prisma/client";
import type { TenantKey } from "@/lib/tenants";

export const MAX_DEMO_RECORD_MESSAGE_LENGTH = 500;

export async function ensureDatabase(prisma: PrismaClient) {
  await prisma.$queryRaw`SELECT 1`;
}

export async function listDemoRecords(
  prisma: PrismaClient,
  tenantKey: TenantKey,
): Promise<DemoRecord[]> {
  return prisma.demoRecord.findMany({
    where: { siteKey: tenantKey },
    orderBy: { id: "desc" },
    take: 50,
  });
}

export async function countDemoRecords(
  prisma: PrismaClient,
  tenantKey: TenantKey,
) {
  return prisma.demoRecord.count({ where: { siteKey: tenantKey } });
}

export async function createDemoRecord(
  prisma: PrismaClient,
  tenantKey: TenantKey,
  message: string,
): Promise<DemoRecord> {
  return prisma.demoRecord.create({
    data: { siteKey: tenantKey, message },
  });
}
