"use client";

import { settingsSectionClassName, settingsInputFocusClassName } from "@/app/components/admin/settings-form-styles";
import { AdminSettingsTenantSelect, AdminSettingsLoadState } from "@/app/components/admin/AdminSettingsTenantSelect";
import { useAdminSettingsTenant } from "../useAdminSettingsTenant";
import type { SettingsReviewState } from "@/lib/admin-settings-review";
import type { TenantKey } from "@/lib/tenants";
import { AdminPageTitleHelp } from "@/app/components/admin/AdminPageTitleHelp";

import { useEffect, useState, type FormEvent } from "react";

import { localeNames } from "@/app/i18n/dictionaries";
import type { PhoneSettings } from "@/lib/phone-settings";
import {
  type LanguageSetting,
  type SettingsErrorCode,
  type SiteLocale,
} from "@/lib/site-settings";

import { useI18n } from "../../i18n/LanguageProvider";
import { AdminSettingsPanel, AdminSettingsTabs, validateSettingsTabs } from "../AdminSettingsTabs";

type PhoneSettingsFormProps = {
  initialSettings: PhoneSettings;
  orderedLocales: LanguageSetting[];
  canEdit: boolean;
  initialTenant: TenantKey;
  reviewState?: SettingsReviewState;
};

type Feedback =
  | { kind: "success" }
  | { kind: "error"; code?: SettingsErrorCode };

export function PhoneSettingsForm({
  initialSettings,
  orderedLocales: initialLocales,
  canEdit,
  initialTenant,
  reviewState,
}: PhoneSettingsFormProps) {
  const { t } = useI18n();
  const [invalidField, setInvalidField] = useState<string | null>(reviewState === "validation" ? "representative-phone-display" : null);
  useEffect(() => { if (invalidField) document.getElementById(invalidField)?.focus(); }, [invalidField]);
  const [activeSection, setActiveSection] = useState(reviewState === "detail" ? "ai-phone" : reviewState === "third" ? "ai-phone" : "representative-phone");
  const [feedback, setFeedback] = useState<Feedback | null>(reviewState === "saved" ? {kind:"success"} : (reviewState === "save-error" || reviewState === "validation") ? {kind:"error"} : null);
  const control = useAdminSettingsTenant(initialSettings, initialTenant, "phone-settings", () => { setActiveSection("representative-phone"); setFeedback(null); setInvalidField(null); }, reviewState);
  const { settings, setSettings, isSubmitting } = control;
  const orderedLocales = (control.extras.orderedLocales as LanguageSetting[] | undefined) ?? initialLocales;
  const feedbackMessage = feedback
    ? feedback.kind === "success"
      ? control.copy.saved.replace("{tenant}", control.tenantName)
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
    setInvalidField(null);
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
    setInvalidField(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || isSubmitting || control.loading || control.loadError) return;
    if (!validateSettingsTabs(event.currentTarget, setActiveSection)) {
      setInvalidField(event.currentTarget.querySelector<HTMLInputElement>("input:invalid")?.id ?? null);
      return;
    }
    setFeedback(null);
    setInvalidField(null);

    try {
      await control.save(settings);
      setFeedback({ kind: "success" });
    } catch {
      setFeedback({ kind: "error" });
    }

  };

  return (
    <section data-industry-state={control.pending ? "confirm-switch" : invalidField ? "validation" : control.invalid ? "invalid" : control.loading ? "loading" : control.loadError ? "load-error" : control.isSubmitting ? "saving" : feedback?.kind === "success" ? "saved" : feedback?.kind === "error" ? "save-error" : control.dirty ? "dirty" : control.reviewIdentity ?? "default"}>
      <div data-admin-page-chrome className="space-y-4">
        <div
          data-admin-page-header
          className="ml-1 mr-0 max-w-4xl space-y-2"
        >
          <AdminPageTitleHelp
            title={t.admin.phoneManagement.title}
            description={t.admin.phoneManagement.description}
            label={t.admin.pageDescriptionLabel.replace("{title}", t.admin.phoneManagement.title)}
          />
        </div>
        <AdminSettingsTenantSelect control={control} resource="phone-settings" />
        {!control.invalid && !control.loading && !control.loadError && <AdminSettingsTabs
          activeSection={activeSection}
          onSelect={setActiveSection}
          label={t.admin.phoneManagement.title}
          items={[
            { key: "representative-phone", label: t.admin.phoneManagement.representativeTitle },
            { key: "ai-phone", label: t.admin.phoneManagement.aiPhoneTitle },
          ]}
        />}
      </div>

      <div data-admin-page-body className="ml-1 mr-0 mt-6 max-w-4xl">
      <AdminSettingsLoadState control={control} />
      {!control.invalid && !control.loading && !control.loadError && <form data-admin-form noValidate onSubmit={submit} className="space-y-6">
        <AdminSettingsPanel section="representative-phone" activeSection={activeSection}>
        <fieldset disabled={isSubmitting} className={settingsSectionClassName}>
          <legend className="sr-only">
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
                aria-invalid={invalidField === "representative-phone-display" || undefined}
                name="representativePhoneDisplay"
                required
                readOnly={!canEdit}
                value={settings.representativePhone.display}
                onChange={(event) =>
                  updateRepresentativePhone("display", event.target.value)
                }
                inputMode="tel"
                maxLength={50}
                aria-describedby="representative-phone-display-help"
                className={`min-w-0 w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
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
                aria-invalid={invalidField === "representative-phone-e164" || undefined}
                name="representativePhoneE164"
                required
                readOnly={!canEdit}
                value={settings.representativePhone.e164}
                onChange={(event) =>
                  updateRepresentativePhone("e164", event.target.value)
                }
                inputMode="tel"
                pattern="\+[1-9]\d{7,14}"
                placeholder="+81312345678"
                aria-describedby="representative-phone-e164-help"
                className={`min-w-0 w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
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

        </AdminSettingsPanel>
        <AdminSettingsPanel section="ai-phone" activeSection={activeSection}>
        <fieldset disabled={isSubmitting} className={settingsSectionClassName}>
          <legend className="sr-only">
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
                    readOnly={!canEdit}
                    value={settings.aiPhoneNumbers[locale] ?? ""}
                    onChange={(event) =>
                      updateAiPhone(locale, event.target.value)
                    }
                    inputMode="tel"
                    pattern="\+[1-9]\d{7,14}"
                    placeholder="+81312345678"
                    className={`min-w-0 w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
                  />
                </div>
              </LocaleSettingRow>
            ))}
          </div>
        </fieldset>

        </AdminSettingsPanel>

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

        {invalidField && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{control.copy.invalidInput}</p>}
        <p id="save-scope" className="text-sm leading-6 text-fg-muted">{control.copy.scope.replace("{tenant}", control.tenantName)}</p>
        {control.dirty && <p className="text-sm text-fg-muted">{control.copy.dirty}</p>}
        {!canEdit && <p role="status" className="text-sm text-fg-muted">{control.copy.readonly}</p>}
        <button
          aria-describedby="save-scope"
          type="submit"
          disabled={isSubmitting || !canEdit}
          className="cursor-pointer rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? t.admin.settings.saving
            : t.admin.settings.save}
        </button>
      </form>}
      </div>
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
    <div className="grid min-w-0 gap-3 border-b border-line-subtle py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:items-start">
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
