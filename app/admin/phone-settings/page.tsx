import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getAdminSettingsTenant } from "@/lib/server/admin-settings-tenant";
import { AdminTenantChoice } from "../AdminTenantChoice";
import { getPhoneSettings } from "@/lib/server/phone-settings";
import { getLanguageSettings } from "@/lib/server/site-settings";

import { PhoneSettingsForm } from "./PhoneSettingsForm";

export default async function PhoneSettingsPage({ searchParams }: { searchParams: Promise<{ tenant?: string | string[] }> }) {
  const { actor } = await requireAdminAccess(
    "phone-settings",
    "VIEW",
    "/admin/phone-settings",
  );

  const selected = await getAdminSettingsTenant((await searchParams).tenant, "phone-settings");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenant = selected.tenant;

  const [phoneSettings, languageSettings] = await Promise.all([
    getPhoneSettings(tenant.key),
    getLanguageSettings(tenant.key),
  ]);

  return (
    <PhoneSettingsForm
      key={tenant.key}
      initialTenant={tenant.key}
      initialSettings={phoneSettings}
      orderedLocales={languageSettings.locales}
      canEdit={canAdminAccess(actor, "phone-settings", "UPDATE")}
    />
  );
}
