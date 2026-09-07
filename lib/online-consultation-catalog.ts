import type { TenantKey } from "./tenants";
export const UNIVERSITY_CONSULTATION_SERVICES = [
  "admissions",
  "student-support",
  "careers",
] as const;
export type UniversityConsultationService =
  (typeof UNIVERSITY_CONSULTATION_SERVICES)[number];
export type ConsultationService = UniversityConsultationService | "general";
export const ONLINE_CONSULTATION_CATALOG: Record<
  TenantKey,
  readonly ConsultationService[]
> = {
  lg: ["general"],
  univ: UNIVERSITY_CONSULTATION_SERVICES,
};
export function consultationServices(tenantKey: TenantKey) {
  return ONLINE_CONSULTATION_CATALOG[tenantKey];
}
