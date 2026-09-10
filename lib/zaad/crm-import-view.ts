import type { CrmCsvRow } from "./crm-csv";
export type CrmImportRow = Omit<CrmCsvRow, "status" | "topicIds"> & { status: string; topicIds?: string[] };
export type CrmImportResult = { id: string; departmentKey: string; previewDigest: string; status: string; expiresAt: string; rows: CrmImportRow[] };
export function crmImportSummary(preview: CrmImportResult, now: number) {
  const rows = preview.rows;
  const targets = rows.filter(row => ["NEW", "FAILED"].includes(row.status)).map(row => row.rowKey);
  const invalid = rows.some(row => row.status === "INVALID");
  const expired = preview.status === "EXPIRED" || Date.parse(preview.expiresAt) <= now;
  return {
    shown: rows.slice(0, 5), targets, invalid, expired,
    errors: rows.filter(row => ["INVALID", "FAILED"].includes(row.status)),
    imported: rows.filter(row => row.status === "IMPORTED").length,
    excluded: rows.filter(row => ["MATCH", "DUPLICATE"].includes(row.status)).length,
    canSubmit: !expired && !invalid && targets.length > 0,
  };
}
