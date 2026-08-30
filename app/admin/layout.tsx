import type { ReactNode } from "react";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { getCurrentAdminAccessActor } from "@/lib/server/admin-access/server";

import { AdminShell, type AdminNavigationItemKey } from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { actor } = await getCurrentAdminAccessActor("/admin");
  const visibleItems: AdminNavigationItemKey[] = [];
  if (canAdminAccess(actor, "users", "VIEW")) visibleItems.push("users");
  if (canAdminAccess(actor, "users", "CREATE")) visibleItems.push("new-user");
  if (canAdminAccess(actor, "password-reset-requests", "VIEW")) {
    visibleItems.push("password-reset-requests");
  }
  if (canAdminAccess(actor, "phone-settings", "VIEW")) visibleItems.push("phone-settings");
  if (canAdminAccess(actor, "chat-settings", "VIEW")) visibleItems.push("chat-settings");
  if (canAdminAccess(actor, "language-settings", "VIEW")) visibleItems.push("language-settings");
  if (canAdminAccess(actor, "maintenance-settings", "VIEW")) visibleItems.push("maintenance-settings");
  if (canAdminAccess(actor, "developer-api", "VIEW")) visibleItems.push("developer-api");
  if (canAdminAccess(actor, "roles", "VIEW")) visibleItems.push("roles");

  return (
    <AdminShell visibleItems={visibleItems}>
      {children}
    </AdminShell>
  );
}
