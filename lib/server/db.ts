import type { DemoRecord } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/server/prisma";

export const MAX_DEMO_RECORD_MESSAGE_LENGTH = 500;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export async function ensureDatabase() {
  await prisma.$queryRaw`SELECT 1`;
}

export async function listDemoRecords(): Promise<DemoRecord[]> {
  return prisma.demoRecord.findMany({
    orderBy: { id: "desc" },
    take: 50,
  });
}

export async function countDemoRecords() {
  return prisma.demoRecord.count();
}

export async function createDemoRecord(message: string): Promise<DemoRecord> {
  return prisma.demoRecord.create({
    data: { message },
  });
}
