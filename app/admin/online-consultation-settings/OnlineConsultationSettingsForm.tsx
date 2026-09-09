"use client";
import { useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { AdminPageTitleHelp } from "@/app/components/admin/AdminPageTitleHelp";
import {
  AdminSettingsTenantSelect,
  AdminSettingsLoadState,
} from "@/app/components/admin/AdminSettingsTenantSelect";
import { settingsInputFocusClassName } from "@/app/components/admin/settings-form-styles";
import { useI18n } from "@/app/i18n/LanguageProvider";
import {
  consultationServices,
  type ConsultationService,
} from "@/lib/online-consultation-catalog";
import {
  parseOnlineConsultationSettings,
  parseVideoClientWebTag,
  type OnlineConsultationSetting,
} from "@/lib/online-consultation-settings";
import { MAX_CHAT_MEMO_LENGTH } from "@/lib/chat-settings";
import type { SettingsReviewState } from "@/lib/admin-settings-review";
import type { TenantKey } from "@/lib/tenants";
import {
  AdminSettingsPanel,
  AdminSettingsTabs,
  validateSettingsTabs,
} from "../AdminSettingsTabs";
import { useAdminSettingsTenant } from "../useAdminSettingsTenant";

type Props = {
  initialSettings: OnlineConsultationSetting[];
  initialTenant: TenantKey;
  canEdit: boolean;
  reviewState?: SettingsReviewState;
};
export function OnlineConsultationSettingsForm({
  initialSettings,
  initialTenant,
  canEdit,
  reviewState,
}: Props) {
  const { t } = useI18n();
  const copy = t.admin.industrySettings;
  const [activeSection, setActiveSection] = useState<string>(
    consultationServices(initialTenant)[
      reviewState === "detail" ? 1 : reviewState === "third" ? 2 : 0
    ] ?? consultationServices(initialTenant)[0],
  );
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(
    reviewState === "saved"
      ? "saved"
      : reviewState === "save-error"
        ? "error"
        : null,
  );
  const [invalidField, setInvalidField] = useState<string | null>(
    reviewState === "validation"
      ? `online-consultation-tag-${consultationServices(initialTenant)[0]}`
      : null,
  );
  useEffect(() => {
    if (invalidField) document.getElementById(invalidField)?.focus();
  }, [invalidField]);
  const control = useAdminSettingsTenant(
    initialSettings,
    initialTenant,
    "online-consultation-settings",
    () => {
      setActiveSection("");
      setFeedback(null);
      setInvalidField(null);
    },
    reviewState,
  );
  const { settings, setSettings, isSubmitting } = control;
  const services = consultationServices(control.tenantKey);
  const active = services.some((key) => key === activeSection)
    ? activeSection
    : services[0];
  function update(
    key: ConsultationService,
    field: "webClientTag" | "memo",
    value: string,
  ) {
    setSettings((current) =>
      current.map((s) => (s.serviceKey === key ? { ...s, [field]: value } : s)),
    );
    setFeedback(null);
    setInvalidField(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || isSubmitting || control.loading || control.loadError)
      return;
    if (!validateSettingsTabs(event.currentTarget, setActiveSection)) {
      const invalidInput = event.currentTarget.querySelector<
        HTMLInputElement | HTMLTextAreaElement
      >("input:invalid, textarea:invalid");
      setInvalidField(invalidInput?.id ?? null);
      return;
    }
    const payload = {
      services: settings.map((s) => ({
        serviceKey: s.serviceKey,
        webClientTag: s.webClientTag ?? "",
        memo: s.memo ?? "",
      })),
    };
    const parsed = parseOnlineConsultationSettings(payload, control.tenantKey);
    if (!parsed.ok) {
      const invalid =
        payload.services.find(
          (s) =>
            parseVideoClientWebTag(s.webClientTag) === null ||
            Array.from(s.memo).length > MAX_CHAT_MEMO_LENGTH,
        )?.serviceKey ?? services[0];
      const invalidRow = payload.services.find(
        (s) => s.serviceKey === invalid,
      )!;
      flushSync(() => {
        setActiveSection(invalid);
        setInvalidField(
          parseVideoClientWebTag(invalidRow.webClientTag) === null
            ? `online-consultation-tag-${invalid}`
            : `memo-${invalid}`,
        );
      });
      return;
    }
    setFeedback(null);
    setInvalidField(null);
    try {
      await control.save(settings, parsed.value);
      setFeedback("saved");
    } catch {
      setFeedback("error");
    }
  }
  return (
    <section
      data-industry-state={control.pending ? "confirm-switch" : invalidField ? "validation" : control.invalid ? "invalid" : control.loading ? "loading" : control.loadError ? "load-error" : control.isSubmitting ? "saving" : feedback === "saved" ? "saved" : feedback === "error" ? "save-error" : control.dirty ? "dirty" : control.reviewIdentity ?? "default"}
    >
      <div data-admin-page-chrome className="space-y-4">
        <div data-admin-page-header className="ml-1 mr-0 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <AdminPageTitleHelp
            title={copy.consultationTitle}
            description={copy.pageHelpDescription.replace("{title}", copy.consultationTitle)}
            label={copy.pageHelpLabel}
          />
        <AdminSettingsTenantSelect
          control={control}
          resource="online-consultation-settings"
        />
        </div>
        {!control.invalid && !control.loading && !control.loadError && (
          <AdminSettingsTabs
            activeSection={active}
            onSelect={setActiveSection}
            label={copy.consultationTitle}
            items={services.map((key) => ({ key, label: copy.services[key] }))}
          />
        )}
      </div>
      <div data-admin-page-body className="ml-1 mr-0 mt-6 max-w-5xl">
        <AdminSettingsLoadState control={control} />
        {!control.invalid && !control.loading && !control.loadError && (
          <form
            data-admin-form
            noValidate
            onSubmit={submit}
            className="space-y-6"
          >
            {services.map((key) => {
              const setting = settings.find((s) => s.serviceKey === key);
              const id = `online-consultation-tag-${key}`;
              return (
                <AdminSettingsPanel
                  key={key}
                  section={key}
                  activeSection={active}
                >
                  <fieldset className="space-y-6">
                    <legend className="sr-only">{copy.consultationConnectionLabel.replace("{service}", copy.services[key])}</legend>
                    <div>
                      <p className="text-lg font-bold">{copy.services[key]}</p>
                      <p className="mt-2 text-sm leading-6 text-fg-muted">
                        {copy.consultationTagDescription}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor={id}
                        className="block text-sm font-semibold"
                      >
                        {copy.tag}
                      </label>
                      <textarea
                        id={id}
                        rows={7}
                        required
                        disabled={isSubmitting}
                        readOnly={!canEdit}
                        value={setting?.webClientTag ?? ""}
                        onChange={(e) =>
                          update(key, "webClientTag", e.target.value)
                        }
                        aria-invalid={invalidField === id}
                        aria-describedby={`${id}-help${invalidField === id ? ` ${id}-error` : ""}`}
                        className={`w-full resize-y rounded-md border ${invalidField === id ? "border-red-600" : "border-line"} bg-surface px-3 py-2 font-mono text-sm text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
                      />
                      <p
                        id={`${id}-help`}
                        className="text-xs leading-5 text-fg-muted"
                      >
                        {copy.tagHelp}
                      </p>
                      {invalidField === id && (
                        <p
                          id={`${id}-error`}
                          role="alert"
                          className="text-sm text-red-700 dark:text-red-400"
                        >
                          {copy.invalidInput}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor={`memo-${key}`}
                        className="block text-sm font-semibold"
                      >
                        {copy.memo}
                      </label>
                      <textarea
                        id={`memo-${key}`}
                        aria-describedby={
                          invalidField === `memo-${key}`
                            ? `memo-${key}-error`
                            : undefined
                        }
                        rows={4}
                        disabled={isSubmitting}
                        readOnly={!canEdit}
                        value={setting?.memo ?? ""}
                        onChange={(e) => update(key, "memo", e.target.value)}
                        aria-invalid={
                          Array.from(setting?.memo ?? "").length >
                          MAX_CHAT_MEMO_LENGTH
                        }
                        className={`mb-2 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-base text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
                      />
                      {invalidField === `memo-${key}` && (
                        <p
                          id={`memo-${key}-error`}
                          role="alert"
                          className="text-sm text-red-700 dark:text-red-400"
                        >
                          {copy.invalidInput}
                        </p>
                      )}
                    </div>
                  </fieldset>
                </AdminSettingsPanel>
              );
            })}
            <p id="save-scope" className="text-sm leading-6 text-fg-muted">
              {copy.scope.replace("{tenant}", control.tenantName)}
            </p>
            {control.dirty && (
              <p className="text-sm text-fg-muted">{copy.dirty}</p>
            )}
            {!canEdit && (
              <p role="status" className="text-sm text-fg-muted">
                {copy.readonly}
              </p>
            )}
            {feedback && (
              <p
                role={feedback === "saved" ? "status" : "alert"}
                className={
                  feedback === "saved"
                    ? "rounded-md bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-surface-raised dark:text-green-300"
                    : "text-sm text-red-700 dark:text-red-400"
                }
              >
                {feedback === "saved"
                  ? copy.saved.replace("{tenant}", control.tenantName)
                  : copy.saveError}
              </p>
            )}
            <button
              type="submit"
              aria-describedby="save-scope"
              disabled={!canEdit || isSubmitting}
              className="cursor-pointer rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? control.copy.saving : t.admin.settings.save}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
