import { admissionYears } from "@/lib/zaad/university/contracts";
import type { Metadata } from "next";
import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { redirect } from "next/navigation";
import { withPrisma } from "@/lib/server/prisma";
import { resolveOutreachScope } from "@/lib/server/zaad/outreach-scope";
import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { OutreachView } from "./OutreachView";
export const metadata: Metadata = { title: "オートリーチ" };
export default async function ZaadPage() {
  const { actor } = await requireAdminAccess("zaad", "VIEW", "/admin/zaad?tenant=lg");
  const selected = await getAdminPageTenant("zaad");
  if (!selected.ok) redirect("/admin?error=access-denied");
  const tenant = selected.tenant.key;
  const scope = await withPrisma(db => resolveOutreachScope(db, actor, tenant));
  const now = new Date();
  return <OutreachView years={admissionYears(now)} serverDate={now.toISOString()} key={`${actor.id}:${tenant}:${scope.departments.join(",")}`} tenant={tenant} departments={scope.departments} allowedTenants={selected.allowed} permissions={{ create: canAdminAccess(actor, "zaad", "CREATE"), update: canAdminAccess(actor, "zaad", "UPDATE"), delete: canAdminAccess(actor, "zaad", "DELETE") }} canConfigure={canAdminAccess(actor, "developer-api", "VIEW")} />;
}
