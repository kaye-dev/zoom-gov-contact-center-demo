import { parse } from "csv-parse/sync";

import {
  parseDisasterRadioResident,
  type ParsedDisasterRadioResident,
} from "@/lib/disaster-radio-subscriptions/validation";

export const ZAAD_CSV_MAX_BYTES = 1024 * 1024;
export const ZAAD_CSV_MAX_ROWS = 1_000;
export const ZAAD_CSV_HEADERS = ["name", "email", "phone", "consent_status"] as const;

export type ZaadCsvError = {
  row: number;
  field: string;
  code: string;
};

export type ZaadCsvParseResult =
  | {
      ok: true;
      rows: ParsedDisasterRadioResident[];
      totalRows: number;
      duplicateRows: number;
    }
  | { ok: false; errors: ZaadCsvError[] };

export function parseZaadResidentCsv(bytes: Uint8Array): ZaadCsvParseResult {
  if (bytes.byteLength === 0) return failure(1, "file", "EMPTY");
  if (bytes.byteLength > ZAAD_CSV_MAX_BYTES) return failure(1, "file", "TOO_LARGE");

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return failure(1, "file", "INVALID_UTF8");
  }

  let records: string[][];
  try {
    records = parse(source, {
      bom: true,
      columns: false,
      delimiter: ",",
      quote: '"',
      escape: '"',
      relax_column_count: false,
      skip_empty_lines: false,
      max_record_size: 2_048,
    }) as string[][];
  } catch {
    return failure(1, "file", "INVALID_STRUCTURE");
  }

  if (records.length === 0) return failure(1, "file", "EMPTY");
  if (!sameHeaders(records[0])) return failure(1, "header", "INVALID_HEADER");
  const dataRows = records.slice(1);
  if (dataRows.length === 0) return failure(2, "file", "EMPTY");
  if (dataRows.length > ZAAD_CSV_MAX_ROWS) return failure(ZAAD_CSV_MAX_ROWS + 2, "file", "TOO_MANY_ROWS");

  const errors: ZaadCsvError[] = [];
  const uniqueRows: ParsedDisasterRadioResident[] = [];
  const seen = new Set<string>();
  let duplicateRows = 0;

  for (let index = 0; index < dataRows.length; index += 1) {
    const rowNumber = index + 2;
    const row = dataRows[index];
    if (row.length !== ZAAD_CSV_HEADERS.length || row.every((entry) => entry.trim() === "")) {
      pushError(errors, { row: rowNumber, field: "row", code: "INVALID_STRUCTURE" });
      continue;
    }
    const parsed = parseDisasterRadioResident({
      name: row[0],
      email: row[1],
      phone: row[2],
      consentStatus: row[3],
    });
    if (!parsed.ok) {
      for (const error of parsed.errors) {
        pushError(errors, { row: rowNumber, field: error.field, code: error.code });
      }
      continue;
    }
    const identity = `${parsed.value.normalizedEmail}\u0000${parsed.value.normalizedPhone}`;
    if (seen.has(identity)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(identity);
    uniqueRows.push(parsed.value);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows: uniqueRows, totalRows: dataRows.length, duplicateRows };
}

function sameHeaders(value: string[] | undefined) {
  return Boolean(value && value.length === ZAAD_CSV_HEADERS.length && value.every((header, index) => header === ZAAD_CSV_HEADERS[index]));
}

function pushError(errors: ZaadCsvError[], error: ZaadCsvError) {
  if (errors.length < 20) errors.push(error);
}

function failure(row: number, field: string, code: string): ZaadCsvParseResult {
  return { ok: false, errors: [{ row, field, code }] };
}
