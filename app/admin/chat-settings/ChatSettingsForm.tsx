"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  MAX_CHAT_MEMO_LENGTH,
  type ChatSettings,
} from "@/lib/chat-settings";
import {
  SETTINGS_ERROR_CODES,
  isSettingsErrorCode,
  type SettingsErrorCode,
} from "@/lib/site-settings";

import { useI18n } from "../../i18n/LanguageProvider";

type ChatSettingsFormProps = {
  initialSettings: ChatSettings;
};

type Feedback =
  | { kind: "success" }
  | { kind: "error"; code?: SettingsErrorCode };

export function ChatSettingsForm({
  initialSettings,
}: ChatSettingsFormProps) {
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
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (
      [settings.campaignMemo, settings.contactCenterEntryIdMemo].some(
        (memo) =>
          memo !== null &&
          Array.from(memo).length > MAX_CHAT_MEMO_LENGTH,
      )
    ) {
      setFeedback({
        kind: "error",
        code: SETTINGS_ERROR_CODES.invalidChatMemo,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/chat-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = (await response.json().catch(() => null)) as
        | { saved?: boolean; error?: unknown }
        | null;

      if (!response.ok || body?.saved !== true) {
        setFeedback({
          kind: "error",
          code: isSettingsErrorCode(body?.error) ? body.error : undefined,
        });
        return;
      }

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
          {t.admin.chatManagement.title}
        </h1>
        <p className="text-sm leading-6 text-fg-muted">
          {t.admin.chatManagement.description}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <fieldset
          className="space-y-4 rounded-lg border border-line bg-surface-raised p-5 shadow-sm md:p-6"
          aria-describedby="chat-settings-mode-help"
        >
          <legend className="px-2 text-lg font-bold">
            {t.admin.chatManagement.activeModeTitle}
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
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-accent/40 ${
                    isSelected
                      ? "border-primary bg-primary-50 dark:bg-primary-950/40"
                      : "border-line bg-surface hover:bg-surface-hover"
                  }`}
                >
                  <input
                    id={inputId}
                    name="activeMode"
                    type="radio"
                    value={value}
                    checked={isSelected}
                    onChange={() => updateActiveMode(value)}
                    aria-describedby={`${descriptionId} chat-settings-mode-help`}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="block font-bold">{label}</span>
                    <span
                      id={descriptionId}
                      className="block text-sm leading-5 text-fg-muted"
                    >
                      {description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <ChatMethodFieldset
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
              name="campaignWebTag"
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
              className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
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
              name="campaignMemo"
              value={settings.campaignMemo ?? ""}
              onChange={(event) =>
                updateText("campaignMemo", event.target.value)
              }
              rows={4}
              aria-describedby={`chat-settings-campaign-memo-help${feedback ? " chat-settings-feedback" : ""}`}
              className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            <p
              id="chat-settings-campaign-memo-help"
              className="text-xs leading-5 text-fg-muted"
            >
              {t.admin.chatManagement.campaign.memoHelp}
            </p>
          </div>
        </ChatMethodFieldset>

        <ChatMethodFieldset
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
              name="contactCenterEntryIdWebTag"
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
              className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
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
              name="contactCenterEntryIdMemo"
              value={settings.contactCenterEntryIdMemo ?? ""}
              onChange={(event) =>
                updateText("contactCenterEntryIdMemo", event.target.value)
              }
              rows={4}
              aria-describedby={`chat-settings-contact-center-entry-id-memo-help${feedback ? " chat-settings-feedback" : ""}`}
              className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            <p
              id="chat-settings-contact-center-entry-id-memo-help"
              className="text-xs leading-5 text-fg-muted"
            >
              {t.admin.chatManagement.contactCenterEntryId.memoHelp}
            </p>
          </div>
        </ChatMethodFieldset>

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

function ChatMethodFieldset({
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
}) {
  return (
    <fieldset className="space-y-5 rounded-lg border border-line bg-surface-raised p-5 shadow-sm md:p-6">
      <legend className="px-2 text-lg font-bold">{title}</legend>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-6 text-fg-muted">
          {description}
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            isActive
              ? "bg-primary-50 text-primary-1100 dark:bg-primary-950 dark:text-primary-100"
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
