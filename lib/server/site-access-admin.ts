import { canAdminAccess } from "@/lib/admin-access/authorization";
import type { AdminAccessActor } from "@/lib/admin-access/types";
import { SITE_ACCESS_SCOPES, type SiteAccessScope } from "@/lib/site-access";
import type { TenantKey } from "@/lib/tenants";

export function allowedSiteAccessScopes(actor: AdminAccessActor, action: "VIEW" | "UPDATE", tenants: readonly TenantKey[]): SiteAccessScope[] {
  if (!canAdminAccess(actor, "maintenance-settings", action)) return [];
  return SITE_ACCESS_SCOPES.filter(scope => scope === "global"
    ? tenants.includes("lg") && tenants.includes("univ") : tenants.includes(scope));
}
