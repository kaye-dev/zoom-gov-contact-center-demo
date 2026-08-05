"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { localeNames } from "@/app/i18n/dictionaries";
import { fetchWithAwsPayloadHash } from "@/lib/client-fetch";
import type { PhoneSettings } from "@/lib/phone-settings";
import {
  isSettingsErrorCode,
  type LanguageSetting,
  type SettingsErrorCode,
  type SiteLocale,
} from "@/lib/site-settings";

import { useI18n } from "../../i18n/LanguageProvider";

type PhoneSettingsFormProps = {
  initialSettings: PhoneSettings;
  orderedLocales: LanguageSetting[];
};

type Feedback =
  | { kind: "success" }
  | { kind: "error"; code?: SettingsErrorCode };

export function PhoneSettingsForm({
  initialSettings,
  orderedLocales,
}: PhoneSettingsFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const feedbackMessage = feedback
    ? feedback.kind === "success"
      ? t.admin.settings.saved
      : feedback.code
        ? t.admin.settings.errors[feedback.code]
        : t.admin.settings.saveError
    : null;

  const updateRepresentativePhone = (
    field: "display" | "e164",
    value: string,
  ) => {
    setSettings((current) => ({
      ...current,
      representativePhone: {
        ...current.representativePhone,
        [field]: value,
      },
    }));
    setFeedback(null);
  };

  const updateAiPhone = (locale: SiteLocale, value: string) => {
    setSettings((current) => ({
      ...current,
      aiPhoneNumbers: {
        ...current.aiPhoneNumbers,
        [locale]: value,
      },
    }));
    setFeedback(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetchWithAwsPayloadHash(
        "/api/admin/phone-settings",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { settings?: PhoneSettings; error?: unknown }
        | null;

      if (!response.ok || !body?.settings) {
        setFeedback({
          kind: "error",
          code: isSettingsErrorCode(body?.error) ? body.error : undefined,
        });
        return;
      }

      setSettings(body.settings);
      setFeedback({ kind: "success" });
      router.refresh();
    } catch {
      setFeedback({ kind: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {t.admin.phoneManagement.title}
        </h1>
        <p className="text-sm leading-6 text-fg-muted">
          {t.admin.phoneManagement.description}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <fieldset className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm md:p-6">
          <legend className="px-2 text-lg font-bold">
            {t.admin.phoneManagement.representativeTitle}
          </legend>
          <p className="text-sm leading-6 text-fg-muted">
            {t.admin.phoneManagement.representativeDescription}
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="representative-phone-display"
                className="block text-sm font-semibold"
              >
                {t.admin.phoneManagement.representativeDisplayLabel}
              </label>
              <input
                id="representative-phone-display"
                name="representativePhoneDisplay"
                required
                value={settings.representativePhone.display}
                onChange={(event) =>
                  updateRepresentativePhone("display", event.target.value)
                }
                inputMode="tel"
                maxLength={50}
                aria-describedby="representative-phone-display-help"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
              <p
                id="representative-phone-display-help"
                className="text-xs leading-5 text-fg-muted"
              >
                {t.admin.phoneManagement.representativeDisplayHelp}
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="representative-phone-e164"
                className="block text-sm font-semibold"
              >
                {t.admin.phoneManagement.representativeE164Label}
              </label>
              <input
                id="representative-phone-e164"
                name="representativePhoneE164"
                required
                value={settings.representativePhone.e164}
                onChange={(event) =>
                  updateRepresentativePhone("e164", event.target.value)
                }
                inputMode="tel"
                pattern="\+[1-9]\d{7,14}"
                placeholder="+81312345678"
                aria-describedby="representative-phone-e164-help"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
              <p
                id="representative-phone-e164-help"
                className="text-xs leading-5 text-fg-muted"
              >
                {t.admin.phoneManagement.representativeE164Help}
              </p>
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm md:p-6">
          <legend className="px-2 text-lg font-bold">
            {t.admin.phoneManagement.aiPhoneTitle}
          </legend>
          <p className="text-sm leading-6 text-fg-muted">
            {t.admin.phoneManagement.aiPhoneDescription}
          </p>
          <div className="space-y-4">
            {orderedLocales.map(({ locale, enabled }) => (
              <LocaleSettingRow
                key={locale}
                locale={locale}
                enabled={enabled}
                hiddenLabel={t.admin.phoneManagement.hidden}
              >
                <div className="space-y-2">
                  <label
                    htmlFor={`ai-phone-${locale}`}
                    className="block text-sm font-semibold"
                  >
                    {t.admin.phoneManagement.aiPhoneLabel}
                  </label>
                  <input
                    id={`ai-phone-${locale}`}
                    name={`aiPhoneNumbers.${locale}`}
                    value={settings.aiPhoneNumbers[locale] ?? ""}
                    onChange={(event) =>
                      updateAiPhone(locale, event.target.value)
                    }
                    inputMode="tel"
                    pattern="\+[1-9]\d{7,14}"
                    placeholder="+81312345678"
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </LocaleSettingRow>
            ))}
          </div>
        </fieldset>

        {feedback ? (
          <p
            role={feedback.kind === "error" ? "alert" : "status"}
            aria-live={feedback.kind === "error" ? "assertive" : "polite"}
            className={`rounded-md px-4 py-3 text-sm ${
              feedback.kind === "error"
                ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200"
                : "bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-200"
            }`}
          >
            {feedbackMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="cursor-pointer rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? t.admin.settings.saving
            : t.admin.settings.save}
        </button>
      </form>
    </section>
  );
}

function LocaleSettingRow({
  locale,
  enabled,
  hiddenLabel,
  children,
}: {
  locale: SiteLocale;
  enabled: boolean;
  hiddenLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-line p-4 md:grid-cols-[12rem_1fr] md:items-start">
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="font-semibold">{localeNames[locale]}</span>
        {!enabled ? (
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-semibold text-fg-muted">
            {hiddenLabel}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
