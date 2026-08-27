import { notFound } from "next/navigation";

import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getUserAccessSummary } from "@/lib/server/admin-access/queries";
import { withPrisma } from "@/lib/server/prisma";

import { UserAccessView } from "./UserAccessView";

export default async function UserAccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const callbackURL = `/admin/users/${encodeURIComponent(id)}/access`;
  await requireAdminAccess("users", "VIEW", callbackURL);
  await requireAdminAccess("roles", "VIEW", callbackURL);
  await requireAdminAccess("role-assignments", "VIEW", callbackURL);

  const summary = await withPrisma((prisma) => getUserAccessSummary(prisma, id));
  if (!summary) notFound();

  return <UserAccessView summary={summary} />;
}
