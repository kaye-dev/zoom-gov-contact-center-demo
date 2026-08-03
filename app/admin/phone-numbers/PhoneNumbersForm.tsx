"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { localeNames } from "@/app/i18n/dictionaries";
import {
  isSettingsErrorCode,
  type ContactSettings,
  type LanguageSetting,
  type SettingsErrorCode,
  type SiteLocale,
} from "@/lib/site-settings";

import { useI18n } from "../../i18n/LanguageProvider";

type PhoneNumbersFormProps = {
  initialSettings: ContactSettings;
  orderedLocales: LanguageSetting[];
};

type Feedback =
  | { kind: "success" }
  | { kind: "error"; code?: SettingsErrorCode };

export function PhoneNumbersForm({
  initialSettings,
  orderedLocales,
}: PhoneNumbersFormProps) {
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
  };

  const updateDestination = (
    locale: SiteLocale,
    field: "aiPhoneE164" | "virtualAgentCampaignUrl",
    value: string,
  ) => {
    setSettings((current) => ({
      ...current,
      destinations: {
        ...current.destinations,
        [locale]: {
          ...current.destinations[locale],
          [field]: value,
        },
      },
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/contact-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = (await response.json().catch(() => null)) as
        | { settings?: ContactSettings; error?: unknown }
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
        <h1 className="text-2xl font-bold">{t.admin.contactSettings.title}</h1>
        <p className="text-sm leading-6 text-fg-muted">
          {t.admin.contactSettings.description}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <fieldset className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm md:p-6">
          <legend className="px-2 text-lg font-bold">
            {t.admin.contactSettings.representativeTitle}
          </legend>
          <p className="text-sm leading-6 text-fg-muted">
            {t.admin.contactSettings.representativeDescription}
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold">
                {t.admin.contactSettings.representativeDisplayLabel}
              </span>
              <input
                required
                value={settings.representativePhone.display}
                onChange={(event) =>
                  updateRepresentativePhone("display", event.target.value)
                }
                inputMode="tel"
                maxLength={50}
                aria-describedby="representative-display-help"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
              />
              <span
                id="representative-display-help"
                className="block text-xs leading-5 text-fg-muted"
              >
                {t.admin.contactSettings.representativeDisplayHelp}
              </span>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold">
                {t.admin.contactSettings.representativeE164Label}
              </span>
              <input
                required
                value={settings.representativePhone.e164}
                onChange={(event) =>
                  updateRepresentativePhone("e164", event.target.value)
                }
                inputMode="tel"
                pattern="\+[1-9]\d{7,14}"
                placeholder="+81312345678"
                aria-describedby="representative-e164-help"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
              />
              <span
                id="representative-e164-help"
                className="block text-xs leading-5 text-fg-muted"
              >
                {t.admin.contactSettings.representativeE164Help}
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm md:p-6">
          <legend className="px-2 text-lg font-bold">
            {t.admin.contactSettings.aiPhoneTitle}
          </legend>
          <p className="text-sm leading-6 text-fg-muted">
            {t.admin.contactSettings.aiPhoneDescription}
          </p>
          <div className="space-y-4">
            {orderedLocales.map(({ locale, enabled }) => (
              <LocaleSettingRow
                key={locale}
                locale={locale}
                enabled={enabled}
                hiddenLabel={t.admin.contactSettings.hidden}
              >
                <label className="block space-y-2">
                  <span className="text-sm font-semibold">
                    {t.admin.contactSettings.aiPhoneLabel}
                  </span>
                  <input
                    value={settings.destinations[locale].aiPhoneE164 ?? ""}
                    onChange={(event) =>
                      updateDestination(
                        locale,
                        "aiPhoneE164",
                        event.target.value,
                      )
                    }
                    inputMode="tel"
                    pattern="\+[1-9]\d{7,14}"
                    placeholder="+81312345678"
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
                  />
                </label>
              </LocaleSettingRow>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm md:p-6">
          <legend className="px-2 text-lg font-bold">
            {t.admin.contactSettings.virtualAgentTitle}
          </legend>
          <p className="text-sm leading-6 text-fg-muted">
            {t.admin.contactSettings.virtualAgentDescription}
          </p>
          <div className="space-y-4">
            {orderedLocales.map(({ locale, enabled }) => (
              <LocaleSettingRow
                key={locale}
                locale={locale}
                enabled={enabled}
                hiddenLabel={t.admin.contactSettings.hidden}
              >
                <label className="block space-y-2">
                  <span className="text-sm font-semibold">
                    {t.admin.contactSettings.campaignUrlLabel}
                  </span>
                  <input
                    type="url"
                    maxLength={2048}
                    value={
                      settings.destinations[locale].virtualAgentCampaignUrl ??
                      ""
                    }
                    onChange={(event) =>
                      updateDestination(
                        locale,
                        "virtualAgentCampaignUrl",
                        event.target.value,
                      )
                    }
                    placeholder="https://example.zoom.us/..."
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
                  />
                </label>
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
