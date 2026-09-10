import { parse } from "csv-parse/sync";
import type { TenantKey } from "@/lib/tenants";
import { CRM_CSV_MAX_BYTES, CRM_CSV_MAX_ROWS, crmCsvHeaders } from "./crm-csv-schema";
import { MUNICIPAL_TOPICS } from "./municipal/contracts";
import { TOPICS } from "./university/contracts";
import { OutreachContractError, phoneValue, stringValue } from "./outreach-contracts";
export type CrmCsvRow = { rowNumber: number; rowKey: string; status: "NEW" | "DUPLICATE" | "INVALID" | "MATCH"; errorCode?: string; errorField?: "name" | "phone" | "studentNumber" | "topicIds"; topicIds: string[]; rawTopicIds?: string; name?: string; phone?: string; studentNumber?: string };
export function parseCrmCsv(bytes: Uint8Array, tenant: TenantKey): CrmCsvRow[] {
  if (!bytes.length || bytes.length > CRM_CSV_MAX_BYTES) throw new OutreachContractError("INVALID_CSV_SIZE", 413);
  let records: string[][];
  try { records = parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { bom: true, columns: false, skip_empty_lines: true, relax_column_count: false, max_record_size: 2048 }) as string[][]; }
  catch { throw new OutreachContractError("INVALID_CSV_STRUCTURE"); }
  const headers = records.shift() ?? [], expected = crmCsvHeaders(tenant);
  if (![JSON.stringify(expected), JSON.stringify(expected.slice(0, -1))].includes(JSON.stringify(headers))) throw new OutreachContractError("INVALID_CSV_HEADER");
  const topicIndex = headers.indexOf("topicIds");
  if (!records.length || records.length > CRM_CSV_MAX_ROWS) throw new OutreachContractError("INVALID_CSV_ROW_COUNT");
  const seen = new Set<string>();
  return records.map((row, index) => {
    const rawTopicIds = topicIndex < 0 ? "" : row[topicIndex];
    const base = { rowNumber: index + 2, rowKey: `row-${index + 2}`, topicIds: [] as string[] };
    let errorField: NonNullable<CrmCsvRow["errorField"]> = "name";
    try {
      const name = stringValue(row[0], 100);
      errorField = "phone";
      const phone = phoneValue(row[1]);
      errorField = "studentNumber";
      const studentNumber = tenant === "univ" ? row[2].normalize("NFKC").trim() : undefined;
      if (studentNumber !== undefined && !/^[1-7][0-9]{6}$/u.test(studentNumber)) throw new OutreachContractError("INVALID_STUDENT_NUMBER");
      errorField = "topicIds";
      const topicIds = parseCrmTopicIds(rawTopicIds, tenant);
      const key = studentNumber ?? `${name}\u0000${phone}`;
      const duplicate = seen.has(key); seen.add(key);
      return { ...base, name, phone, studentNumber, topicIds, status: duplicate ? "DUPLICATE" : "NEW" };
    } catch (error) { return { ...base, name: row[0], phone: row[1], ...(tenant === "univ" ? { studentNumber: row[2] } : {}), status: "INVALID", rawTopicIds, errorField, errorCode: error instanceof OutreachContractError ? error.code : "INVALID_REQUEST" }; }
  });
}


export function parseCrmTopicIds(raw: string, tenant: TenantKey): string[] {
  if (!raw.trim()) return [];
  const allowed: readonly string[] = tenant === "lg" ? MUNICIPAL_TOPICS : TOPICS;
  const values = raw.split(";").map(value => value.trim());
  if (values.some(value => !allowed.includes(value))) throw new OutreachContractError("INVALID_TOPIC_IDS");
  return [...new Set(values)];
}
