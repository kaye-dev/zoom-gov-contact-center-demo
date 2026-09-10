"use client";

import type { ReactNode } from "react";
import { LanguageProvider } from "@/app/i18n/LanguageProvider";
import { ThemeSync } from "@/app/components/ThemeSync";
import type { Locale } from "@/app/i18n/dictionaries";
import type { TenantKey } from "@/lib/tenants";
import config from "./preview-config.json";

export function PrototypeProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <ThemeSync />
      <LanguageProvider availableLocales={[config.locale as Locale]} tenantKey={config.tenant as TenantKey}>
        {children}
      </LanguageProvider>
    </>
  );
}
