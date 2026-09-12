import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConsultationIntake } from "../lib/consultation-intake";

test("intake trims answers and rejects blank or excessive data before sharing", () => {
  const valid = { displayName: " デモ学生 ", affiliation: "在学生", topic: " 奨学金について " };
  assert.deepEqual(normalizeConsultationIntake(valid), { displayName: "デモ学生", affiliation: "在学生", topic: "奨学金について" });
  for (const key of ["displayName", "affiliation", "topic"] as const) {
    assert.equal(normalizeConsultationIntake({ ...valid, [key]: " \n " }), null);
    assert.equal(normalizeConsultationIntake({ ...valid, [key]: "a".repeat(301) }), null);
  }
});
