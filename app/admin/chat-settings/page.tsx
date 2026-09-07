import { getSettingsReview } from "@/lib/server/admin-settings-review";
import { settingsReviewData } from "@/lib/admin-settings-review";
import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getAdminSettingsTenant } from "@/lib/server/admin-settings-tenant";
import { InvalidSettingsTenant } from "../InvalidSettingsTenant";
import { getChatSettings } from "@/lib/server/chat-settings";

import { ChatSettingsForm } from "./ChatSettingsForm";

export default async function ChatSettingsPage({ searchParams }: { searchParams: Promise<{ tenant?: string | string[]; state?: string | string[] }> }) {
  const { actor } = await requireAdminAccess(
    "chat-settings",
    "VIEW",
    "/admin/chat-settings",
  );

  const reviewState = await getSettingsReview((await searchParams).state);
  const selected = await getAdminSettingsTenant((await searchParams).tenant, "chat-settings");
  if (!selected.ok) return <InvalidSettingsTenant />;
  const tenant = selected.tenant;

  const chatSettings = await getChatSettings(tenant.key);

  return (
    <ChatSettingsForm
      reviewState={reviewState}
      key={tenant.key}
      initialTenant={tenant.key}
      initialSettings={reviewState ? settingsReviewData("chat-settings", tenant.key).settings as typeof chatSettings : chatSettings}
      canEdit={reviewState !== "readonly" && canAdminAccess(actor, "chat-settings", "UPDATE")}
    />
  );
}
