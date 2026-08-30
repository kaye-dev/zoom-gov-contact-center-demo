import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  DeveloperApiEncryptionUnavailableError,
  decryptDeveloperApiSecret,
  encryptDeveloperApiSecret,
} from "../lib/server/developer-api-crypto";

const key = randomBytes(32).toString("base64");

test("Developer API secrets round-trip in versioned AES-GCM envelopes", () => {
  const envelope = encryptDeveloperApiSecret(" secret value ", "clientSecret", key);
  assert.match(envelope, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/u);
  assert.equal(envelope.includes("secret value"), false);
  assert.equal(decryptDeveloperApiSecret(envelope, "clientSecret", key), " secret value ");
  assert.notEqual(
    encryptDeveloperApiSecret(" secret value ", "clientSecret", key),
    envelope,
  );
});

test("Developer API envelopes bind ciphertext to the field and authentication tag", () => {
  const envelope = encryptDeveloperApiSecret("secret", "clientSecret", key);
  assert.throws(() => decryptDeveloperApiSecret(envelope, "secretToken", key));
  const parts = envelope.split(".");
  parts[3] = `${parts[3].slice(0, -1)}${parts[3].endsWith("A") ? "B" : "A"}`;
  assert.throws(() => decryptDeveloperApiSecret(parts.join("."), "clientSecret", key));
});

test("Developer API encryption fails closed for missing or invalid keys", () => {
  for (const invalid of [undefined, "", "not-base64", randomBytes(31).toString("base64")]) {
    assert.throws(
      () => encryptDeveloperApiSecret("secret", "clientSecret", invalid),
      DeveloperApiEncryptionUnavailableError,
    );
  }
});
