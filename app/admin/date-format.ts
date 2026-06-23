import type { Locale } from "../i18n/dictionaries";

const dateTimeLocales: Record<Locale, string> = {
  ja: "ja-JP",
  en: "en-US",
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
  ko: "ko-KR",
};

const adminDateTimeFormatOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
};

export function formatAdminDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(
    dateTimeLocales[locale],
    adminDateTimeFormatOptions,
  ).format(new Date(value));
}
