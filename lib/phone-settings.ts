import {
  SETTINGS_ERROR_CODES,
  SITE_LOCALES,
  isNullableString,
  isRecord,
  isSiteLocale,
  normalizeNullableString,
  type SiteLocale,
  type ValidationResult,
} from "./site-settings";

export type PhoneSettings = {
  representativePhone: {
    display: string;
    e164: string;
  };
  aiPhoneNumbers: Record<SiteLocale, string | null>;
};

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const DISPLAY_PHONE_PATTERN = /^[0-9+().\- ]+$/;
const MAX_DISPLAY_PHONE_LENGTH = 50;

export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function isValidDisplayPhone(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_DISPLAY_PHONE_LENGTH &&
    DISPLAY_PHONE_PATTERN.test(value) &&
    /\d/.test(value)
  );
}

export function parsePhoneSettings(
  input: unknown,
): ValidationResult<PhoneSettings> {
  if (!isRecord(input)) {
    return invalid(SETTINGS_ERROR_CODES.invalidRequest);
  }

  const representativePhone = input.representativePhone;
  const aiPhoneNumbers = input.aiPhoneNumbers;

  if (!isRecord(representativePhone) || !isRecord(aiPhoneNumbers)) {
    return invalid(SETTINGS_ERROR_CODES.invalidRequest);
  }

  if (
    typeof representativePhone.display !== "string" ||
    typeof representativePhone.e164 !== "string"
  ) {
    return invalid(SETTINGS_ERROR_CODES.invalidRequest);
  }

  const display = representativePhone.display.trim();
  if (!isValidDisplayPhone(display)) {
    return invalid(SETTINGS_ERROR_CODES.invalidRepresentativePhoneDisplay);
  }

  const e164 = representativePhone.e164.trim();
  if (!isValidE164(e164)) {
    return invalid(SETTINGS_ERROR_CODES.invalidRepresentativePhoneE164);
  }

  const localeKeys = Object.keys(aiPhoneNumbers);
  if (
    localeKeys.length !== SITE_LOCALES.length ||
    localeKeys.some((locale) => !isSiteLocale(locale))
  ) {
    return invalid(SETTINGS_ERROR_CODES.invalidRequest);
  }

  const normalizedAiPhoneNumbers = {} as Record<
    SiteLocale,
    string | null
  >;

  for (const locale of SITE_LOCALES) {
    const value = aiPhoneNumbers[locale];
    if (!isNullableString(value)) {
      return invalid(SETTINGS_ERROR_CODES.invalidRequest);
    }

    const normalized = normalizeNullableString(value);
    if (normalized !== null && !isValidE164(normalized)) {
      return invalid(SETTINGS_ERROR_CODES.invalidAiPhoneE164);
    }

    normalizedAiPhoneNumbers[locale] = normalized;
  }

  return {
    ok: true,
    value: {
      representativePhone: { display, e164 },
      aiPhoneNumbers: normalizedAiPhoneNumbers,
    },
  };
}

function invalid<T>(
  code: (typeof SETTINGS_ERROR_CODES)[keyof typeof SETTINGS_ERROR_CODES],
): ValidationResult<T> {
  return { ok: false, code };
}
