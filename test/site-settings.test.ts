import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SITE_LOCALE,
  SETTINGS_ERROR_CODES,
  SITE_LOCALES,
  fromDatabaseSiteLocale,
  isValidCampaignUrl,
  isValidDisplayPhone,
  isValidE164,
  normalizeNullableString,
  parseContactSettings,
  parseLanguageSettings,
  resolveAvailableLocale,
  toDatabaseSiteLocale,
  type ContactSettings,
  type LanguageSettings,
} from "../lib/site-settings";

const validContactSettings: ContactSettings = {
  representativePhone: {
    display: "(03)1234-5678",
    e164: "+81312345678",
  },
  zoomVirtualAgentWebTag:
    '<script type="module" src="https://us01ccistatic.zoom.us/us01cci/web-sdk/chat-client.js" data-apikey="public-api-key" data-env="us01"></script>',
  destinations: {
    ja: {
      aiPhoneE164: "+81311111111",
      virtualAgentCampaignUrl: "https://example.zoom.us/ja",
    },
    en: { aiPhoneE164: null, virtualAgentCampaignUrl: null },
    "zh-Hans": { aiPhoneE164: null, virtualAgentCampaignUrl: null },
    "zh-Hant": { aiPhoneE164: null, virtualAgentCampaignUrl: null },
    ko: { aiPhoneE164: null, virtualAgentCampaignUrl: null },
  },
};

const validLanguageSettings: LanguageSettings = {
  locales: SITE_LOCALES.map((locale) => ({ locale, enabled: true })),
};

test("site locale and database enum values round-trip", () => {
  for (const locale of SITE_LOCALES) {
    assert.equal(fromDatabaseSiteLocale(toDatabaseSiteLocale(locale)), locale);
  }
});

test("nullable values normalize empty strings to null", () => {
  assert.equal(normalizeNullableString(null), null);
  assert.equal(normalizeNullableString(""), null);
  assert.equal(normalizeNullableString("   \n"), null);
  assert.equal(normalizeNullableString("  +81312345678  "), "+81312345678");
});

test("E.164 and representative display phone validation", () => {
  assert.equal(isValidE164("+81312345678"), true);
  assert.equal(isValidE164("+12345678"), true);
  assert.equal(isValidE164("0312345678"), false);
  assert.equal(isValidE164("+012345678"), false);
  assert.equal(isValidE164("+1234567"), false);
  assert.equal(isValidE164("+1234567890123456"), false);

  assert.equal(isValidDisplayPhone("(03) 1234-5678"), true);
  assert.equal(isValidDisplayPhone("03.1234.5678"), true);
  assert.equal(isValidDisplayPhone("03-1234-5678 ext. 1"), false);
  assert.equal(isValidDisplayPhone("03-1234\n5678"), false);
  assert.equal(isValidDisplayPhone("03-1234\t5678"), false);
  assert.equal(isValidDisplayPhone(""), false);
  assert.equal(isValidDisplayPhone("1".repeat(51)), false);
});

test("Campaign URL accepts only absolute HTTPS URLs within the limit", () => {
  assert.equal(isValidCampaignUrl("https://example.zoom.us/campaign"), true);
  assert.equal(isValidCampaignUrl("http://example.zoom.us/campaign"), false);
  assert.equal(isValidCampaignUrl("/campaign"), false);
  assert.equal(isValidCampaignUrl("javascript:alert(1)"), false);
  assert.equal(
    isValidCampaignUrl(`https://example.com/${"a".repeat(2050)}`),
    false,
  );
});

test("contact settings trim values and normalize blank destinations", () => {
  const input = structuredClone(validContactSettings);
  input.representativePhone.display = "  (03)1234-5678  ";
  input.destinations.en.aiPhoneE164 = "  ";
  input.destinations.en.virtualAgentCampaignUrl = "";
  input.zoomVirtualAgentWebTag = "  ";

  const result = parseContactSettings(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.representativePhone.display, "(03)1234-5678");
  assert.equal(result.value.destinations.en.aiPhoneE164, null);
  assert.equal(result.value.destinations.en.virtualAgentCampaignUrl, null);
  assert.equal(result.value.zoomVirtualAgentWebTag, null);
});

test("contact settings reject missing locales and invalid destinations", () => {
  const missingLocale = structuredClone(validContactSettings) as unknown as {
    destinations: Record<string, unknown>;
  };
  delete missingLocale.destinations.ko;
  assert.deepEqual(parseContactSettings(missingLocale), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidRequest,
  });

  const invalidPhone = structuredClone(validContactSettings);
  invalidPhone.destinations.ja.aiPhoneE164 = "03-1111-1111";
  assert.deepEqual(parseContactSettings(invalidPhone), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidAiPhoneE164,
  });

  const invalidUrl = structuredClone(validContactSettings);
  invalidUrl.destinations.ja.virtualAgentCampaignUrl = "http://example.com";
  assert.deepEqual(parseContactSettings(invalidUrl), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidCampaignUrl,
  });

  const invalidWebTag = structuredClone(validContactSettings);
  invalidWebTag.zoomVirtualAgentWebTag =
    '<script type="module" src="https://attacker.example/web-sdk/chat-client.js" data-apikey="public-api-key" data-env="us01"></script>';
  assert.deepEqual(parseContactSettings(invalidWebTag), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidVirtualAgentWebTag,
  });
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
