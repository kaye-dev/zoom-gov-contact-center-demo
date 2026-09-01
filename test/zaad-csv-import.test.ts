import assert from "node:assert/strict";
import test from "node:test";

import {
  parseZaadResidentCsv,
  ZAAD_CSV_HEADERS,
  ZAAD_CSV_MAX_BYTES,
  ZAAD_CSV_MAX_ROWS,
} from "../lib/zaad/csv-import";

const encoder = new TextEncoder();

test("ZAAD CSV accepts UTF-8 BOM, quoted values, and both consent states", () => {
  const csv = [
    `\uFEFF${ZAAD_CSV_HEADERS.join(",")}`,
    '"山田, 花子",HANAKO.YAMADA@example.jp,090-1234-5678,CONSENTED',
    "佐藤 健,ken.sato@example.jp,+819012345679,NOT_CONSENTED",
  ].join("\n");

  const parsed = parseZaadResidentCsv(encoder.encode(csv));

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.totalRows, 2);
  assert.equal(parsed.duplicateRows, 0);
  assert.deepEqual(parsed.rows, [
    {
      name: "山田, 花子",
      normalizedEmail: "hanako.yamada@example.jp",
      normalizedPhone: "+819012345678",
      consentStatus: "CONSENTED",
    },
    {
      name: "佐藤 健",
      normalizedEmail: "ken.sato@example.jp",
      normalizedPhone: "+819012345679",
      consentStatus: "NOT_CONSENTED",
    },
  ]);
});

test("ZAAD CSV deduplicates normalized identity within one atomic import", () => {
  const csv = [
    ZAAD_CSV_HEADERS.join(","),
    "鈴木 美咲,MISAKI.SUZUKI@example.jp,090-2345-6789,CONSENTED",
    "鈴木 美咲,misaki.suzuki@example.jp,+819023456789,CONSENTED",
  ].join("\n");

  const parsed = parseZaadResidentCsv(encoder.encode(csv));

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.totalRows, 2);
  assert.equal(parsed.duplicateRows, 1);
  assert.equal(parsed.rows.length, 1);
});

test("ZAAD CSV rejects the whole payload when any row is invalid", () => {
  const csv = [
    ZAAD_CSV_HEADERS.join(","),
    "正常 太郎,taro@example.jp,090-1111-2222,CONSENTED",
    "不正 花子,not-an-email,090-1111-3333,UNKNOWN",
  ].join("\n");

  const parsed = parseZaadResidentCsv(encoder.encode(csv));

  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(parsed.errors, [
    { row: 3, field: "email", code: "INVALID_FORMAT" },
    { row: 3, field: "consentStatus", code: "INVALID_VALUE" },
  ]);
  assert.equal("rows" in parsed, false);
});

test("ZAAD CSV enforces the exact header, UTF-8, size, and row limits", () => {
  assert.deepEqual(
    parseZaadResidentCsv(encoder.encode("email,name,phone,consent_status\na@example.jp,氏名,09012345678,CONSENTED")),
    { ok: false, errors: [{ row: 1, field: "header", code: "INVALID_HEADER" }] },
  );
  assert.deepEqual(
    parseZaadResidentCsv(Uint8Array.from([0xff, 0xfe, 0xfd])),
    { ok: false, errors: [{ row: 1, field: "file", code: "INVALID_UTF8" }] },
  );
  assert.deepEqual(
    parseZaadResidentCsv(new Uint8Array(ZAAD_CSV_MAX_BYTES + 1)),
    { ok: false, errors: [{ row: 1, field: "file", code: "TOO_LARGE" }] },
  );

  const rows = Array.from(
    { length: ZAAD_CSV_MAX_ROWS + 1 },
    (_, index) => `住民${index},resident${index}@example.jp,090${String(index).padStart(8, "0")},CONSENTED`,
  );
  const tooMany = parseZaadResidentCsv(
    encoder.encode([ZAAD_CSV_HEADERS.join(","), ...rows].join("\n")),
  );
  assert.deepEqual(tooMany, {
    ok: false,
    errors: [{ row: ZAAD_CSV_MAX_ROWS + 2, field: "file", code: "TOO_MANY_ROWS" }],
  });
});

test("ZAAD CSV returns at most twenty stable row errors", () => {
  const invalidRows = Array.from(
    { length: 25 },
    () => ",invalid,invalid,UNKNOWN",
  );
  const parsed = parseZaadResidentCsv(
    encoder.encode([ZAAD_CSV_HEADERS.join(","), ...invalidRows].join("\n")),
  );

  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.errors.length, 20);
  assert.deepEqual(parsed.errors[0], { row: 2, field: "name", code: "REQUIRED" });
  assert.ok(parsed.errors.every(({ row }) => row >= 2));
});
