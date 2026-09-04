"use client";

import Link from "next/link";

import { Select } from "@/app/components/Select";
import { ChevronLeftIcon } from "@/app/components/svg/ChevronLeftIcon";
import { useI18n } from "@/app/i18n/LanguageProvider";
import {
  RESERVATION_SERVICE_KEYS,
  getReservationService,
  type ReservationServiceKey,
} from "@/lib/reservations";
import type {
  ReservationBookingListSource,
  ReservationBookingListSummary,
} from "@/lib/server/reservation-bookings";

const RESERVATION_BOOKINGS_ROUTE = "/admin/reservations/bookings";
const BOOKING_GRID_CLASS_NAME =
  "grid w-full grid-cols-[220px_280px_230px_120px_230px] gap-4";

type ReservationBookingFilters = {
  service: ReservationServiceKey | "";
  source: ReservationBookingListSource | "";
};

export function ReservationBookingsView({
  bookings,
  nextCursor,
  filters,
}: {
  bookings: ReservationBookingListSummary[];
  nextCursor: string | null;
  filters: ReservationBookingFilters;
}) {
  const { locale, t } = useI18n();
  const copy = t.admin.reservationManagement.bookings;
  const reservationCopy = t.admin.reservationManagement;
  const hasBookings = bookings.length > 0;

  return (
    <section id="reservation-booking-list-content" className="min-w-0 space-y-6">
      <div className="max-w-3xl space-y-2">
        <Link
          id="back-to-reservation-system"
          href="/admin/reservations"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
        >
          <ChevronLeftIcon className="h-5 w-5" />
          {copy.back}
        </Link>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="text-sm leading-6 text-fg-muted">{copy.description}</p>
      </div>

      <section
        aria-labelledby="reservation-booking-filter-heading"
        className="rounded-lg border border-line bg-surface-raised p-4 shadow-sm md:p-5"
      >
        <h2 id="reservation-booking-filter-heading" className="sr-only">
          {copy.filter.heading}
        </h2>
        <form
          id="reservation-booking-filter-form"
          method="get"
          action={RESERVATION_BOOKINGS_ROUTE}
          className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)_auto] md:items-end"
        >
          <label className="block space-y-2">
            <span className="block text-sm font-semibold">{copy.filter.service}</span>
            <Select id="booking-service-filter" name="service" defaultValue={filters.service}>
              <option value="">{copy.filter.allServices}</option>
              {RESERVATION_SERVICE_KEYS.map((serviceKey) => (
                <option key={serviceKey} value={serviceKey}>
                  {reservationCopy.services[serviceKey].name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-2">
            <span className="block text-sm font-semibold">{copy.filter.source}</span>
            <Select id="booking-source-filter" name="source" defaultValue={filters.source}>
              <option value="">{copy.filter.allSources}</option>
              <option value="ZVA">{copy.filter.zva}</option>
              <option value="DEMO">{copy.filter.demo}</option>
            </Select>
          </label>
          <button
            id="booking-filter-submit"
            type="submit"
            className="cursor-pointer rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {copy.filter.submit}
          </button>
        </form>
      </section>

      <section
        id="reservation-booking-list-card"
        aria-labelledby="reservation-booking-list-heading"
        className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="reservation-booking-list-heading" className="text-lg font-bold">
              {copy.list.title}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{copy.list.description}</p>
          </div>
          <p id="reservation-booking-result-count" className="text-sm font-semibold text-fg-muted">
            {formatTemplate(copy.list.count, {
              count: new Intl.NumberFormat(localeTag(locale)).format(bookings.length),
            })}
          </p>
        </div>

        <div
          id="reservation-booking-list-wrap"
          hidden={!hasBookings}
          role="region"
          aria-label={copy.list.scrollRegion}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            event.currentTarget.scrollBy({
              left: event.key === "ArrowRight" ? 48 : -48,
            });
          }}
          className="max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        >
          <div id="reservation-booking-list-grid" className="min-w-[1080px] text-sm">
            <div
              aria-hidden="true"
              className={`${BOOKING_GRID_CLASS_NAME} bg-surface px-5 py-3 font-semibold`}
            >
              <span>{copy.list.reservationDateTime}</span>
              <span>{copy.list.service}</span>
              <span>{copy.list.reservationId}</span>
              <span>{copy.list.source}</span>
              <span>{copy.list.createdAt}</span>
            </div>
            <ol id="reservation-booking-rows" className="divide-y divide-line-subtle">
              {bookings.map((booking) => (
                <li
                  key={booking.id}
                  data-source={booking.source === "DEMO" ? booking.source : undefined}
                  className={`${BOOKING_GRID_CLASS_NAME} px-5 py-4`}
                >
                  <time dateTime={reservationDateTimeValue(booking)}>
                    {formatReservationDateTime(booking, locale, copy.unknownEndTime)}
                  </time>
                  <strong className="font-semibold">
                    {reservationCopy.services[booking.serviceKey].name}
                  </strong>
                  <code className="truncate text-xs text-fg-muted">{booking.id}</code>
                  <span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${sourceBadgeClassName(booking.source)}`}>
                      {reservationCopy.sources[booking.source]}
                    </span>
                  </span>
                  <time dateTime={formatIsoAttribute(booking.createdAt)}>
                    {formatDateTime(booking.createdAt, locale)}
                  </time>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div id="reservation-booking-empty" hidden={hasBookings} className="px-5 py-12 text-center">
          <p className="font-semibold">{copy.list.emptyTitle}</p>
          <p className="mt-2 text-sm text-fg-muted">{copy.list.emptyDescription}</p>
        </div>
        <div
          id="reservation-booking-pagination"
          hidden={!hasBookings}
          className="flex justify-end border-t border-line px-5 py-4"
        >
          {nextCursor ? (
            <Link
              href={buildReservationBookingListNextHref(filters, nextCursor)}
              className="rounded-md border border-line px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover"
            >
              {copy.list.next}
            </Link>
          ) : (
            <span aria-disabled="true" className="rounded-md border border-line px-4 py-2 text-sm font-semibold">
              {copy.list.next}
            </span>
          )}
        </div>
      </section>
    </section>
  );
}

export function buildReservationBookingListNextHref(
  filters: ReservationBookingFilters,
  cursor: string,
) {
  const params = new URLSearchParams();
  if (filters.service) params.set("service", filters.service);
  if (filters.source) params.set("source", filters.source);
  params.set("cursor", cursor);
  return `${RESERVATION_BOOKINGS_ROUTE}?${params.toString()}`;
}

function formatReservationDateTime(
  booking: ReservationBookingListSummary,
  locale: string,
  unknownEndTime: string,
) {
  const date = formatCalendarDate(booking.reservationDate, locale);
  const service = getReservationService(booking.serviceKey);
  if (service.method === "DATE") return date;
  const slot = service.slots.find(({ startMinute }) => startMinute === booking.startMinute);
  const start = formatMinutes(booking.startMinute);
  return slot
    ? `${date} ${start}–${formatMinutes(slot.endMinute)}`
    : `${date} ${formatTemplate(unknownEndTime, { time: start })}`;
}

function reservationDateTimeValue(booking: ReservationBookingListSummary) {
  const service = getReservationService(booking.serviceKey);
  if (service.method === "DATE") return booking.reservationDate;
  return `${booking.reservationDate}T${formatMinutes(booking.startMinute)}:00+09:00`;
}

function formatCalendarDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function formatIsoAttribute(value: string) {
  return value.replace(/\.000Z$/u, "Z");
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sourceBadgeClassName(source: ReservationBookingListSource) {
  return source === "DEMO"
    ? "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
    : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200";
}

function localeTag(locale: string) {
  return {
    ja: "ja-JP",
    en: "en-US",
    "zh-Hans": "zh-CN",
    "zh-Hant": "zh-TW",
    ko: "ko-KR",
  }[locale] ?? "ja-JP";
}

function formatTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, value),
    template,
  );
}
