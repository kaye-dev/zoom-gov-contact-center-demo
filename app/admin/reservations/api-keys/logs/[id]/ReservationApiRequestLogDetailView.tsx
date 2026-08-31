"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ChevronLeftIcon } from "@/app/components/svg/ChevronLeftIcon";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type { ReservationApiRequestLogDetail } from "@/lib/server/reservation-api-request-logs";

import {
  ReservationApiJsonCodeBlock,
  type ReservationApiJsonValue,
} from "./ReservationApiJsonCodeBlock";

const RESERVATION_API_LOGS_ROUTE = "/admin/reservations/api-keys/logs";

export function ReservationApiRequestLogDetailView({
  log,
}: {
  log: ReservationApiRequestLogDetail;
}) {
  const { locale, t } = useI18n();
  const copy = t.admin.reservationManagement.apiKeys.logs.detail;
  const requestJson: ReservationApiJsonValue = {
    pathParameters: log.pathParameters,
    query: log.query,
    body: log.requestBody,
  };
  const requestId = responseRequestId(log.responseBody) ?? log.id;
  const successful = log.statusCode >= 200 && log.statusCode <= 299;

  return (
    <section id="reservation-api-log-detail-content" className="min-w-0 space-y-6">
      <div className="space-y-3">
        <Link id="back-to-api-logs" href={RESERVATION_API_LOGS_ROUTE} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
          <ChevronLeftIcon className="h-5 w-5" />
          {copy.back}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{copy.title}</h1>
            <code id="api-log-detail-id" className="mt-2 block break-all text-xs text-fg-muted">{log.id}</code>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${statusBadgeClassName(log.statusCode)}`}>{formatStatusLabel(log.statusCode, copy.created)}</span>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section id="api-log-request" aria-labelledby="api-log-request-heading" className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 id="api-log-request-heading" className="text-lg font-bold">{copy.request}</h2>
                <p className="mt-1 text-sm text-fg-muted"><span className={`font-mono font-semibold ${methodTextClassName(log.method)}`}>{log.method}</span> {log.path}</p>
              </div>
              <span className="text-sm font-semibold text-fg-muted">{log.permission}</span>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm leading-6 text-fg-muted">{copy.credentialNotice}</p>
              <div>
                <h3 className="text-sm font-semibold">{copy.normalizedJson}</h3>
                <ReservationApiJsonCodeBlock
                  id="api-log-request-json"
                  value={requestJson}
                  copyLabel={copy.requestCopyLabel}
                  copiedMessage={copy.requestCopied}
                  copyFailedMessage={copy.requestCopyFailed}
                />
              </div>
            </div>
          </section>

          <section id="api-log-response" aria-labelledby="api-log-response-heading" className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 id="api-log-response-heading" className="text-lg font-bold">{copy.response}</h2>
                <p className="mt-1 text-sm text-fg-muted">{formatTemplate(copy.httpStatus, { status: String(log.statusCode) })}</p>
              </div>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClassName(log.statusCode)}`}>{successful ? copy.success : copy.failure}</span>
            </div>
            <div className="p-5">
              <h3 className="text-sm font-semibold">{copy.json}</h3>
              <ReservationApiJsonCodeBlock
                id="api-log-response-json"
                value={log.responseBody}
                copyLabel={copy.responseCopyLabel}
                copiedMessage={copy.responseCopied}
                copyFailedMessage={copy.responseCopyFailed}
              />
            </div>
          </section>
        </div>

        <aside id="api-log-properties" aria-labelledby="api-log-properties-heading" className="rounded-lg border border-line bg-surface-raised shadow-sm lg:sticky lg:top-24">
          <div className="border-b border-line px-5 py-4"><h2 id="api-log-properties-heading" className="text-lg font-bold">{copy.properties}</h2></div>
          <dl className="divide-y divide-line-subtle text-sm">
            <Property label={copy.requestedAt}><time dateTime={log.requestedAt}>{formatDateTime(log.requestedAt, locale)}</time></Property>
            <Property label={copy.apiKey}><strong className="block font-semibold">{log.apiKeyName}</strong><code className="mt-1 block break-all text-xs text-fg-muted">{log.apiKeyPreview}</code></Property>
            <Property label={copy.method}><span className="font-mono">{log.method}</span></Property>
            <Property label={copy.permission}><span className="font-mono">{log.permission}</span></Property>
            <Property label={copy.status}>{log.statusCode}</Property>
            <Property label={copy.duration}>{log.durationMs} ms</Property>
            <Property label={copy.completedAt}><time dateTime={log.completedAt}>{formatDateTime(log.completedAt, locale)}</time></Property>
            <Property label={copy.requestId}><code className="break-all text-xs">{requestId}</code></Property>
            <Property label={copy.idempotencyOutcome}>{log.idempotencyOutcome ?? copy.notApplicable}</Property>
            <Property label={copy.responseLocation}>{log.responseLocation ? <code className="break-all text-xs">{log.responseLocation}</code> : copy.notApplicable}</Property>
            <Property label={copy.responseEtag}>{log.responseEtag ? <code className="break-all text-xs">{log.responseEtag}</code> : copy.notApplicable}</Property>
          </dl>
        </aside>
      </div>
    </section>
  );
}

function responseRequestId(value: ReservationApiRequestLogDetail["responseBody"]): string | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return typeof value.requestId === "string" ? value.requestId : null;
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-5 py-3"><dt className="text-fg-muted">{label}</dt><dd>{children}</dd></div>;
}

function statusBadgeClassName(statusCode: number) {
  if (statusCode >= 200 && statusCode <= 299) {
    return "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200";
  }
  return "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200";
}

function methodTextClassName(method: string) {
  if (method === "GET") return "text-green-700 dark:text-green-300";
  if (method === "POST") return "text-blue-700 dark:text-blue-300";
  if (method === "PUT" || method === "PATCH") return "text-amber-700 dark:text-amber-300";
  return "text-red-700 dark:text-red-300";
}

function formatStatusLabel(statusCode: number, created: string) {
  return statusCode === 201 ? `${statusCode} ${created}` : String(statusCode);
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function localeTag(locale: string) {
  return { ja: "ja-JP", en: "en-US", "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", ko: "ko-KR" }[locale] ?? "ja-JP";
}

function formatTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, value),
    template,
  );
}
