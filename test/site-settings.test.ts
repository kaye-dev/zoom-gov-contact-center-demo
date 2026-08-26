import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SITE_LOCALE,
  HTML_LANG_BY_SITE_LOCALE,
  SETTINGS_ERROR_CODES,
  SITE_LOCALES,
  fromDatabaseSiteLocale,
  normalizeNullableString,
  parseLanguageSettings,
  resolveAvailableLocale,
  toDatabaseSiteLocale,
  toHtmlLanguageTag,
  type LanguageSettings,
} from "../lib/site-settings";

const validLanguageSettings: LanguageSettings = {
  locales: SITE_LOCALES.map((locale) => ({ locale, enabled: true })),
};

test("site locale and database enum values round-trip", () => {
  for (const locale of SITE_LOCALES) {
    assert.equal(fromDatabaseSiteLocale(toDatabaseSiteLocale(locale)), locale);
  }
});

test("every site locale maps to the explicit Zoom Campaign HTML language", () => {
  assert.deepEqual(HTML_LANG_BY_SITE_LOCALE, {
    ja: "ja-JP",
    en: "en-US",
    "zh-Hans": "zh-CN",
    "zh-Hant": "zh-TW",
    ko: "ko-KR",
  });

  assert.deepEqual(
    SITE_LOCALES.map((locale) => toHtmlLanguageTag(locale)),
    ["ja-JP", "en-US", "zh-CN", "zh-TW", "ko-KR"],
  );
});

test("nullable values normalize empty strings to null", () => {
  assert.equal(normalizeNullableString(null), null);
  assert.equal(normalizeNullableString(""), null);
  assert.equal(normalizeNullableString("   \n"), null);
  assert.equal(normalizeNullableString("  value  "), "value");
});

test("language settings preserve array order", () => {
  const input: LanguageSettings = {
    locales: [
      { locale: "ko", enabled: true },
      { locale: "ja", enabled: true },
      { locale: "en", enabled: false },
      { locale: "zh-Hant", enabled: true },
      { locale: "zh-Hans", enabled: false },
    ],
  };

  const result = parseLanguageSettings(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.locales, input.locales);
});

test("language settings reject duplicates, missing and unknown locales", () => {
  const duplicate = structuredClone(validLanguageSettings);
  duplicate.locales[4].locale = "en";
  assert.deepEqual(parseLanguageSettings(duplicate), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidLanguageSettings,
  });

  const missing = { locales: validLanguageSettings.locales.slice(0, 4) };
  assert.deepEqual(parseLanguageSettings(missing), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidLanguageSettings,
  });

  const unknown = structuredClone(validLanguageSettings) as unknown as {
    locales: Array<{ locale: string; enabled: boolean }>;
  };
  unknown.locales[4].locale = "fr";
  assert.deepEqual(parseLanguageSettings(unknown), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidLanguageSettings,
  });
});

test("Japanese must stay enabled", () => {
  const input = structuredClone(validLanguageSettings);
  const japanese = input.locales.find(
    ({ locale }) => locale === DEFAULT_SITE_LOCALE,
  );
  assert.ok(japanese);
  japanese.enabled = false;

  assert.deepEqual(parseLanguageSettings(input), {
    ok: false,
    code: SETTINGS_ERROR_CODES.japaneseRequired,
  });
});

test("disabled or unknown stored locale falls back to Japanese", () => {
  const available = ["en", "ja", "ko"] as const;
  assert.equal(resolveAvailableLocale("ko", available), "ko");
  assert.equal(resolveAvailableLocale("zh-Hans", available), "ja");
  assert.equal(resolveAvailableLocale("fr", available), "ja");
  assert.equal(resolveAvailableLocale(null, available), "ja");
});
