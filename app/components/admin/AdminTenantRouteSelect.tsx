"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { parseAdminTenant } from "@/lib/admin-routing";
import type { TenantKey } from "@/lib/tenants";
import { AdminSettingsTenantSelect } from "@/app/components/admin/AdminSettingsTenantSelect";

export function AdminTenantRouteSelect({ dirty, saving, allowed = ["lg", "univ"] }: { dirty: boolean; saving: boolean; allowed?: readonly TenantKey[] }) {
  const { t } = useI18n(), copy = t.admin.industrySettings, query = useSearchParams(), pathname = usePathname(), router = useRouter();
  const [pending, setPending] = useState<TenantKey | "" | null>(null), [routing, startTransition] = useTransition();
  const selected = parseAdminTenant(query.getAll("tenant"));
  if (!selected.ok) return null;
  function navigate(tenant: TenantKey | "") { const params = new URLSearchParams(query.toString()); if (tenant || pathname === "/admin/zaad") params.set("tenant", tenant || "lg"); else params.delete("tenant"); for (const key of ["id", "detail", "origin", "state", "importJob", "contactId", "caseId", "workflowId", "runId", "cursor", "query", "page", "trail"]) params.delete(key); setPending(null); startTransition(() => router.push(`${pathname}?${params}`, { scroll: false })); }
  return <AdminSettingsTenantSelect options={allowed} control={{ tenantKey: selected.tenantKey, tenantName: copy.names[selected.tenantKey], copy, isSubmitting: saving || routing, pending: pending !== null ? { tenant: pending || undefined, label: pending ? copy.names[pending] : copy.placeholder } : null, select: tenant => { if (saving || routing || tenant === selected.tenantKey || (tenant !== "" && !allowed.includes(tenant))) return; if (dirty) setPending(tenant); else navigate(tenant); }, cancel: () => setPending(null), discard: () => { if (pending !== null && !saving) navigate(pending); } }} />;
}
