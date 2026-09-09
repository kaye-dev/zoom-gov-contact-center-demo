import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { PrismaClient } from "../lib/generated/prisma/client";
import { acceptProviderEvent, verifyZoomSignature } from "../lib/server/zaad/municipal/receipts";
import { OutreachContractError } from "../lib/zaad/outreach-contracts";

const secret = "test-only-municipal-signature-secret-000000";
const now = new Date("2026-09-09T12:00:00Z");
function headers(raw: string, timestamp = String(Math.floor(now.getTime() / 1000))) {
  return new Headers({ "x-zm-request-timestamp": timestamp, "x-zm-signature": `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${raw}`).digest("hex")}` });
}
test("webhook signs exact bytes and authenticates request time independently of delayed event time", async () => {
  const body = { event: "contact_center.outbound_campaign_dialer_status", event_ts: now.getTime() - 3600000, payload: { account_id: "test-account", object: { engagement_id: "test-engagement", campaign_dialer_status: "consumer_answer", date_time_ms: "2026-09-09T11:00:00.000Z" } } };
  const raw = JSON.stringify(body);
  verifyZoomSignature(raw, headers(raw), secret, now);
  for (const [bytes, signed] of [[raw + " ", headers(raw)], [raw, headers(raw, String(now.getTime() / 1000 - 301))]] as const)
    assert.throws(() => verifyZoomSignature(bytes, signed, secret, now), error => error instanceof OutreachContractError && error.status === 401);
  let stored = 0;
  const db = { municipalProviderInbox: { async upsert() { stored++; return {}; } } } as unknown as PrismaClient;
  await acceptProviderEvent(db, raw, headers(raw), secret, now);
  assert.equal(stored, 1);
  for (const date of [now.getTime(), "2026-09-09T13:00:00Z"]) {
    const invalid = JSON.stringify({ ...body, payload: { ...body.payload, object: { ...body.payload.object, date_time_ms: date } } });
    await assert.rejects(acceptProviderEvent(db, invalid, headers(invalid), secret, now));
  }
  assert.equal(stored, 1);
});
test("URL validation returns token HMAC without persisting a call event", async () => {
  const raw = JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "verification-token" } });
  const db = {} as PrismaClient;
  assert.deepEqual(await acceptProviderEvent(db, raw, headers(raw), secret, now), { plainToken: "verification-token", encryptedToken: createHmac("sha256", secret).update("verification-token").digest("hex") });
});

test("live municipal provider stays unavailable until every account-specific condition is verified", async () => {
  const { configuredMunicipalProvider, MUNICIPAL_LIVE_REQUIREMENTS } = await import("../lib/server/zaad/municipal/provider");
  const provider = configuredMunicipalProvider();
  const ready = await provider.readiness("test-flow");
  assert.equal(ready.ready, false);
  assert.deepEqual(ready.missing, [...MUNICIPAL_LIVE_REQUIREMENTS]);
  await assert.rejects(provider.send({ siteKey: "lg", operationKey: "test-operation", correlationId: "correlation", attemptId: "attempt", phone: "+819000000000", body: "test", voiceId: "Takumi", flowBindingId: "test-flow", questionVersion: "test" }), error => error instanceof OutreachContractError && error.code === "PROVIDER_NOT_CONFIGURED");
  assert.equal((await provider.reconcile({ operationKey: "test-operation", correlationId: "correlation" })).state, "UNKNOWN");
});
