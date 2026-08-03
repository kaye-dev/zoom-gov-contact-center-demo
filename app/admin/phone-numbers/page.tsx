import { requireAdminSession } from "@/lib/server/auth/server";
import {
  getContactSettings,
  getLanguageSettings,
} from "@/lib/server/site-settings";

import { PhoneNumbersForm } from "./PhoneNumbersForm";

export default async function PhoneNumbersPage() {
  await requireAdminSession("/admin/phone-numbers");

  const [contactSettings, languageSettings] = await Promise.all([
    getContactSettings(),
    getLanguageSettings(),
  ]);

  return (
    <PhoneNumbersForm
      initialSettings={contactSettings}
      orderedLocales={languageSettings.locales}
    />
  );
}
