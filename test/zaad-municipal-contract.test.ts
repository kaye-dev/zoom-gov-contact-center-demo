import assert from "node:assert/strict";
import test from "node:test";
import { MUNICIPAL_CONSENT_VERSION, parseCaseUpdate, parseBusinessEvidence, type Availability } from "../lib/zaad/municipal/contracts";
import { eligibleMunicipalTarget, requireCaseTransition } from "../lib/zaad/municipal/workflows";

const window: Availability = { weekdays: [0, 1, 2, 3, 4, 5, 6], windows: [{ start: "09:00", end: "17:00" }] };
test("RECHECK-LATEST: latest withdrawal, identity, business completion and scope prevent dispatch", () => {
  const now = new Date("2026-09-09T01:00:00Z");
  const base = { purpose: "PROCEDURE_SUPPORT" as const, contact: { status: "ACTIVE", identityVerified: true, phoneVerified: true, district: "central", departmentKey: "procedures", preferences: [{ topic: "procedure-support", enabled: true, consentVersion: MUNICIPAL_CONSENT_VERSION, consentedAt: new Date("2026-09-01"), confirmedAt: new Date("2026-09-02") }] }, businessEvidence: { purpose: "PROCEDURE_SUPPORT", procedureRef: "procedure-1", noticeSentAt: "2026-09-01T00:00:00Z", reminderAt: "2026-09-03T00:00:00Z", status: "INCOMPLETE", statusVerifiedAt: "2026-09-08T00:00:00Z", individualCallRequired: true, reason: "職員確認済み", deadline: "2026-09-10T00:00:00Z" }, allowedDepartments: ["procedures"], excluded: false, dueAt: new Date("2026-09-10"), now, schedule: window, dispatch: true };
  assert.equal(eligibleMunicipalTarget(base).eligible, true);
  for (const patch of [{ contact: { ...base.contact, status: "WITHDRAWN" } }, { contact: { ...base.contact, phoneVerified: false } }, { contact: { ...base.contact, preferences: [] } }, { excluded: true }, { allowedDepartments: [] }, { businessEvidence: { ...base.businessEvidence, status: "VERIFIED_COMPLETE" } }, { businessEvidence: { ...base.businessEvidence, individualCallRequired: false } }]) assert.equal(eligibleMunicipalTarget({ ...base, ...patch }).eligible, false);
  assert.throws(() => parseBusinessEvidence({ ...base.businessEvidence, scheduleId: "wrong-schema" }, "PROCEDURE_SUPPORT"));
});
test("CASE-LIFECYCLE: sending is not receipt; business changes require verified reference and receipt", () => {
  const base = { version: 1, operationKey: "case-operation-1", assigneeId: "worker", dueAt: "2026-09-10T00:00:00Z", status: "COMPLETED", note: "記録を確認" };
  assert.throws(() => parseCaseUpdate({ ...base, handoff: { recipientId: "other", sentAt: "2026-09-09T00:00:00Z", scopeNote: "最小限" } }));
  assert.throws(() => parseCaseUpdate({ ...base, businessVerification: { type: "CHANGE_VERIFIED", referenceId: "schedule-1", verifiedAt: "2026-09-09T00:00:00Z", method: "台帳" } }));
  assert.throws(() => requireCaseTransition("HANDOFF_PENDING", "COMPLETED"));
  assert.throws(() => requireCaseTransition("COMPLETED", "OPEN"));
  requireCaseTransition("HANDOFF_RECEIVED", "COMPLETED");
});
