"use client";
import { useI18n } from "@/app/i18n/LanguageProvider";
export function RegistrationClosed() {
  const { t } = useI18n();
  return <p role="status" className="mx-auto max-w-3xl px-6 py-12 leading-7">{t.outreachCommon.registrationClosed}</p>;
}
