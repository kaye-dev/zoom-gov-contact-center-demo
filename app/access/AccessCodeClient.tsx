"use client";
import { useI18n } from "../i18n/LanguageProvider";
import { safePublicReturnTo } from "@/lib/public-site-routing";
import { AccessCodeForm } from "./AccessCodeForm";

export function AccessCodeClient({ returnTo }: { returnTo: string }) {
  const { t } = useI18n();
  return <AccessCodeForm frame={t.siteAccess.frame} copy={t.siteAccess.gate} onSubmit={async code => {
    const response = await fetch("/api/site-access/verify", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, returnTo }),
    });
    if (!response.ok) return response.status === 429 ? t.siteAccess.gate.rateLimit
      : response.status === 503 ? t.siteAccess.gate.unavailable : t.siteAccess.gate.error;
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("redirectTo" in result) || typeof result.redirectTo !== "string") return t.siteAccess.gate.error;
    window.location.assign(safePublicReturnTo(result.redirectTo));
    return null;
  }} />;
}
