import { resolveSettingsReview } from "../lib/admin-settings-review";
import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAdminSettingsTenant,
  settingsTenantOptions,
  ADMIN_SETTINGS_RESOURCES,
} from "../lib/admin-settings-tenant";
import { parseOnlineConsultationSettings } from "../lib/online-consultation-settings";
const tag = '<script src="https://zoom.us/sdk.js"></script>';
test("REGISTRY: each management resource exposes only registered industries", () => {
  for (const resource of ADMIN_SETTINGS_RESOURCES) {
    assert.deepEqual(settingsTenantOptions(resource), ["lg", "univ"]);
    assert.equal(resolveAdminSettingsTenant(["univ"], "lg", resource).ok, true);
    assert.equal(resolveAdminSettingsTenant([], "univ", resource).ok, true);
    for (const values of [
      [""],
      ["gov"],
      ["healthcare"],
      ["univ", "lg"],
      ["UNIV"],
      [" univ"],
    ])
      assert.deepEqual(resolveAdminSettingsTenant(values, "lg", resource), {
        ok: false,
        status: 400,
        error: "INVALID_SETTINGS_TENANT",
      });
  }
});
test("consultation catalog and memo boundaries are industry-specific", () => {
  const payload = {
    services: [
      { serviceKey: "general", webClientTag: tag, memo: "😀".repeat(4000) },
    ],
  };
  assert.equal(parseOnlineConsultationSettings(payload, "lg").ok, true);
  assert.equal(parseOnlineConsultationSettings(payload, "univ").ok, false);
  assert.equal(
    parseOnlineConsultationSettings(
      { services: [{ ...payload.services[0], memo: "😀".repeat(4001) }] },
      "lg",
    ).ok,
    false,
  );
  assert.equal(
    parseOnlineConsultationSettings(
      { services: [{ ...payload.services[0], serviceKey: "admissions" }] },
      "lg",
    ).ok,
    false,
  );
  assert.equal(
    parseOnlineConsultationSettings(
      { services: [payload.services[0], payload.services[0]] },
      "lg",
    ).ok,
    false,
  );
});

test("review fixtures require an explicit state, loopback and non-production", () => {
  assert.equal(
    resolveSettingsReview("saving", "localhost", "development", true),
    "saving",
  );
  for (const [host, env] of [
    ["localhost", "production"],
    ["univ.localhost", "development"],
    ["example.com", "development"],
  ]) {
    assert.equal(resolveSettingsReview("saving", host!, env, true), undefined);
  }
  assert.equal(
    resolveSettingsReview("saving", "localhost", "development"),
    undefined,
  );
  for (const state of [
    undefined,
    "",
    "unknown",
    ["saving"],
    ["saving", "default"],
  ]) {
    assert.equal(
      resolveSettingsReview(state, "localhost", "development", true),
      undefined,
    );
  }
});
