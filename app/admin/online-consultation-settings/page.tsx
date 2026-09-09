import { getAdminSettingsTenant } from "@/lib/server/admin-settings-tenant";
import { AdminTenantChoice } from "../AdminTenantChoice";
import type { Metadata } from "next";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getOnlineConsultationSettings } from "@/lib/server/online-consultation-settings";

import { OnlineConsultationSettingsForm } from "./OnlineConsultationSettingsForm";

export const metadata: Metadata = { title: "オンライン相談管理 | 管理画面" };

export default async function OnlineConsultationSettingsPage({ searchParams }: { searchParams: Promise<{ tenant?: string | string[] }> }) {

  const { actor } = await requireAdminAccess(
    "chat-settings",
    "VIEW",
    "/admin/online-consultation-settings",
  );
  const selected = await getAdminSettingsTenant((await searchParams).tenant, "online-consultation-settings");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenant = selected.tenant;
  const initialSettings = await getOnlineConsultationSettings(tenant.key);

  return (
    <OnlineConsultationSettingsForm
      key={tenant.key}
      initialTenant={tenant.key}
      initialSettings={initialSettings}
      canEdit={canAdminAccess(actor, "chat-settings", "UPDATE")}
    />
  );
}
