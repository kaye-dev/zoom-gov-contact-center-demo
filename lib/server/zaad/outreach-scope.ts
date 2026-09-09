import type { AdminAccessActor } from "@/lib/admin-access/types";
import { evaluateAdminAccess } from "@/lib/admin-access/authorization";
import type { TenantKey } from "@/lib/tenants";
import { OutreachContractError } from "@/lib/zaad/outreach-contracts";
import { MUNICIPAL_DEPARTMENTS } from "@/lib/zaad/municipal/contracts";
import { outreachTenants, universityScope, type Database } from "./university/permissions";
export type OutreachScope = { siteKey: TenantKey; actorId: string; departments: string[]; all: boolean; live: boolean };
export async function resolveOutreachScope(db: Database, actor: AdminAccessActor, siteKey: TenantKey): Promise<OutreachScope> {
  if (!(await outreachTenants(db, actor)).includes(siteKey)) throw new OutreachContractError("ADMIN_ACCESS_DENIED", 403);
  const access = evaluateAdminAccess(actor, "zaad", "VIEW");
  if (siteKey === "univ") return { ...await universityScope(db, siteKey, actor), siteKey, all: access.allowSources.some(role => role.systemKey === "FULL_ACCESS") };
  const grants = await db.universityZaadGrant.findMany({ where: { siteKey, userId: actor.id } });
  const all = access.allowSources.some(role => role.systemKey === "FULL_ACCESS");
  const grantedAll = grants.some(grant => grant.departmentKey === "ALL");
  const departments = all || grantedAll ? [...MUNICIPAL_DEPARTMENTS] : grants.length
    ? MUNICIPAL_DEPARTMENTS.filter(department => grants.some(grant => grant.departmentKey === department)) : ["resident-support"];
  if (!departments.length) throw new OutreachContractError("DEPARTMENT_ACCESS_DENIED", 403);
  return { siteKey, actorId: actor.id, departments, all, live: grants.some(grant => grant.liveExecution) };
}
export function requireOutreachDepartment(scope: OutreachScope, department: string) {
  if (!scope.departments.includes(department)) throw new OutreachContractError("NOT_FOUND", 404);
}
export const outreachWhere = (scope: OutreachScope) => ({ siteKey: scope.siteKey, departmentKey: { in: scope.departments } });
export function requireFullAccess(scope: OutreachScope) { if (!scope.all) throw new OutreachContractError("FULL_ACCESS_REQUIRED", 403); }
