import type { Metadata } from "next";
export const metadata: Metadata = { title: { default: "管理画面", template: "%s | 管理画面" }, icons: { icon: { url: "/favicons/admin.svg", type: "image/svg+xml", sizes: "any" } }, robots: { index: false, follow: false } };
import { withPrisma } from "@/lib/server/prisma";
import { getRequestTenant } from "@/lib/server/tenant";
import { outreachTenants } from "@/lib/server/zaad/university/permissions";
import type { ReactNode } from "react";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { getCurrentAdminAccessActor } from "@/lib/server/admin-access/server";
import { getSessionUser } from "@/lib/server/auth/helpers";
import { settingsTenantOptions } from "@/lib/admin-settings-tenant";

import { AdminShell } from "./AdminShell";
import type { AdminNavigationItemKey } from "./admin-navigation";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { actor, session } = await getCurrentAdminAccessActor("/admin");
  const visibleItems: AdminNavigationItemKey[] = [];
  if (canAdminAccess(actor, "users", "VIEW")) visibleItems.push("users");
  if (canAdminAccess(actor, "users", "CREATE")) visibleItems.push("new-user");
  if (canAdminAccess(actor, "password-reset-requests", "VIEW")) {
    visibleItems.push("password-reset-requests");
  }
  if (canAdminAccess(actor, "phone-settings", "VIEW"))
    visibleItems.push("phone-settings");
  if (canAdminAccess(actor, "chat-settings", "VIEW"))
    visibleItems.push("chat-settings");
  if (
    settingsTenantOptions("online-consultation-settings").length > 0 &&
    canAdminAccess(actor, "chat-settings", "VIEW")
  ) {
    visibleItems.push("online-consultation-settings");
  }
  if (canAdminAccess(actor, "language-settings", "VIEW"))
    visibleItems.push("language-settings");
  if (canAdminAccess(actor, "maintenance-settings", "VIEW"))
    visibleItems.push("maintenance-settings");
  if (canAdminAccess(actor, "developer-api", "VIEW"))
    visibleItems.push("developer-api");
  if (canAdminAccess(actor, "roles", "VIEW")) visibleItems.push("roles");
  if (canAdminAccess(actor, "reservations", "VIEW"))
    visibleItems.push("reservations");
  const tenant = await getRequestTenant();
  const allowedOutreachTenants = await withPrisma((db) => outreachTenants(db, actor));
  if (allowedOutreachTenants.length > 0) visibleItems.push("zaad");

  return (
    <AdminShell
      visibleItems={visibleItems}
      outreach={{ allowedTenants: allowedOutreachTenants, hostTenant: tenant.key }}
      currentUserName={getSessionUser(session)!.name}
    >
      {children}
    </AdminShell>
  );
}
