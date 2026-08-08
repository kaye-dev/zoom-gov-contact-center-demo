"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { localeNames } from "@/app/i18n/dictionaries";
import {
  DEFAULT_SITE_LOCALE,
  SITE_LOCALES,
  isSettingsErrorCode,
  type LanguageSetting,
  type LanguageSettings,
  type SettingsErrorCode,
  type SiteLocale,
} from "@/lib/site-settings";

import { useI18n } from "../../i18n/LanguageProvider";

type LanguageSettingsFormProps = {
  initialSettings: LanguageSettings;
};

type Feedback =
  | { kind: "success" }
  | { kind: "error"; code?: SettingsErrorCode };

export function LanguageSettingsForm({
  initialSettings,
}: LanguageSettingsFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [locales, setLocales] = useState(initialSettings.locales);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const enabledCount = locales.filter(({ enabled }) => enabled).length;
  const feedbackMessage = feedback
    ? feedback.kind === "success"
      ? t.admin.settings.saved
      : feedback.code
        ? t.admin.settings.errors[feedback.code]
        : t.admin.settings.saveError
    : null;

  const toggleLocale = (locale: SiteLocale, enabled: boolean) => {
    if (locale === DEFAULT_SITE_LOCALE) return;

    setLocales((current) =>
      current.map((setting) =>
        setting.locale === locale ? { ...setting, enabled } : setting,
      ),
    );
    setFeedback(null);
  };

  const moveLocale = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= locales.length) return;

    setLocales((current) => {
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [
        reordered[nextIndex],
        reordered[index],
      ];
      return reordered;
    });
    setFeedback(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/admin/language-settings",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locales }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { settings?: LanguageSettings; error?: unknown }
        | null;

      if (!response.ok || !body?.settings) {
        setFeedback({
          kind: "error",
          code: isSettingsErrorCode(body?.error) ? body.error : undefined,
        });
        return;
      }

      setLocales(body.settings.locales);
      setFeedback({ kind: "success" });
      router.refresh();
    } catch {
      setFeedback({ kind: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {t.admin.languageManagement.title}
        </h1>
        <p className="text-sm leading-6 text-fg-muted">
          {t.admin.languageManagement.description}
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm md:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <h2 className="font-bold">
            {t.admin.languageManagement.enabledCountLabel}
          </h2>
          <p className="rounded-full bg-primary-50 px-3 py-1 text-sm font-bold text-primary-1100 dark:bg-primary-950 dark:text-primary-100">
            {enabledCount} / {SITE_LOCALES.length}
          </p>
        </div>

        <ol className="space-y-3">
          {locales.map((setting, index) => (
            <LanguageRow
              key={setting.locale}
              setting={setting}
              index={index}
              total={locales.length}
              isSubmitting={isSubmitting}
              onToggle={toggleLocale}
              onMove={moveLocale}
            />
          ))}
        </ol>

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

function LanguageRow({
  setting,
  index,
  total,
  isSubmitting,
  onToggle,
  onMove,
}: {
  setting: LanguageSetting;
  index: number;
  total: number;
  isSubmitting: boolean;
  onToggle: (locale: SiteLocale, enabled: boolean) => void;
  onMove: (index: number, offset: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const isJapanese = setting.locale === DEFAULT_SITE_LOCALE;

  return (
    <li className="flex flex-col gap-3 rounded-md border border-line p-4 sm:flex-row sm:items-center">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 has-[:disabled]:cursor-not-allowed">
        <input
          type="checkbox"
          checked={setting.enabled}
          disabled={isJapanese || isSubmitting}
          onChange={(event) =>
            onToggle(setting.locale, event.target.checked)
          }
          className="h-5 w-5 cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
        <span className="font-semibold">{localeNames[setting.locale]}</span>
        {isJapanese ? (
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-1100 dark:bg-primary-950 dark:text-primary-100">
            {t.admin.languageManagement.japaneseRequired}
          </span>
        ) : null}
      </label>

      <div className="flex gap-2 sm:shrink-0">
        <button
          type="button"
          disabled={index === 0 || isSubmitting}
          onClick={() => onMove(index, -1)}
          aria-label={`${localeNames[setting.locale]}: ${t.admin.languageManagement.moveUp}`}
          className="cursor-pointer rounded-md border border-line px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">↑</span>{" "}
          {t.admin.languageManagement.moveUp}
        </button>
        <button
          type="button"
          disabled={index === total - 1 || isSubmitting}
          onClick={() => onMove(index, 1)}
          aria-label={`${localeNames[setting.locale]}: ${t.admin.languageManagement.moveDown}`}
          className="cursor-pointer rounded-md border border-line px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">↓</span>{" "}
          {t.admin.languageManagement.moveDown}
        </button>
      </div>
    </li>
  );
}
