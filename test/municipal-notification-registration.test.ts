import assert from "node:assert/strict";
import test from "node:test";
import { MUNICIPAL_CONSENT_VERSION, parseMunicipalRegistration, type Availability } from "../lib/zaad/municipal/contracts";


const window: Availability = { weekdays: [0, 1, 2, 3, 4, 5, 6], windows: [{ start: "09:00", end: "17:00" }] };
test("PUBLIC-LG-PENDING: strict opt-in, no inferred eligibility or old disaster consent", () => {
  const base = { operationKey: "municipal-test-001", name: "架空住民", phone: "09000000001", district: "central", topics: ["fraud-alert"], consent: true, consentVersion: MUNICIPAL_CONSENT_VERSION };
  assert.equal(parseMunicipalRegistration(base).phone, "+819000000001");
  for (const patch of [{ topics: [] }, { consent: false }, { consentVersion: "disaster-radio-v1" }, { district: "unknown" }, { email: "extra@example.test" }, { topics: ["elder-watch"] }]) assert.throws(() => parseMunicipalRegistration({ ...base, ...patch }));
  assert.deepEqual(parseMunicipalRegistration({ ...base, topics: ["elder-watch"], availability: window }).availability, window);
});
