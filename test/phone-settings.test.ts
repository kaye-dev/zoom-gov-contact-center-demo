import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidDisplayPhone,
  isValidE164,
  parsePhoneSettings,
  type PhoneSettings,
} from "../lib/phone-settings";
import { SETTINGS_ERROR_CODES } from "../lib/site-settings";

const validPhoneSettings: PhoneSettings = {
  representativePhone: {
    display: "(03)1234-5678",
    e164: "+81312345678",
  },
  aiPhoneNumbers: {
    ja: "+81311111111",
    en: null,
    "zh-Hans": null,
    "zh-Hant": null,
    ko: null,
  },
};

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

test("phone settings trim values and normalize blank AI phone numbers", () => {
  const input = structuredClone(validPhoneSettings);
  input.representativePhone.display = "  (03)1234-5678  ";
  input.representativePhone.e164 = "  +81312345678 ";
  input.aiPhoneNumbers.en = "  ";

  const result = parsePhoneSettings(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value, validPhoneSettings);
});

test("phone settings require every supported locale exactly once", () => {
  const missingLocale = structuredClone(validPhoneSettings) as unknown as {
    representativePhone: PhoneSettings["representativePhone"];
    aiPhoneNumbers: Record<string, string | null>;
  };
  delete missingLocale.aiPhoneNumbers.ko;
  assert.deepEqual(parsePhoneSettings(missingLocale), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidRequest,
  });

  const extraLocale = structuredClone(validPhoneSettings) as unknown as {
    representativePhone: PhoneSettings["representativePhone"];
    aiPhoneNumbers: Record<string, string | null>;
  };
  extraLocale.aiPhoneNumbers.fr = null;
  assert.deepEqual(parsePhoneSettings(extraLocale), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidRequest,
  });
});

test("phone settings return field-specific validation errors", () => {
  const invalidDisplay = structuredClone(validPhoneSettings);
  invalidDisplay.representativePhone.display = "03-1234-5678 ext. 1";
  assert.deepEqual(parsePhoneSettings(invalidDisplay), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidRepresentativePhoneDisplay,
  });

  const invalidRepresentativeE164 = structuredClone(validPhoneSettings);
  invalidRepresentativeE164.representativePhone.e164 = "03-1234-5678";
  assert.deepEqual(parsePhoneSettings(invalidRepresentativeE164), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidRepresentativePhoneE164,
  });

  const invalidAiPhoneE164 = structuredClone(validPhoneSettings);
  invalidAiPhoneE164.aiPhoneNumbers.ja = "03-1111-1111";
  assert.deepEqual(parsePhoneSettings(invalidAiPhoneE164), {
    ok: false,
    code: SETTINGS_ERROR_CODES.invalidAiPhoneE164,
  });
});
