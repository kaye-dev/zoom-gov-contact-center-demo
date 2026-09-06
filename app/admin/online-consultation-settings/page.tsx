import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getOnlineConsultationSettings } from "@/lib/server/online-consultation-settings";
import { getRequestTenant } from "@/lib/server/tenant";

import { OnlineConsultationSettingsForm } from "./OnlineConsultationSettingsForm";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  return {
    title: `オンライン相談管理 | ${tenant.metadata.shortName}`,
  };
}

export default async function OnlineConsultationSettingsPage() {
  const tenant = await getRequestTenant();
  if (!tenant.features.onlineConsultationAdmin) notFound();

  const { actor } = await requireAdminAccess(
    "chat-settings",
    "VIEW",
    "/admin/online-consultation-settings",
  );
  const initialSettings = await getOnlineConsultationSettings(tenant.key);

  return (
    <OnlineConsultationSettingsForm
      initialSettings={initialSettings}
      siteName={tenant.metadata.shortName}
      canEdit={canAdminAccess(actor, "chat-settings", "UPDATE")}
    />
  );
}
