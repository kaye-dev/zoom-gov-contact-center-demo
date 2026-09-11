import type { AdminAccessActor } from "@/lib/admin-access/types";
import { evaluateAdminAccess } from "@/lib/admin-access/authorization";
import type { TenantKey } from "@/lib/tenants";
import { OutreachContractError } from "@/lib/zaad/outreach-contracts";
import { outreachTenants, type Database } from "./university/permissions";

export type OutreachScope = { siteKey: TenantKey; actorId: string; all: boolean; live: boolean };
export async function resolveOutreachScope(db: Database, actor: AdminAccessActor, siteKey: TenantKey): Promise<OutreachScope> {
  if (!(await outreachTenants(db, actor)).includes(siteKey)) throw new OutreachContractError("ADMIN_ACCESS_DENIED", 403);
  const access = evaluateAdminAccess(actor, "zaad", "VIEW");
  const grant = await db.outreachTenantGrant.findUnique({ where: { siteKey_userId: { siteKey, userId: actor.id } } });
  return { siteKey, actorId: actor.id, all: access.allowSources.some(role => role.systemKey === "FULL_ACCESS"), live: Boolean(grant?.liveExecution) };
}
export const outreachWhere = (scope: OutreachScope) => ({ siteKey: scope.siteKey });
export function requireFullAccess(scope: OutreachScope) { if (!scope.all) throw new OutreachContractError("FULL_ACCESS_REQUIRED", 403); }
