import type { ReactNode } from "react";

import { isAdminSession } from "@/lib/server/auth/helpers";
import { requirePasswordReadySession } from "@/lib/server/auth/server";

import { AdminShell } from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requirePasswordReadySession("/admin");

  return (
    <AdminShell isAdmin={isAdminSession(session)}>
      {children}
    </AdminShell>
  );
}
