import assert from "node:assert/strict";
import test from "node:test";

import { classifyMunicipalAnswers, nextCallState } from "../lib/zaad/municipal/workflows";

test("ANSWER-STATE: connection is independent; ambiguous/self-attested responses never imply completion", () => {
  const state = { callState: "ANSWERED", identityState: "VERIFIED", ackState: "CONFIRMED", recognitionState: "CLEAR", answers: { usual: { value: "USUAL", input: "VOICE" as const }, callback: { value: "NO", input: "DTMF" as const } } };
  assert.equal(classifyMunicipalAnswers("ELDER_WATCH", state).classification, "PHONE_CONFIRMATION_COMPLETE");
  for (const patch of [{ identityState: "SELF_ATTESTED" }, { identityState: "OTHER_PERSON" }, { recognitionState: "AMBIGUOUS" }, { ackState: "UNCONFIRMED" }, { answers: {} }]) assert.equal(classifyMunicipalAnswers("ELDER_WATCH", { ...state, ...patch }).phoneConfirmed, false);
  assert.equal(nextCallState("QUEUED", "consumer_answer"), "ANSWERED");
  assert.equal(nextCallState("ANSWERED", "no_answer"), "ANSWERED");
});
test("multiple procedure requests retain all reasons and prefer consultation over resend/report", () => {
  const result = classifyMunicipalAnswers("PROCEDURE_SUPPORT", { callState: "ANSWERED", identityState: "VERIFIED", ackState: "CONFIRMED", recognitionState: "CLEAR", answers: { delivered: { value: "RESEND", input: "DTMF" }, submission: { value: "REPORTED_COMPLETE", input: "DTMF" }, help: { value: "YES", input: "DTMF" } } });
  assert.deepEqual(result.reasons, ["CONSULTATION_REQUESTED", "RESEND_REQUESTED", "COMPLETION_REPORTED"]);
  assert.equal(result.classification, "CONSULTATION_REQUESTED");
  assert.equal(result.requiresStaff, true);
});

test("all four purposes require complete clear answers; requests remain staff work rather than confirmation complete", () => {
  const cases = [
    ["ELDER_WATCH", { usual: "USUAL", callback: "NO" }, "callback", "YES"],
    ["PROCEDURE_SUPPORT", { delivered: "DELIVERED", submission: "PLANNED", help: "NO" }, "help", "YES"],
    ["SERVICE_CONFIRMATION", { attendance: "AS_PLANNED", callback: "NO" }, "attendance", "CHANGE"],
    ["FRAUD_ALERT", { ack: "CONFIRMED", similar: "NO", consult: "NO" }, "similar", "YES"],
  ] as const;
  for (const [purpose, values, requested, changed] of cases) {
    const answers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, input: "DTMF" as const }]));
    const state = { callState: "ANSWERED", identityState: "VERIFIED", recognitionState: "CLEAR", ackState: "CONFIRMED", answers };
    assert.equal(classifyMunicipalAnswers(purpose, state).phoneConfirmed, true);
    for (const patch of [{ recognitionState: "AMBIGUOUS" }, { recognitionState: "NONE" }, { identityState: "VOICEMAIL" }, { answers: {} }]) {
      const outcome = classifyMunicipalAnswers(purpose, { ...state, ...patch });
      assert.equal(outcome.phoneConfirmed, false); assert.equal(outcome.requiresStaff, true);
    }
    const outcome = classifyMunicipalAnswers(purpose, { ...state, answers: { ...answers, [requested]: { value: changed, input: "VOICE" } } });
    assert.equal(outcome.phoneConfirmed, false); assert.equal(outcome.requiresStaff, true);
  }
});
