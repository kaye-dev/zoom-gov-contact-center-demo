import { redirect } from "next/navigation";

import { isAdminSession } from "@/lib/server/auth/helpers";
import { requirePasswordReadySession } from "@/lib/server/auth/server";

import { AdminHome } from "./AdminHome";

export default async function AdminPage() {
  const session = await requirePasswordReadySession("/admin");

  if (isAdminSession(session)) {
    redirect("/admin/users");
  }

  return <AdminHome />;
}
