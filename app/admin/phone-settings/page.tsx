import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getPhoneSettings } from "@/lib/server/phone-settings";
import { getLanguageSettings } from "@/lib/server/site-settings";

import { PhoneSettingsForm } from "./PhoneSettingsForm";

export default async function PhoneSettingsPage() {
  const { actor } = await requireAdminAccess(
    "phone-settings",
    "VIEW",
    "/admin/phone-settings",
  );

  const [phoneSettings, languageSettings] = await Promise.all([
    getPhoneSettings(),
    getLanguageSettings(),
  ]);

  return (
    <PhoneSettingsForm
      initialSettings={phoneSettings}
      orderedLocales={languageSettings.locales}
      canEdit={canAdminAccess(actor, "phone-settings", "UPDATE")}
    />
  );
}
