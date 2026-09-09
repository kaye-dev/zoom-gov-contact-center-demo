import { readFileSync } from "node:fs";
import { CONSENT_VERSION } from "../lib/zaad/university/contracts";
import { createDatabaseContext } from "../lib/server/prisma";

// These are display fixtures, not evidence of registration or consent collection.
async function main() {
  const expectedRuntime = process.argv[2];
  const manifest = readFileSync(".codex/runtime.local.env", "utf8");
  if (!expectedRuntime || !/^[a-f0-9]{12}$/.test(expectedRuntime) ||
      !new RegExp(`^RUNTIME_ID=${expectedRuntime}$`, "m").test(manifest) ||
      !/^RUNTIME_MODE=worktree$/m.test(manifest) || process.env.NODE_ENV === "production")
    throw new Error("Expected the explicitly selected isolated worktree runtime");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.hostname !== "db" || url.pathname !== "/zoom_demo")
    throw new Error("Fixtures require the isolated Compose database");
  const registrationFixture = {
    id: "outreach-fixture-univ-B", siteKey: "univ", requestKey: "outreach-display-fixture-B",
    requestDigest: "outreach-display-fixture-not-a-public-submission", name: "学生デモ B",
    facultyCode: "2", admissionYear: 2026, serial: "0002", phone: "+819000000002",
    topicIds: ["scholarship"], source: "STUDENT_PUBLIC", status: "PENDING_REVIEW",
    consentVersion: CONSENT_VERSION, consentedAt: new Date("2026-09-08T00:00:00.000Z"),
    note: "隔離環境の申請確認用データ。実在する人物や同意を表すデータではありません",
  };
  const context = createDatabaseContext();
  try {
    await context.prisma.$transaction(async db => {
      if (process.argv[3] === "--replace-display-registration") {
        const existing = await db.universityContact.findUnique({ where: { id: registrationFixture.id }, include: { preferences: true, registrations: true, representedGroups: true, groupMemberships: true } });
        if (!existing || existing.siteKey !== "univ" || existing.name !== registrationFixture.name ||
            existing.phone !== registrationFixture.phone || existing.registrationStatus !== "PENDING_REVIEW" ||
            existing.selectionReason !== "隔離環境の表示確認用データ" || existing.version !== 1 ||
            existing.preferences.length || existing.registrations.length || existing.representedGroups.length || existing.groupMemberships.length ||
            await db.universityStudentRegistration.findUnique({ where: { id: registrationFixture.id } }))
          throw new Error("Only the unchanged owned display fixture B may be replaced");
        await db.universityContact.delete({ where: { id: existing.id, version: 1 } });
        await db.universityStudentRegistration.create({ data: registrationFixture });
        return;
      }
      if (process.argv[3]) throw new Error("Unknown fixture operation");
      if (await db.universityContact.count() || await db.municipalContact.count() || await db.universityStudentRegistration.count())
        throw new Error("Contact fixtures require an empty contact database; existing data is never overwritten");
      const observed = new Date("2026-09-08T00:00:00.000Z");
      for (let index = 0; index < 4; index++) {
        const suffix = String.fromCharCode(65 + index), active = index === 0 || index === 3;
        const status = active ? "ACTIVE" : index === 1 ? "PENDING_REVIEW" : "WITHDRAWN";
        const source = ["MANUAL", "HP", "ZCC", "CSV"][index];
        const phone = index === 3 ? "+819000000001" : `+81900000000${index + 1}`;
        if (index === 1) await db.universityStudentRegistration.create({ data: registrationFixture });
        else await db.universityContact.create({ data: {
          id: `outreach-fixture-univ-${suffix}`, siteKey: "univ", departmentKey: "student-affairs",
          name: `学生デモ ${suffix}`, phone, facultyCode: String(index + 1), admissionYear: 2026,
          serial: `000${index + 1}`, displayStudentNumber: `${index + 1}26000${index + 1}`,
          registrationSource: source, registrationStatus: status, identityVerified: active,
          phoneVerified: active, phoneEligible: active, selectionReason: "隔離環境の表示確認用データ",
          preferences: { create: (active ? ["scholarship", ...(index === 0 ? ["class-change"] : [])] : []).map(topicId => ({
            topicId, enabled: true, sourceRequestId: "outreach-display-fixture",
            confirmedBy: "outreach-display-fixture", confirmedAt: observed,
          })) },
        } });
        await db.municipalContact.create({ data: {
          id: `outreach-fixture-lg-${suffix}`, siteKey: "lg", departmentKey: "resident-support",
          name: `市民デモ ${suffix}`, phone, district: "central", source, status,
          identityVerified: active, phoneVerified: active,
          ...(active ? { confirmedBy: "outreach-display-fixture", confirmedAt: observed,
            confirmationMethod: "隔離環境の表示確認", attestation: "実在する人物や同意を表すデータではありません" } : {}),
          preferences: { create: { topic: "elder-watch", requested: index !== 2,
            enabled: active, ...(active ? { confirmedBy: "outreach-display-fixture", confirmedAt: observed } : {}) } },
        } });
      }
    });
    console.log(JSON.stringify({ runtimeId: expectedRuntime, displayFixture: true, publicSubmissionEvidence: false, counts: { univContacts: 3, univRegistrations: 1, lg: 4 }, externalWrites: 0 }));
  } finally { await context.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Fixture seed failed"); process.exitCode = 1; });
