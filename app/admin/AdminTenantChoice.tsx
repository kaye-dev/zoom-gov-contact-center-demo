"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type { TenantKey } from "@/lib/tenants";

export function AdminTenantChoice({ allowed, code = "TENANT_REQUIRED" }: { allowed: readonly TenantKey[]; code?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname(), query = useSearchParams();
  const copy = t.admin.industrySettings;
  return <section className="space-y-4" aria-label={copy.label}>
    <p role={code === "TENANT_REQUIRED" ? undefined : "alert"}>{code === "TENANT_REQUIRED" ? copy.help : copy.invalid}</p>
    <div className="flex flex-wrap gap-3">{allowed.map(tenant => <button key={tenant} type="button" className="cursor-pointer rounded-md border border-line px-4 py-2 text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent" onClick={() => { const params = new URLSearchParams(query.toString()); params.delete("tenant"); params.set("tenant", tenant); router.push(`${pathname}?${params}`); }}>{copy.names[tenant]}</button>)}</div>
  </section>;
}
