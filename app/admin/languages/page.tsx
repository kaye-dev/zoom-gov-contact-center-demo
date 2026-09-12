import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getAdminPageTenant } from "@/lib/server/admin-scope";
import { redirect } from "next/navigation";
import { getLanguageSettings } from "@/lib/server/site-settings";

import { LanguageSettingsForm } from "./LanguageSettingsForm";

export default async function LanguagesPage() {
  const { actor } = await requireAdminAccess(
    "language-settings",
    "VIEW",
    "/admin/languages?tenant=lg",
  );

  const selected = await getAdminPageTenant("language-settings");
  if (!selected.ok) redirect("/admin?error=access-denied");
  const tenant = selected.tenant;

  const languageSettings = await getLanguageSettings(tenant.key);

  return (
    <LanguageSettingsForm
      key={tenant.key}
      initialSettings={languageSettings}
      canEdit={canAdminAccess(actor, "language-settings", "UPDATE")}
    />
  );
}
