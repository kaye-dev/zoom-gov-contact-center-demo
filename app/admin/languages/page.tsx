import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getLanguageSettings } from "@/lib/server/site-settings";

import { LanguageSettingsForm } from "./LanguageSettingsForm";

export default async function LanguagesPage() {
  const { actor } = await requireAdminAccess(
    "language-settings",
    "VIEW",
    "/admin/languages",
  );

  const languageSettings = await getLanguageSettings();

  return (
    <LanguageSettingsForm
      initialSettings={languageSettings}
      canEdit={canAdminAccess(actor, "language-settings", "UPDATE")}
    />
  );
}
