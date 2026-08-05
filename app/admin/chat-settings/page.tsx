import { requireAdminSession } from "@/lib/server/auth/server";
import { getChatSettings } from "@/lib/server/chat-settings";

import { ChatSettingsForm } from "./ChatSettingsForm";

export default async function ChatSettingsPage() {
  await requireAdminSession("/admin/chat-settings");

  const chatSettings = await getChatSettings();

  return <ChatSettingsForm initialSettings={chatSettings} />;
}
