export const DISASTER_RADIO_LIMITS = {
  name: 100,
  email: 254,
  phoneInput: 20,
} as const;

export const DISASTER_RADIO_CONSENT_VERSIONS = {
  publicForm: "disaster-radio-v1",
  adminRecorded: "admin-recorded-v1",
} as const;

export type DisasterRadioConsentInput = "CONSENTED" | "NOT_CONSENTED";

export type DisasterRadioResidentInput = {
  name: string;
  email: string;
  phone: string;
  consentStatus: DisasterRadioConsentInput;
};

export type DisasterRadioValidationErrorCode =
  | "REQUIRED"
  | "INVALID_FORMAT"
  | "INVALID_VALUE"
  | "TOO_LONG"
  | "CONTROL_CHARACTER";

export type DisasterRadioValidationError = {
  field: "name" | "email" | "phone" | "consentStatus";
  code: DisasterRadioValidationErrorCode;
};

export type ParsedDisasterRadioResident = {
  name: string;
  normalizedEmail: string;
  normalizedPhone: string;
  consentStatus: DisasterRadioConsentInput;
};

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const JAPAN_DOMESTIC_PHONE = /^0\d{9,10}$/u;
const JAPAN_E164_PHONE = /^\+81\d{9,10}$/u;

export function normalizeDisasterRadioEmail(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function normalizeJapanPhone(value: string): string | null {
  const normalized = value
    .trim()
    .normalize("NFKC")
    .replace(/[\s‐‑‒–—―ーｰ－()（）.\-]/gu, "");

  if (JAPAN_E164_PHONE.test(normalized)) return normalized;
  if (!JAPAN_DOMESTIC_PHONE.test(normalized)) return null;
  return `+81${normalized.slice(1)}`;
}

export function parseDisasterRadioResident(
  value: unknown,
):
  | { ok: true; value: ParsedDisasterRadioResident }
  | { ok: false; errors: DisasterRadioValidationError[] } {
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [
        { field: "name", code: "REQUIRED" },
        { field: "email", code: "REQUIRED" },
        { field: "phone", code: "REQUIRED" },
        { field: "consentStatus", code: "REQUIRED" },
      ],
    };
  }

  const errors: DisasterRadioValidationError[] = [];
  const name = typeof value.name === "string" ? value.name.trim().normalize("NFKC") : "";
  const emailInput = typeof value.email === "string" ? value.email : "";
  const phoneInput = typeof value.phone === "string" ? value.phone : "";
  const consentStatus = value.consentStatus;

  if (!name) errors.push({ field: "name", code: "REQUIRED" });
  else if (CONTROL_CHARACTERS.test(name)) {
    errors.push({ field: "name", code: "CONTROL_CHARACTER" });
  } else if ([...name].length > DISASTER_RADIO_LIMITS.name) {
    errors.push({ field: "name", code: "TOO_LONG" });
  }

  const normalizedEmail = normalizeDisasterRadioEmail(emailInput);
  if (!normalizedEmail) errors.push({ field: "email", code: "REQUIRED" });
  else if (CONTROL_CHARACTERS.test(normalizedEmail)) {
    errors.push({ field: "email", code: "CONTROL_CHARACTER" });
  } else if (normalizedEmail.length > DISASTER_RADIO_LIMITS.email) {
    errors.push({ field: "email", code: "TOO_LONG" });
  } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
    errors.push({ field: "email", code: "INVALID_FORMAT" });
  }

  if (!phoneInput.trim()) errors.push({ field: "phone", code: "REQUIRED" });
  else if (CONTROL_CHARACTERS.test(phoneInput)) {
    errors.push({ field: "phone", code: "CONTROL_CHARACTER" });
  } else if (phoneInput.length > DISASTER_RADIO_LIMITS.phoneInput) {
    errors.push({ field: "phone", code: "TOO_LONG" });
  }
  const normalizedPhone = normalizeJapanPhone(phoneInput);
  if (phoneInput.trim() && !normalizedPhone) {
    errors.push({ field: "phone", code: "INVALID_FORMAT" });
  }

  if (consentStatus !== "CONSENTED" && consentStatus !== "NOT_CONSENTED") {
    errors.push({
      field: "consentStatus",
      code: consentStatus === undefined || consentStatus === "" ? "REQUIRED" : "INVALID_VALUE",
    });
  }

  if (errors.length > 0 || !normalizedPhone) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      normalizedEmail,
      normalizedPhone,
      consentStatus: consentStatus as DisasterRadioConsentInput,
    },
  };
}

export function parsePublicDisasterRadioRegistration(value: unknown) {
  const exactKeys = isRecord(value) &&
    Object.keys(value).sort().join(",") === "consent,email,name,phone";
  if (!exactKeys || value.consent !== true) {
    const parsed = parseDisasterRadioResident(
      isRecord(value)
        ? { ...value, consentStatus: value.consent === true ? "CONSENTED" : undefined }
        : value,
    );
    if (parsed.ok) {
      return {
        ok: false as const,
        errors: [{ field: "consentStatus", code: "REQUIRED" }] satisfies DisasterRadioValidationError[],
      };
    }
    return parsed;
  }
  return parseDisasterRadioResident({ ...value, consentStatus: "CONSENTED" });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
