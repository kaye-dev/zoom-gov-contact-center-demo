import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { redirect } from "next/navigation";
import { getDeveloperApiSettings } from "@/lib/server/developer-api-settings";

import { DeveloperApiSettingsForm } from "./DeveloperApiSettingsForm";

export default async function DeveloperApiSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (query.tenant !== undefined) {
    const canonical = new URLSearchParams();
    if (typeof query.returnTo === "string") canonical.set("returnTo", query.returnTo);
    redirect(`/admin/developer-api${canonical.size ? `?${canonical}` : ""}`);
  }
  const { actor } = await requireAdminAccess(
    "developer-api",
    "VIEW",
    "/admin/developer-api",
  );
  const settings = await getDeveloperApiSettings();

  return (
    <DeveloperApiSettingsForm
      initialSettings={settings}
      canEdit={canAdminAccess(actor, "developer-api", "UPDATE")}
    />
  );
}
