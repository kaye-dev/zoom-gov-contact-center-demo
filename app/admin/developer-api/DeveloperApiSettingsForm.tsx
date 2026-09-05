"use client";

import { settingsSectionClassName, settingsInputFocusClassName } from "@/app/components/admin/settings-form-styles";
import { SettingsSaveScope } from "@/app/components/admin/SettingsSaveScope";
import { AdminPageTitleHelp } from "@/app/components/admin/AdminPageTitleHelp";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PasswordInput } from "@/app/components/PasswordInput";
import {
  isDeveloperApiErrorCode,
  type DeveloperApiErrorCode,
  type DeveloperApiSecretField,
  type DeveloperApiSecretRevealResponse,
  type DeveloperApiSettingsSnapshot,
  type DeveloperApiSettingsUpdate,
} from "@/lib/developer-api-settings";

import { useI18n } from "../../i18n/LanguageProvider";
import { DeveloperApiSectionTabs } from "./DeveloperApiSectionTabs";

type Props = { initialSettings: DeveloperApiSettingsSnapshot; canEdit: boolean };
type Section = DeveloperApiSettingsUpdate["section"];
type Feedback =
  | { kind: "success" }
  | { kind: "error"; code?: DeveloperApiErrorCode };
type SecretOrigin = "masked" | "stored" | "replacement";
type SecretState = {
  value: string;
  origin: SecretOrigin;
  visible: boolean;
  revealing: boolean;
};

const SECRET_PLACEHOLDER = "••••••••••••";
const MASKED_SECRET: SecretState = {
  value: "",
  origin: "masked",
  visible: false,
  revealing: false,
};

function secretRevealState(state: SecretState) {
  if (state.revealing) return "revealing";
  if (state.origin === "stored" && state.visible) return "stored-visible";
  if (state.origin === "replacement") {
    return state.visible ? "replacement-visible" : "replacement-masked";
  }
  return "masked";
}

export function DeveloperApiSettingsForm({ initialSettings, canEdit }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>("server-to-server-oauth");
  const [settings, setSettings] = useState(initialSettings);
  const [clientSecret, setClientSecret] = useState<SecretState>(MASKED_SECRET);
  const [secretToken, setSecretToken] = useState<SecretState>(MASKED_SECRET);
  const [feedback, setFeedback] = useState<Partial<Record<Section, Feedback>>>({});
  const [submitting, setSubmitting] = useState<Partial<Record<Section, boolean>>>({});
  const copy = t.admin.developerApiManagement;
  const inputClass =
    `w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors ${settingsInputFocusClassName}`;

  const clearFeedback = (section: Section) => {
    setFeedback((current) => ({ ...current, [section]: undefined }));
  };

  const updateIdentifier = (field: "accountId" | "clientId", value: string) => {
    setSettings((current) => ({ ...current, [field]: value }));
    clearFeedback("server-to-server-oauth");
  };

  const updateSecret = (field: DeveloperApiSecretField, value: string) => {
    const update = (current: SecretState): SecretState => ({
      ...current,
      value,
      origin: "replacement",
    });
    if (field === "clientSecret") {
      setClientSecret(update);
      clearFeedback("server-to-server-oauth");
    } else {
      setSecretToken(update);
      clearFeedback("webhook-only-app");
    }
  };

  const setSecretVisibility = (
    field: DeveloperApiSecretField,
    nextVisible: boolean,
  ) => {
    const state = field === "clientSecret" ? clientSecret : secretToken;
    const configured =
      field === "clientSecret"
        ? settings.clientSecretConfigured
        : settings.secretTokenConfigured;
    const setState = field === "clientSecret" ? setClientSecret : setSecretToken;

    if (!nextVisible) {
      setState((current) =>
        current.origin === "stored"
          ? MASKED_SECRET
          : { ...current, visible: false },
      );
      return;
    }
    if (state.origin === "replacement" || state.value !== "" || !configured) {
      setState((current) => ({ ...current, visible: true }));
      return;
    }
    void revealSecret(field, setState);
  };

  const revealSecret = async (
    field: DeveloperApiSecretField,
    setState: (value: SecretState | ((current: SecretState) => SecretState)) => void,
  ) => {
    const section: Section =
      field === "clientSecret"
        ? "server-to-server-oauth"
        : "webhook-only-app";
    clearFeedback(section);
    setState((current) => ({ ...current, revealing: true }));

    try {
      const response = await fetch("/api/admin/developer-api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | (Partial<DeveloperApiSecretRevealResponse> & { error?: unknown })
        | null;
      if (
        !response.ok ||
        body?.field !== field ||
        typeof body.value !== "string"
      ) {
        setState(MASKED_SECRET);
        setFeedback((current) => ({
          ...current,
          [section]: {
            kind: "error",
            code: isDeveloperApiErrorCode(body?.error) ? body.error : undefined,
          },
        }));
        return;
      }
      setState({
        value: body.value,
        origin: "stored",
        visible: true,
        revealing: false,
      });
    } catch {
      setState(MASKED_SECRET);
      setFeedback((current) => ({
        ...current,
        [section]: { kind: "error" },
      }));
    }
  };

  const submit =
    (section: Section) => async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canEdit || submitting[section]) return;
      clearFeedback(section);
      setSubmitting((current) => ({ ...current, [section]: true }));

      const update: DeveloperApiSettingsUpdate =
        section === "server-to-server-oauth"
          ? {
              section,
              accountId: settings.accountId,
              clientId: settings.clientId,
              ...(clientSecret.origin === "replacement" && clientSecret.value
                ? { clientSecret: clientSecret.value }
                : {}),
            }
          : {
              section,
              ...(secretToken.origin === "replacement" && secretToken.value
                ? { secretToken: secretToken.value }
                : {}),
            };

      try {
        const response = await fetch("/api/admin/developer-api", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        const body = (await response.json().catch(() => null)) as
          | { settings?: DeveloperApiSettingsSnapshot; error?: unknown }
          | null;
        if (!response.ok || !body?.settings) {
          setFeedback((current) => ({
            ...current,
            [section]: {
              kind: "error",
              code: isDeveloperApiErrorCode(body?.error) ? body.error : undefined,
            },
          }));
          return;
        }

        setSettings(body.settings);
        if (section === "server-to-server-oauth") setClientSecret(MASKED_SECRET);
        else setSecretToken(MASKED_SECRET);
        setFeedback((current) => ({
          ...current,
          [section]: { kind: "success" },
        }));
        router.refresh();
      } catch {
        setFeedback((current) => ({
          ...current,
          [section]: { kind: "error" },
        }));
      } finally {
        setSubmitting((current) => ({ ...current, [section]: false }));
      }
    };

  const feedbackMessage = (section: Section) => {
    const value = feedback[section];
    if (!value) return null;
    if (value.kind === "success") return t.admin.settings.saved;
    return value.code ? copy.errors[value.code] : t.admin.settings.saveError;
  };

  return (
    <section id="developer-api-content">
      <div data-admin-page-chrome className="space-y-4">
        <div
          data-admin-page-header
          className="ml-1 mr-0 max-w-5xl space-y-2"
        >
          <AdminPageTitleHelp
            title={copy.title}
            description={copy.description}
            label={t.admin.pageDescriptionLabel.replace("{title}", copy.title)}
          />
        </div>
        <DeveloperApiSectionTabs
          activeSection={activeSection}
          onSelect={setActiveSection}
          label={copy.title}
          oauthLabel={copy.oauthTitle}
          webhookLabel={copy.webhookTitle}
        />
      </div>

      <div
        id="developer-api-form"
        data-admin-page-body
        className="ml-1 mr-0 mt-6 max-w-5xl space-y-6"
      >
        <div id="server-to-server-oauth-panel" role="tabpanel" aria-labelledby="server-to-server-oauth-tab" tabIndex={0} hidden={activeSection !== "server-to-server-oauth"}>
        <form
          id="server-to-server-oauth-form"
          onSubmit={submit("server-to-server-oauth")}
          className="space-y-4"
        >
          <fieldset
            id="server-to-server-oauth"
            className={settingsSectionClassName}
          >
            <legend className="sr-only">{copy.oauthTitle}</legend>
            <p className="text-sm leading-6 text-fg-muted">{copy.oauthDescription}</p>
            <div id="oauth-fields" className="max-w-xl space-y-5">
              <label id="account-id-field" className="block space-y-2">
                <span className="block text-sm font-semibold">{copy.accountId}</span>
                <input
                  id="account-id"
                  name="accountId"
                  required
                  maxLength={255}
                  autoComplete="off"
                  readOnly={!canEdit || Boolean(submitting["server-to-server-oauth"])}
                  value={settings.accountId}
                  onChange={(event) => updateIdentifier("accountId", event.target.value)}
                  className={inputClass}
                />
              </label>
              <label id="client-id-field" className="block space-y-2">
                <span className="block text-sm font-semibold">{copy.clientId}</span>
                <input
                  id="client-id"
                  name="clientId"
                  required
                  maxLength={255}
                  autoComplete="off"
                  readOnly={!canEdit || Boolean(submitting["server-to-server-oauth"])}
                  value={settings.clientId}
                  onChange={(event) => updateIdentifier("clientId", event.target.value)}
                  className={inputClass}
                />
              </label>
              <div id="client-secret-field" className="space-y-2">
                <PasswordInput
                  id="client-secret"
                  visibilityButtonId="client-secret-visibility"
                  name="clientSecret"
                  label={copy.clientSecret}
                  value={clientSecret.value}
                  onChange={(event) => {
                    updateSecret("clientSecret", event.target.value);
                  }}
                  required={!settings.clientSecretConfigured}
                  maxLength={4096}
                  autoComplete="new-password"
                  placeholder={settings.clientSecretConfigured ? SECRET_PLACEHOLDER : undefined}
                  aria-busy={clientSecret.revealing || undefined}
                  data-configured={settings.clientSecretConfigured}
                  data-reveal-state={secretRevealState(clientSecret)}
                  visible={clientSecret.visible}
                  onVisibleChange={(visible) =>
                    setSecretVisibility("clientSecret", visible)
                  }
                  visibilityBusy={clientSecret.revealing}
                  readOnly={
                    !canEdit || Boolean(submitting["server-to-server-oauth"])
                  }
                  disabled={
                    Boolean(submitting["server-to-server-oauth"]) ||
                    (!canEdit && !settings.clientSecretConfigured)
                  }
                  className={`placeholder:text-fg-muted ${settingsInputFocusClassName}`}
                />
              </div>
            </div>
          </fieldset>
          <SectionFeedback
            id="server-to-server-oauth-feedback"
            value={feedback["server-to-server-oauth"]}
            message={feedbackMessage("server-to-server-oauth")}
          />
          <SaveButton
            id="save-server-to-server-oauth"
            disabled={!canEdit || Boolean(submitting["server-to-server-oauth"])}
            isSubmitting={Boolean(submitting["server-to-server-oauth"])}
            saveLabel={t.admin.settings.save}
            savingLabel={t.admin.settings.saving}
          />
        </form>

        </div>
        <div id="webhook-only-app-panel" role="tabpanel" aria-labelledby="webhook-only-app-tab" tabIndex={0} hidden={activeSection !== "webhook-only-app"}>
        <form
          id="webhook-only-app-form"
          onSubmit={submit("webhook-only-app")}
          className="space-y-4"
        >
          <fieldset
            id="webhook-only-app"
            className={settingsSectionClassName}
          >
            <legend className="sr-only">{copy.webhookTitle}</legend>
            <p className="text-sm leading-6 text-fg-muted">{copy.webhookDescription}</p>
            <div id="secret-token-field" className="max-w-xl space-y-2">
              <PasswordInput
                id="secret-token"
                visibilityButtonId="secret-token-visibility"
                name="secretToken"
                label={copy.secretToken}
                value={secretToken.value}
                onChange={(event) => {
                  updateSecret("secretToken", event.target.value);
                }}
                required={!settings.secretTokenConfigured}
                maxLength={4096}
                autoComplete="new-password"
                placeholder={settings.secretTokenConfigured ? SECRET_PLACEHOLDER : undefined}
                aria-busy={secretToken.revealing || undefined}
                data-configured={settings.secretTokenConfigured}
                data-reveal-state={secretRevealState(secretToken)}
                visible={secretToken.visible}
                onVisibleChange={(visible) =>
                  setSecretVisibility("secretToken", visible)
                }
                visibilityBusy={secretToken.revealing}
                readOnly={!canEdit || Boolean(submitting["webhook-only-app"])}
                disabled={
                  Boolean(submitting["webhook-only-app"]) ||
                  (!canEdit && !settings.secretTokenConfigured)
                }
                className={`placeholder:text-fg-muted ${settingsInputFocusClassName}`}
              />
            </div>
          </fieldset>
          <SectionFeedback
            id="webhook-only-app-feedback"
            value={feedback["webhook-only-app"]}
            message={feedbackMessage("webhook-only-app")}
          />
          <SaveButton
            id="save-webhook-only-app"
            disabled={!canEdit || Boolean(submitting["webhook-only-app"])}
            isSubmitting={Boolean(submitting["webhook-only-app"])}
            saveLabel={t.admin.settings.save}
            savingLabel={t.admin.settings.saving}
          />
        </form>
        </div>
      </div>
    </section>
  );
}

function SectionFeedback({
  id,
  value,
  message,
}: {
  id: string;
  value?: Feedback;
  message: string | null;
}) {
  if (!value || !message) return null;
  return (
    <p
      id={id}
      role={value.kind === "error" ? "alert" : "status"}
      aria-live={value.kind === "error" ? "assertive" : "polite"}
      className={`rounded-md px-4 py-3 text-sm ${
        value.kind === "error"
          ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-200"
          : "bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-200"
      }`}
    >
      {message}
    </p>
  );
}

function SaveButton({
  id,
  disabled,
  isSubmitting,
  saveLabel,
  savingLabel,
}: {
  id: string;
  disabled: boolean;
  isSubmitting: boolean;
  saveLabel: string;
  savingLabel: string;
}) {
  return (
    <>
    <SettingsSaveScope scope="section" id={`${id}-scope`} />
    <button
      aria-describedby={`${id}-scope`}
      id={id}
      type="submit"
      disabled={disabled}
      className="cursor-pointer rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSubmitting ? savingLabel : saveLabel}
    </button>
    </>
  );
}
