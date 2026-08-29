import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getDeveloperApiSettings } from "@/lib/server/developer-api-settings";

import { DeveloperApiSettingsForm } from "./DeveloperApiSettingsForm";

export default async function DeveloperApiSettingsPage() {
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
