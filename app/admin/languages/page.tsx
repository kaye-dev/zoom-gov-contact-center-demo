import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { AdminTenantChoice } from "@/app/admin/AdminTenantChoice";
import { getLanguageSettings } from "@/lib/server/site-settings";

import { LanguageSettingsForm } from "./LanguageSettingsForm";

export default async function LanguagesPage() {
  const selected = await getAdminPageTenant("language-settings");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenant = selected.tenant;
  const { actor } = await requireAdminAccess(
    "language-settings",
    "VIEW",
    "/admin/languages",
  );

  const languageSettings = await getLanguageSettings(tenant.key);

  return (
    <LanguageSettingsForm
      key={tenant.key}
      initialSettings={languageSettings}
      canEdit={canAdminAccess(actor, "language-settings", "UPDATE")}
    />
  );
}
