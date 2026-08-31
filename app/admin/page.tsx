import { redirect } from "next/navigation";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { getCurrentAdminAccessActor } from "@/lib/server/admin-access/server";

import { AdminHome } from "./AdminHome";

export default async function AdminPage() {
  const { actor } = await getCurrentAdminAccessActor("/admin");
  const destinations = [
    ["users", "/admin/users"],
    ["password-reset-requests", "/admin/password-reset-requests"],
    ["phone-settings", "/admin/phone-settings"],
    ["chat-settings", "/admin/chat-settings"],
    ["language-settings", "/admin/languages"],
    ["maintenance-settings", "/admin/maintenance-settings"],
    ["developer-api", "/admin/developer-api"],
    ["roles", "/admin/roles"],
    ["reservations", "/admin/reservations"],
  ] as const;
  const first = destinations.find(([resourceKey]) =>
    canAdminAccess(actor, resourceKey, "VIEW"),
  );
  if (first) {
    redirect(first[1]);
  }

  return <AdminHome />;
}
