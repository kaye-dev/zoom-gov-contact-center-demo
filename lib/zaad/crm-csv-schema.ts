import type { TenantKey } from "@/lib/tenants";
export const CRM_CSV_MAX_BYTES = 1024 * 1024;
export const CRM_CSV_MAX_ROWS = 1000;
export const crmCsvHeaders = (tenant: TenantKey) => tenant === "univ" ? ["name", "phone", "studentNumber"] : ["name", "phone"];
export const crmCsvFilename = (tenant: TenantKey) => tenant === "univ" ? "outreach-students-sample.csv" : "outreach-residents-sample.csv";
export function crmCsvSample(tenant: TenantKey) {
  const rows = tenant === "univ" ? [["サンプル学生一", "09000000001", "1260001"], ["サンプル学生二", "09000000002", "2260002"]]
    : [["サンプル住民一", "09000000001"], ["サンプル住民二", "09000000002"]];
  return "\ufeff" + [crmCsvHeaders(tenant), ...rows].map(row => row.join(",")).join("\r\n") + "\r\n";
}
export function csvSafeCell(value: string) {
  const safe = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
