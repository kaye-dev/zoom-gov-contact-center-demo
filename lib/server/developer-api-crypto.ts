import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import type { DeveloperApiSecretField } from "@/lib/developer-api-settings";

const ENCRYPTION_KEY_ENV = "DEVELOPER_API_SETTINGS_ENCRYPTION_KEY";
const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DeveloperApiEncryptionUnavailableError extends Error {
  constructor() {
    super("Developer API settings encryption is unavailable.");
    this.name = "DeveloperApiEncryptionUnavailableError";
  }
}

export function assertDeveloperApiEncryptionAvailable(
  encodedKey = process.env[ENCRYPTION_KEY_ENV],
): void {
  decodeKey(encodedKey);
}

export function encryptDeveloperApiSecret(
  value: string,
  field: DeveloperApiSecretField,
  encodedKey = process.env[ENCRYPTION_KEY_ENV],
): string {
  const key = decodeKey(encodedKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(aad(field), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, iv, ciphertext, tag]
    .map((part) => typeof part === "string" ? part : part.toString("base64url"))
    .join(".");
}

export function decryptDeveloperApiSecret(
  envelope: string,
  field: DeveloperApiSecretField,
  encodedKey = process.env[ENCRYPTION_KEY_ENV],
): string {
  const key = decodeKey(encodedKey);
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error("Invalid Developer API secret envelope.");
  }
  const iv = decodeBase64Url(parts[1], IV_BYTES);
  const ciphertext = decodeBase64Url(parts[2]);
  const tag = decodeBase64Url(parts[3], TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(aad(field), "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function decodeKey(encodedKey: string | undefined): Buffer {
  if (!encodedKey || !isCanonicalBase64(encodedKey)) {
    throw new DeveloperApiEncryptionUnavailableError();
  }
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new DeveloperApiEncryptionUnavailableError();
  }
  return key;
}

function decodeBase64Url(value: string, expectedLength?: number): Buffer {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) {
    throw new Error("Invalid Developer API secret envelope.");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value || (expectedLength && decoded.length !== expectedLength)) {
    throw new Error("Invalid Developer API secret envelope.");
  }
  return decoded;
}

function isCanonicalBase64(value: string): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return false;
  }
  return Buffer.from(value, "base64").toString("base64") === value;
}

function aad(field: DeveloperApiSecretField): string {
  return `site-developer-api-settings:${field}:v1`;
}
