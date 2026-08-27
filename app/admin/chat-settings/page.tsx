import { canAdminAccess } from "@/lib/admin-access/authorization";
import { requireAdminAccess } from "@/lib/server/admin-access/server";
import { getChatSettings } from "@/lib/server/chat-settings";

import { ChatSettingsForm } from "./ChatSettingsForm";

export default async function ChatSettingsPage() {
  const { actor } = await requireAdminAccess(
    "chat-settings",
    "VIEW",
    "/admin/chat-settings",
  );

  const chatSettings = await getChatSettings();

  return (
    <ChatSettingsForm
      initialSettings={chatSettings}
      canEdit={canAdminAccess(actor, "chat-settings", "UPDATE")}
    />
  );
}
