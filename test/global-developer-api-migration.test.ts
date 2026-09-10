import assert from "node:assert/strict";
import test from "node:test";
import { encryptDeveloperApiSecret } from "../lib/server/developer-api-crypto";
import { selectGlobalDeveloperApiSettings } from "../lib/server/global-developer-api-migration";

test("global credential migration compares plaintext, never merges conflicting secrets", () => {
  const prior = process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY;
  process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const make = (siteKey: string, secret = "fixture") => ({ siteKey, accountId: "account", clientId: "client", clientSecretEncrypted: encryptDeveloperApiSecret(secret, "clientSecret"), secretTokenEncrypted: null });
    assert.equal(selectGlobalDeveloperApiSettings([]).row, null);
    const lg = make("lg"), univ = make("univ");
    assert.notEqual(lg.clientSecretEncrypted, univ.clientSecretEncrypted);
    assert.equal(selectGlobalDeveloperApiSettings([lg]).row, lg);
    assert.deepEqual(selectGlobalDeveloperApiSettings([lg, univ]).conflicts, []);
    const conflicting = make("univ", "other-fixture");
    assert.deepEqual(selectGlobalDeveloperApiSettings([lg, conflicting]).conflicts, ["clientSecret"]);
    assert.equal(selectGlobalDeveloperApiSettings([lg, conflicting], "univ").row, conflicting);
    assert.throws(() => selectGlobalDeveloperApiSettings([lg], "invalid"));
  } finally { if (prior === undefined) delete process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY; else process.env.DEVELOPER_API_SETTINGS_ENCRYPTION_KEY = prior; }
});
