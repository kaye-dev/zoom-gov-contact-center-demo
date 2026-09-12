"use client";

import type { ReactNode } from "react";
import { AdminPageTitleHelp } from "@/app/components/admin/AdminPageTitleHelp";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type { MaintenanceEnvironment } from "@/lib/maintenance-config";

export function MaintenanceSettingsHeader({
  environment,
  badgeClassName,
  tenantControl,
}: {
  environment: MaintenanceEnvironment;
  badgeClassName: string;
  tenantControl: ReactNode;
}) {
  const { t } = useI18n();
  const copy = t.admin.maintenanceManagement;

  return (
    <div
      data-admin-page-header
      className="ml-1 mr-0 flex flex-wrap items-start justify-between gap-4"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <AdminPageTitleHelp
          title={copy.title}
          description={copy.description}
          label={t.admin.pageDescriptionLabel.replace("{title}", copy.title)}
        />
        <span
          className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-sm font-bold ${badgeClassName}`}
        >
          {copy.environmentLabel}: {copy.environments[environment]}
        </span>
      </div>
      {tenantControl}
    </div>
  );
}
