export const SITE_LOCALES = [
  "ja",
  "en",
  "zh-Hans",
  "zh-Hant",
  "ko",
] as const;

export type SiteLocale = (typeof SITE_LOCALES)[number];

export const DEFAULT_SITE_LOCALE: SiteLocale = "ja";

export const DATABASE_SITE_LOCALES = [
  "JA",
  "EN",
  "ZH_HANS",
  "ZH_HANT",
  "KO",
] as const;

export type DatabaseSiteLocale = (typeof DATABASE_SITE_LOCALES)[number];

const SITE_TO_DATABASE_LOCALE: Record<SiteLocale, DatabaseSiteLocale> = {
  ja: "JA",
  en: "EN",
  "zh-Hans": "ZH_HANS",
  "zh-Hant": "ZH_HANT",
  ko: "KO",
};

const DATABASE_TO_SITE_LOCALE: Record<DatabaseSiteLocale, SiteLocale> = {
  JA: "ja",
  EN: "en",
  ZH_HANS: "zh-Hans",
  ZH_HANT: "zh-Hant",
  KO: "ko",
};

export type AiContactDestination = {
  aiPhoneE164: string | null;
  virtualAgentCampaignUrl: string | null;
};

export type ContactSettings = {
  representativePhone: {
    display: string;
    e164: string;
  };
  destinations: Record<SiteLocale, AiContactDestination>;
};

export type LanguageSetting = {
  locale: SiteLocale;
  enabled: boolean;
};

export type LanguageSettings = {
  locales: LanguageSetting[];
};

export const SETTINGS_ERROR_CODES = {
  authenticationRequired: "AUTHENTICATION_REQUIRED",
  administratorRequired: "ADMINISTRATOR_REQUIRED",
  invalidRequest: "INVALID_REQUEST",
  invalidRepresentativePhoneDisplay:
    "INVALID_REPRESENTATIVE_PHONE_DISPLAY",
  invalidRepresentativePhoneE164: "INVALID_REPRESENTATIVE_PHONE_E164",
  invalidAiPhoneE164: "INVALID_AI_PHONE_E164",
  invalidCampaignUrl: "INVALID_CAMPAIGN_URL",
  invalidLanguageSettings: "INVALID_LANGUAGE_SETTINGS",
  japaneseRequired: "JAPANESE_REQUIRED",
  saveFailed: "SETTINGS_SAVE_FAILED",
} as const;

export type SettingsErrorCode =
  (typeof SETTINGS_ERROR_CODES)[keyof typeof SETTINGS_ERROR_CODES];

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: SettingsErrorCode };

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const DISPLAY_PHONE_PATTERN = /^[0-9+().\- ]+$/;
const MAX_DISPLAY_PHONE_LENGTH = 50;
const MAX_CAMPAIGN_URL_LENGTH = 2048;

export function isSiteLocale(value: string): value is SiteLocale {
  return (SITE_LOCALES as readonly string[]).includes(value);
}

export function isSettingsErrorCode(
  value: unknown,
): value is SettingsErrorCode {
  return (
    typeof value === "string" &&
    Object.values(SETTINGS_ERROR_CODES).includes(value as SettingsErrorCode)
  );
}

export function isDatabaseSiteLocale(
  value: string,
): value is DatabaseSiteLocale {
  return (DATABASE_SITE_LOCALES as readonly string[]).includes(value);
}

export function toDatabaseSiteLocale(
  locale: SiteLocale,
): DatabaseSiteLocale {
  return SITE_TO_DATABASE_LOCALE[locale];
}

export function fromDatabaseSiteLocale(
  locale: DatabaseSiteLocale,
): SiteLocale {
  return DATABASE_TO_SITE_LOCALE[locale];
}

export function normalizeNullableString(value: string | null): string | null {
  if (value === null) return null;

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

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

export function isValidCampaignUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_CAMPAIGN_URL_LENGTH) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

export function parseContactSettings(
  input: unknown,
): ValidationResult<ContactSettings> {
  if (!isRecord(input)) {
    return invalid(SETTINGS_ERROR_CODES.invalidRequest);
  }

  const representativePhone = input.representativePhone;
  const destinations = input.destinations;

  if (!isRecord(representativePhone) || !isRecord(destinations)) {
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

  const destinationKeys = Object.keys(destinations);
  if (
    destinationKeys.length !== SITE_LOCALES.length ||
    destinationKeys.some((locale) => !isSiteLocale(locale))
  ) {
    return invalid(SETTINGS_ERROR_CODES.invalidRequest);
  }

  const normalizedDestinations = {} as Record<
    SiteLocale,
    AiContactDestination
  >;

  for (const locale of SITE_LOCALES) {
    const destination = destinations[locale];
    if (
      !isRecord(destination) ||
      !("aiPhoneE164" in destination) ||
      !("virtualAgentCampaignUrl" in destination) ||
      !isNullableString(destination.aiPhoneE164) ||
      !isNullableString(destination.virtualAgentCampaignUrl)
    ) {
      return invalid(SETTINGS_ERROR_CODES.invalidRequest);
    }

    const aiPhoneE164 = normalizeNullableString(destination.aiPhoneE164);
    if (aiPhoneE164 !== null && !isValidE164(aiPhoneE164)) {
      return invalid(SETTINGS_ERROR_CODES.invalidAiPhoneE164);
    }

    const virtualAgentCampaignUrl = normalizeNullableString(
      destination.virtualAgentCampaignUrl,
    );
    if (
      virtualAgentCampaignUrl !== null &&
      !isValidCampaignUrl(virtualAgentCampaignUrl)
    ) {
      return invalid(SETTINGS_ERROR_CODES.invalidCampaignUrl);
    }

    normalizedDestinations[locale] = {
      aiPhoneE164,
      virtualAgentCampaignUrl,
    };
  }

  return {
    ok: true,
    value: {
      representativePhone: { display, e164 },
      destinations: normalizedDestinations,
    },
  };
}

export function parseLanguageSettings(
  input: unknown,
): ValidationResult<LanguageSettings> {
  if (!isRecord(input) || !Array.isArray(input.locales)) {
    return invalid(SETTINGS_ERROR_CODES.invalidRequest);
  }

  if (input.locales.length !== SITE_LOCALES.length) {
    return invalid(SETTINGS_ERROR_CODES.invalidLanguageSettings);
  }

  const seen = new Set<SiteLocale>();
  const locales: LanguageSetting[] = [];

  for (const entry of input.locales) {
    if (
      !isRecord(entry) ||
      typeof entry.locale !== "string" ||
      !isSiteLocale(entry.locale) ||
      typeof entry.enabled !== "boolean" ||
      seen.has(entry.locale)
    ) {
      return invalid(SETTINGS_ERROR_CODES.invalidLanguageSettings);
    }

    seen.add(entry.locale);
    locales.push({ locale: entry.locale, enabled: entry.enabled });
  }

  if (!seen.has(DEFAULT_SITE_LOCALE)) {
    return invalid(SETTINGS_ERROR_CODES.invalidLanguageSettings);
  }

  const japanese = locales.find(
    ({ locale }) => locale === DEFAULT_SITE_LOCALE,
  );
  if (!japanese?.enabled) {
    return invalid(SETTINGS_ERROR_CODES.japaneseRequired);
  }

  return { ok: true, value: { locales } };
}

export function resolveAvailableLocale(
  storedLocale: string | null,
  availableLocales: readonly SiteLocale[],
): SiteLocale {
  if (
    storedLocale &&
    isSiteLocale(storedLocale) &&
    availableLocales.includes(storedLocale)
  ) {
    return storedLocale;
  }

  return DEFAULT_SITE_LOCALE;
}

function invalid<T>(code: SettingsErrorCode): ValidationResult<T> {
  return { ok: false, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
