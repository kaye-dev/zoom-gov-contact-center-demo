import type { PrismaClient } from "@/lib/generated/prisma/client";

import {
  MaintenanceStoreWriteError,
  isValidMaintenanceStoreUpdate,
  parseMaintenanceStoreRow,
  toMaintenanceDatabaseEnvironment,
  type MaintenanceStoreUpdate,
  type MaintenanceStoreWriteResult,
} from "./maintenance-store";

export type MaintenancePrismaClient = Pick<
  PrismaClient,
  "siteMaintenanceSetting"
>;

export async function writeMaintenanceSettingWithPrisma(
  prisma: MaintenancePrismaClient,
  update: MaintenanceStoreUpdate,
): Promise<MaintenanceStoreWriteResult> {
  if (!isValidMaintenanceStoreUpdate(update)) {
    throw new MaintenanceStoreWriteError();
  }

  try {
    const rows = await prisma.siteMaintenanceSetting.updateManyAndReturn({
      where: {
        environment: toMaintenanceDatabaseEnvironment(update.environment),
        revision: update.expectedRevision,
        schemaVersion: 1,
      },
      data: {
        mode: update.mode,
        ...(update.mode === "SCHEDULED"
          ? {
              scheduledStartAt: new Date(update.scheduledStartAt),
              scheduledEndAt: new Date(update.scheduledEndAt),
            }
          : {}),
        revision: { increment: 1 },
        updatedAt: new Date(update.updatedAt),
      },
      select: {
        environment: true,
        schemaVersion: true,
        mode: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        revision: true,
        updatedAt: true,
      },
    });

    if (rows.length === 0) {
      const existing = await prisma.siteMaintenanceSetting.findUnique({
        where: {
          environment: toMaintenanceDatabaseEnvironment(update.environment),
        },
        select: { environment: true },
      });
      if (existing === null) throw new MaintenanceStoreWriteError();

      return { status: "CONFLICT" };
    }
    if (rows.length !== 1) throw new MaintenanceStoreWriteError();

    const { schemaVersion, ...row } = rows[0];
    const setting = parseMaintenanceStoreRow({
      ...row,
      version: schemaVersion,
    });
    if (setting === null || setting.environment !== update.environment) {
      throw new MaintenanceStoreWriteError();
    }

    return { status: "UPDATED", setting };
  } catch (error) {
    if (error instanceof MaintenanceStoreWriteError) throw error;
    throw new MaintenanceStoreWriteError();
  }
}
