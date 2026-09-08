import { normalizeJapanPhone } from "@/lib/disaster-radio-subscriptions/validation";

export const PURPOSES = [
  "admissions",
  "scholarship",
  "staff",
  "class-change",
  "facility",
  "group",
  "continuity",
] as const;
export type Purpose = (typeof PURPOSES)[number];
export const TOPICS = [
  "scholarship",
  "class-change",
  "facility",
  "group",
  "continuity",
] as const;
export type Topic = (typeof TOPICS)[number];
export const DEPARTMENTS = [
  "admissions",
  "student-affairs",
  "exam-office",
  "academic-affairs",
  "facilities",
  "international",
  "student-support",
] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const PURPOSE_DEPARTMENT: Record<Purpose, Department> =
  Object.fromEntries(PURPOSES.map((p, i) => [p, DEPARTMENTS[i]])) as Record<
    Purpose,
    Department
  >;
export const CONSENT_VERSION = "univ-phone-notice-v1";
export const FACULTY_CODES = ["1", "2", "3", "4", "5", "6", "7"] as const;
export class OutreachError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 | 422 | 429 | 503 = 422,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
  }
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export function object(value: unknown) {
  if (!isRecord(value)) throw new OutreachError("INVALID_REQUEST");
  return value;
}
export function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((k) => !keys.includes(k)))
    throw new OutreachError("INVALID_REQUEST");
}
export function text(value: unknown, max = 2000, multiline = false): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    (multiline
      ? /[\u0000-\u0008\u000b-\u001f\u007f]/u
      : /[\u0000-\u001f\u007f]/u
    ).test(value)
  )
    throw new OutreachError("INVALID_REQUEST");
  return value.trim();
}
export function integer(value: unknown, min = 0, max = 100000) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new OutreachError("INVALID_REQUEST");
  return value;
}
export function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new OutreachError("INVALID_REQUEST");
  return value as T;
}
export function ids(value: unknown, max = 100): string[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some(
      (x) => typeof x !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(x),
    )
  )
    throw new OutreachError("INVALID_REQUEST");
  return [...new Set(value as string[])];
}
export const requestKey = (value: unknown) => {
  const v = text(value, 100);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(v))
    throw new OutreachError("INVALID_REQUEST");
  return v;
};
export function academicYear(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return Number(parts.year) - (Number(parts.month) < 4 ? 1 : 0);
}
export const admissionYears = (now = new Date()) =>
  Array.from({ length: 4 }, (_, i) => academicYear(now) - i);
export const studentNumber = (
  facultyCode: string,
  admissionYear: number,
  serial: string,
) => `${facultyCode}${String(admissionYear).slice(-2)}${serial}`;
export type RegistrationInput = {
  name: string;
  facultyCode: string;
  admissionYear: number;
  serial: string;
  phone: string;
  topicIds: Topic[];
  consent: true;
  consentVersion: string;
  requestKey: string;
};
export function parseRegistration(
  payload: unknown,
  now = new Date(),
): RegistrationInput {
  const v = object(payload);
  exact(v, [
    "name",
    "facultyCode",
    "admissionYear",
    "serial",
    "phone",
    "topicIds",
    "consent",
    "consentVersion",
    "requestKey",
  ]);
  const errors: Record<string, string> = {};
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/u.test(name))
    errors.name = "name";
  const facultyCode = typeof v.facultyCode === "string" ? v.facultyCode : "";
  if (!(FACULTY_CODES as readonly string[]).includes(facultyCode))
    errors.facultyCode = "faculty";
  const year = v.admissionYear;
  if (
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    !admissionYears(now).includes(year)
  )
    errors.admissionYear = "year";
  const serial =
    typeof v.serial === "string" ? v.serial.trim().normalize("NFKC") : "";
  if (!/^\d{4}$/.test(serial)) errors.serial = "serial";
  const rawPhone = typeof v.phone === "string" ? v.phone : "";
  const phone = normalizeJapanPhone(rawPhone);
  if (!phone || rawPhone.length > 30 || /[\u0000-\u001f\u007f]/u.test(rawPhone))
    errors.phone = "phone";
  const topics =
    Array.isArray(v.topicIds) && v.topicIds.length <= 5
      ? [...new Set(v.topicIds)]
      : [];
  if (
    !topics.length ||
    topics.some((id) => !(TOPICS as readonly unknown[]).includes(id))
  )
    errors.topicIds = "topics";
  if (v.consent !== true || v.consentVersion !== CONSENT_VERSION)
    errors.consent = "consent";
  if (Object.keys(errors).length)
    throw new OutreachError("INVALID_REGISTRATION", 422, errors);
  return {
    name,
    facultyCode,
    admissionYear: year as number,
    serial,
    phone: phone!,
    topicIds: topics as Topic[],
    consent: true,
    consentVersion: CONSENT_VERSION,
    requestKey: requestKey(v.requestKey),
  };
}
export type Answers = Record<string, string | number | boolean>;
export type CallState =
  | "NOT_CALLED"
  | "QUEUED"
  | "HUMAN"
  | "VOICEMAIL"
  | "NO_ANSWER"
  | "BUSY"
  | "FAILED"
  | "UNKNOWN";
export type CaseStatus =
  "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED_UNREACHED";
export type ProcedureStatus = "UNKNOWN" | "PLANNED" | "VERIFIED" | "NA";
export type Outcome = {
  id: string;
  name: string;
  maskedContact: string;
  call: CallState;
  confirmed: boolean;
  recognized: boolean;
  answers: Answers;
  groupMemberCount: number;
  eligible: boolean;
  exclusionReason: string;
  notified: boolean;
  priorNoticeAt: string;
  selectedByStaff: boolean;
  contactKey: string;
};
export type Template = {
  id: Purpose;
  number: string;
  name: string;
  department: string;
  icon: string;
  audience: string;
  trigger: string;
  mode: string;
  purpose: string;
  fields: [string, string, string, string?][];
  questions: string[][];
  answerColumns: string[][];
  completion: string;
  evidence: string;
  procedureApplicable: boolean;
};
export type Config = Record<string, string>;
const CONFIG_FIELDS: Record<
  Purpose,
  Record<string, "text" | "date" | "time" | "datetime" | "number">
> = {
  admissions: { procedure: "text", deadline: "date", noticeReference: "text" },
  scholarship: { procedure: "text", deadline: "date", noticeReference: "text" },
  staff: {
    event: "text",
    arrivalDeadline: "time",
    venueA: "number",
    venueB: "number",
  },
  "class-change": {
    event: "text",
    oldRoom: "text",
    newRoom: "text",
    effectiveAt: "datetime",
  },
  facility: { incident: "text", building: "text", incidentAt: "datetime" },
  group: { activity: "text", deadline: "date", timeZone: "text" },
  continuity: { noticeReference: "text", callbackWindow: "text" },
};
export function parseConfig(purpose: Purpose, value: unknown): Config {
  const v = object(value),
    fields = CONFIG_FIELDS[purpose];
  exact(v, Object.keys(fields));
  return Object.fromEntries(
    Object.entries(fields).map(([k, kind]) => {
      const s = text(v[k], 2000);
      if (
        kind === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))
      )
        throw new OutreachError("INVALID_REQUEST");
      if (kind === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s))
        throw new OutreachError("INVALID_REQUEST");
      if (
        kind === "datetime" &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ||
          Number.isNaN(Date.parse(s)))
      )
        throw new OutreachError("INVALID_REQUEST");
      if (kind === "number" && (!/^\d{1,4}$/.test(s) || Number(s) < 1))
        throw new OutreachError("INVALID_REQUEST");
      return [k, s];
    }),
  );
}
export const rate = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : null;
export function classify(
  r: Pick<Outcome, "confirmed" | "recognized" | "call" | "answers">,
) {
  if (!r.confirmed || !r.recognized || r.call !== "HUMAN") return "unconfirmed";
  if (r.answers.consultation === true) return "consultation";
  if (r.answers.resend === true) return "resend";
  if (r.answers.support === true) return "support";
  if (r.answers.plannedDate && r.answers.plannedDate !== "未定")
    return "planned";
  if (r.answers.participation)
    return r.answers.participation === "参加可能" ? "available" : "unavailable";
  if (r.answers.affected === "影響あり") return "affected";
  if (r.answers.memberCount) return "group";
  return "confirmed";
}
export function groupSummary(rows: Outcome[]) {
  const latest = [...new Map(rows.map((r) => [r.id, r])).values()];
  const valid = latest.filter(
    (r) => r.recognized && r.confirmed && r.call === "HUMAN",
  );
  for (const r of valid) {
    const { assembled, delayed } = r.answers;
    if (
      typeof assembled !== "number" ||
      typeof delayed !== "number" ||
      !Number.isInteger(assembled) ||
      !Number.isInteger(delayed) ||
      assembled < 0 ||
      delayed < 0 ||
      assembled + delayed > r.groupMemberCount
    )
      throw new OutreachError("INVALID_GROUP_COUNT");
  }
  return {
    respondents: valid.length,
    representatives: latest.length,
    population: latest.reduce((n, r) => n + r.groupMemberCount, 0),
    covered: valid.reduce((n, r) => n + r.groupMemberCount, 0),
    assembled: valid.reduce((n, r) => n + Number(r.answers.assembled), 0),
    delayed: valid.reduce((n, r) => n + Number(r.answers.delayed), 0),
    unknown: latest
      .filter((r) => !valid.includes(r))
      .reduce((n, r) => n + r.groupMemberCount, 0),
  };
}
export function staffSummary(
  rows: Outcome[],
  config: Config,
  reserves: { venue: string; id: string }[],
) {
  return ["A会場", "B会場"].map((venue, i) => {
    const eligible = rows.filter(
      (r) =>
        r.call === "HUMAN" &&
        r.confirmed &&
        r.recognized &&
        r.answers.venue === venue &&
        r.answers.participation === "参加可能" &&
        typeof r.answers.arrival === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(r.answers.arrival) &&
        r.answers.arrival <= config.arrivalDeadline &&
        r.answers.venueConfirmed === true,
    ).length;
    const reserve = new Set(
      reserves.filter((r) => r.venue === venue).map((r) => r.id),
    ).size;
    const required = Number(config[i ? "venueB" : "venueA"]);
    return {
      venue,
      required,
      available: eligible + reserve,
      shortage: Math.max(0, required - eligible - reserve),
    };
  });
}

/** Manual answers use the same bounded, typed fields as the seven question sets. */
export function parseAnswers(
  purpose: Purpose,
  value: unknown,
  population: number,
): Answers {
  const v = object(value);
  const fields: Record<Purpose, readonly string[]> = {
    admissions: ["plannedDate", "difficulty", "consultation"],
    scholarship: [
      "noticeSeen",
      "plannedDate",
      "difficulty",
      "consultation",
      "resend",
    ],
    staff: ["venue", "participation", "arrival", "venueConfirmed"],
    "class-change": ["changeSeen", "canMove", "support"],
    facility: ["affected", "buildingRoom", "situation", "support"],
    group: ["memberCount", "assembled", "delayed", "location", "support"],
    continuity: [
      "noticeSeen",
      "consultation",
      "callback",
      "callbackWindow",
      "declined",
    ],
  };
  exact(v, fields[purpose]);
  const booleans = new Set([
    "consultation",
    "resend",
    "venueConfirmed",
    "support",
    "callback",
    "declined",
  ]);
  const answers: Answers = {};
  for (const [key, val] of Object.entries(v)) {
    if (booleans.has(key)) {
      if (typeof val !== "boolean") throw new OutreachError("INVALID_REQUEST");
      answers[key] = val;
    } else if (["memberCount", "assembled", "delayed"].includes(key))
      answers[key] = integer(val, 0, population);
    else answers[key] = text(val, 500);
  }
  if (purpose === "group") {
    if (
      answers.memberCount !== population ||
      typeof answers.assembled !== "number" ||
      typeof answers.delayed !== "number" ||
      answers.assembled + answers.delayed > population
    )
      throw new OutreachError("INVALID_GROUP_COUNT");
  }
  if (
    answers.plannedDate &&
    answers.plannedDate !== "未定" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(String(answers.plannedDate)) ||
      Number.isNaN(Date.parse(String(answers.plannedDate))))
  )
    throw new OutreachError("INVALID_REQUEST");
  if (
    answers.arrival &&
    answers.arrival !== "未定" &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(answers.arrival))
  )
    throw new OutreachError("INVALID_REQUEST");
  if (answers.venue) enumValue(answers.venue, ["A会場", "B会場"]);
  if (answers.participation)
    enumValue(answers.participation, ["参加可能", "参加不可", "未定"]);
  return answers;
}
