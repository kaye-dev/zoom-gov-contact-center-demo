import { evaluateAdminAccess } from "@/lib/admin-access/authorization";
import type { AdminAccessActor } from "@/lib/admin-access/types";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  OutreachError,
  DEPARTMENTS,
  type Department,
} from "@/lib/zaad/university/contracts";
export type Database = PrismaClient | Prisma.TransactionClient;
export type Scope = {
  siteKey: string;
  actorId: string;
  departments: Department[];
  all: boolean;
  live: boolean;
};
export async function universityScope(
  db: Database,
  siteKey: string,
  actor: AdminAccessActor,
): Promise<Scope> {
  if (siteKey !== "univ") throw new OutreachError("NOT_FOUND", 404);
  const access = evaluateAdminAccess(actor, "zaad", "VIEW");
  if (!access.allowed) throw new OutreachError("DEPARTMENT_ACCESS_DENIED", 403);
  const grants = await db.universityZaadGrant.findMany({
    where: { siteKey, userId: actor.id },
  });
  const all = access.allowSources.some((role) => role.systemKey === "FULL_ACCESS") ||
    grants.some((g) => g.departmentKey === "ALL");
  const departments = all
    ? [...DEPARTMENTS]
    : DEPARTMENTS.filter((d) => grants.some((g) => g.departmentKey === d));
  if (!departments.length)
    throw new OutreachError("DEPARTMENT_ACCESS_DENIED", 403);
  return {
    siteKey,
    actorId: actor.id,
    departments,
    all,
    live: grants.some((g) => g.liveExecution),
  };
}
export function requireDepartment(scope: Scope, department: string) {
  if (!scope.departments.includes(department as Department))
    throw new OutreachError("NOT_FOUND", 404);
}
export const scopedWhere = (scope: Scope) => ({
  siteKey: scope.siteKey,
  departmentKey: { in: scope.departments },
});

/** Legacy municipal access remains available unless the person has university-only grants. */
export async function outreachTenants(
  db: Database,
  actor: AdminAccessActor,
): Promise<("lg" | "univ")[]> {
  const access = evaluateAdminAccess(actor, "zaad", "VIEW");
  if (!access.allowed) return [];
  if (access.allowSources.some((role) => role.systemKey === "FULL_ACCESS"))
    return ["lg", "univ"];
  const grants = await db.universityZaadGrant.findMany({
    where: { userId: actor.id, siteKey: { in: ["lg", "univ"] } },
  });
  const university = grants.some(
    (g) =>
      g.siteKey === "univ" &&
      (g.departmentKey === "ALL" ||
        (DEPARTMENTS as readonly string[]).includes(g.departmentKey)),
  );
  const municipal =
    !university ||
    grants.some((g) => g.siteKey === "lg" && g.departmentKey === "ALL");
  return [
    ...(municipal ? ["lg" as const] : []),
    ...(university ? ["univ" as const] : []),
  ];
}
