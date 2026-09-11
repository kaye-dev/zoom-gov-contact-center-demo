import { parseBusinessEvidence, purposeTopic, QUESTIONS, type Answer, type Availability, type BusinessEvidence, type CaseState, type MunicipalPurpose } from "./contracts";
import { OutreachContractError } from "../outreach-contracts";

export function inJstWindow(now: Date, availability: Availability) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const clock = `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
  return availability.weekdays.includes(jst.getUTCDay()) && availability.windows.some(w => clock >= w.start && clock < w.end);
}
export function availabilityOverlaps(left: Availability, right: Availability) {
  return left.weekdays.some(day => right.weekdays.includes(day)) && left.windows.some(a => right.windows.some(b => a.start < b.end && b.start < a.end));
}
export function nextDueSlot(after: Date, deadline: Date, schedules: Availability[]) {
  // Bound search to 14 days per tick. A later tick can continue from the DB.
  const end = Math.min(deadline.getTime(), after.getTime() + 14 * 86400000);
  for (let time = Math.ceil(after.getTime() / 60000) * 60000; time < end; time += 60000) {
    const date = new Date(time);
    if (schedules.every(schedule => inJstWindow(date, schedule))) return date;
  }
  return null;
}
export type EligibilityContact = {
  status: string; identityVerified: boolean; phoneVerified: boolean; deletedAt?: Date | null;
  district: string | null; preferences: { topic: string; enabled: boolean; consentVersion: string | null; consentedAt: Date | null; confirmedAt: Date | null }[];
};
export function eligibleMunicipalTarget(input: {
  purpose: MunicipalPurpose; contact: EligibilityContact; businessEvidence: unknown;
  excluded: boolean; dueAt: Date; now: Date;
  schedule: Availability; dispatch?: boolean;
}) {
  const { contact, now } = input, reasons: string[] = [];
  if (input.excluded || contact.deletedAt) reasons.push("EXCLUDED");
  if (contact.status !== "ACTIVE" || !contact.identityVerified || !contact.phoneVerified) reasons.push("CONFIRMATION_REQUIRED");
  if (!contact.preferences.some(p => p.topic === purposeTopic[input.purpose] && p.enabled && p.consentVersion && p.consentedAt && p.confirmedAt)) reasons.push("TOPIC_CONSENT_REQUIRED");
  if (input.dueAt <= now) reasons.push("DEADLINE_PASSED");
  if (input.dispatch && !inJstWindow(now, input.schedule)) reasons.push("OUTSIDE_TIME_WINDOW");
  let evidence: BusinessEvidence | null = null;
  try { evidence = parseBusinessEvidence(input.businessEvidence, input.purpose); } catch { reasons.push("BUSINESS_EVIDENCE_REQUIRED"); }
  if (evidence) {
    switch (evidence.purpose) {
      case "ELDER_WATCH":
        if (!availabilityOverlaps(evidence.confirmedAvailability, input.schedule)) reasons.push("AVAILABILITY_ADJUSTMENT_REQUIRED");
        if (input.dispatch && !inJstWindow(now, evidence.confirmedAvailability)) reasons.push("OUTSIDE_CONTACT_WINDOW");
        break;
      case "PROCEDURE_SUPPORT":
        if (evidence.status !== "INCOMPLETE") reasons.push(evidence.status === "VERIFIED_COMPLETE" ? "PROCEDURE_COMPLETE" : "BUSINESS_STATUS_UNKNOWN");
        if (!evidence.individualCallRequired) reasons.push("INDIVIDUAL_CALL_JUDGEMENT_REQUIRED");
        if (Date.parse(evidence.noticeSentAt) > now.getTime() || Date.parse(evidence.reminderAt) > now.getTime() || Date.parse(evidence.statusVerifiedAt) > now.getTime()) reasons.push("BUSINESS_EVIDENCE_REQUIRED");
        if (Date.parse(evidence.deadline) <= now.getTime()) reasons.push("DEADLINE_PASSED");
        break;
      case "SERVICE_CONFIRMATION":
        if (!evidence.registeredUserVerified || evidence.status !== "CONFIRMED") reasons.push("SERVICE_NOT_CONFIRMED");
        if (Date.parse(evidence.startsAt) <= now.getTime()) reasons.push("SERVICE_ALREADY_STARTED");
        if (input.dispatch && !inJstWindow(now, evidence.contactWindow)) reasons.push("OUTSIDE_CONTACT_WINDOW");
        break;
      case "FRAUD_ALERT":
        if (!contact.district || !evidence.districts.includes(contact.district)) reasons.push("DISTRICT_MISMATCH");
        if (Date.parse(evidence.verifiedAt) > now.getTime() || Date.parse(evidence.publicationVerifiedAt) > now.getTime()) reasons.push("INCIDENT_NOT_VERIFIED");
        break;
    }
  }
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)], evidence };
}

export type MunicipalAnswerState = { callState: string; identityState: string; ackState: string; recognitionState: string; answers: Record<string, Answer> };
export function classifyMunicipalAnswers(purpose: MunicipalPurpose, state: MunicipalAnswerState) {
  const values = Object.fromEntries(Object.entries(state.answers).map(([key, answer]) => [key, answer.value]));
  const allAnswers = Object.entries(QUESTIONS[purpose]).every(([key, options]) => options.includes(values[key]));
  if (["QUEUED", "UNKNOWN"].includes(state.callState)) return { phoneConfirmed: false, classification: "PENDING", reasons: [], requiresStaff: false };
  if (state.callState !== "ANSWERED") return { phoneConfirmed: false, classification: "NO_ANSWER", reasons: ["NO_ANSWER"], requiresStaff: false };
  if (state.identityState !== "VERIFIED" || state.ackState !== "CONFIRMED" || state.recognitionState !== "CLEAR" || !allAnswers)
    return { phoneConfirmed: false, classification: "UNCONFIRMED", reasons: ["UNCONFIRMED"], requiresStaff: true };
  const reasons: string[] = [];
  switch (purpose) {
    case "ELDER_WATCH":
      if (values.usual === "CONCERN") reasons.push("CONCERN");
      if (values.callback === "YES") reasons.push("CALLBACK_REQUESTED");
      break;
    case "PROCEDURE_SUPPORT":
      if (values.help === "YES") reasons.push("CONSULTATION_REQUESTED");
      if (values.delivered === "RESEND") reasons.push("RESEND_REQUESTED");
      if (values.submission === "REPORTED_COMPLETE") reasons.push("COMPLETION_REPORTED");
      if (values.submission === "PLANNED") reasons.push("SUBMISSION_PLANNED");
      if (values.submission === "UNDECIDED") reasons.push("UNCONFIRMED");
      break;
    case "SERVICE_CONFIRMATION":
      if (values.attendance === "CHANGE") reasons.push("CHANGE_REQUESTED");
      if (values.attendance === "CANCEL") reasons.push("CANCELLATION_REQUESTED");
      if (values.callback === "YES") reasons.push("CALLBACK_REQUESTED");
      break;
    case "FRAUD_ALERT":
      if (values.similar === "YES") reasons.push("SIMILAR_CALL_REPORTED");
      if (values.consult === "YES") reasons.push("CONSULTATION_REQUESTED");
      if (values.ack !== "CONFIRMED") reasons.push("UNCONFIRMED");
      break;
  }
  const requiresStaff = reasons.some(reason => reason !== "SUBMISSION_PLANNED");
  return { phoneConfirmed: !requiresStaff && !reasons.includes("UNCONFIRMED"), classification: reasons[0] ?? "PHONE_CONFIRMATION_COMPLETE", reasons, requiresStaff };
}

const caseTransitions: Record<CaseState, readonly CaseState[]> = {
  OPEN: ["OPEN", "IN_PROGRESS"], IN_PROGRESS: ["IN_PROGRESS", "HANDOFF_PENDING", "COMPLETED"],
  HANDOFF_PENDING: ["HANDOFF_PENDING", "HANDOFF_RECEIVED"], HANDOFF_RECEIVED: ["HANDOFF_RECEIVED", "IN_PROGRESS", "COMPLETED"], COMPLETED: ["COMPLETED"],
};
export function requireCaseTransition(from: CaseState, to: CaseState) {
  if (!caseTransitions[from]?.includes(to)) throw new OutreachContractError("INVALID_CASE_TRANSITION", 409);
}
export function nextCallState(current: string, event: string) {
  const mapping: Record<string, string> = { consumer_answer: "ANSWERED", consumer_no_answer: "NO_ANSWER", consumer_busy: "BUSY", consumer_reject: "REJECTED", agent_abandoned: "FAILED", number_invalid: "FAILED", number_blocked: "REJECTED", other_errors: "FAILED" };
  const next = mapping[event];
  if (!next) return current;
  // Call status alone never changes identity, acknowledgement or question answers.
  if (next === "ANSWERED") return next;
  if (current === "ANSWERED" || (current !== "QUEUED" && current !== "UNKNOWN" && next !== current)) return current;
  return next;
}
