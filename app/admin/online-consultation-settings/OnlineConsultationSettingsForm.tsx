"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AdminPageTitleHelp } from "@/app/components/admin/AdminPageTitleHelp";
import { settingsInputFocusClassName } from "@/app/components/admin/settings-form-styles";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { univContent } from "@/app/tenants/univ/content";
import {
  ONLINE_CONSULTATION_ERROR_CODES,
  UNIVERSITY_CONSULTATION_SERVICES,
  parseVideoClientWebTag,
  type OnlineConsultationSetting,
  type UniversityConsultationService,
} from "@/lib/online-consultation-settings";

import { AdminSettingsPanel, AdminSettingsTabs } from "../AdminSettingsTabs";

type Props = {
  initialSettings: OnlineConsultationSetting[];
  siteName: string;
  canEdit: boolean;
};

const serviceMemos: Record<UniversityConsultationService, string> = {
  admissions: "大学入試相談窓口",
  "student-support": "学生生活・奨学金相談窓口",
  careers: "キャリア相談窓口",
};

export function OnlineConsultationSettingsForm({
  initialSettings,
  siteName,
  canEdit,
}: Props) {
  const { locale, t } = useI18n();
  const previewState = useSearchParams().get("state");
  const content = univContent[locale];
  const serviceLabels = Object.fromEntries(
    UNIVERSITY_CONSULTATION_SERVICES.map((serviceKey, index) => [
      serviceKey,
      content.consultation.services[index][0],
    ]),
  ) as Record<UniversityConsultationService, string>;
  const [activeSection, setActiveSection] =
    useState<UniversityConsultationService>("admissions");
  const [tags, setTags] = useState<
    Record<UniversityConsultationService, string>
  >(
    () =>
      Object.fromEntries(
        UNIVERSITY_CONSULTATION_SERVICES.map((serviceKey) => [
          serviceKey,
          initialSettings.find((setting) => setting.serviceKey === serviceKey)
            ?.webClientTag ?? "",
        ]),
      ) as Record<UniversityConsultationService, string>,
  );
  const [invalidService, setInvalidService] =
    useState<UniversityConsultationService | null>(
      previewState === "admin-error" ? "admissions" : null,
    );
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(
    previewState === "admin-saved" ? "saved" : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const invalid = UNIVERSITY_CONSULTATION_SERVICES.find(
      (serviceKey) => parseVideoClientWebTag(tags[serviceKey]) === null,
    );
    if (invalid) {
      setActiveSection(invalid);
      setInvalidService(invalid);
      setFeedback(null);
      return;
    }

    setInvalidService(null);
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/online-consultation-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: UNIVERSITY_CONSULTATION_SERVICES.map((serviceKey) => ({
            serviceKey,
            webClientTag: tags[serviceKey],
          })),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        saved?: boolean;
        error?: string;
      } | null;
      setFeedback(response.ok && body?.saved ? "saved" : "error");
    } catch {
      setFeedback("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = `${t.admin.onlineConsultation}${locale === "ja" ? "管理" : ""}`;
  return (
    <section>
      <div data-admin-page-chrome className="space-y-4">
        <div data-admin-page-header className="ml-1 mr-0 max-w-5xl space-y-2">
          <AdminPageTitleHelp
            title={title}
            description="3種類のオンライン相談窓口に、接続用Webタグを設定します。"
            label={t.admin.pageDescriptionLabel.replace("{title}", title)}
          />
        </div>
        <AdminSettingsTabs
          activeSection={activeSection}
          onSelect={setActiveSection}
          label={title}
          items={UNIVERSITY_CONSULTATION_SERVICES.map((serviceKey) => ({
            key: serviceKey,
            label: serviceLabels[serviceKey],
          }))}
        />
      </div>

      <form
        data-admin-form
        noValidate
        onSubmit={submit}
        className="ml-1 mr-0 mt-6 max-w-5xl space-y-6"
      >
        {UNIVERSITY_CONSULTATION_SERVICES.map((serviceKey) => {
          const invalid = invalidService === serviceKey;
          const inputId = `online-consultation-tag-${serviceKey}`;
          return (
            <AdminSettingsPanel
              key={serviceKey}
              section={serviceKey}
              activeSection={activeSection}
            >
              <fieldset className="space-y-6">
                <legend className="sr-only">
                  {serviceLabels[serviceKey]}の接続設定
                </legend>
                <div>
                  <p className="text-lg font-bold">
                    {serviceLabels[serviceKey]}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-fg-muted">
                    オンライン相談サービスで発行した接続用Webタグを設定します。
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={inputId}
                    className="block text-sm font-semibold"
                  >
                    {content.consultation.connectionTag}
                  </label>
                  <textarea
                    id={inputId}
                    rows={7}
                    required
                    readOnly={!canEdit}
                    value={
                      previewState === "admin-default" ||
                      previewState === "admin-saved"
                        ? "設定済み（値は安全のためprototypeでは表示しません）"
                        : tags[serviceKey]
                    }
                    onChange={(event) => {
                      setTags((current) => ({
                        ...current,
                        [serviceKey]: event.target.value,
                      }));
                      setInvalidService(null);
                      setFeedback(null);
                    }}
                    aria-invalid={invalid}
                    aria-describedby={`${inputId}-help${invalid ? ` ${inputId}-error` : ""}`}
                    className={`w-full resize-y rounded-md border ${
                      invalid ? "border-red-600" : "border-line"
                    } bg-surface px-3 py-2 font-mono text-sm text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
                  />
                  <p
                    id={`${inputId}-help`}
                    className="text-xs leading-5 text-fg-muted"
                  >
                    仕様に適合する接続用Webタグだけを受け付けます。
                  </p>
                  {invalid ? (
                    <p
                      id={`${inputId}-error`}
                      role="alert"
                      className="text-sm font-semibold text-red-700 dark:text-red-400"
                    >
                      接続用Webタグを入力してください。
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor={`online-consultation-memo-${serviceKey}`}
                    className="block text-sm font-semibold"
                  >
                    管理メモ
                  </label>
                  <textarea
                    id={`online-consultation-memo-${serviceKey}`}
                    rows={4}
                    readOnly={!canEdit}
                    defaultValue={serviceMemos[serviceKey]}
                    className={`w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors ${settingsInputFocusClassName}`}
                  />
                </div>
              </fieldset>
            </AdminSettingsPanel>
          );
        })}

        <div className="border-l-4 border-primary-500 bg-primary-50 px-4 py-3 text-sm leading-6 dark:bg-surface-raised">
          <p className="font-bold">保存範囲</p>
          <p className="text-fg-muted">
            3種類すべてのオンライン相談設定を、この大学テナントに保存します。
          </p>
        </div>
        {feedback === "saved" ? (
          <p
            role="status"
            className="border-l-4 border-green-600 bg-green-50 px-4 py-3 font-semibold text-green-900 dark:bg-surface-raised dark:text-green-300"
          >
            {siteName}のオンライン相談設定を保存しました。
          </p>
        ) : feedback === "error" ? (
          <p
            role="alert"
            className="font-semibold text-red-700 dark:text-red-400"
          >
            {ONLINE_CONSULTATION_ERROR_CODES.saveFailed}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!canEdit || isSubmitting}
          className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-md bg-primary px-6 py-3 font-bold text-white hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {isSubmitting ? "保存中" : "設定を保存"}
        </button>
      </form>
    </section>
  );
}
