import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_REQUEST_PATH_HEADER, parseAdminTenant } from "@/lib/admin-routing";
import { canAdminAccess } from "@/lib/admin-access/authorization";
import type { AdminAccessAction, AdminAccessActor, AdminResourceKey } from "@/lib/admin-access/types";
import { getTenant, type TenantKey } from "@/lib/tenants";
import { settingsTenantOptions, type AdminSettingsResource } from "@/lib/admin-settings-tenant";
import { outreachTenants, type Database } from "./zaad/university/permissions";
import { withPrisma } from "./prisma";
import { getCurrentAdminAccessActor } from "./admin-access/server";

export async function allowedAdminTenants(db: Database, actor: AdminAccessActor, resource: AdminResourceKey | AdminSettingsResource, action: AdminAccessAction = "VIEW"): Promise<TenantKey[]> {
  const permission = resource === "online-consultation-settings" ? "chat-settings" : resource;
  if (!canAdminAccess(actor, permission, action)) return [];
  if (resource === "zaad") return outreachTenants(db, actor);
  if (resource === "reservations") return ["lg"];
  if (["phone-settings", "chat-settings", "online-consultation-settings"].includes(resource))
    return settingsTenantOptions(resource as AdminSettingsResource);
  return ["lg", "univ"];
}

export async function getAdminPageTenant(resource: AdminResourceKey | AdminSettingsResource) {
  const { actor } = await getCurrentAdminAccessActor();
  const allowed = await withPrisma(db => allowedAdminTenants(db, actor, resource));
  const requestHeaders = await headers();
  const current = new URL(requestHeaders.get(ADMIN_REQUEST_PATH_HEADER) ?? "/admin", "http://localhost:3000");
  const parsed = parseAdminTenant(current.searchParams.getAll("tenant"));
  if (!parsed.ok) {
    if (parsed.code === "TENANT_REQUIRED" && allowed.length === 1) {
      current.searchParams.set("tenant", allowed[0]);
      redirect(current.pathname + current.search);
    }
    return { ok: false, code: allowed.length ? parsed.code : "ADMIN_ACCESS_DENIED", allowed } as const;
  }
  if (!allowed.includes(parsed.tenantKey)) return { ok: false, code: "ADMIN_ACCESS_DENIED", allowed } as const;
  return { ok: true, tenant: getTenant(parsed.tenantKey), allowed } as const;
}
