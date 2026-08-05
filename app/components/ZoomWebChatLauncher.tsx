import { resolveActiveZoomWebChatTag } from "@/lib/chat-settings";
import { getChatSettings } from "@/lib/server/chat-settings";

import { ZoomWebChatScript } from "./ZoomWebChatScript";

export async function ZoomWebChatLauncher() {
  const settings = await getChatSettings();
  const config = resolveActiveZoomWebChatTag(settings);

  return <ZoomWebChatScript config={config} />;
}
