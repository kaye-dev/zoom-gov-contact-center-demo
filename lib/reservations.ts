export const RESERVATION_SERVICE_KEYS = [
  "my-number-card",
  "legal-consultation",
  "bulky-waste",
  "civic-facility",
] as const;

export type ReservationServiceKey =
  (typeof RESERVATION_SERVICE_KEYS)[number];

export type ReservationMethod = "DATE" | "DATETIME";

export type ReservationAvailabilityStatus =
  | "AVAILABLE"
  | "LIMITED"
  | "FULL"
  | "UNAVAILABLE";

export type ReservationBookingSource = "ZVA" | "DEMO";

export type ReservationBookingSummary = {
  id: string;
  createdAt: string;
  source: ReservationBookingSource;
};

export type ReservationSlotSummary = {
  startMinute: number;
  endMinute: number;
  capacity: number;
  booked: number;
  remaining: number;
  status: ReservationAvailabilityStatus;
  reservations: ReservationBookingSummary[];
};

export type ReservationDaySummary = {
  date: string;
  bookable: boolean;
  capacity: number;
  booked: number;
  remaining: number;
  status: ReservationAvailabilityStatus;
  slots: ReservationSlotSummary[];
};

export type ReservationCalendarSnapshot = {
  service: {
    key: ReservationServiceKey;
    method: ReservationMethod;
  };
  month: string;
  days: ReservationDaySummary[];
};

export type ReservationServiceDefinition = {
  key: ReservationServiceKey;
  method: ReservationMethod;
  weekdays: readonly number[];
  slots: readonly {
    startMinute: number;
    endMinute: number;
    capacity: number;
  }[];
};

export const RESERVATION_SERVICE_CATALOG = [
  {
    key: "my-number-card",
    method: "DATETIME",
    weekdays: [1, 2, 3, 4, 5],
    slots: Array.from({ length: 16 }, (_, index) => ({
      startMinute: 9 * 60 + index * 30,
      endMinute: 9 * 60 + (index + 1) * 30,
      capacity: 3,
    })),
  },
  {
    key: "legal-consultation",
    method: "DATETIME",
    weekdays: [3],
    slots: Array.from({ length: 3 }, (_, index) => ({
      startMinute: 13 * 60 + index * 60,
      endMinute: 13 * 60 + (index + 1) * 60,
      capacity: 1,
    })),
  },
  {
    key: "bulky-waste",
    method: "DATE",
    weekdays: [1, 2, 3, 4, 5, 6],
    slots: [{ startMinute: 0, endMinute: 24 * 60, capacity: 20 }],
  },
  {
    key: "civic-facility",
    method: "DATETIME",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    slots: [
      { startMinute: 9 * 60, endMinute: 12 * 60, capacity: 2 },
      { startMinute: 13 * 60, endMinute: 17 * 60, capacity: 2 },
      { startMinute: 18 * 60, endMinute: 21 * 60, capacity: 2 },
    ],
  },
] as const satisfies readonly ReservationServiceDefinition[];

export const RESERVATION_ERROR_CODES = {
  invalidRequest: "RESERVATION_INVALID_REQUEST",
  saveFailed: "RESERVATION_SAVE_FAILED",
} as const;

export function isReservationServiceKey(
  value: string,
): value is ReservationServiceKey {
  return RESERVATION_SERVICE_KEYS.includes(value as ReservationServiceKey);
}

export function getReservationService(
  key: ReservationServiceKey,
): ReservationServiceDefinition {
  return RESERVATION_SERVICE_CATALOG.find((service) => service.key === key)!;
}

export function isReservationMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(value)) return false;
  const [year] = value.split("-").map(Number);
  return year >= 2000 && year <= 9999;
}

export function isReservationDate(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/u.test(value)) {
    return false;
  }
  const date = calendarDateToUtc(value);
  return utcDateToCalendarDate(date) === value;
}

export function getTokyoCalendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getReservationMonthRange(now: Date) {
  const minimum = getTokyoCalendarDate(now).slice(0, 7);
  return { minimum, maximum: addCalendarMonths(minimum, 11) };
}

export function isReservationMonthInRange(month: string, now: Date): boolean {
  if (!isReservationMonth(month)) return false;
  const { minimum, maximum } = getReservationMonthRange(now);
  return month >= minimum && month <= maximum;
}

export function addCalendarMonths(month: string, offset: number): string {
  if (!isReservationMonth(month)) throw new Error("Invalid reservation month.");
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}`;
}

export function listCalendarDates(month: string): string[] {
  if (!isReservationMonth(month)) throw new Error("Invalid reservation month.");
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: dayCount }, (_, index) =>
    `${month}-${(index + 1).toString().padStart(2, "0")}`,
  );
}

export function getReservationSlotsForDate(
  service: ReservationServiceDefinition,
  date: string,
  now: Date,
) {
  if (!isReservationDate(date) || date < getTokyoCalendarDate(now)) return [];
  const weekday = calendarDateToUtc(date).getUTCDay();
  if (!service.weekdays.includes(weekday)) return [];
  return service.slots;
}

export function getReservationAvailabilityStatus(
  capacity: number,
  remaining: number,
): ReservationAvailabilityStatus {
  if (capacity <= 0) return "UNAVAILABLE";
  if (remaining <= 0) return "FULL";
  const limitedThreshold = Math.max(1, Math.ceil(capacity * 0.25));
  return remaining <= limitedThreshold ? "LIMITED" : "AVAILABLE";
}

export function calendarDateToUtc(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function utcDateToCalendarDate(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`;
}

export function getReservationMonthBounds(month: string) {
  return {
    start: calendarDateToUtc(`${month}-01`),
    end: calendarDateToUtc(`${addCalendarMonths(month, 1)}-01`),
  };
}
