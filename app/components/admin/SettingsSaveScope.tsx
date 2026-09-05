"use client";

import { useI18n } from "@/app/i18n/LanguageProvider";

export function SettingsSaveScope({ scope, id }: { scope: "page" | "section"; id: string }) {
  const { t } = useI18n();
  return (
    <p id={id} className="text-sm leading-6 text-fg-muted">
      {scope === "page" ? t.admin.settings.pageSaveScope : t.admin.settings.sectionSaveScope}
    </p>
  );
}
