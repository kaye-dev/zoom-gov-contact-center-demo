import type { PrismaClient } from "@/lib/generated/prisma/client";
import { fields, record, whole, OutreachContractError } from "@/lib/zaad/outreach-contracts";
import type { OutreachScope } from "./outreach-scope";
import type { Database } from "./university/permissions";
import { databaseError } from "./outreach-data";
import { writeZaadAudit } from "./audit";
export async function getRegistrationReception(db: Database, siteKey: string) {
  const row = await db.zaadRegistrationSetting.findUnique({ where: { siteKey } });
  return { enabled: row?.publicRegistrationEnabled ?? true, version: row?.revision ?? 0 };
}
export async function saveRegistrationReception(db: PrismaClient, scope: OutreachScope, payload: unknown) {
  const value = record(payload); fields(value, ["enabled", "version"]);
  if (typeof value.enabled !== "boolean") throw new OutreachContractError("INVALID_REQUEST");
  const enabled = value.enabled, version = whole(value.version, 0);
  try {
    return await db.$transaction(async tx => {
      const current = await getRegistrationReception(tx, scope.siteKey);
      if (current.version !== version) throw new OutreachContractError("VERSION_CONFLICT", 409);
      if (version === 0) await tx.zaadRegistrationSetting.create({ data: { siteKey: scope.siteKey, publicRegistrationEnabled: enabled, updatedByUserId: scope.actorId } });
      else {
        const changed = await tx.zaadRegistrationSetting.updateMany({ where: { siteKey: scope.siteKey, revision: version }, data: { publicRegistrationEnabled: enabled, revision: { increment: 1 }, updatedByUserId: scope.actorId } });
        if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
      }
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "registration-setting", targetId: scope.siteKey, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["publicRegistrationEnabled"] });
      return { tenantKey: scope.siteKey, setting: await getRegistrationReception(tx, scope.siteKey) };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
