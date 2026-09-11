import { normalizeJapanPhone } from "@/lib/disaster-radio-subscriptions/validation";
import type { TenantKey } from "@/lib/tenants";

export class OutreachContractError extends Error {
  constructor(readonly code: string, readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 502 | 503 = 400, readonly fieldErrors?: Record<string, string>) { super(code); }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OutreachContractError("INVALID_REQUEST");
  return value as Record<string, unknown>;
}
export function fields(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new OutreachContractError("UNKNOWN_FIELD");
}
export function stringValue(value: unknown, maximum = 100, multiline = false): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum ||
    (multiline ? /[\u0000-\u0008\u000b-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(value)) throw new OutreachContractError("INVALID_REQUEST");
  return value.trim();
}
export function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new OutreachContractError("INVALID_REQUEST");
  return value as T;
}
export function whole(value: unknown, min = 1, max = 100000) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new OutreachContractError("INVALID_REQUEST");
  return value;
}
export function operationKey(value: unknown) {
  const key = stringValue(value);
  if (!/^[A-Za-z0-9_-]{8,100}$/u.test(key)) throw new OutreachContractError("INVALID_OPERATION_KEY");
  return key;
}
export function dateValue(value: unknown): string {
  const text = stringValue(value, 40);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/u.test(text) || !Number.isFinite(Date.parse(text))) throw new OutreachContractError("INVALID_DATE");
  return new Date(text).toISOString();
}
export function phoneValue(value: unknown) {
  const phone = normalizeJapanPhone(stringValue(value, 40));
  if (!phone) throw new OutreachContractError("INVALID_PHONE", 400, { phone: "INVALID_PHONE" });
  return phone;
}
export function stringList(value: unknown, maximum = 100): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new OutreachContractError("INVALID_REQUEST");
  const items = value.map(item => stringValue(item));
  if (new Set(items).size !== items.length) throw new OutreachContractError("DUPLICATE_SELECTION");
  return items;
}
export const PERSON_ORIGINS = ["DISASTER_RADIO", "MUNICIPAL_CONTACT", "UNIVERSITY_CONTACT", "UNIVERSITY_REGISTRATION", "IMPORT_CANDIDATE"] as const;
export type PersonOrigin = typeof PERSON_ORIGINS[number];
export type PersonReference = { siteKey: TenantKey; kind: "resident" | "student"; origin: PersonOrigin; id: string };
export function personReference(value: unknown, tenant: TenantKey): PersonReference {
  const v = record(value); fields(v, ["siteKey", "kind", "origin", "id"]);
  if (v.siteKey !== tenant) throw new OutreachContractError("NOT_FOUND", 404);
  const origin = choice(v.origin, PERSON_ORIGINS);
  const kind = tenant === "lg" ? "resident" : "student";
  if (v.kind !== kind || (tenant === "lg" ? origin.startsWith("UNIVERSITY_") : ["DISASTER_RADIO", "MUNICIPAL_CONTACT"].includes(origin))) throw new OutreachContractError("NOT_FOUND", 404);
  return { siteKey: tenant, kind, origin, id: stringValue(v.id) };
}
export const referenceKey = (ref: PersonReference) => `${ref.origin}:${ref.id}`;
export function contactSource(source: string): "CSV" | "MANUAL" | "ZCC" | "HP" | "UNKNOWN" {
  const values: Record<string, "CSV" | "MANUAL" | "ZCC" | "HP"> = {
    CSV: "CSV", CSV_IMPORT: "CSV", MANUAL: "MANUAL", UNIVERSITY_STAFF: "MANUAL", ADMIN_MANUAL: "MANUAL",
    ZCC: "ZCC", ZOOM_IMPORT: "ZCC", HP: "HP", STUDENT_PUBLIC: "HP", PUBLIC_FORM: "HP",
  };
  return values[source] ?? "UNKNOWN";
}
export type ContactDto = {
  reference: PersonReference; name: string; phone: string; studentNumber: string | null;
  source: ReturnType<typeof contactSource>; status: string;
  topics: string[]; requestedTopics: string[]; identityVerified: boolean; phoneVerified: boolean;
  version: number; district?: string | null; consentVersion?: string | null;
};

export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(sort) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, item]) => [k, sort(item)])) : v;
  return JSON.stringify(sort(value));
}
