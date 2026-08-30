export const DEVELOPER_API_ERROR_CODES = {
  invalidRequest: "DEVELOPER_API_INVALID_REQUEST",
  invalidAccountId: "DEVELOPER_API_INVALID_ACCOUNT_ID",
  invalidClientId: "DEVELOPER_API_INVALID_CLIENT_ID",
  oauthSecretRequired: "DEVELOPER_API_OAUTH_SECRET_REQUIRED",
  webhookSecretRequired: "DEVELOPER_API_WEBHOOK_SECRET_REQUIRED",
  encryptionUnavailable: "DEVELOPER_API_ENCRYPTION_UNAVAILABLE",
  secretNotConfigured: "DEVELOPER_API_SECRET_NOT_CONFIGURED",
  secretRevealFailed: "DEVELOPER_API_SECRET_REVEAL_FAILED",
  saveFailed: "DEVELOPER_API_SAVE_FAILED",
} as const;

export type DeveloperApiErrorCode =
  (typeof DEVELOPER_API_ERROR_CODES)[keyof typeof DEVELOPER_API_ERROR_CODES];

export type DeveloperApiSettingsSnapshot = {
  accountId: string;
  clientId: string;
  clientSecretConfigured: boolean;
  secretTokenConfigured: boolean;
};

export type DeveloperApiSettingsUpdate =
  | {
      section: "server-to-server-oauth";
      accountId: string;
      clientId: string;
      clientSecret?: string;
    }
  | {
      section: "webhook-only-app";
      secretToken?: string;
    };

export type DeveloperApiSecretField = "clientSecret" | "secretToken";

export type DeveloperApiSecretRevealRequest = {
  field: DeveloperApiSecretField;
};

export type DeveloperApiSecretRevealResponse = {
  field: DeveloperApiSecretField;
  value: string;
};

export type DeveloperApiSecretRevealValidationResult =
  | { ok: true; value: DeveloperApiSecretRevealRequest }
  | { ok: false; code: DeveloperApiErrorCode };

export type DeveloperApiValidationResult =
  | { ok: true; value: DeveloperApiSettingsUpdate }
  | { ok: false; code: DeveloperApiErrorCode };

export function parseDeveloperApiSettings(
  input: unknown,
): DeveloperApiValidationResult {
  if (!isRecord(input) || typeof input.section !== "string") {
    return invalid(DEVELOPER_API_ERROR_CODES.invalidRequest);
  }
  if (input.section === "server-to-server-oauth") {
    if (!hasOnlyKeys(input, ["section", "accountId", "clientId", "clientSecret"])) {
      return invalid(DEVELOPER_API_ERROR_CODES.invalidRequest);
    }
    const accountId = normalizeIdentifier(input.accountId);
    if (accountId === null) {
      return invalid(DEVELOPER_API_ERROR_CODES.invalidAccountId);
    }
    const clientId = normalizeIdentifier(input.clientId);
    if (clientId === null) {
      return invalid(DEVELOPER_API_ERROR_CODES.invalidClientId);
    }
    const clientSecret = parseOptionalSecret(input, "clientSecret");
    if (clientSecret === null) {
      return invalid(DEVELOPER_API_ERROR_CODES.invalidRequest);
    }
    return {
      ok: true,
      value: {
        section: input.section,
        accountId,
        clientId,
        ...(clientSecret === undefined ? {} : { clientSecret }),
      },
    };
  }
  if (input.section === "webhook-only-app") {
    if (!hasOnlyKeys(input, ["section", "secretToken"])) {
      return invalid(DEVELOPER_API_ERROR_CODES.invalidRequest);
    }
    const secretToken = parseOptionalSecret(input, "secretToken");
    if (secretToken === null) {
      return invalid(DEVELOPER_API_ERROR_CODES.invalidRequest);
    }
    return {
      ok: true,
      value: {
        section: input.section,
        ...(secretToken === undefined ? {} : { secretToken }),
      },
    };
  }
  return invalid(DEVELOPER_API_ERROR_CODES.invalidRequest);
}

export function parseDeveloperApiSecretReveal(
  input: unknown,
): DeveloperApiSecretRevealValidationResult {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ["field"]) ||
    Object.keys(input).length !== 1 ||
    (input.field !== "clientSecret" && input.field !== "secretToken")
  ) {
    return { ok: false, code: DEVELOPER_API_ERROR_CODES.invalidRequest };
  }
  return { ok: true, value: { field: input.field } };
}

export function isDeveloperApiErrorCode(value: unknown): value is DeveloperApiErrorCode {
  return Object.values(DEVELOPER_API_ERROR_CODES).includes(
    value as DeveloperApiErrorCode,
  );
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 255 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(input: Record<string, unknown>, allowed: string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(input).every((key) => allowedKeys.has(key));
}

function parseOptionalSecret(
  input: Record<string, unknown>,
  key: "clientSecret" | "secretToken",
): string | undefined | null {
  if (!(key in input)) return undefined;
  const value = input[key];
  return typeof value === "string" && value.length >= 1 && value.length <= 4096
    ? value
    : null;
}

function invalid(code: DeveloperApiErrorCode): DeveloperApiValidationResult {
  return { ok: false, code };
}
