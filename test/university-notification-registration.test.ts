import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  admissionYears,
  academicYear,
  parseRegistration,
  studentNumber,
  CONSENT_VERSION,
  OutreachError,
} from "../lib/zaad/university/contracts";
import { buildDictionary } from "../app/i18n/build-dictionary";
const now = new Date("2026-09-08T00:00:00Z");
const input = {
  name: " 大学 花子 ",
  facultyCode: "1",
  admissionYear: 2026,
  serial: "0001",
  phone: "090-0000-0000",
  topicIds: ["scholarship", "class-change"],
  consent: true,
  consentVersion: CONSENT_VERSION,
  requestKey: "registration-test-0001",
};
test("STUDENT-NUMBER: seven digits preserve leading zeros without a check digit", () => {
  const row = parseRegistration({ ...input, serial: " ０００１ " }, now);
  assert.equal(row.serial, "0001");
  assert.equal(row.name, "大学 花子");
  assert.equal(row.phone, "+819000000000");
  assert.equal(
    studentNumber(row.facultyCode, row.admissionYear, row.serial),
    "1260001",
  );
  for (const serial of [
    "1",
    "001",
    "00001",
    "+001",
    "-001",
    "1e03",
    "1.01",
    "abcd",
  ])
    assert.throws(
      () => parseRegistration({ ...input, serial }, now),
      OutreachError,
    );
});
test("ADMISSION-YEAR: four years roll at April 1 in Japan, not UTC January", () => {
  assert.equal(academicYear(new Date("2027-03-31T14:59:59.999Z")), 2026);
  assert.deepEqual(
    admissionYears(new Date("2027-03-31T14:59:59.999Z")),
    [2026, 2025, 2024, 2023],
  );
  assert.deepEqual(
    admissionYears(new Date("2027-03-31T15:00:00.000Z")),
    [2027, 2026, 2025, 2024],
  );
  assert.throws(
    () =>
      parseRegistration(
        { ...input, admissionYear: 2023 },
        new Date("2027-03-31T15:00:00Z"),
      ),
    OutreachError,
  );
  assert.throws(
    () => parseRegistration({ ...input, admissionYear: "2026" }, now),
    OutreachError,
  );
});
test("REGISTRATION-VALIDATION: identity, phone, explicit selected consent and source cannot be forged", () => {
  for (const change of [
    { name: "" },
    { name: "x".repeat(101) },
    { name: "a\nb" },
    { phone: "090" },
    { phone: "12345" },
    { topicIds: [] },
    { topicIds: ["admissions"] },
    { topicIds: ["staff"] },
    { topicIds: ["scholarship", "unknown"] },
    { consent: false },
    { consent: "true" },
    { consentVersion: "stale" },
    { facultyCode: "8" },
    { source: "UNIVERSITY_STAFF" },
    { siteKey: "lg" },
    { status: "ACTIVE" },
  ])
    assert.throws(
      () => parseRegistration({ ...input, ...change }, now),
      OutreachError,
    );
  assert.deepEqual(
    parseRegistration(
      { ...input, topicIds: ["scholarship", "scholarship"] },
      now,
    ).topicIds,
    ["scholarship"],
  );
});
test("REGISTRATION-I18N: all five locales contain complete public and staff copy", () => {
  const locales = ["ja", "en", "zh-Hans", "zh-Hant", "ko"] as const;
  const base = buildDictionary("univ", "ja").universityOutreach;
  for (const locale of locales) {
    const copy = buildDictionary("univ", locale).universityOutreach;
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(base).sort());
    assert.equal(copy.faculties.length, 7);
    assert.equal(copy.topicLabels.length, 5);
    assert.deepEqual(
      Object.keys(copy.admin).sort(),
      Object.keys(base.admin).sort(),
    );
    for (const value of Object.values(copy.admin)) assert.ok(value.trim());
    assert.equal(
      buildDictionary("lg", locale).admin.zaad.title,
      locale === "ja" ? "オートリーチ" : "AutoReach",
    );
  }
});
test("REGISTRATION-ENTRY/RECOVERY: tenant-isolated route and persistent, accessible input flow", () => {
  const route = readFileSync("app/notifications/register/page.tsx", "utf8");
  assert.match(route, /const tenant = await getRequestTenant\(\)/);
  assert.match(route, /if \(tenant\.key === "lg"\)/);
  assert.match(route, /<MunicipalNotificationRegistration/);
  assert.match(route, /<UniversityPortal page="registration">/);
  const ui = readFileSync(
    "app/notifications/register/StudentNotificationRegistration.tsx",
    "utf8",
  );
  assert.match(ui, /\/api\/university-notification-registrations/);
  assert.doesNotMatch(ui, /localStorage/);
  assert.match(ui, /aria-invalid/);
  assert.match(ui, /registration-errors/);
  assert.match(ui, /sending\.current/);
  const portal = readFileSync("app/tenants/univ/UniversityPortal.tsx", "utf8");
  assert.match(portal, /NotificationEntry/);
  assert.match(portal, /NotificationRegistrationLink/);
  assert.match(
    portal,
    /href="\/notifications\/register" className="font-bold text-accent/,
  );
});
