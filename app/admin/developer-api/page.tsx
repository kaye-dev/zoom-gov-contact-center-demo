import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { AdminTenantChoice } from "@/app/admin/AdminTenantChoice";
import { getDeveloperApiSettings } from "@/lib/server/developer-api-settings";

import { DeveloperApiSettingsForm } from "./DeveloperApiSettingsForm";

export default async function DeveloperApiSettingsPage() {
  const selected = await getAdminPageTenant("developer-api");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenant = selected.tenant;
  const { actor } = await requireAdminAccess(
    "developer-api",
    "VIEW",
    "/admin/developer-api",
  );
  const settings = await getDeveloperApiSettings(tenant.key);

  return (
    <DeveloperApiSettingsForm
      key={tenant.key}
      initialSettings={settings}
      canEdit={canAdminAccess(actor, "developer-api", "UPDATE")}
    />
  );
}
