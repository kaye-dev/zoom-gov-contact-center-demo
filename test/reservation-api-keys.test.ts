import assert from "node:assert/strict";
import test from "node:test";

import {
  digestReservationApiKey,
  generateReservationApiKey,
  parseReservationApiKey,
  previewReservationApiKey,
  verifyReservationApiKey,
} from "../lib/server/reservation-api-keys";

test("raw reservation API keys use cryptographic format and one-way digest", () => {
  const first = generateReservationApiKey();
  const second = generateReservationApiKey();
  assert.match(first.rawKey, /^zgcc_rsv_[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(first.rawKey, second.rawKey);
  assert.deepEqual(parseReservationApiKey(first.rawKey), { publicId: first.publicId });
  const digest = digestReservationApiKey(first.rawKey);
  assert.match(digest, /^[a-f0-9]{64}$/u);
  assert.equal(verifyReservationApiKey(first.rawKey, digest), true);
  assert.equal(verifyReservationApiKey(second.rawKey, digest), false);
  assert.equal(digest.includes(first.rawKey), false);
});

test("key previews reveal only bounded public identifier fragments", () => {
  const preview = previewReservationApiKey("1234567890abcdef");
  assert.equal(preview, "zgcc_rsv_1234••••cdef");
  assert.equal(preview.includes("567890ab"), false);
});
