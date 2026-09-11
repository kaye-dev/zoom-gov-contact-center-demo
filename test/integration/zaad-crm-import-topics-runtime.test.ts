import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { createDatabaseContext } from "../../lib/server/prisma";
import { previewCrmImport, applyCrmImport } from "../../lib/server/zaad/crm-imports";
import { OutreachContractError } from "../../lib/zaad/outreach-contracts";
import { registerStudent } from "../../lib/server/zaad/university/registrations";
import { CONSENT_VERSION } from "../../lib/zaad/university/contracts";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";

test("CSV topics persist for all rows while retaining pending review and retry safety", { timeout: 180000 }, async () => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl });
    const db = context.prisma;
    try {
      await db.user.create({ data: { id: "csv-topics-actor", name: "Test", email: "csv-topics@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      for (const siteKey of ["lg", "univ"] as const) {
        const scope: OutreachScope = { siteKey, actorId: "csv-topics-actor", all: true, live: false };
        const topics = siteKey === "lg" ? "elder-watch;procedure-support" : "scholarship;class-change";
        const header = siteKey === "lg" ? "name,phone,topicIds" : "name,phone,studentNumber,topicIds";
        const rows = Array.from({ length: 7 }, (_, i) => `CSV${i},0900000000${i + 1},${siteKey === "univ" ? `126000${i + 1},` : ""}${topics}`);
        const preview = await previewCrmImport(db, scope, { operationKey: `topics_preview_${siteKey}`, bytes: new TextEncoder().encode([header, ...rows].join("\r\n")) });
        assert.equal("departmentKey" in preview, false);
        assert.ok(preview.rows.every(row => row.status === "NEW"));
        const selection = { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: preview.rows.map(row => row.rowKey) };
        const applied = await applyCrmImport(db, scope, selection);
        assert.equal(applied.status, "COMPLETED");
        assert.equal(applied.rows.filter(row => row.status === "IMPORTED").length, 7);
        await applyCrmImport(db, scope, selection);
        if (siteKey === "lg") {
          const contacts = await db.municipalContact.findMany({ include: { preferences: true } });
          assert.equal(contacts.length, 7);
          assert.ok(contacts.every(row => row.status === "PENDING_REVIEW" && !row.identityVerified && !row.phoneVerified));
          assert.ok(contacts.every(row => row.preferences.length === 2 && row.preferences.every(pref => pref.requested && !pref.enabled)));
        } else {
          const contacts = await db.universityContact.findMany({ include: { preferences: true } });
          assert.equal(contacts.length, 7);
          assert.ok(contacts.every(row => row.registrationStatus === "PENDING_REVIEW" && !row.identityVerified && !row.phoneVerified));
          assert.ok(contacts.every(row => row.preferences.length === 2));
        }
        const invalid = await previewCrmImport(db, scope, { operationKey: `topics_invalid_${siteKey}`, bytes: new TextEncoder().encode([header, ...rows.slice(0, 5), rows[5].replace(topics, "invalid-topic")].join("\n")) });
        assert.equal(invalid.rows[5].status, "INVALID");
        // A caller cannot bypass an invalid hidden row by selecting another row.
        const fresh = await previewCrmImport(db, scope, { operationKey: `topics_fresh_${siteKey}`, bytes: new TextEncoder().encode([header, `Fresh,09000000099,${siteKey === "univ" ? "1260099," : ""}${topics}`, rows[5].replace(topics, "invalid-topic")].join("\n")) });
        await assert.rejects(applyCrmImport(db, scope, { jobId: fresh.id, previewDigest: fresh.previewDigest, rowKeys: [fresh.rows[0].rowKey] }), (error: unknown) => error instanceof OutreachContractError && error.code === "INVALID_IMPORT_ROWS");
        assert.equal(await db.outreachConsentEvidence.count(), 0);
      }
      await db.zaadRegistrationSetting.create({ data: { siteKey: "univ", publicRegistrationEnabled: false } });
      const registered = await registerStudent(db, "univ", { requestKey: "always_open_univ_registration", name: "公開登録確認", facultyCode: "1", admissionYear: new Date().getFullYear(), serial: "0098", phone: "09000000098", topicIds: ["scholarship"], consent: true, consentVersion: CONSENT_VERSION });
      assert.ok(registered.id);
      assert.equal((await db.zaadRegistrationSetting.findUniqueOrThrow({ where: { siteKey: "univ" } })).publicRegistrationEnabled, false);
    } finally { await context.close(); }
  });
});
