import { parse } from "csv-parse/sync";
import type { TenantKey } from "@/lib/tenants";
import { CRM_CSV_MAX_BYTES, CRM_CSV_MAX_ROWS, crmCsvHeaders } from "./crm-csv-schema";
import { OutreachContractError, phoneValue, stringValue } from "./outreach-contracts";
export type CrmCsvRow = { rowNumber: number; rowKey: string; status: "NEW" | "DUPLICATE" | "INVALID" | "MATCH"; errorCode?: string; errorField?: "name" | "phone" | "studentNumber"; name?: string; phone?: string; studentNumber?: string };
export function parseCrmCsv(bytes: Uint8Array, tenant: TenantKey): CrmCsvRow[] {
  if (!bytes.length || bytes.length > CRM_CSV_MAX_BYTES) throw new OutreachContractError("INVALID_CSV_SIZE", 413);
  let records: string[][];
  try { records = parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { bom: true, columns: false, skip_empty_lines: true, relax_column_count: false, max_record_size: 2048 }) as string[][]; }
  catch { throw new OutreachContractError("INVALID_CSV_STRUCTURE"); }
  if (JSON.stringify(records.shift()) !== JSON.stringify(crmCsvHeaders(tenant))) throw new OutreachContractError("INVALID_CSV_HEADER");
  if (!records.length || records.length > CRM_CSV_MAX_ROWS) throw new OutreachContractError("INVALID_CSV_ROW_COUNT");
  const seen = new Set<string>();
  return records.map((row, index) => {
    const base = { rowNumber: index + 2, rowKey: `row-${index + 2}` };
    let errorField: "name" | "phone" | "studentNumber" = "name";
    try {
      const name = stringValue(row[0], 100);
      errorField = "phone";
      const phone = phoneValue(row[1]);
      errorField = "studentNumber";
      const studentNumber = tenant === "univ" ? row[2].normalize("NFKC").trim() : undefined;
      if (studentNumber !== undefined && !/^[1-7][0-9]{6}$/u.test(studentNumber)) throw new OutreachContractError("INVALID_STUDENT_NUMBER");
      const key = studentNumber ?? `${name}\u0000${phone}`;
      const duplicate = seen.has(key); seen.add(key);
      return { ...base, name, phone, studentNumber, status: duplicate ? "DUPLICATE" : "NEW" };
    } catch (error) { return { ...base, name: row[0], phone: row[1], ...(tenant === "univ" ? { studentNumber: row[2] } : {}), status: "INVALID", errorField, errorCode: error instanceof OutreachContractError ? error.code : "INVALID_REQUEST" }; }
  });
}
