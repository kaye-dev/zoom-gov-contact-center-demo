import type { ReactNode } from "react";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { getCurrentAdminAccessActor } from "@/lib/server/admin-access/server";
import { getSessionUser } from "@/lib/server/auth/helpers";

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
  if (canAdminAccess(actor, "phone-settings", "VIEW")) visibleItems.push("phone-settings");
  if (canAdminAccess(actor, "chat-settings", "VIEW")) visibleItems.push("chat-settings");
  if (canAdminAccess(actor, "language-settings", "VIEW")) visibleItems.push("language-settings");
  if (canAdminAccess(actor, "maintenance-settings", "VIEW")) visibleItems.push("maintenance-settings");
  if (canAdminAccess(actor, "developer-api", "VIEW")) visibleItems.push("developer-api");
  if (canAdminAccess(actor, "roles", "VIEW")) visibleItems.push("roles");
  if (canAdminAccess(actor, "reservations", "VIEW")) visibleItems.push("reservations");
  if (canAdminAccess(actor, "zaad", "VIEW")) visibleItems.push("zaad");

  return (
    <AdminShell
      visibleItems={visibleItems}
      currentUserName={getSessionUser(session)!.name}
    >
      {children}
    </AdminShell>
  );
}
