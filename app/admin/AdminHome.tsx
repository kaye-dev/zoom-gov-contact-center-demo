"use client";

import { useI18n } from "../i18n/LanguageProvider";

export function AdminHome() {
  const { t } = useI18n();

  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold">{t.admin.dashboardTitle}</h1>
      <p className="text-sm text-fg-muted">{t.admin.dashboardDescription}</p>
    </section>
  );
}
