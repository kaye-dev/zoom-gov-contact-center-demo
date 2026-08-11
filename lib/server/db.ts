import type {
  DemoRecord,
  PrismaClient,
} from "@/lib/generated/prisma/client";

export const MAX_DEMO_RECORD_MESSAGE_LENGTH = 500;

export async function ensureDatabase(prisma: PrismaClient) {
  await prisma.$queryRaw`SELECT 1`;
}

export async function listDemoRecords(
  prisma: PrismaClient,
): Promise<DemoRecord[]> {
  return prisma.demoRecord.findMany({
    orderBy: { id: "desc" },
    take: 50,
  });
}

export async function countDemoRecords(prisma: PrismaClient) {
  return prisma.demoRecord.count();
}

export async function createDemoRecord(
  prisma: PrismaClient,
  message: string,
): Promise<DemoRecord> {
  return prisma.demoRecord.create({
    data: { message },
  });
}
