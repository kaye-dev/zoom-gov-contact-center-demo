import { resolveActiveZoomWebChatTag } from "@/lib/chat-settings";
import { getChatSettings } from "@/lib/server/chat-settings";
import { getRequestTenant } from "@/lib/server/tenant";

import { ZoomWebChatLocaleGate } from "./ZoomWebChatLocaleGate";

export async function ZoomWebChatLauncher() {
  const tenant = await getRequestTenant();
  const settings = await getChatSettings(tenant.key);
  const config = resolveActiveZoomWebChatTag(settings);

  return <ZoomWebChatLocaleGate config={config} />;
}
