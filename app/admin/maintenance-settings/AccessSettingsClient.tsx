"use client";
import { adminFetch } from "@/lib/admin-fetch";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type { SiteAccessScope, SiteAccessSnapshot } from "@/lib/site-access";
import { AccessSettings } from "./AccessSettings";

export function AccessSettingsClient(props: {
  initialValues: Partial<Record<SiteAccessScope, SiteAccessSnapshot>>;
  allowedScopes: SiteAccessScope[];
  updateScopes: SiteAccessScope[];
}) {
  const { t } = useI18n();
  const readResponse = async (response: Response): Promise<SiteAccessSnapshot> => {
    if (!response.ok) throw new Error(response.status === 409 ? "SITE_ACCESS_SETTINGS_CONFLICT" : "SITE_ACCESS_UNAVAILABLE");
    return await response.json() as SiteAccessSnapshot;
  };
  return <AccessSettings {...props} copy={t.siteAccess.settings}
    onLoad={async scope => readResponse(await adminFetch(`/api/admin/site-access-settings?scope=${scope}`, { cache: "no-store" }))}
    onSave={async (scope, value, code, revision) => readResponse(await adminFetch(`/api/admin/site-access-settings?scope=${scope}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: value.enabled, sessionDays: value.days, code, expectedRevision: revision }),
    }))} />;
}
