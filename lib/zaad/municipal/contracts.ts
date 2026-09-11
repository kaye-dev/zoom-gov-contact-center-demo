import { choice, dateValue, fields, operationKey, OutreachContractError, phoneValue, record, stringList, stringValue, whole } from "../outreach-contracts";
export const MUNICIPAL_PURPOSES = ["ELDER_WATCH", "PROCEDURE_SUPPORT", "SERVICE_CONFIRMATION", "FRAUD_ALERT"] as const;
export type MunicipalPurpose = typeof MUNICIPAL_PURPOSES[number];
export const MUNICIPAL_TOPICS = ["elder-watch", "procedure-support", "service-confirmation", "fraud-alert"] as const;
export type MunicipalTopic = typeof MUNICIPAL_TOPICS[number];
// This demo master is explicit configuration, never inferred from a phone/address.
export const MUNICIPAL_DISTRICTS = ["central", "east", "west"] as const;
export const MUNICIPAL_CONSENT_VERSION = "municipal-phone-notice-v1";
export const QUESTION_VERSION = "municipal-questions-v1";
export const purposeTopic: Record<MunicipalPurpose, MunicipalTopic> = { ELDER_WATCH: "elder-watch", PROCEDURE_SUPPORT: "procedure-support", SERVICE_CONFIRMATION: "service-confirmation", FRAUD_ALERT: "fraud-alert" };
export const purposePath: Record<MunicipalPurpose, string> = { ELDER_WATCH: "watch", PROCEDURE_SUPPORT: "procedure", SERVICE_CONFIRMATION: "service", FRAUD_ALERT: "fraud" };
export const QUESTIONS: Record<MunicipalPurpose, Record<string, readonly string[]>> = {
  ELDER_WATCH: { usual: ["USUAL", "CONCERN"], callback: ["NO", "YES"] },
  PROCEDURE_SUPPORT: { delivered: ["DELIVERED", "RESEND"], submission: ["PLANNED", "REPORTED_COMPLETE", "UNDECIDED"], help: ["NO", "YES"] },
  SERVICE_CONFIRMATION: { attendance: ["AS_PLANNED", "CHANGE", "CANCEL"], callback: ["NO", "YES"] },
  FRAUD_ALERT: { ack: ["CONFIRMED", "REPLAY"], similar: ["NO", "YES"], consult: ["NO", "YES"] },
};
export type TimeWindow = { start: string; end: string };
export type Availability = { weekdays: number[]; windows: TimeWindow[] };
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function parseAvailability(value: unknown): Availability {
  const v = record(value); fields(v, ["weekdays", "windows"]);
  if (!Array.isArray(v.weekdays) || !v.weekdays.length || v.weekdays.length > 7) throw new OutreachContractError("INVALID_AVAILABILITY");
  const weekdays = v.weekdays.map(day => whole(day, 0, 6));
  if (new Set(weekdays).size !== weekdays.length || !Array.isArray(v.windows) || !v.windows.length || v.windows.length > 5) throw new OutreachContractError("INVALID_AVAILABILITY");
  const windows = v.windows.map(item => {
    const w = record(item); fields(w, ["start", "end"]);
    const start = stringValue(w.start, 5), end = stringValue(w.end, 5);
    if (![start, end].every(t => /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(t)) || minutes(start) >= minutes(end)) throw new OutreachContractError("INVALID_AVAILABILITY");
    return { start, end };
  }).sort((a, b) => a.start.localeCompare(b.start));
  if (windows.some((w, i) => i > 0 && w.start < windows[i - 1].end)) throw new OutreachContractError("INVALID_AVAILABILITY");
  return { weekdays: weekdays.sort(), windows };
}
export function parseMunicipalRegistration(payload: unknown) {
  const v = record(payload); fields(v, ["operationKey", "name", "phone", "district", "topics", "availability", "consent", "consentVersion"]);
  const topics = stringList(v.topics, 4).map(topic => choice(topic, MUNICIPAL_TOPICS));
  if (!topics.length || v.consent !== true || v.consentVersion !== MUNICIPAL_CONSENT_VERSION) throw new OutreachContractError("CONSENT_REQUIRED", 400, { consent: "CONSENT_REQUIRED" });
  const availability = topics.includes("elder-watch") ? parseAvailability(v.availability) : null;
  if (!topics.includes("elder-watch") && v.availability != null) throw new OutreachContractError("INVALID_AVAILABILITY");
  return { operationKey: operationKey(v.operationKey), name: stringValue(v.name, 100), phone: phoneValue(v.phone), district: choice(v.district, MUNICIPAL_DISTRICTS), topics, availability, consentVersion: MUNICIPAL_CONSENT_VERSION };
}
export type BusinessEvidence =
  | { purpose: "ELDER_WATCH"; availabilityRevision: number; confirmedAvailability: Availability }
  | { purpose: "PROCEDURE_SUPPORT"; procedureRef: string; noticeSentAt: string; reminderAt: string; status: "INCOMPLETE" | "VERIFIED_COMPLETE" | "UNKNOWN"; statusVerifiedAt: string; individualCallRequired: boolean; reason: string; deadline: string }
  | { purpose: "SERVICE_CONFIRMATION"; serviceRef: string; serviceKind: "VISIT" | "TRANSPORT" | "MEAL"; scheduleId: string; scheduleVersion: number; startsAt: string; status: "CONFIRMED" | "CHANGED" | "CANCELLED" | "UNKNOWN"; registeredUserVerified: boolean; contactWindow: Availability }
  | { purpose: "FRAUD_ALERT"; incidentRef: string; verifiedBy: string; verifiedAt: string; districts: string[]; guidance: string; officeUrl: string; callerPhone: string; publicationVerifiedAt: string };
export function parseBusinessEvidence(payload: unknown, purpose: MunicipalPurpose): BusinessEvidence {
  const v = record(payload);
  if (v.purpose !== purpose) throw new OutreachContractError("PURPOSE_MISMATCH");
  switch (purpose) {
    case "ELDER_WATCH":
      fields(v, ["purpose", "availabilityRevision", "confirmedAvailability"]);
      return { purpose, availabilityRevision: whole(v.availabilityRevision), confirmedAvailability: parseAvailability(v.confirmedAvailability) };
    case "PROCEDURE_SUPPORT":
      fields(v, ["purpose", "procedureRef", "noticeSentAt", "reminderAt", "status", "statusVerifiedAt", "individualCallRequired", "reason", "deadline"]);
      if (typeof v.individualCallRequired !== "boolean") throw new OutreachContractError("INVALID_REQUEST");
      return { purpose, procedureRef: stringValue(v.procedureRef), noticeSentAt: dateValue(v.noticeSentAt), reminderAt: dateValue(v.reminderAt), status: choice(v.status, ["INCOMPLETE", "VERIFIED_COMPLETE", "UNKNOWN"]), statusVerifiedAt: dateValue(v.statusVerifiedAt), individualCallRequired: v.individualCallRequired, reason: stringValue(v.reason, 500), deadline: dateValue(v.deadline) };
    case "SERVICE_CONFIRMATION":
      fields(v, ["purpose", "serviceRef", "serviceKind", "scheduleId", "scheduleVersion", "startsAt", "status", "registeredUserVerified", "contactWindow"]);
      if (typeof v.registeredUserVerified !== "boolean") throw new OutreachContractError("INVALID_REQUEST");
      return { purpose, serviceRef: stringValue(v.serviceRef), serviceKind: choice(v.serviceKind, ["VISIT", "TRANSPORT", "MEAL"]), scheduleId: stringValue(v.scheduleId), scheduleVersion: whole(v.scheduleVersion), startsAt: dateValue(v.startsAt), status: choice(v.status, ["CONFIRMED", "CHANGED", "CANCELLED", "UNKNOWN"]), registeredUserVerified: v.registeredUserVerified, contactWindow: parseAvailability(v.contactWindow) };
    case "FRAUD_ALERT": {
      fields(v, ["purpose", "incidentRef", "verifiedBy", "verifiedAt", "districts", "guidance", "officeUrl", "callerPhone", "publicationVerifiedAt"]);
      const officeUrl = stringValue(v.officeUrl, 500);
      let url: URL; try { url = new URL(officeUrl); } catch { throw new OutreachContractError("INVALID_OFFICE_URL"); }
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new OutreachContractError("INVALID_OFFICE_URL");
      const districts = stringList(v.districts, 3).map(d => choice(d, MUNICIPAL_DISTRICTS));
      if (!districts.length) throw new OutreachContractError("INVALID_DISTRICT");
      return { purpose, incidentRef: stringValue(v.incidentRef), verifiedBy: stringValue(v.verifiedBy), verifiedAt: dateValue(v.verifiedAt), districts, guidance: stringValue(v.guidance, 500), officeUrl, callerPhone: phoneValue(v.callerPhone), publicationVerifiedAt: dateValue(v.publicationVerifiedAt) };
    }
  }
}
export function parseWorkflow(payload: unknown) {
  const v = record(payload); fields(v, ["version", "name", "purpose", "departmentKey", "body", "voiceId", "questionVersion", "schedule", "maxRetries", "retryIntervalMinutes", "assigneeId", "dueAt", "flowBindingId"]);
  if (v.questionVersion !== QUESTION_VERSION) throw new OutreachContractError("QUESTION_VERSION_MISMATCH");
  return { version: v.version === undefined ? undefined : whole(v.version), name: stringValue(v.name), purpose: choice(v.purpose, MUNICIPAL_PURPOSES), body: stringValue(v.body, 500, true), voiceId: choice(v.voiceId, ["Tomoko", "Takumi", "Mizuki", "Kazuha"]), questionVersion: QUESTION_VERSION, schedule: parseAvailability(v.schedule), maxRetries: whole(v.maxRetries, 0, 3), retryIntervalMinutes: whole(v.retryIntervalMinutes, 5, 1440), assigneeId: stringValue(v.assigneeId), dueAt: dateValue(v.dueAt), flowBindingId: v.flowBindingId == null ? null : stringValue(v.flowBindingId) };
}
export type Answer = { value: string; input: "DTMF" | "VOICE" };
export function parseAnswers(payload: unknown, purpose: MunicipalPurpose): Record<string, Answer> {
  const value = record(payload), questions = QUESTIONS[purpose]; fields(value, Object.keys(questions));
  return Object.fromEntries(Object.entries(value).map(([key, raw]) => {
    const answer = record(raw); fields(answer, ["value", "input"]);
    return [key, { value: choice(answer.value, questions[key]), input: choice(answer.input, ["DTMF", "VOICE"]) }];
  }));
}
export const CASE_STATES = ["OPEN", "IN_PROGRESS", "HANDOFF_PENDING", "HANDOFF_RECEIVED", "COMPLETED"] as const;
export type CaseState = typeof CASE_STATES[number];
export function parseCaseUpdate(payload: unknown) {
  const v = record(payload); fields(v, ["version", "operationKey", "assigneeId", "dueAt", "status", "note", "handoff", "businessVerification"]);
  let handoff = null;
  if (v.handoff != null) {
    const h = record(v.handoff); fields(h, ["recipientId", "sentAt", "scopeNote", "receivedBy", "receivedAt"]);
    if ((h.receivedBy == null) !== (h.receivedAt == null)) throw new OutreachContractError("HANDOFF_RECEIPT_REQUIRED", 422);
    handoff = { recipientId: stringValue(h.recipientId), sentAt: dateValue(h.sentAt), scopeNote: stringValue(h.scopeNote, 500), receivedBy: h.receivedBy == null ? null : stringValue(h.receivedBy), receivedAt: h.receivedAt == null ? null : dateValue(h.receivedAt) };
    if (handoff.receivedAt && handoff.receivedAt < handoff.sentAt) throw new OutreachContractError("INVALID_HANDOFF_DATE");
  }
  let businessVerification = null;
  if (v.businessVerification != null) {
    const b = record(v.businessVerification); fields(b, ["type", "referenceId", "verifiedAt", "method", "receivedBy", "receivedAt"]);
    businessVerification = { type: choice(b.type, ["VERIFIED_COMPLETE", "CHANGE_VERIFIED"]), referenceId: stringValue(b.referenceId), verifiedAt: dateValue(b.verifiedAt), method: stringValue(b.method, 500), receivedBy: b.receivedBy == null ? null : stringValue(b.receivedBy), receivedAt: b.receivedAt == null ? null : dateValue(b.receivedAt) };
    if (businessVerification.type === "CHANGE_VERIFIED" && (!businessVerification.receivedBy || !businessVerification.receivedAt)) throw new OutreachContractError("BUSINESS_RECEIPT_REQUIRED", 422);
  }
  const status = choice(v.status, CASE_STATES);
  if ((status === "HANDOFF_PENDING" && !handoff) || (status === "HANDOFF_RECEIVED" && !handoff?.receivedAt) || (status === "COMPLETED" && handoff && !handoff.receivedAt)) throw new OutreachContractError("HANDOFF_RECEIPT_REQUIRED", 422);
  return { version: whole(v.version), operationKey: operationKey(v.operationKey), assigneeId: stringValue(v.assigneeId), dueAt: dateValue(v.dueAt), status, note: stringValue(v.note, 2000, true), handoff, businessVerification };
}
