'use client';

import { useI18n } from '@/app/i18n/LanguageProvider';
import { toHtmlLanguageTag } from '@/lib/site-settings';
import type { ZoomWebChatTagConfig } from '@/lib/zoom-web-chat-tag';

import { ZoomWebChatScript } from './ZoomWebChatScript';

type ZoomWebChatLocaleGateProps = {
  config: ZoomWebChatTagConfig | null;
};

export function ZoomWebChatLocaleGate({
  config,
}: ZoomWebChatLocaleGateProps) {
  const { isLocaleReady, locale } = useI18n();

  if (
    !isLocaleReady ||
    document.documentElement.lang !== toHtmlLanguageTag(locale)
  ) {
    return null;
  }

  return <ZoomWebChatScript config={config} />;
}
