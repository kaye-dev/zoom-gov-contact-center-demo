import Script from "next/script";

import { parseZoomVirtualAgentWebTag } from "@/lib/zoom-virtual-agent-web-tag";

type ZoomVirtualAgentWebTagProps = {
  webTag: string | null;
};

export function ZoomVirtualAgentWebTag({
  webTag,
}: ZoomVirtualAgentWebTagProps) {
  const config = webTag ? parseZoomVirtualAgentWebTag(webTag) : null;
  if (!config) return null;

  return (
    <Script
      id="zoom-virtual-agent-web-tag"
      type="module"
      src={config.scriptSrc}
      data-apikey={config.apiKey}
      data-env={config.environment}
      strategy="afterInteractive"
    />
  );
}
