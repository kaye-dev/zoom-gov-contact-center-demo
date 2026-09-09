import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { AdminTenantChoice } from "@/app/admin/AdminTenantChoice";
import { headers } from "next/headers";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getMaintenanceSettingsSnapshot } from "@/lib/server/maintenance-settings-read";

import { MaintenanceSettingsForm } from "./MaintenanceSettingsForm";

export default async function MaintenanceSettingsPage() {
  const { actor } = await requireAdminAccess(
    "maintenance-settings",
    "VIEW",
    "/admin/maintenance-settings",
  );

  const selected = await getAdminPageTenant("maintenance-settings");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const requestHeaders = await headers();
  const requestHostname = requestHeaders.get("host");
  const snapshot = await getMaintenanceSettingsSnapshot({ requestHostname, tenantKey: selected.tenant.key });

  return (
    <MaintenanceSettingsForm
      key={selected.tenant.key}
      environment={snapshot.environment}
      initialConfig={
        snapshot.readStatus === "VALID" ? snapshot.config : null
      }
      initialEffective={snapshot.effective}
      initialRevision={
        snapshot.readStatus === "VALID" ? snapshot.revision : null
      }
      allowUpdate={canAdminAccess(actor, "maintenance-settings", "UPDATE")}
    />
  );
}
