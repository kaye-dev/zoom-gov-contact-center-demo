"use client";
import { useI18n } from "../i18n/LanguageProvider";
import { DemoEntry } from "./DemoEntry";
import type { TenantKey } from "@/lib/tenants";

export function DemoEntryClient({ hrefs }: { hrefs: Record<TenantKey, string> }) {
  const { t } = useI18n();
  return <DemoEntry copy={t.siteAccess.frame} sites={t.siteAccess.sites.map(site => ({ ...site, href: hrefs[site.key] }))} />;
}
