"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/app/i18n/LanguageProvider";
export function InvalidSettingsTenant() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <div role="alert" className="space-y-4">
      <p>{t.admin.industrySettings.invalid}</p>
      <Link className="text-primary underline" href={`${pathname}?tenant=univ`}>
        {t.admin.industrySettings.names.univ}
      </Link>
    </div>
  );
}
