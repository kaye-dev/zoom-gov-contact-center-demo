import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getAdminSettingsTenant } from "@/lib/server/admin-settings-tenant";
import { AdminTenantChoice } from "../AdminTenantChoice";
import { getChatSettings } from "@/lib/server/chat-settings";

import { ChatSettingsForm } from "./ChatSettingsForm";

export default async function ChatSettingsPage({ searchParams }: { searchParams: Promise<{ tenant?: string | string[] }> }) {
  const { actor } = await requireAdminAccess(
    "chat-settings",
    "VIEW",
    "/admin/chat-settings",
  );

  const selected = await getAdminSettingsTenant((await searchParams).tenant, "chat-settings");
  if (!selected.ok) return <AdminTenantChoice allowed={selected.allowed} code={selected.code} />;
  const tenant = selected.tenant;

  const chatSettings = await getChatSettings(tenant.key);

  return (
    <ChatSettingsForm
      key={tenant.key}
      initialTenant={tenant.key}
      initialSettings={chatSettings}
      canEdit={canAdminAccess(actor, "chat-settings", "UPDATE")}
    />
  );
}
