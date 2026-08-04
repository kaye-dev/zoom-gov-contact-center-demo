import Script from "next/script";

import type { ZoomWebChatTagConfig } from "@/lib/zoom-web-chat-tag";

type ZoomWebChatScriptProps = {
  config: ZoomWebChatTagConfig | null;
};

export function ZoomWebChatScript({ config }: ZoomWebChatScriptProps) {
  if (!config) return null;

  return (
    <Script
      id="zoom-web-chat-script"
      type={config.scriptType ?? undefined}
      src={config.scriptSrc}
      data-apikey={config.apiKey}
      data-env={config.environment}
      data-chat-entry-id={
        config.mode === "CONTACT_CENTER_ENTRY_ID"
          ? config.chatEntryId
          : undefined
      }
      strategy="afterInteractive"
    />
  );
}
