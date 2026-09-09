import assert from "node:assert/strict";
import test from "node:test";
import { parseCrmCsv } from "../lib/zaad/crm-csv";
import { crmCsvSample, crmCsvFilename, csvSafeCell } from "../lib/zaad/crm-csv-schema";
test("CSV-SAMPLE-ROUNDTRIP: BOM templates use the same strict schema and preserve zeros", () => {
  for (const tenant of ["lg", "univ"] as const) {
    const sample = crmCsvSample(tenant), rows = parseCrmCsv(new TextEncoder().encode(sample), tenant);
    assert.equal(sample.charCodeAt(0), 0xfeff);
    assert.equal(rows.length, 2); assert.ok(rows.every(row => row.status === "NEW"));
    assert.equal(rows[0].phone, "+819000000001");
    assert.equal(rows[0].studentNumber, tenant === "univ" ? "1260001" : undefined);
    assert.match(crmCsvFilename(tenant), /^outreach-(?:residents|students)-sample\.csv$/u);
    assert.ok(!("consent" in rows[0]));
  }
});
test("CSV-PREVIEW: quoted fields, blank lines, duplicates and invalid rows remain distinguishable", () => {
  const rows = parseCrmCsv(new TextEncoder().encode('name,phone,studentNumber\r\n"架空,学生",09000000001,1260001\r\n\r\n別名,09000000002,1260001\r\n不正,invalid,2260001\r\n'), "univ");
  assert.deepEqual(rows.map(row => row.status), ["NEW", "DUPLICATE", "INVALID"]);
  assert.equal(rows[0].name, "架空,学生");
  assert.equal(rows[2].name, "不正");
  assert.equal(rows[2].phone, "invalid");
  assert.equal(rows[2].studentNumber, "2260001");
  assert.equal(rows[2].errorField, "phone");
  assert.equal(csvSafeCell("=1+1"), '"\'=1+1"');
  assert.throws(() => parseCrmCsv(new Uint8Array([0xff]), "lg"));
});
test("CSV-INVALID-VALUES: missing and invalid fields retain raw values for correction without becoming importable", () => {
  const rows = parseCrmCsv(new TextEncoder().encode('name,phone,studentNumber\n,09000000001,1260001\n未入力,,2260001\n番号不正,09000000002,0000001\n'), "univ");
  assert.deepEqual(rows.map(row => [row.status, row.errorField]), [["INVALID", "name"], ["INVALID", "phone"], ["INVALID", "studentNumber"]]);
  assert.deepEqual(rows.map(row => row.studentNumber), ["1260001", "2260001", "0000001"]);
  assert.equal(rows[1].name, "未入力"); assert.equal(rows[1].phone, "");
});
