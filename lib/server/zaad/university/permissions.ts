import { evaluateAdminAccess } from "@/lib/admin-access/authorization";
import type { AdminAccessActor } from "@/lib/admin-access/types";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { OutreachError } from "@/lib/zaad/university/contracts";

export type Database = PrismaClient | Prisma.TransactionClient;
export type Scope = { siteKey: string; actorId: string; all: boolean; live: boolean };

export async function universityScope(db: Database, siteKey: string, actor: AdminAccessActor): Promise<Scope> {
  if (siteKey !== "univ") throw new OutreachError("NOT_FOUND", 404);
  const access = evaluateAdminAccess(actor, "zaad", "VIEW");
  if (!access.allowed) throw new OutreachError("ADMIN_ACCESS_DENIED", 403);
  const roleFullAccess = access.allowSources.some(role => role.systemKey === "FULL_ACCESS");
  const grant = await db.outreachTenantGrant.findUnique({ where: { siteKey_userId: { siteKey, userId: actor.id } } });
  if (!roleFullAccess && !grant?.accessEnabled) throw new OutreachError("ADMIN_ACCESS_DENIED", 403);
  return { siteKey, actorId: actor.id, all: roleFullAccess || Boolean(grant?.serviceFullAccess), live: Boolean(grant?.liveExecution) };
}

export const scopedWhere = (scope: Scope) => ({ siteKey: scope.siteKey });

/** Existing users have explicit allow/deny rows; new users retain municipal-only entry. */
export async function outreachTenants(db: Database, actor: AdminAccessActor): Promise<("lg" | "univ")[]> {
  const access = evaluateAdminAccess(actor, "zaad", "VIEW");
  if (!access.allowed) return [];
  if (access.allowSources.some(role => role.systemKey === "FULL_ACCESS")) return ["lg", "univ"];
  const grants = await db.outreachTenantGrant.findMany({ where: { userId: actor.id, siteKey: { in: ["lg", "univ"] } } });
  const municipal = grants.find(grant => grant.siteKey === "lg");
  const university = grants.find(grant => grant.siteKey === "univ");
  return [...((municipal?.accessEnabled ?? !university?.accessEnabled) ? ["lg" as const] : []), ...(university?.accessEnabled ? ["univ" as const] : [])];
}
