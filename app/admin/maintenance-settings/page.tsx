import { AccessSettingsClient } from "./AccessSettingsClient";
import { allowedSiteAccessScopes } from "@/lib/server/site-access-admin";
import { readSiteAccessSettings, publicSiteAccessSnapshot, siteAccessEnvironment } from "@/lib/server/site-access-settings";
import type { SiteAccessScope, SiteAccessSnapshot } from "@/lib/site-access";
import { normalizeRequestHostname } from "@/lib/hostname";
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

  const allowedScopes = allowedSiteAccessScopes(actor, "VIEW", selected.allowed);
  const updateScopes = allowedSiteAccessScopes(actor, "UPDATE", selected.allowed);
  let initialValues: Partial<Record<SiteAccessScope, SiteAccessSnapshot>> = {};
  try {
    const rows = await readSiteAccessSettings(siteAccessEnvironment(normalizeRequestHostname(requestHostname) ?? ""));
    initialValues = Object.fromEntries(rows.filter(row => allowedScopes.includes(row.scope)).map(row => [row.scope, publicSiteAccessSnapshot(row)]));
  } catch { /* An unavailable snapshot stays unsaveable; the client offers retry. */ }

  return (<>
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
    <AccessSettingsClient key={`access-${selected.tenant.key}`} initialValues={initialValues} allowedScopes={allowedScopes} updateScopes={updateScopes} />
  </>);
}
