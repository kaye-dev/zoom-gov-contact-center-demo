import { previewResourceBinding, saveResourceBinding } from "../../lib/server/zaad/resource-bindings";
import { bindCampaigns, getRegularCampaign, pauseRegularCampaign, type CampaignReader } from "../../lib/server/zaad/campaign-bindings";
import type { ZaadZoomClient } from "../../lib/server/zaad/zoom-client";
import { previewZoomCrmImport, applyZoomCrmImport } from "../../lib/server/zaad/zoom-crm-imports";
import { CONSENT_VERSION } from "../../lib/zaad/university/contracts";
import { linkZoomMember, zoomGroupMembers, saveZoomMember, deleteZoomMember, type GroupClient } from "../../lib/server/zaad/zoom-groups";
import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { createDatabaseContext } from "../../lib/server/prisma";
import { registerMunicipalContact } from "../../lib/server/zaad/municipal/registrations";
import { MUNICIPAL_CONSENT_VERSION } from "../../lib/zaad/municipal/contracts";
import { getContact, listContacts, updateContact } from "../../lib/server/zaad/contacts";
import { saveOutreachMessage, getOutreachMessage, listOutreachMessages, retireOutreachMessage, requireMessageAudio } from "../../lib/server/zaad/message-revisions";
import { preflightDispatch, prepareDispatch, inspectDispatchConfirmation, executeDispatch } from "../../lib/server/zaad/dispatches";
import { digest } from "../../lib/server/zaad/outreach-data";
import { previewCrmImport, applyCrmImport } from "../../lib/server/zaad/crm-imports";
import { OutreachContractError } from "../../lib/zaad/outreach-contracts";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";
const scope: OutreachScope = { siteKey: "lg", actorId: "outreach-test-actor", all: true, departments: ["resident-support", "welfare"], live: false };
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (error: unknown) => error instanceof OutreachContractError && error.code === code);
test("outreach persists scoped registration, consent, immutable messages and snapshots", { timeout: 180000 }, async t => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl });
    const db = context.prisma, oldFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("External calls forbidden in this test"); };
    try {
      await db.user.create({ data: { id: scope.actorId, name: "Test actor", email: "outreach-test@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      const payload = { operationKey: "registration_one", name: "テスト住民", phone: "09000000001", district: "central", topics: ["elder-watch"], availability: { weekdays: [1, 3], windows: [{ start: "09:00", end: "12:00" }] }, consent: true, consentVersion: MUNICIPAL_CONSENT_VERSION };
      const registered = await registerMunicipalContact(db, "lg", payload);
      await t.test("public retries are idempotent and never promote consent", async () => {
        assert.equal((await registerMunicipalContact(db, "lg", payload)).id, registered.id);
        await rejects(registerMunicipalContact(db, "lg", { ...payload, name: "異なる内容" }), "OPERATION_CONFLICT");
        await rejects(registerMunicipalContact(db, "univ", payload), "NOT_FOUND");
        const contact = await getContact(db, scope, "MUNICIPAL_CONTACT", registered.contactId);
        assert.equal(contact.status, "PENDING_REVIEW"); assert.deepEqual(contact.topics, []);
        assert.equal(contact.source, "HP"); assert.equal(await db.zoomContactMembership.count(), 0);
        assert.equal((await listContacts(db, scope)).total, 1);
      });
      const input = { version: 1, name: payload.name, phone: payload.phone, district: "central", status: "ACTIVE", topics: ["elder-watch"], identityVerified: true, phoneVerified: true, attestation: "本人と電話番号・通知希望を確認", confirmationMethod: "対面確認", confirmedAt: new Date().toISOString() };
      await t.test("review requires evidence and validates scope", async () => {
        await rejects(updateContact(db, scope, "MUNICIPAL_CONTACT", registered.contactId, { ...input, topics: ["fraud-alert"] }), "CONSENT_EVIDENCE_REQUIRED");
        const active = await updateContact(db, scope, "MUNICIPAL_CONTACT", registered.contactId, input);
        assert.equal(active.status, "ACTIVE"); assert.deepEqual(active.topics, ["elder-watch"]);
        await rejects(getContact(db, { ...scope, siteKey: "univ", departments: ["student-affairs"] }, "MUNICIPAL_CONTACT", registered.contactId), "NOT_FOUND");
        await rejects(updateContact(db, scope, "MUNICIPAL_CONTACT", registered.contactId, input), "VERSION_CONFLICT");
      });
      const messageInput = { departmentKey: "resident-support", name: "確認案内", body: "ご登録いただいた電話連絡です。", voiceId: "Takumi", languageCode: "ja-JP" };
      const message = await saveOutreachMessage(db, scope, messageInput), firstRevision = message.revisions[0];
      await t.test("message list reports persisted generation state and preserves legacy uncertainty", async () => {
        assert.equal((await listOutreachMessages(db, scope)).items.find(row => row.id === message.id)?.generationState, "NOT_GENERATED");
        await db.messageRevision.update({ where: { id: firstRevision.id }, data: { generationState: "UNKNOWN", zoomAssetId: "test-unverified-asset" } });
        const unknown = (await listOutreachMessages(db, scope)).items.find(row => row.id === message.id);
        assert.equal(unknown?.generationState, "UNKNOWN"); assert.equal(unknown?.zoomAssetId, "test-unverified-asset");
        await db.messageRevision.update({ where: { id: firstRevision.id }, data: { generationState: "NOT_GENERATED", zoomAssetId: null } });
        const legacy = await db.zaadOutboundMessage.create({ data: { siteKey: "lg", departmentKey: "resident-support", name: "Legacy audio", body: "Legacy", voiceId: "Takumi", languageCode: "ja-JP", zoomAssetId: "test-legacy-asset" } });
        assert.equal((await listOutreachMessages(db, scope)).items.find(row => row.id === legacy.id)?.generationState, "LEGACY_UNVERIFIED");
        await db.zaadOutboundMessage.delete({ where: { id: legacy.id } });
      });
      const confirmation = await preflightDispatch(db, scope, { operationKey: "dispatch_000001", name: "見守り確認", departmentKey: "resident-support", connectionMode: "MEDIA", messageRevisionId: firstRevision.id, body: messageInput.body, voiceId: messageInput.voiceId, languageCode: "ja-JP", targetMode: "PEOPLE", people: [{ siteKey: "lg", kind: "resident", origin: "MUNICIPAL_CONTACT", id: registered.contactId }], groupIds: [], topic: "elder-watch" });
      await t.test("new message revisions never rewrite a dispatch snapshot", async () => {
        assert.equal((await listOutreachMessages(db, scope)).items.find(row => row.id === message.id)?.inUse, true);
        const snapshotBefore = JSON.stringify((await db.zaadOneTimeDispatch.findUniqueOrThrow({ where: { id: confirmation.id } })).snapshot);
        assert.equal((JSON.parse(snapshotBefore) as { targets: { name: string }[] }).targets[0].name, payload.name);
        await db.municipalContact.update({ where: { id: registered.contactId }, data: { name: "変更後の氏名" } });
        assert.equal(JSON.stringify((await db.zaadOneTimeDispatch.findUniqueOrThrow({ where: { id: confirmation.id } })).snapshot), snapshotBefore);
        await db.municipalContact.update({ where: { id: registered.contactId }, data: { name: payload.name } });
        const edited = await saveOutreachMessage(db, scope, { ...messageInput, body: "新しい案内です。", version: message.version }, message.id);
        assert.equal(edited.revisions.length, 2); assert.equal(edited.revisions.find(row => row.id === firstRevision.id)?.body, messageInput.body);
        assert.equal(JSON.stringify((await db.zaadOneTimeDispatch.findUniqueOrThrow({ where: { id: confirmation.id } })).snapshot), snapshotBefore);
        await rejects(retireOutreachMessage(db, scope, message.id, edited.version, true), "MESSAGE_IN_USE");
        await rejects(requireMessageAudio(db, scope, message.id, 1), "AUDIO_CONTRACT_NOT_VERIFIED");
        await rejects(executeDispatch(db, scope, confirmation.id, { id: confirmation.id, version: confirmation.version, snapshotDigest: confirmation.snapshotDigest, operationKey: "dispatch_000001" }), "LIVE_DISABLED");
        assert.equal((await getOutreachMessage(db, scope, message.id)).version, 2);
      });
      await t.test("preparation rechecks current contact and consent without rewriting history", async () => {
        const request = { id: confirmation.id, version: confirmation.version, snapshotDigest: confirmation.snapshotDigest, operationKey: "dispatch_000001" };
        const before = await db.municipalContact.findUniqueOrThrow({ where: { id: registered.contactId } });
        const stored = await db.zaadOneTimeDispatch.findUniqueOrThrow({ where: { id: confirmation.id } });
        await rejects(prepareDispatch(db, scope, request), "AUDIO_CONTRACT_NOT_VERIFIED");
        assert.equal((await inspectDispatchConfirmation(db, scope, confirmation.id)).confirmationStatus, "CURRENT");
        for (const change of [{ status: "WITHDRAWN" as const }, { phoneVerified: false }, { version: before.version + 1 }, { name: "変更された氏名" }]) {
          await db.municipalContact.update({ where: { id: before.id }, data: change });
          await rejects(prepareDispatch(db, scope, request), "TARGET_CHANGED");
          assert.equal((await inspectDispatchConfirmation(db, scope, confirmation.id)).confirmationStatus, "TARGET_CHANGED");
          await db.municipalContact.update({ where: { id: before.id }, data: { status: before.status, phoneVerified: before.phoneVerified, version: before.version, name: before.name } });
        }
        await rejects(prepareDispatch(db, { ...scope, all: false, departments: ["welfare"] }, request), "NOT_FOUND");
        await db.zaadOneTimeDispatch.update({ where: { id: confirmation.id }, data: { appState: "EXECUTION_REQUESTED" } });
        await rejects(prepareDispatch(db, scope, request), "DISPATCH_NOT_REPEATABLE");
        assert.equal((await inspectDispatchConfirmation(db, scope, confirmation.id)).confirmationStatus, "ALREADY_REQUESTED");
        await db.zaadOneTimeDispatch.update({ where: { id: confirmation.id }, data: { appState: "VALIDATING" } });
        await db.zaadOneTimeDispatch.update({ where: { id: confirmation.id }, data: { expiresAt: new Date(0) } });
        assert.equal((await inspectDispatchConfirmation(db, scope, confirmation.id)).confirmationStatus, "EXPIRED");
        await db.zaadOneTimeDispatch.update({ where: { id: confirmation.id }, data: { expiresAt: stored.expiresAt } });
        assert.deepEqual((await db.zaadOneTimeDispatch.findUniqueOrThrow({ where: { id: confirmation.id } })).snapshot, stored.snapshot);
      });
      await t.test("preparation rechecks live membership while ignoring observation time", async () => {
        const binding = await db.zoomResourceBinding.create({ data: { ownerSiteKey: "lg", accountId: "recheck-account", resourceType: "CONTACT_LIST", zoomId: "recheck-list", departmentKey: "resident-support", purpose: "REGULAR" } });
        const member = { id: "recheck-member", displayName: payload.name, phones: [{ type: "main", number: "+819000000001" }], emails: [] };
        let members = [member];
        const reader = { accountId: "recheck-account", async getContactList() { return { id: "recheck-list", name: "Recheck group", revision: "r1" }; }, async listContacts() { return structuredClone(members); } } as unknown as GroupClient;
        const mapping = await db.zoomContactMembership.create({ data: { siteKey: "lg", bindingId: binding.id, zoomContactId: member.id, personOrigin: "MUNICIPAL_CONTACT", personId: registered.contactId, observedDigest: digest(member), syncState: "LINKED" } });
        const result = await preflightDispatch(db, scope, { operationKey: "recheck_group_001", name: "所属確認", departmentKey: "resident-support", connectionMode: "MEDIA", body: messageInput.body, voiceId: "Takumi", languageCode: "ja-JP", targetMode: "GROUPS", groupIds: ["recheck-list"], topic: "elder-watch" }, reader);
        assert.equal((result.snapshot as { recipientCount: number }).recipientCount, 1);
        const request = { id: result.id, version: result.version, snapshotDigest: result.snapshotDigest, operationKey: "recheck_group_001" };
        await rejects(prepareDispatch(db, scope, request, reader), "AUDIO_CONTRACT_NOT_VERIFIED");
        const unavailable = { ...reader, async listContacts() { throw new Error("Provider unavailable"); } };
        assert.equal((await inspectDispatchConfirmation(db, scope, result.id, unavailable)).confirmationStatus, "UNAVAILABLE");
        await rejects(prepareDispatch(db, scope, request, unavailable), "SERVICE_UNAVAILABLE");
        await rejects(preflightDispatch(db, scope, { ...(await db.zaadOneTimeDispatch.findUniqueOrThrow({ where: { id: result.id } })).draft as object, operationKey: "unavailable_group_001" }, unavailable), "SERVICE_UNAVAILABLE");
        assert.equal(await db.zaadOneTimeDispatch.count({ where: { operationKey: "unavailable_group_001" } }), 0);
        assert.equal((await inspectDispatchConfirmation(db, scope, result.id, reader)).confirmationStatus, "CURRENT");
        members = [];
        await rejects(prepareDispatch(db, scope, request, reader), "TARGET_CHANGED");
        members = [member];
        await db.zoomContactMembership.update({ where: { id: mapping.id }, data: { version: { increment: 1 } } });
        await rejects(prepareDispatch(db, scope, request, reader), "TARGET_CHANGED");
        assert.deepEqual((await db.zaadOneTimeDispatch.findUniqueOrThrow({ where: { id: result.id } })).snapshot, result.snapshot);
      });
      await t.test("zero eligible preview explains exclusions and legacy consent stays disaster-only", async () => {
        const legacy = await db.disasterRadioSubscription.create({ data: { siteKey: "lg", name: "旧防災登録", normalizedEmail: "legacy@example.invalid", normalizedPhone: "+819000000099", consentStatus: "CONSENTED", consentVersion: "legacy-v1", consentedAt: new Date(), source: "PUBLIC_FORM", syncStatus: "NOT_ASSIGNED" } });
        const draft = { operationKey: "legacy_dispatch_001", name: "防災通知", departmentKey: "resident-support", connectionMode: "MEDIA", body: "防災のお知らせ", voiceId: "Takumi", languageCode: "ja-JP", targetMode: "PEOPLE", people: [{ siteKey: "lg", kind: "resident", origin: "DISASTER_RADIO", id: legacy.id }], groupIds: [], topic: "disaster-radio" };
        const valid = await preflightDispatch(db, scope, draft);
        assert.equal((valid.snapshot as { recipientCount: number }).recipientCount, 1);
        const excluded = await preflightDispatch(db, scope, { ...draft, operationKey: "legacy_dispatch_002", topic: "elder-watch" });
        assert.equal((excluded.snapshot as { recipientCount: number }).recipientCount, 0);
        assert.equal(excluded.disabledReason, "NO_ELIGIBLE_TARGETS");
        assert.equal(excluded.executionReady, false);
        assert.deepEqual((excluded.snapshot as { exclusions: unknown }).exclusions, { PENDING_REVIEW: 1 });
        assert.deepEqual((excluded.snapshot as { excludedTargets: unknown }).excludedTargets, [{ name: "旧防災登録", reason: "PENDING_REVIEW" }]);
        await db.disasterRadioSubscription.update({ where: { id: legacy.id }, data: { consentStatus: "NOT_CONSENTED", consentVersion: null, consentedAt: null, syncStatus: "NOT_ELIGIBLE" } });
        const repeat = await preflightDispatch(db, scope, { ...draft, operationKey: "legacy_dispatch_003", parentDispatchId: valid.id });
        assert.notEqual(repeat.id, valid.id);
        assert.deepEqual((repeat.snapshot as { exclusions: unknown }).exclusions, { WITHDRAWN: 1 });
        assert.equal((valid.snapshot as { recipientCount: number }).recipientCount, 1);
        await db.zaadOneTimeDispatch.update({ where: { id: valid.id }, data: { appState: "UNKNOWN" } });
        await rejects(preflightDispatch(db, scope, { ...draft, operationKey: "legacy_dispatch_004", parentDispatchId: valid.id }), "DISPATCH_NOT_REPEATABLE");
      });
      await t.test("CSV imports preserve row idempotency and do not grant consent", async () => {
        const preview = await previewCrmImport(db, scope, { operationKey: "csv_import_00001", departmentKey: "resident-support", bytes: new TextEncoder().encode("name,phone\r\nCSV住民,09000000002\r\n") });
        assert.equal(preview.departmentKey, "resident-support");
        const selection = { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: preview.rows.map(row => row.rowKey) };
        await applyCrmImport(db, scope, selection); await applyCrmImport(db, scope, selection);
        const contacts = await db.municipalContact.findMany({ where: { source: "CSV" } });
        assert.equal(contacts.length, 1); assert.equal(contacts[0].status, "PENDING_REVIEW");
        assert.equal(await db.municipalNotificationPreference.count({ where: { contactId: contacts[0].id, enabled: true } }), 0);
      });
      await t.test("CSV treats visible unreviewed student registrations as matches and rechecks before applying", async () => {
        const univ: OutreachScope = { ...scope, siteKey: "univ", departments: ["student-affairs"] };
        const registration = { siteKey: "univ", name: "CSV照合用学生", facultyCode: "2", admissionYear: 2026, serial: "0098", phone: "+819000000098", topicIds: ["scholarship"], source: "STUDENT_PUBLIC", consentVersion: CONSENT_VERSION, consentedAt: new Date(), requestKey: "csv_match_receipt", requestDigest: "synthetic-test-not-real-consent" };
        const receipt = await db.universityStudentRegistration.create({ data: registration });
        const preview = await previewCrmImport(db, univ, { operationKey: "csv_receipt_match_001", departmentKey: "student-affairs", bytes: new TextEncoder().encode("name,phone,studentNumber\nCSV別名,09000000099,2260098\n") });
        assert.equal(preview.rows[0].status, "MATCH");
        await rejects(applyCrmImport(db, univ, { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: [preview.rows[0].rowKey] }), "INVALID_IMPORT_SELECTION");
        assert.deepEqual(await db.universityStudentRegistration.findUnique({ where: { id: receipt.id } }), receipt);
        assert.equal(await db.universityContact.count({ where: { displayStudentNumber: "2260098" } }), 0);
        const race = await previewCrmImport(db, univ, { operationKey: "csv_receipt_race_001", departmentKey: "student-affairs", bytes: new TextEncoder().encode("name,phone,studentNumber\n後から申請,09000000097,2260097\n") });
        assert.equal(race.rows[0].status, "NEW");
        await db.universityStudentRegistration.create({ data: { ...registration, serial: "0097", requestKey: "csv_race_receipt" } });
        const result = await applyCrmImport(db, univ, { jobId: race.id, previewDigest: race.previewDigest, rowKeys: [race.rows[0].rowKey] });
        assert.equal(result.rows[0].status, "MATCH");
        assert.equal(await db.universityContact.count({ where: { displayStudentNumber: "2260097" } }), 0);
      });
      await t.test("Zoom membership edits detect drift and deletion preserves the CRM person", async () => {
        await db.zoomResourceBinding.create({ data: { ownerSiteKey: "lg", accountId: "group-account", resourceType: "CONTACT_LIST", zoomId: "group-list", departmentKey: "resident-support", purpose: "REGULAR" } });
        let members = [{ id: "group-member", displayName: "Zoomの名前", phones: [{ type: "main", number: "+819000000001" }], emails: [] }];
        let writes = 0;
        const reader = { accountId: "group-account", async getContactList() { return { id: "group-list", name: "Group", description: "", type: "contact", revision: "r1" }; }, async listContacts() { return structuredClone(members); }, async listCampaigns() { return { campaigns: [], nextPageToken: null }; }, async updateContact(_list: string, id: string, input: { name: string; phone: string }) { writes++; members = members.map(row => row.id === id ? { ...row, displayName: input.name, phones: [{ type: "main", number: input.phone }] } : row); }, async deleteContact(_list: string, id: string) { writes++; members = members.filter(row => row.id !== id); } } as unknown as GroupClient;
        const before = await zoomGroupMembers(db, scope, "group-list", reader, true);
        assert.match(before.items[0].observedDigest, /^[a-f0-9]{64}$/);
        assert.equal(before.group.mutationBlock, null);
        for (const [status, alwaysRunning, contactListId, expected] of [
          ["running", false, "group-list", "GROUP_IN_USE"],
          ["ready", true, "group-list", "GROUP_IN_USE"],
          ["unknown", false, "group-list", "GROUP_IN_USE"],
          ["unknown", false, "other-list", "CAMPAIGN_REFERENCE_UNKNOWN"],
          ["paused", false, "group-list", null],
        ] as const) {
          const guarded = { ...reader, async listCampaigns() { return { campaigns: [{ id: "campaign" }], nextPageToken: null }; }, async getCampaign() { return { id: "campaign", status, alwaysRunning, contactListId }; } } as unknown as GroupClient;
          const observation = await zoomGroupMembers(db, scope, "group-list", guarded, true);
          assert.equal(observation.group.mutationBlock, expected);
          assert.equal(observation.items.length, 1);
          if (expected) {
            await rejects(saveZoomMember(db, scope, "group-list", { operationKey: "blocked_member_001", name: "変更不可", phone: "+819000000001", expectedDigest: before.items[0].observedDigest }, "group-member", guarded), expected);
            await rejects(deleteZoomMember(db, scope, "group-list", "group-member", { operationKey: "blocked_delete_001", expectedDigest: before.items[0].observedDigest }, guarded), expected);
          }
          assert.equal(writes, 0);
        }
        const contactBefore = await getContact(db, scope, "MUNICIPAL_CONTACT", registered.contactId);
        await rejects(saveZoomMember(db, scope, "group-list", { operationKey: "member_bad_digest", name: "変更", phone: "+819000000001", expectedDigest: "old" }, "group-member", reader), "PROVIDER_RESOURCE_CHANGED");
        assert.equal(writes, 0);
        await saveZoomMember(db, scope, "group-list", { operationKey: "member_edit_001", name: "Zoom更新名", phone: "+819000000001", expectedDigest: before.items[0].observedDigest }, "group-member", reader);
        const after = await zoomGroupMembers(db, scope, "group-list", reader);
        assert.equal(after.items[0].mapping?.syncState, "UNLINKED");
        assert.equal(after.items[0].mapping?.personId, null);
        assert.equal(after.items[0].source, "Zoom");
        assert.equal(after.items[0].syncStatus, "REGISTERED");
        const mapping = await db.zoomContactMembership.findUniqueOrThrow({ where: { id: after.items[0].mapping!.id } });
        assert.equal(after.items[0].mapping?.version, mapping.version);
        const link = { reference: contactBefore.reference, attestation: "本人情報を確認して関連付け", expectedDigest: after.items[0].observedDigest, version: mapping.version };
        await rejects(linkZoomMember(db, scope, "group-list", "group-member", { ...link, version: mapping.version + 1 }, reader), "MEMBERSHIP_LINK_CONFLICT");
        const linked = await linkZoomMember(db, scope, "group-list", "group-member", link, reader);
        assert.equal(linked.mapping.personId, registered.contactId);
        assert.equal(linked.mapping.version, mapping.version + 1);
        await deleteZoomMember(db, scope, "group-list", "group-member", { operationKey: "member_delete_001", expectedDigest: after.items[0].observedDigest }, reader);
        assert.equal((await zoomGroupMembers(db, scope, "group-list", reader)).items.length, 0);
        assert.deepEqual(await getContact(db, scope, "MUNICIPAL_CONTACT", registered.contactId), contactBefore);
        assert.equal(writes, 2);
      });
      await t.test("a stopped university contact can be reactivated with new consent evidence", async () => {
        const univ: OutreachScope = { ...scope, siteKey: "univ", departments: ["student-affairs"] };
        const contact = await db.universityContact.create({ data: { siteKey: "univ", departmentKey: "student-affairs", name: "再確認用学生", phone: "+819000000008", facultyCode: "4", admissionYear: 2026, serial: "0008", displayStudentNumber: "4260008", registrationSource: "STAFF", registrationStatus: "WITHDRAWN", phoneEligible: false, identityVerified: true, phoneVerified: true } });
        const updated = await updateContact(db, univ, "UNIVERSITY_CONTACT", contact.id, { version: contact.version, departmentKey: "student-affairs", name: contact.name, phone: contact.phone, status: "ACTIVE", topics: ["scholarship"], identityVerified: true, phoneVerified: true, studentNumber: "4260008", attestation: "合成データの再確認", confirmationMethod: "合成データの再確認", confirmedAt: new Date().toISOString(), consentEvidence: { topics: ["scholarship"], consentVersion: CONSENT_VERSION, consentedAt: "2026-09-08T00:00:00.000Z" } });
        assert.equal(updated.status, "ACTIVE");
        assert.deepEqual(updated.topics, ["scholarship"]);
        assert.equal(await db.outreachConsentEvidence.count({ where: { personId: contact.id } }), 1);
        await db.universityNotificationPreference.deleteMany({ where: { contactId: contact.id } });
        await db.universityContact.delete({ where: { id: contact.id } });
      });
      await t.test("concurrent Zoom import previews share one job and reject changed input", async () => {
        await db.zoomResourceBinding.create({ data: { ownerSiteKey: "lg", accountId: "preview-account", resourceType: "CONTACT_LIST", zoomId: "preview-list", departmentKey: "welfare", purpose: "REGULAR" } });
        let name = "同時プレビュー検証";
        const reader = { accountId: "preview-account", async getContactList() { return { id: "preview-list", name: "Preview list", description: "", type: "contact", revision: "r1" }; }, async listContacts() { return [{ id: "preview-member", displayName: name, phones: [{ type: "mobile", number: "+819088880091" }], emails: [] }]; } } as unknown as GroupClient;
        const key = "concurrent_zoom_preview_001";
        const results = await Promise.all(Array.from({ length: 4 }, () => previewZoomCrmImport(db, scope, "preview-list", { operationKey: key }, reader)));
        assert.equal(new Set(results.map(result => result.id)).size, 1);
        assert.equal(await db.crmImportJob.count({ where: { siteKey: "lg", actorId: scope.actorId, operationKey: key } }), 1);
        assert.equal(await db.crmImportRow.count({ where: { jobId: results[0].id } }), 1);
        name = "異なる入力";
        await rejects(previewZoomCrmImport(db, scope, "preview-list", { operationKey: key }, reader), "OPERATION_CONFLICT");
      });
      await t.test("university Zoom imports require completion before creating a student", async () => {
        const univ: OutreachScope = { ...scope, siteKey: "univ", departments: ["student-affairs"] };
        await db.zoomResourceBinding.create({ data: { ownerSiteKey: "univ", accountId: "test-account", resourceType: "CONTACT_LIST", zoomId: "test-list", departmentKey: "student-affairs", purpose: "REGULAR" } });
        const reader = { accountId: "test-account", async getContactList() { return { id: "test-list", name: "Test list", description: "", type: "contact", revision: "revision-1" }; }, async listContacts() { return [{ id: "test-zoom-contact", displayName: "取込学生", phones: [{ type: "mobile", number: "+819000000003" }], emails: [] }]; } } as unknown as GroupClient;
        const preview = await previewZoomCrmImport(db, univ, "test-list", { operationKey: "zoom_import_001" }, reader);
        const imported = await applyZoomCrmImport(db, univ, "test-list", { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: preview.rows.map(row => row.rowKey) }, reader);
        await applyZoomCrmImport(db, univ, "test-list", { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: preview.rows.map(row => row.rowKey) }, reader);
        assert.equal(await db.universityContact.count(), 0);
        assert.equal(await db.outreachImportCandidate.count(), 1);
        assert.equal(imported.rows[0].reference?.origin, "IMPORT_CANDIDATE");
        const candidate = await db.outreachImportCandidate.findFirstOrThrow();
        const now = new Date().toISOString();
        const confirmation = { version: candidate.version, departmentKey: "student-affairs", name: candidate.name, phone: candidate.phone, studentNumber: "1260003", status: "ACTIVE", topics: ["scholarship"], identityVerified: true, phoneVerified: true, attestation: "本人と学内記録・電話番号・同意を確認", confirmationMethod: "対面確認", confirmedAt: now, consentEvidence: { topics: ["scholarship"], consentVersion: CONSENT_VERSION, consentedAt: now } };
        const completed = await updateContact(db, univ, "IMPORT_CANDIDATE", candidate.id, confirmation);
        assert.equal(completed.reference.origin, "UNIVERSITY_CONTACT"); assert.equal(completed.studentNumber, "1260003"); assert.equal(completed.source, "ZCC");
        assert.equal(await db.universityContact.count(), 1);
        await rejects(updateContact(db, univ, "IMPORT_CANDIDATE", candidate.id, confirmation), "VERSION_CONFLICT");
      });
      await t.test("matching Zoom members require explicit linking and never overwrite CRM identity or consent", async () => {
        for (const siteKey of ["lg", "univ"] as const) {
          const currentScope: OutreachScope = { ...scope, siteKey, departments: [siteKey === "lg" ? "resident-support" : "student-affairs"] };
          const existing = siteKey === "lg" ? await db.municipalContact.findUniqueOrThrow({ where: { id: registered.contactId } }) : await db.universityContact.findFirstOrThrow({ where: { siteKey } });
          const accountId = `identity-${siteKey}`, listId = `identity-list-${siteKey}`;
          const binding = await db.zoomResourceBinding.create({ data: { ownerSiteKey: siteKey, accountId, resourceType: "CONTACT_LIST", zoomId: listId, departmentKey: currentScope.departments[0], purpose: "REGULAR" } });
          const member = { id: "identity-member", displayName: existing.name, phones: [{ type: "mobile", number: "+819077779999" }], emails: [] };
          const reader = { accountId, async getContactList() { return { id: listId, name: "Identity list", description: "", type: "contact", revision: "r1" }; }, async listContacts() { return [member]; } } as unknown as GroupClient;
          const preview = await previewZoomCrmImport(db, currentScope, listId, { operationKey: `identity_preview_${siteKey}` }, reader);
          assert.equal(preview.rows[0].status, "CANDIDATE");
          const persistedRow = await db.crmImportRow.findFirstOrThrow({ where: { jobId: preview.id, rowKey: member.id } });
          const candidates = (persistedRow.candidate as { candidates: { id: string }[] }).candidates;
          assert.ok(candidates.some(candidate => candidate.id === existing.id));
          await rejects(applyZoomCrmImport(db, currentScope, listId, { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: [member.id] }, reader), "INVALID_IMPORT_SELECTION");
          assert.equal(await db.zoomContactMembership.count({ where: { bindingId: binding.id } }), 0);
          const reference = { siteKey, kind: siteKey === "lg" ? "resident" : "student", origin: siteKey === "lg" ? "MUNICIPAL_CONTACT" : "UNIVERSITY_CONTACT", id: existing.id };
          const input = { reference, attestation: "本人情報を確認して明示的に対応付け", expectedDigest: digest(member) };
          await rejects(linkZoomMember(db, currentScope, listId, member.id, { ...input, expectedDigest: "stale" }, reader), "PROVIDER_RESOURCE_CHANGED");
          const linked = await linkZoomMember(db, currentScope, listId, member.id, input, reader);
          assert.equal(linked.mapping.personId, existing.id);
          assert.equal(linked.mapping.confirmedBy, scope.actorId);
          assert.equal(linked.mapping.attestation, input.attestation);
          const after = siteKey === "lg" ? await db.municipalContact.findUniqueOrThrow({ where: { id: existing.id } }) : await db.universityContact.findUniqueOrThrow({ where: { id: existing.id } });
          assert.deepEqual(after, existing);
        }
      });
      await t.test("partial Zoom imports preserve concurrent links and retry without duplicating successful rows", async () => {
        for (const siteKey of ["lg", "univ"] as const) {
          const currentScope: OutreachScope = { ...scope, siteKey, departments: [siteKey === "lg" ? "resident-support" : "student-affairs"] };
          const accountId = `partial-${siteKey}`, listId = `partial-list-${siteKey}`;
          const binding = await db.zoomResourceBinding.create({ data: { ownerSiteKey: siteKey, accountId, resourceType: "CONTACT_LIST", zoomId: listId, departmentKey: currentScope.departments[0], purpose: "REGULAR" } });
          const existing = siteKey === "lg" ? await db.municipalContact.findUniqueOrThrow({ where: { id: registered.contactId } }) : await db.universityContact.findFirstOrThrow({ where: { siteKey } });
          const reader = { accountId, async getContactList() { return { id: listId, name: "Partial import", description: "", type: "contact", revision: "r1" }; }, async listContacts() { return ["a", "b"].map((id, index) => ({ id, displayName: `部分取込 ${siteKey} ${id}`, phones: [{ type: "mobile", number: `+81908888009${index + 4}` }], emails: [] })); } } as unknown as GroupClient;
          const preview = await previewZoomCrmImport(db, currentScope, listId, { operationKey: `partial_import_${siteKey}` }, reader);
          assert.deepEqual(preview.rows.map(row => row.status), ["NEW", "NEW"]);
          const concurrent = await db.zoomContactMembership.create({ data: { siteKey, bindingId: binding.id, zoomContactId: "a", personId: existing.id, personOrigin: siteKey === "lg" ? "MUNICIPAL_CONTACT" : "UNIVERSITY_CONTACT", observedDigest: "concurrent-link", syncState: "LINKED" } });
          const input = { jobId: preview.id, previewDigest: preview.previewDigest, rowKeys: ["a", "b"] };
          const partial = await applyZoomCrmImport(db, currentScope, listId, input, reader);
          assert.equal(partial.status, "PARTIAL");
          assert.deepEqual(partial.rows.map(row => row.status), ["FAILED", "IMPORTED"]);
          assert.equal((await db.zoomContactMembership.findUniqueOrThrow({ where: { id: concurrent.id } })).personId, existing.id);
          const successfulPerson = partial.rows[1].reference?.id;
          assert.ok(successfulPerson);
          await db.zoomContactMembership.delete({ where: { id: concurrent.id } });
          const retried = await applyZoomCrmImport(db, currentScope, listId, { ...input, rowKeys: ["a"] }, reader);
          assert.equal(retried.status, "COMPLETED");
          assert.deepEqual(retried.rows.map(row => row.status), ["IMPORTED", "IMPORTED"]);
          assert.equal(retried.rows[1].reference?.id, successfulPerson);
          await applyZoomCrmImport(db, currentScope, listId, input, reader);
          const people = siteKey === "lg" ? await db.municipalContact.findMany({ where: { name: { startsWith: `部分取込 ${siteKey} ` } } }) : await db.outreachImportCandidate.findMany({ where: { name: { startsWith: `部分取込 ${siteKey} ` } } });
          assert.equal(people.length, 2);
          assert.ok(people.every(person => person.status === "PENDING_REVIEW"));
          const after = siteKey === "lg" ? await db.municipalContact.findUniqueOrThrow({ where: { id: existing.id } }) : await db.universityContact.findUniqueOrThrow({ where: { id: existing.id } });
          assert.deepEqual(after, existing);
        }
      });
      await t.test("campaign selection rolls back all bindings on a later ownership conflict and retries idempotently", async () => {
        for (const siteKey of ["lg", "univ"] as const) {
          const currentScope = { ...scope, siteKey };
          const accountId = `atomic-campaign-${siteKey}`;
          const foreign = await db.zoomResourceBinding.create({ data: { accountId, resourceType: "CAMPAIGN", zoomId: "z-conflict", ownerSiteKey: siteKey === "lg" ? "univ" : "lg", purpose: "REGULAR" } });
          const reader = { accountId, async getCampaign(id: string) { return { id, name: id, dialingMethod: "agentless", status: "ready" }; } } as CampaignReader;
          const input = { operationKey: `atomic_campaign_${siteKey}`, campaignIds: ["a-new", "z-conflict"] };
          await rejects(bindCampaigns(db, currentScope, input, reader), "RESOURCE_OWNERSHIP_CONFLICT");
          assert.equal(await db.zoomResourceBinding.count({ where: { accountId } }), 1);
          assert.deepEqual(await db.zoomResourceBinding.findUniqueOrThrow({ where: { id: foreign.id } }), foreign);
          assert.equal(await db.outreachOperation.count({ where: { operationKey: input.operationKey } }), 0);
          await db.zoomResourceBinding.delete({ where: { id: foreign.id } });
          await bindCampaigns(db, currentScope, input, reader);
          await bindCampaigns(db, currentScope, input, reader);
          const bindings = await db.zoomResourceBinding.findMany({ where: { accountId }, orderBy: { zoomId: "asc" } });
          assert.deepEqual(bindings.map(row => [row.zoomId, row.ownerSiteKey, row.purpose]), [["a-new", siteKey, "REGULAR"], ["z-conflict", siteKey, "REGULAR"]]);
          assert.equal(await db.outreachOperation.count({ where: { operationKey: input.operationKey } }), 1);
        }
      });
      await t.test("resource mapping rejects foreign ownership before provider reads and preserves idempotency", async () => {
        let reads = 0;
        const reader = { accountId: "mapping-account", async getContactList(id: string) { reads++; return { id, name: "Mapping test", description: "", type: "contact" as const, contactCount: 0, revision: "r1", updatedAt: null }; } } as unknown as Pick<ZaadZoomClient, "accountId" | "getContactList" | "getCampaign" | "getFlow" | "getTtsAsset">;
        await db.zoomResourceBinding.create({ data: { accountId: "mapping-account", resourceType: "CONTACT_LIST", zoomId: "foreign-list", ownerSiteKey: "univ", purpose: "REGULAR" } });
        await rejects(previewResourceBinding(db, scope, { resourceType: "CONTACT_LIST", zoomId: "foreign-list" }, reader), "NOT_FOUND");
        await rejects(previewResourceBinding(db, { ...scope, all: false }, { resourceType: "CONTACT_LIST", zoomId: "new-list" }, reader), "FULL_ACCESS_REQUIRED");
        assert.equal(reads, 0);
        const preview = await previewResourceBinding(db, scope, { resourceType: "CONTACT_LIST", zoomId: "new-list" }, reader);
        const input = { operationKey: "mapping_save_001", resourceType: "CONTACT_LIST", zoomId: "new-list", accountId: preview.accountId, observedDigest: preview.observedDigest, version: preview.version, departmentKey: "resident-support", notificationTopic: "elder-watch" };
        const first = await saveResourceBinding(db, scope, input, reader);
        assert.deepEqual(await saveResourceBinding(db, scope, input, reader), first);
        assert.equal(await db.zoomResourceBinding.count({ where: { accountId: reader.accountId, zoomId: "new-list" } }), 1);
      });
      await t.test("campaign pause requires scoped ownership, verifies Paused, and never repeats the PATCH", async () => {
        const campaign = { id: "pause-campaign", name: "Pause test", dialingMethod: "agentless", status: "running", revision: "r1", alwaysRunning: false };
        let patches = 0, reads = 0;
        const client = { accountId: "pause-account", async getCampaign() { reads++; return { ...campaign }; }, async setCampaignStatus(_id: string, status: string) { assert.equal(status, "Paused"); patches++; campaign.status = "paused"; campaign.revision = "r2"; } } as unknown as Pick<ZaadZoomClient, "accountId" | "getCampaign" | "listCampaigns" | "setCampaignStatus">;
        await rejects(getRegularCampaign(db, scope, "unknown-id", client), "NOT_FOUND"); assert.equal(reads, 0);
        await db.zoomResourceBinding.create({ data: { accountId: client.accountId, resourceType: "CAMPAIGN", zoomId: campaign.id, ownerSiteKey: "lg", departmentKey: "resident-support", purpose: "REGULAR" } });
        const input = { operationKey: "pause_operation_001", status: "Paused", version: 1, expectedRevision: "r1" };
        await rejects(pauseRegularCampaign(db, scope, campaign.id, input, client), "LIVE_DISABLED"); assert.equal(patches, 0);
        assert.equal((await pauseRegularCampaign(db, { ...scope, live: true }, campaign.id, input, client)).campaign.status, "paused");
        await pauseRegularCampaign(db, { ...scope, live: true }, campaign.id, input, client); assert.equal(patches, 1);
      });
      await t.test("public registration ignores the retired reception toggle", async () => {
        await db.zaadRegistrationSetting.upsert({ where: { siteKey: "lg" }, create: { siteKey: "lg", publicRegistrationEnabled: false }, update: { publicRegistrationEnabled: false } });
        const result = await registerMunicipalContact(db, "lg", { ...payload, operationKey: "always_open_registration", phone: "09000000091" });
        assert.ok(result.id);
        assert.equal((await db.zaadRegistrationSetting.findUniqueOrThrow({ where: { siteKey: "lg" } })).publicRegistrationEnabled, false);
      });
    } finally { globalThis.fetch = oldFetch; await context.close(); }
  });
});
