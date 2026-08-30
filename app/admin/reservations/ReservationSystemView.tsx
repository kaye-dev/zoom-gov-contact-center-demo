"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ChevronLeftIcon } from "@/app/components/svg/ChevronLeftIcon";
import { ChevronRightIcon } from "@/app/components/svg/ChevronRightIcon";
import { useI18n } from "@/app/i18n/LanguageProvider";
import {
  RESERVATION_SERVICE_KEYS,
  addCalendarMonths,
  calendarDateToUtc,
  type ReservationAvailabilityStatus,
  type ReservationCalendarSnapshot,
  type ReservationDaySummary,
  type ReservationServiceKey,
} from "@/lib/reservations";

type ReservationSystemViewProps = {
  initialCalendar: ReservationCalendarSnapshot;
  initialSelectedDate: string;
  minimumMonth: string;
  maximumMonth: string;
  canEdit: boolean;
};

export function ReservationSystemView({
  initialCalendar,
  initialSelectedDate,
  minimumMonth,
  maximumMonth,
  canEdit,
}: ReservationSystemViewProps) {
  const { locale, t } = useI18n();
  const copy = t.admin.reservationManagement;
  const router = useRouter();
  const randomButtonRef = useRef<HTMLButtonElement>(null);
  const [calendar, setCalendar] = useState(initialCalendar);
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [feedback, setFeedback] = useState<"generated" | "load-error" | "generation-error" | null>(null);
  const serviceCopy = copy.services[calendar.service.key];
  const selectedDay = calendar.days.find((day) => day.date === selectedDate) ?? calendar.days[0];
  const methodLabel = calendar.service.key === "civic-facility"
    ? copy.facilityMethod
    : copy.methods[calendar.service.method];

  const replaceUrl = (service: ReservationServiceKey, month: string, date: string) => {
    const params = new URLSearchParams({ service, month, date });
    router.replace(`/admin/reservations?${params.toString()}`, { scroll: false });
  };

  const loadCalendar = async (service: ReservationServiceKey, month: string) => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const params = new URLSearchParams({ service, month });
      const response = await fetch(`/api/admin/reservations?${params.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json() as { calendar?: ReservationCalendarSnapshot };
      if (!response.ok || !body.calendar) throw new Error("Reservation calendar unavailable.");
      const nextDate = body.calendar.days.find((day) => day.bookable)?.date ?? `${month}-01`;
      setCalendar(body.calendar);
      setSelectedDate(nextDate);
      replaceUrl(service, month, nextDate);
    } catch {
      setFeedback("load-error");
    } finally {
      setIsLoading(false);
    }
  };

  const generateDemoReservations = async () => {
    if (!canEdit || isGenerating) return;
    setIsGenerating(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/reservations/demo-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ month: calendar.month }),
      });
      const body = await response.json() as {
        calendars?: Record<ReservationServiceKey, ReservationCalendarSnapshot>;
      };
      const next = body.calendars?.[calendar.service.key];
      if (!response.ok || !next) throw new Error("Demo generation failed.");
      setCalendar(next);
      if (!next.days.some((day) => day.date === selectedDate && day.bookable)) {
        setSelectedDate(next.days.find((day) => day.bookable)?.date ?? `${next.month}-01`);
      }
      setFeedback("generated");
    } catch {
      setFeedback("generation-error");
    } finally {
      setIsGenerating(false);
      requestAnimationFrame(() => randomButtonRef.current?.focus());
    }
  };

  return (
    <section id="reservation-system-content" className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl space-y-2">
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-sm leading-6 text-fg-muted">{copy.description}</p>
        </div>
        <button
          ref={randomButtonRef}
          id="random-fill-button"
          type="button"
          onClick={generateDemoReservations}
          disabled={!canEdit || isGenerating}
          aria-busy={isGenerating || undefined}
          className="cursor-pointer rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:shrink-0"
        >
          {copy.demoFill}
        </button>
      </div>

      <p
        id="read-only-notice"
        role="status"
        hidden={canEdit}
        className="rounded-md border border-line bg-surface-accent-subtle px-4 py-3 text-sm font-semibold text-accent"
      >
        {copy.readOnlyNotice}
      </p>
      <p
        id="generation-feedback"
        role="status"
        aria-live="polite"
        hidden={feedback !== "generated"}
        className="rounded-md bg-green-50 px-4 py-3 text-sm font-semibold text-green-800 dark:bg-green-950/50 dark:text-green-200"
      >
        {copy.generated}
      </p>
      {feedback === "load-error" || feedback === "generation-error" ? (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">
          {feedback === "load-error" ? copy.loadingError : copy.generationError}
        </p>
      ) : null}

      <div id="reservation-controls" className="rounded-lg border border-line bg-surface-raised p-4 shadow-sm md:p-5" aria-busy={isLoading || undefined}>
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-end">
          <label htmlFor="service-select" className="block max-w-xl space-y-2">
            <span className="block text-sm font-semibold">{copy.serviceLabel}</span>
            <select
              id="service-select"
              value={calendar.service.key}
              onChange={(event) => loadCalendar(event.target.value as ReservationServiceKey, calendar.month)}
              disabled={isLoading || isGenerating}
              className="w-full cursor-pointer rounded-md border border-line bg-surface px-3 py-2.5 text-fg outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {RESERVATION_SERVICE_KEYS.map((key) => (
                <option key={key} value={key}>{copy.services[key].name}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="previous-month"
              type="button"
              aria-label={copy.previousMonth}
              onClick={() => loadCalendar(calendar.service.key, addCalendarMonths(calendar.month, -1))}
              disabled={isLoading || isGenerating || calendar.month <= minimumMonth}
              className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              id="current-month"
              type="button"
              onClick={() => loadCalendar(calendar.service.key, minimumMonth)}
              disabled={isLoading || isGenerating}
              className="cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.currentMonth}
            </button>
            <button
              id="next-month"
              type="button"
              aria-label={copy.nextMonth}
              onClick={() => loadCalendar(calendar.service.key, addCalendarMonths(calendar.month, 1))}
              disabled={isLoading || isGenerating || calendar.month >= maximumMonth}
              className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-4">
          <span id="booking-method-badge" className="inline-flex rounded-full bg-surface-accent-subtle px-3 py-1 text-xs font-bold text-accent">{methodLabel}</span>
          <p id="service-description" className="text-sm leading-6 text-fg-muted">{serviceCopy.description}</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
        <Calendar
          calendar={calendar}
          selectedDate={selectedDate}
          locale={locale}
          copy={copy}
          onSelect={(date) => {
            setSelectedDate(date);
            setFeedback(null);
            replaceUrl(calendar.service.key, calendar.month, date);
          }}
        />
        <SelectedDatePanel day={selectedDay} serviceKey={calendar.service.key} method={calendar.service.method} locale={locale} copy={copy} />
      </div>
    </section>
  );
}

type ReservationCopy = ReturnType<typeof useI18n>["t"]["admin"]["reservationManagement"];

function Calendar({
  calendar,
  selectedDate,
  locale,
  copy,
  onSelect,
}: {
  calendar: ReservationCalendarSnapshot;
  selectedDate: string;
  locale: ReturnType<typeof useI18n>["locale"];
  copy: ReservationCopy;
  onSelect: (date: string) => void;
}) {
  const leading = calendarDateToUtc(`${calendar.month}-01`).getUTCDay();
  const cellCount = Math.ceil((leading + calendar.days.length) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => calendar.days[index - leading] ?? null);
  return (
    <section id="calendar-card" aria-labelledby="calendar-month-heading" className="min-w-0 overflow-hidden rounded-lg border border-line bg-surface-raised shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 md:px-5">
        <h2 id="calendar-month-heading" className="text-lg font-bold">{formatMonth(calendar.month, locale)}</h2>
        <div aria-label={copy.legend} className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
          <span className="text-green-700 dark:text-green-300">● {copy.statuses.AVAILABLE}</span>
          <span className="text-amber-700 dark:text-amber-300">● {copy.statuses.LIMITED}</span>
          <span className="text-red-700 dark:text-red-300">● {copy.statuses.FULL}</span>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-line bg-surface text-center text-xs font-semibold text-fg-muted" aria-hidden="true">
        {copy.weekdays.map((weekday, index) => <span key={index} className={`py-2 ${index === 0 ? "text-red-700 dark:text-red-300" : index === 6 ? "text-blue-700 dark:text-blue-300" : ""}`}>{weekday}</span>)}
      </div>
      <div id="calendar-grid" className="grid grid-cols-7 bg-line-subtle" role="grid" aria-labelledby="calendar-month-heading">
        {cells.map((day, index) => day ? (
          <CalendarDay key={day.date} day={day} method={calendar.service.method} selected={selectedDate === day.date} locale={locale} copy={copy} onSelect={onSelect} />
        ) : <span key={`empty-${index}`} className="min-h-24 bg-surface-raised sm:min-h-28" aria-hidden="true" />)}
      </div>
    </section>
  );
}

function CalendarDay({ day, method, selected, locale, copy, onSelect }: { day: ReservationDaySummary; method: ReservationCalendarSnapshot["service"]["method"]; selected: boolean; locale: ReturnType<typeof useI18n>["locale"]; copy: ReservationCopy; onSelect: (date: string) => void }) {
  const className = selected
    ? "min-h-24 cursor-pointer bg-surface-selected p-1.5 text-left ring-2 ring-inset ring-accent focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent sm:min-h-28 sm:p-2"
    : day.bookable
      ? "min-h-24 cursor-pointer bg-surface-raised p-1.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent sm:min-h-28 sm:p-2"
      : "min-h-24 cursor-not-allowed bg-surface p-1.5 text-left text-fg-muted opacity-60 sm:min-h-28 sm:p-2";
  return (
    <button type="button" data-day={day.date} disabled={!day.bookable} role="gridcell" aria-pressed={selected} aria-label={`${formatFullDate(day.date, locale)}。${copy.statuses[day.status]}`} onClick={() => onSelect(day.date)} className={className}>
      <span className="block text-sm font-bold">{Number(day.date.slice(-2))}</span>
      <span className={`mt-2 block text-[11px] leading-4 ${day.bookable ? `font-bold ${statusTextClass(day.status)}` : "font-semibold"}`}>{copy.statuses[day.status]}</span>
      {day.bookable ? <span className="mt-1 block text-[10px] leading-4 text-fg-muted sm:text-xs">{method === "DATE" ? formatTemplate(copy.dateCount, { booked: day.booked, capacity: day.capacity }) : formatTemplate(copy.openSlotCount, { count: day.remaining })}</span> : null}
    </button>
  );
}

function SelectedDatePanel({ day, serviceKey, method, locale, copy }: { day: ReservationDaySummary | undefined; serviceKey: ReservationServiceKey; method: ReservationCalendarSnapshot["service"]["method"]; locale: ReturnType<typeof useI18n>["locale"]; copy: ReservationCopy }) {
  if (!day) return null;
  return (
    <aside id="selected-date-panel" aria-labelledby="selected-date-heading" className="rounded-lg border border-line bg-surface-raised p-4 shadow-sm md:p-5 lg:sticky lg:top-24">
      <div className="space-y-1 border-b border-line-subtle pb-4">
        <p id="selected-service-name" className="text-sm font-semibold text-accent">{copy.services[serviceKey].name}</p>
        <h2 id="selected-date-heading" className="text-lg font-bold">{formatFullDate(day.date, locale)}</h2>
        <p id="selected-date-summary" className="text-sm text-fg-muted">{method === "DATE" ? copy.availableDate : copy.availableTimes}</p>
      </div>
      <div id="slot-list" className="mt-4 space-y-3" hidden={!day.bookable}>
        {day.slots.map((slot) => (
          <article key={slot.startMinute} data-slot={slot.startMinute} className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{method === "DATE" ? copy.dateSlot : formatSlotLabel(serviceKey, slot.startMinute, slot.endMinute, locale)}</h3>
                <p className="mt-1 text-sm text-fg-muted">{formatTemplate(copy.bookedCount, { booked: slot.booked, capacity: slot.capacity, remaining: slot.remaining })}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(slot.status)}`}>{copy.statuses[slot.status]}</span>
            </div>
          </article>
        ))}
      </div>
      <p id="no-slots-message" hidden={day.bookable} className="mt-4 rounded-md border border-line bg-surface px-4 py-5 text-center text-sm text-fg-muted">{copy.noSlots}</p>
    </aside>
  );
}

function formatMonth(month: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), { year: "numeric", month: "long", timeZone: "UTC" }).format(calendarDateToUtc(`${month}-01`));
}

function formatFullDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(localeTag(locale), { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(calendarDateToUtc(date));
}

function formatSlotLabel(service: ReservationServiceKey, start: number, end: number, locale: ReturnType<typeof useI18n>["locale"]) {
  const period = service === "civic-facility"
    ? start === 9 * 60 ? { ja: "午前", en: "Morning", "zh-Hans": "上午", "zh-Hant": "上午", ko: "오전" }[locale]
      : start === 13 * 60 ? { ja: "午後", en: "Afternoon", "zh-Hans": "下午", "zh-Hant": "下午", ko: "오후" }[locale]
        : { ja: "夜間", en: "Evening", "zh-Hans": "晚间", "zh-Hant": "晚間", ko: "야간" }[locale]
    : "";
  return `${period ? `${period} ` : ""}${formatTime(start)}–${formatTime(end)}`;
}

function formatTime(minutes: number) {
  if (minutes === 1440) return "24:00";
  return `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

function localeTag(locale: string) {
  return { ja: "ja-JP", en: "en-US", "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", ko: "ko-KR" }[locale] ?? "ja-JP";
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), template);
}

function statusTextClass(status: ReservationAvailabilityStatus) {
  return status === "FULL" ? "text-red-700 dark:text-red-300" : status === "LIMITED" ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-300";
}

function statusBadgeClass(status: ReservationAvailabilityStatus) {
  return status === "FULL" ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200" : status === "LIMITED" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200" : "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200";
}
