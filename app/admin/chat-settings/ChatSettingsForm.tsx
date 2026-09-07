"use client";

import { flushSync } from "react-dom";
import { settingsSectionClassName, settingsInputFocusClassName } from "@/app/components/admin/settings-form-styles";
import { AdminSettingsTenantSelect, AdminSettingsLoadState } from "@/app/components/admin/AdminSettingsTenantSelect";
import { useAdminSettingsTenant } from "../useAdminSettingsTenant";
import type { SettingsReviewState } from "@/lib/admin-settings-review";
import type { TenantKey } from "@/lib/tenants";
import { AdminPageTitleHelp } from "@/app/components/admin/AdminPageTitleHelp";

import { useEffect, useState, type FormEvent } from "react";

import {
  MAX_CHAT_MEMO_LENGTH,
  type ChatSettings,
} from "@/lib/chat-settings";
import {
  SETTINGS_ERROR_CODES,
  type SettingsErrorCode,
} from "@/lib/site-settings";

import { useI18n } from "../../i18n/LanguageProvider";
import { AdminSettingsPanel, AdminSettingsTabs, validateSettingsTabs } from "../AdminSettingsTabs";

type ChatSettingsFormProps = {
  initialSettings: ChatSettings;
  canEdit: boolean;
  initialTenant: TenantKey;
  reviewState?: SettingsReviewState;
};

type Feedback =
  | { kind: "success" }
  | { kind: "error"; code?: SettingsErrorCode };

export function ChatSettingsForm({
  initialSettings,
  canEdit,
  initialTenant,
  reviewState,
}: ChatSettingsFormProps) {
  const { t } = useI18n();
  const [invalidField, setInvalidField] = useState<string | null>(reviewState === "validation" ? "chat-settings-campaign-web-tag" : null);
  useEffect(() => { if (invalidField) document.getElementById(invalidField)?.focus(); }, [invalidField]);
  const [activeSection, setActiveSection] = useState((reviewState === "detail" || reviewState === "validation") ? "chat-campaign" : reviewState === "third" ? "chat-entry-id" : "chat-method");
  const [feedback, setFeedback] = useState<Feedback | null>(reviewState === "saved" ? {kind:"success"} : (reviewState === "save-error" || reviewState === "validation") ? {kind:"error"} : null);
  const control = useAdminSettingsTenant(initialSettings, initialTenant, "chat-settings", () => { setActiveSection("chat-method"); setFeedback(null); setInvalidField(null); }, reviewState);
  const { settings, setSettings, isSubmitting } = control;
  const feedbackMessage = feedback
    ? feedback.kind === "success"
      ? control.copy.saved.replace("{tenant}", control.tenantName)
      : feedback.code
        ? t.admin.settings.errors[feedback.code]
        : t.admin.settings.saveError
    : null;
  const modeOptions: Array<{
    value: ChatSettings["activeMode"];
    label: string;
    description: string;
  }> = [
    {
      value: "DISABLED",
      label: t.admin.chatManagement.modes.disabled.label,
      description: t.admin.chatManagement.modes.disabled.description,
    },
    {
      value: "CAMPAIGN",
      label: t.admin.chatManagement.modes.campaign.label,
      description: t.admin.chatManagement.modes.campaign.description,
    },
    {
      value: "CONTACT_CENTER_ENTRY_ID",
      label: t.admin.chatManagement.modes.contactCenterEntryId.label,
      description:
        t.admin.chatManagement.modes.contactCenterEntryId.description,
    },
  ];

  const updateActiveMode = (activeMode: ChatSettings["activeMode"]) => {
    setSettings((current) => ({ ...current, activeMode }));
    setFeedback(null);
    setInvalidField(null);
  };

  const updateText = (
    field:
      | "campaignWebTag"
      | "campaignMemo"
      | "contactCenterEntryIdWebTag"
      | "contactCenterEntryIdMemo",
    value: string,
  ) => {
    setSettings((current) => ({ ...current, [field]: value }));
    setFeedback(null);
    setInvalidField(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || isSubmitting || control.loading || control.loadError) return;
    if (!validateSettingsTabs(event.currentTarget, setActiveSection)) {
      setInvalidField(event.currentTarget.querySelector<HTMLTextAreaElement>("textarea:invalid")?.id ?? null);
      return;
    }
    setFeedback(null);
    setInvalidField(null);

    if (
      [settings.campaignMemo, settings.contactCenterEntryIdMemo].some(
        (memo) =>
          memo !== null &&
          Array.from(memo).length > MAX_CHAT_MEMO_LENGTH,
      )
    ) {
      const campaign = Array.from(settings.campaignMemo ?? "").length > MAX_CHAT_MEMO_LENGTH;
      flushSync(() => {
        setActiveSection(campaign ? "chat-campaign" : "chat-entry-id");
        setInvalidField(campaign ? "chat-settings-campaign-memo" : "chat-settings-contact-center-entry-id-memo");
        setFeedback({ kind: "error", code: SETTINGS_ERROR_CODES.invalidChatMemo });
      });
      return;
    }


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
          className="ml-1 mr-0 max-w-5xl space-y-2"
        >
          <AdminPageTitleHelp
            title={t.admin.chatManagement.title}
            description={t.admin.chatManagement.description}
            label={t.admin.pageDescriptionLabel.replace("{title}", t.admin.chatManagement.title)}
          />
        </div>
        <AdminSettingsTenantSelect control={control} resource="chat-settings" />
        {!control.invalid && !control.loading && !control.loadError && <AdminSettingsTabs
          activeSection={activeSection}
          onSelect={setActiveSection}
          label={t.admin.chatManagement.title}
          items={[
            { key: "chat-method", label: t.admin.chatManagement.methodTab },
            { key: "chat-campaign", label: t.admin.chatManagement.campaignTab },
            { key: "chat-entry-id", label: t.admin.chatManagement.contactCenterEntryId.title },
          ]}
        />}
      </div>

      <div data-admin-page-body className="ml-1 mr-0 mt-6 max-w-5xl">
      <AdminSettingsLoadState control={control} />
      {!control.invalid && !control.loading && !control.loadError && <form data-admin-form noValidate onSubmit={submit} className="space-y-6">
        <AdminSettingsPanel section="chat-method" activeSection={activeSection}>
        <fieldset
          className={settingsSectionClassName}
          aria-describedby="chat-settings-mode-help"
        >
          <legend className="sr-only">
            {t.admin.chatManagement.methodTab}
          </legend>
          <p
            id="chat-settings-mode-help"
            className="text-sm leading-6 text-fg-muted"
          >
            {t.admin.chatManagement.activeModeDescription}
          </p>
          <div className="grid gap-3 lg:grid-cols-3">
            {modeOptions.map(({ value, label, description }) => {
              const inputId = `chat-settings-mode-${value.toLowerCase().replaceAll("_", "-")}`;
              const descriptionId = `${inputId}-description`;
              const isSelected = settings.activeMode === value;

              return (
                <label
                  key={value}
                  htmlFor={inputId}
                  className={`flex min-w-0 cursor-pointer gap-3 rounded-md border p-4 transition-colors has-[:disabled]:cursor-not-allowed focus-within:ring-2 focus-within:ring-accent/40 ${
                    isSelected
                      ? "border-accent bg-surface-selected"
                      : "border-line bg-surface hover:bg-surface-hover"
                  }`}
                >
                  <input
                    id={inputId}
                    name="activeMode"
                    type="radio"
                    value={value}
                    checked={isSelected}
                    disabled={!canEdit || isSubmitting}
                    onChange={() => updateActiveMode(value)}
                    aria-describedby={`${descriptionId} chat-settings-mode-help`}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  <span>
                    <span className="font-semibold">{label}</span>
                    <span
                      id={descriptionId}
                      className="mt-1 block text-sm leading-5 text-fg-muted"
                    >
                      {description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        </AdminSettingsPanel>
        <AdminSettingsPanel section="chat-campaign" activeSection={activeSection}>
        <ChatMethodFieldset
            isSubmitting={isSubmitting}
          title={t.admin.chatManagement.campaign.title}
          description={t.admin.chatManagement.campaign.description}
          isActive={settings.activeMode === "CAMPAIGN"}
          activeLabel={t.admin.chatManagement.active}
          inactiveLabel={t.admin.chatManagement.inactive}
        >
          <div className="space-y-2">
            <label
              htmlFor="chat-settings-campaign-web-tag"
              className="block text-sm font-semibold"
            >
              {t.admin.chatManagement.campaign.webTagLabel}
            </label>
            <textarea
              id="chat-settings-campaign-web-tag"
              aria-invalid={invalidField === "chat-settings-campaign-web-tag" || undefined}
              name="campaignWebTag"
              readOnly={!canEdit}
              value={settings.campaignWebTag ?? ""}
              onChange={(event) =>
                updateText("campaignWebTag", event.target.value)
              }
              required={settings.activeMode === "CAMPAIGN"}
              rows={6}
              maxLength={4096}
              spellCheck={false}
              aria-describedby={`chat-settings-campaign-web-tag-help${feedback ? " chat-settings-feedback" : ""}`}
              placeholder={'<script src="https://…/web-sdk/chat-client.js" data-apikey="…" data-env="us01"></script>'}
              className={`w-full resize-y rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
            />
            <p
              id="chat-settings-campaign-web-tag-help"
              className="text-xs leading-5 text-fg-muted"
            >
              {t.admin.chatManagement.campaign.webTagHelp}
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="chat-settings-campaign-memo"
              className="block text-sm font-semibold"
            >
              {t.admin.chatManagement.campaign.memoLabel}
            </label>
            <textarea
              id="chat-settings-campaign-memo"
              aria-invalid={invalidField === "chat-settings-campaign-memo" || undefined}
              name="campaignMemo"
              readOnly={!canEdit}
              value={settings.campaignMemo ?? ""}
              onChange={(event) =>
                updateText("campaignMemo", event.target.value)
              }
              rows={4}
              aria-describedby={`chat-settings-campaign-memo-help${feedback ? " chat-settings-feedback" : ""}`}
              className={`w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
            />
            <p
              id="chat-settings-campaign-memo-help"
              className="text-xs leading-5 text-fg-muted"
            >
              {t.admin.chatManagement.campaign.memoHelp}
            </p>
          </div>
        </ChatMethodFieldset>

        </AdminSettingsPanel>
        <AdminSettingsPanel section="chat-entry-id" activeSection={activeSection}>
        <ChatMethodFieldset
            isSubmitting={isSubmitting}
          title={t.admin.chatManagement.contactCenterEntryId.title}
          description={
            t.admin.chatManagement.contactCenterEntryId.description
          }
          isActive={settings.activeMode === "CONTACT_CENTER_ENTRY_ID"}
          activeLabel={t.admin.chatManagement.active}
          inactiveLabel={t.admin.chatManagement.inactive}
        >
          <div className="space-y-2">
            <label
              htmlFor="chat-settings-contact-center-entry-id-web-tag"
              className="block text-sm font-semibold"
            >
              {t.admin.chatManagement.contactCenterEntryId.webTagLabel}
            </label>
            <textarea
              id="chat-settings-contact-center-entry-id-web-tag"
              aria-invalid={invalidField === "chat-settings-contact-center-entry-id-web-tag" || undefined}
              name="contactCenterEntryIdWebTag"
              readOnly={!canEdit}
              value={settings.contactCenterEntryIdWebTag ?? ""}
              onChange={(event) =>
                updateText(
                  "contactCenterEntryIdWebTag",
                  event.target.value,
                )
              }
              required={
                settings.activeMode === "CONTACT_CENTER_ENTRY_ID"
              }
              rows={6}
              maxLength={4096}
              spellCheck={false}
              aria-describedby={`chat-settings-contact-center-entry-id-web-tag-help${feedback ? " chat-settings-feedback" : ""}`}
              placeholder={'<script src="https://…/web-sdk/chat-client.js" data-chat-entry-id="…" data-apikey="…" data-env="us01"></script>'}
              className={`w-full resize-y rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
            />
            <p
              id="chat-settings-contact-center-entry-id-web-tag-help"
              className="text-xs leading-5 text-fg-muted"
            >
              {t.admin.chatManagement.contactCenterEntryId.webTagHelp}
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="chat-settings-contact-center-entry-id-memo"
              className="block text-sm font-semibold"
            >
              {t.admin.chatManagement.contactCenterEntryId.memoLabel}
            </label>
            <textarea
              id="chat-settings-contact-center-entry-id-memo"
              aria-invalid={invalidField === "chat-settings-contact-center-entry-id-memo" || undefined}
              name="contactCenterEntryIdMemo"
              readOnly={!canEdit}
              value={settings.contactCenterEntryIdMemo ?? ""}
              onChange={(event) =>
                updateText("contactCenterEntryIdMemo", event.target.value)
              }
              rows={4}
              aria-describedby={`chat-settings-contact-center-entry-id-memo-help${feedback ? " chat-settings-feedback" : ""}`}
              className={`w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
            />
            <p
              id="chat-settings-contact-center-entry-id-memo-help"
              className="text-xs leading-5 text-fg-muted"
            >
              {t.admin.chatManagement.contactCenterEntryId.memoHelp}
            </p>
          </div>
        </ChatMethodFieldset>

        </AdminSettingsPanel>

        {feedback ? (
          <p
            id="chat-settings-feedback"
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

function ChatMethodFieldset({
  isSubmitting,
  title,
  description,
  isActive,
  activeLabel,
  inactiveLabel,
  children,
}: {
  title: string;
  description: string;
  isActive: boolean;
  activeLabel: string;
  inactiveLabel: string;
  children: React.ReactNode;
  isSubmitting: boolean;
}) {
  return (
    <fieldset disabled={isSubmitting} className={settingsSectionClassName}>
      <legend className="sr-only">{title}</legend>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-6 text-fg-muted">
          {description}
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            isActive
              ? "bg-surface-accent-subtle text-accent"
              : "bg-surface-hover text-fg-muted"
          }`}
        >
          {isActive ? activeLabel : inactiveLabel}
        </span>
      </div>
      {children}
    </fieldset>
  );
}
