import type { PrismaClient } from "@/lib/generated/prisma/client";
import { fields, record, stringValue, phoneValue, whole, OutreachContractError } from "@/lib/zaad/outreach-contracts";
import { outreachWhere, requireOutreachDepartment, type OutreachScope } from "../outreach-scope";
import { databaseError } from "../outreach-data";
import { writeZaadAudit } from "../audit";
export async function listCallerNotices(db: PrismaClient, scope: OutreachScope) {
  if (scope.siteKey !== "lg") throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, items: await db.municipalCallerNotice.findMany({ where: outreachWhere(scope), orderBy: { departmentKey: "asc" } }) };
}
export async function saveCallerNotice(db: PrismaClient, scope: OutreachScope, payload: unknown) {
  if (scope.siteKey !== "lg") throw new OutreachContractError("NOT_FOUND", 404);
  const v = record(payload); fields(v, ["departmentKey", "callerPhone", "officeUrl", "version", "publicationConfirmed"]);
  const departmentKey = stringValue(v.departmentKey), callerPhone = phoneValue(v.callerPhone), officeUrl = stringValue(v.officeUrl, 500), version = whole(v.version, 0);
  requireOutreachDepartment(scope, departmentKey);
  let url: URL; try { url = new URL(officeUrl); } catch { throw new OutreachContractError("INVALID_OFFICE_URL"); }
  if (url.protocol !== "https:" || url.username || url.password || v.publicationConfirmed !== true) throw new OutreachContractError("PUBLICATION_CONFIRMATION_REQUIRED");
  try {
    return await db.$transaction(async tx => {
      const current = await tx.municipalCallerNotice.findUnique({ where: { siteKey_departmentKey: { siteKey: scope.siteKey, departmentKey } } });
      if ((current?.version ?? 0) !== version) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const data = { callerPhone, officeUrl: url.href, approvedBy: scope.actorId, publishedAt: new Date() };
      const notice = current ? await tx.municipalCallerNotice.update({ where: { id: current.id, version }, data: { ...data, version: { increment: 1 } } }) : await tx.municipalCallerNotice.create({ data: { ...data, siteKey: scope.siteKey, departmentKey } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "caller-notice", targetId: notice.id, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["callerPhone", "officeUrl", "publishedAt"] });
      return { tenantKey: scope.siteKey, notice };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
