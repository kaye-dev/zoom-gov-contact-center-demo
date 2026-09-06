import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getRequestTenant } from "@/lib/server/tenant";
import { getPhoneSettings } from "@/lib/server/phone-settings";
import { getLanguageSettings } from "@/lib/server/site-settings";

import { PhoneSettingsForm } from "./PhoneSettingsForm";

export default async function PhoneSettingsPage() {
  const tenant = await getRequestTenant();
  const { actor } = await requireAdminAccess(
    "phone-settings",
    "VIEW",
    "/admin/phone-settings",
  );

  const [phoneSettings, languageSettings] = await Promise.all([
    getPhoneSettings(tenant.key),
    getLanguageSettings(tenant.key),
  ]);

  return (
    <PhoneSettingsForm
      initialSettings={phoneSettings}
      orderedLocales={languageSettings.locales}
      canEdit={canAdminAccess(actor, "phone-settings", "UPDATE")}
    />
  );
}
