import { requireAdminSession } from "@/lib/server/auth/server";
import { getPhoneSettings } from "@/lib/server/phone-settings";
import { getLanguageSettings } from "@/lib/server/site-settings";

import { PhoneSettingsForm } from "./PhoneSettingsForm";

export default async function PhoneSettingsPage() {
  await requireAdminSession("/admin/phone-settings");

  const [phoneSettings, languageSettings] = await Promise.all([
    getPhoneSettings(),
    getLanguageSettings(),
  ]);

  return (
    <PhoneSettingsForm
      initialSettings={phoneSettings}
      orderedLocales={languageSettings.locales}
    />
  );
}
