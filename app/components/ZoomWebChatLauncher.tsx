import { resolveActiveZoomWebChatTag } from "@/lib/chat-settings";
import { getChatSettings } from "@/lib/server/chat-settings";

import { ZoomWebChatLocaleGate } from "./ZoomWebChatLocaleGate";

export async function ZoomWebChatLauncher() {
  const settings = await getChatSettings();
  const config = resolveActiveZoomWebChatTag(settings);

  return <ZoomWebChatLocaleGate config={config} />;
}
