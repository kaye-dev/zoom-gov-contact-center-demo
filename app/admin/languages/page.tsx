import { requireAdminSession } from "@/lib/server/auth/server";
import { getLanguageSettings } from "@/lib/server/site-settings";

import { LanguageSettingsForm } from "./LanguageSettingsForm";

export default async function LanguagesPage() {
  await requireAdminSession("/admin/languages");

  const languageSettings = await getLanguageSettings();

  return <LanguageSettingsForm initialSettings={languageSettings} />;
}
