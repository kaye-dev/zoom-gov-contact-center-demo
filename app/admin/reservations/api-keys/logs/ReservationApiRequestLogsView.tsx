"use client";

import Link from "next/link";

import { ChevronLeftIcon } from "@/app/components/svg/ChevronLeftIcon";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type {
  ReservationApiRequestLogMethod,
  ReservationApiRequestLogResult,
  ReservationApiRequestLogSummary,
} from "@/lib/server/reservation-api-request-logs";

const RESERVATION_API_LOGS_ROUTE = "/admin/reservations/api-keys/logs";
const API_LOG_GRID_CLASS_NAME = "grid w-full grid-cols-[192px_304px_112px_432px_120px_120px_300px] gap-4";

type ReservationApiRequestLogFilters = {
  query: string;
  method: ReservationApiRequestLogMethod | "";
  result: ReservationApiRequestLogResult | "";
};

export function ReservationApiRequestLogsView({
  logs,
  nextCursor,
  filters,
}: {
  logs: ReservationApiRequestLogSummary[];
  nextCursor: string | null;
  filters: ReservationApiRequestLogFilters;
}) {
  const { locale, t } = useI18n();
  const copy = t.admin.reservationManagement.apiKeys.logs;
  const hasLogs = logs.length > 0;

  return (
    <section id="reservation-api-log-list-content" className="min-w-0 space-y-6">
      <div className="max-w-3xl space-y-2">
        <Link id="back-to-api-keys" href="/admin/reservations/api-keys" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
          <ChevronLeftIcon className="h-5 w-5" />
          {copy.backToKeys}
        </Link>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="text-sm leading-6 text-fg-muted">{copy.description}</p>
      </div>

      <section aria-labelledby="api-log-search-heading" className="rounded-lg border border-line bg-surface-raised p-4 shadow-sm md:p-5">
        <h2 id="api-log-search-heading" className="sr-only">{copy.filter.heading}</h2>
        <form id="api-log-filter-form" method="get" action={RESERVATION_API_LOGS_ROUTE} className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(10rem,14rem)_minmax(10rem,14rem)_auto] lg:items-end">
          <label className="block space-y-2">
            <span className="block text-sm font-semibold">{copy.filter.search}</span>
            <input name="query" defaultValue={filters.query} maxLength={100} placeholder={copy.filter.searchPlaceholder} className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
          </label>
          <label className="block space-y-2">
            <span className="block text-sm font-semibold">{copy.filter.method}</span>
            <select name="method" defaultValue={filters.method} className="w-full cursor-pointer rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <option value="">{copy.filter.all}</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
          <label className="block space-y-2">
            <span className="block text-sm font-semibold">{copy.filter.result}</span>
            <select name="result" defaultValue={filters.result} className="w-full cursor-pointer rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <option value="">{copy.filter.all}</option>
              <option value="success">{copy.filter.success}</option>
              <option value="client-error">{copy.filter.clientError}</option>
              <option value="server-error">{copy.filter.serverError}</option>
            </select>
          </label>
          <button type="submit" className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{copy.filter.submit}</button>
        </form>
      </section>

      <section id="api-log-list-card" aria-labelledby="api-log-list-heading" className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="api-log-list-heading" className="text-lg font-bold">{copy.list.title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{copy.list.description}</p>
          </div>
          <p id="api-log-result-count" className="text-sm font-semibold text-fg-muted">{formatTemplate(copy.list.count, { count: formatCount(logs.length, locale) })}</p>
        </div>
        <div id="api-log-list-wrap" hidden={!hasLogs} className="max-w-full overflow-x-auto">
          <div id="api-log-list-grid" className="min-w-[1720px] text-sm">
            <div aria-hidden="true" className={`${API_LOG_GRID_CLASS_NAME} bg-surface px-5 py-3 font-semibold`}>
              <span>{copy.list.requestedAt}</span>
              <span>{copy.list.apiKey}</span>
              <span>{copy.list.method}</span>
              <span>{copy.list.api}</span>
              <span>{copy.list.result}</span>
              <span>{copy.list.duration}</span>
              <span>{copy.list.requestId}</span>
            </div>
            <ol className="divide-y divide-line-subtle">
              {logs.map((log, index) => (
                <li key={log.id}>
                  <Link id={index === 0 ? "api-log-row-primary" : undefined} href={`${RESERVATION_API_LOGS_ROUTE}/${encodeURIComponent(log.id)}`} className={`${API_LOG_GRID_CLASS_NAME} cursor-pointer px-5 py-4 align-top transition-colors hover:bg-surface-hover focus:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent`}>
                    <time dateTime={log.requestedAt}>{formatDateTime(log.requestedAt, locale)}</time>
                    <span className="min-w-0">
                      <strong className="block truncate font-semibold">{log.apiKeyName}</strong>
                      <code className="mt-1 block truncate text-xs text-fg-muted">{log.apiKeyPreview}</code>
                    </span>
                    <span id={index === 0 ? "api-log-row-primary-method" : undefined}>
                      <span className={`inline-flex rounded-full px-2 py-1 font-mono text-xs font-semibold ${methodBadgeClassName(log.method)}`}>{log.method}</span>
                    </span>
                    <span
                      id={index === 0 ? "api-log-row-primary-endpoint" : undefined}
                      title={log.path}
                      className="min-w-0 truncate whitespace-nowrap font-mono text-sm font-semibold text-fg"
                    >
                      {log.path}
                    </span>
                    <span><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClassName(log.statusCode)}`}>{log.statusCode}</span></span>
                    <span>{log.durationMs} ms</span>
                    <code className="min-w-0 truncate text-xs text-fg-muted">{log.id}</code>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div id="api-log-empty" hidden={hasLogs} className="px-5 py-12 text-center">
          <p className="font-semibold">{copy.list.emptyTitle}</p>
          <p className="mt-2 text-sm text-fg-muted">{copy.list.emptyDescription}</p>
        </div>
        <div id="api-log-pagination" hidden={!hasLogs} className="flex justify-end border-t border-line px-5 py-4">
          {nextCursor ? (
            <Link href={buildNextPageHref(filters, nextCursor)} className="rounded-md border border-line px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover">{copy.list.next}</Link>
          ) : (
            <span aria-disabled="true" className="rounded-md border border-line px-4 py-2 text-sm font-semibold">{copy.list.next}</span>
          )}
        </div>
      </section>
    </section>
  );
}

function buildNextPageHref(
  filters: ReservationApiRequestLogFilters,
  cursor: string,
) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.method) params.set("method", filters.method);
  if (filters.result) params.set("result", filters.result);
  params.set("cursor", cursor);
  return `${RESERVATION_API_LOGS_ROUTE}?${params.toString()}`;
}

function methodBadgeClassName(method: ReservationApiRequestLogMethod) {
  if (method === "GET") return "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200";
  if (method === "POST") return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200";
  if (method === "PATCH") return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200";
}

function statusBadgeClassName(statusCode: number) {
  if (statusCode >= 200 && statusCode <= 299) {
    return "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200";
  }
  return "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200";
}

function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
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
