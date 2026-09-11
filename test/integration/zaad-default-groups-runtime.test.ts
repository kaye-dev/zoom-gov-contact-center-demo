import { registerStudent } from "../../lib/server/zaad/university/registrations";
import { registerMunicipalContact } from "../../lib/server/zaad/municipal/registrations";
import { registerPublicDisasterRadioResident } from "../../lib/server/zaad/residents";
import { admissionYears, CONSENT_VERSION } from "../../lib/zaad/university/contracts";
import { MUNICIPAL_CONSENT_VERSION } from "../../lib/zaad/municipal/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { createDatabaseContext } from "../../lib/server/prisma";
import { listOutreachGroups, bindDefaultGroup, defaultGroupCandidates, addRegistrationMemberships, ensureDefaultGroups } from "../../lib/server/zaad/default-groups";
import { startRegistrationGroupSync, advanceRegistrationSync, getRegistrationSyncOperation, getDefaultGroupDetail, syncRegisteredSource, type RegistrationGroupClient } from "../../lib/server/zaad/registration-group-sync";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";
import { OutreachContractError } from "../../lib/zaad/outreach-contracts";
import type { ZoomContactDto } from "../../lib/server/zaad/zoom-client";
import { ZaadZoomError } from "../../lib/server/zaad/zoom-client";
import { ZAAD_ERROR_CODES } from "../../lib/zaad/contracts";

const scope: OutreachScope = { siteKey: "lg", actorId: "group-fixture-admin", all: true, live: false };
const rejects = (promise: Promise<unknown>, code: string) => assert.rejects(promise, e => e instanceof OutreachContractError && e.code === code);
export function groupProvider(): RegistrationGroupClient & { contacts: Map<string, ZoomContactDto[]>; writes: string[]; failure: string | null; running: boolean } {
  return {
    accountId: "fixture-account", contacts: new Map(), writes: [], failure: null, running: false,
    async getContactList(id) { if (id === "missing") throw new Error("not found"); return { id, name: id, description: "", type: "contact", contactCount: null, revision: "1", updatedAt: null }; },
    async listContacts(id) { if (this.failure === "read") throw new Error("provider unavailable"); return structuredClone(this.contacts.get(id) ?? []); },
    async listCampaigns() { return { campaigns: this.running ? [{ id: "running" }] as never : [], nextPageToken: null }; },
    async getCampaign() { return { id: "running", status: "running", contactListId: "fixture-radio", alwaysRunning: false } as never; },
    async createContact(id, input) { this.writes.push(id); if (this.failure === "unknown") throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true); if (this.failure === "rate") throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomRateLimited, 429); const contact = { id: `contact-${this.writes.length}`, displayName: input.name, phones: [{ type: "Main", number: input.phone }], emails: [] }; this.contacts.set(id, [...this.contacts.get(id) ?? [], contact]); return contact.id; },
    async updateContact(id, contactId, input) { this.writes.push(id); const contact = this.contacts.get(id)?.find(c => c.id === contactId); if (!contact) throw new Error("missing"); contact.displayName = input.name; contact.phones = [{ type: "Main", number: input.phone }]; },
  };
}

test("default group binding, registration membership and durable sync isolation", { timeout: 180000 }, async t => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl }), db = context.prisma, provider = groupProvider();
    try {
      await db.user.create({ data: { id: scope.actorId, name: "Fixture", email: "groups@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      await db.globalDeveloperApiSetting.create({ data: { id: "global", accountId: provider.accountId, clientId: "fixture" } });
      const groupId = "default-lg-disaster-radio";
      await t.test("catalog has ten stable rows and cannot cross tenant or department scope", async () => {
        await ensureDefaultGroups(db, "lg"); await ensureDefaultGroups(db, "univ");
        assert.equal(await db.outreachDefaultGroup.count(), 10);
        await rejects(getDefaultGroupDetail(db, { ...scope, siteKey: "univ" }, groupId, {}, provider), "NOT_FOUND");
        await rejects(getDefaultGroupDetail(db, { ...scope, all: false }, groupId, {}, provider), "FULL_ACCESS_REQUIRED");
      });
      await t.test("binding verifies ID, account, uniqueness, internal resources and versions", async () => {
        const payload = { operationKey: "fixture-bind-radio", revision: 1, accountId: provider.accountId, contactListId: "fixture-radio" };
        await bindDefaultGroup(db, scope, groupId, payload, provider);
        await bindDefaultGroup(db, scope, groupId, payload, provider);
        assert.equal((await db.outreachDefaultGroup.findUniqueOrThrow({ where: { id: groupId } })).revision, 2);
        await rejects(bindDefaultGroup(db, scope, "default-lg-elder-watch", { ...payload, operationKey: "fixture-duplicate" }, provider), "RESOURCE_OWNERSHIP_CONFLICT");
        await rejects(bindDefaultGroup(db, scope, groupId, { ...payload, operationKey: "fixture-stale" }, provider), "VERSION_CONFLICT");
        await rejects(bindDefaultGroup(db, scope, groupId, { ...payload, accountId: "wrong" }, provider), "OPERATION_CONFLICT");
        await assert.rejects(bindDefaultGroup(db, scope, "default-lg-elder-watch", { ...payload, operationKey: "fixture-missing", contactListId: "missing" }, provider));
        await db.zoomResourceBinding.create({ data: { accountId: provider.accountId, zoomId: "internal", resourceType: "CONTACT_LIST", ownerSiteKey: "lg", purpose: "ONE_TIME", dispatchId: "fixture" } });
        await rejects(bindDefaultGroup(db, scope, "default-lg-elder-watch", { ...payload, operationKey: "fixture-internal", contactListId: "internal" }, provider), "RESOURCE_OWNERSHIP_CONFLICT");
      });
      await t.test("public university, municipal and radio receipts preserve chosen memberships and approval state", async () => {
        const university = { name: "Fixture student", facultyCode: "1", admissionYear: admissionYears()[0], serial: "0099", phone: "09000000099", topicIds: ["scholarship", "facility"], consent: true, consentVersion: CONSENT_VERSION, requestKey: "fixture-student-request" };
        const student = await registerStudent(db, "univ", university);
        await registerStudent(db, "univ", university);
        const memberships = await db.outreachRegistrationMembership.findMany({ where: { sourceId: student.id } });
        assert.deepEqual(memberships.map(m => m.defaultGroupId).sort(), ["default-univ-facility", "default-univ-scholarship"]);
        assert.equal(await db.universityContact.count(), 0);
        for (const topic of university.topicIds) await bindDefaultGroup(db, { ...scope, siteKey: "univ" }, `default-univ-${topic}`, { operationKey: `fixture-bind-${topic}`, revision: 1, accountId: provider.accountId, contactListId: `univ-${topic}` }, provider);
        await syncRegisteredSource(db, "univ", "UNIVERSITY_REGISTRATION", student.id, provider);
        assert.equal(await db.outreachRegistrationMembership.count({ where: { sourceId: student.id, syncStatus: "SYNCED" } }), 2);
        const municipal = { operationKey: "fixture-municipal-request", name: "Fixture resident", phone: "09000000098", district: "central", topics: ["elder-watch", "fraud-alert"], consent: true, consentVersion: MUNICIPAL_CONSENT_VERSION, availability: { weekdays: [1], windows: [{ start: "09:00", end: "12:00" }] } };
        const accepted = await registerMunicipalContact(db, "lg", municipal);
        await registerMunicipalContact(db, "lg", municipal);
        const local = await db.outreachRegistrationMembership.findMany({ where: { sourceId: accepted.contactId } });
        assert.deepEqual(local.map(m => m.defaultGroupId).sort(), ["default-lg-elder-watch", "default-lg-fraud-alert"]);
        assert.equal(await db.municipalNotificationPreference.count({ where: { contactId: accepted.contactId, enabled: true } }), 0);
        await db.outreachRegistrationMembership.deleteMany({ where: { sourceId: accepted.contactId } });
        const radioPayload = { name: "Public radio", phone: "09000000097", email: "public-radio@example.invalid", consent: true };
        await registerPublicDisasterRadioResident(db, "lg", radioPayload);
        await registerPublicDisasterRadioResident(db, "lg", radioPayload);
        const radioRow = await db.disasterRadioSubscription.findFirstOrThrow({ where: { normalizedEmail: radioPayload.email } });
        assert.equal(await db.outreachRegistrationMembership.count({ where: { sourceId: radioRow.id, defaultGroupId: "default-lg-disaster-radio" } }), 1);
        await db.outreachRegistrationMembership.deleteMany({ where: { sourceId: radioRow.id } });
        provider.writes.length = 0;
      });
      async function radio(index: number) {
        const person = await db.disasterRadioSubscription.create({ data: { siteKey: "lg", name: `Person ${index}`, normalizedEmail: `person-${index}@example.invalid`, normalizedPhone: `+8190${String(index).padStart(8, "0")}`, consentStatus: "CONSENTED", consentVersion: "fixture-v1", consentedAt: new Date(), source: "PUBLIC_FORM", syncStatus: "PENDING" } });
        await addRegistrationMemberships(db, "lg", "DISASTER_RADIO", person.id, ["disaster-radio"]);
        return person;
      }
      const first = await radio(1), second = await radio(2);
      const firstMember = await db.outreachRegistrationMembership.findFirstOrThrow({ where: { sourceId: first.id } });
      await t.test("Zoom-only and local users form an unfiltered union with individual and bulk counts", async () => {
        provider.contacts.set("fixture-radio", [{ id: "remote-only", displayName: "Zoom fixture", phones: [{ type: "Main", number: first.normalizedPhone }], emails: [] }]);
        let detail = await getDefaultGroupDetail(db, scope, groupId, {}, provider);
        assert.equal(detail.summary.total, 3); assert.equal(detail.summary.unsynced, 2);
        assert.equal(detail.items.filter(i => i.source === "Zoom").length, 1); // same phone is not identity
        const operation = await startRegistrationGroupSync(db, scope, groupId, { operationKey: "fixture-first", revision: 2, memberIds: [firstMember.id] }, provider);
        const done = await advanceRegistrationSync(db, scope, operation.operationId, provider);
        assert.equal(done.status, "COMPLETED"); assert.equal(done.counts.synced, 1);
        await advanceRegistrationSync(db, scope, operation.operationId, provider);
        assert.equal(provider.writes.length, 1);
        assert.equal((await startRegistrationGroupSync(db, scope, groupId, { operationKey: "fixture-first", revision: 2, memberIds: [firstMember.id] }, provider)).operationId, operation.operationId);
        await rejects(getRegistrationSyncOperation(db, { ...scope, actorId: "other" }, operation.operationId), "NOT_FOUND");
        detail = await getDefaultGroupDetail(db, scope, groupId, { query: "Person 1" }, provider);
        assert.equal(detail.items.length, 1); assert.equal(detail.summary.total, 3); assert.equal(detail.summary.unsynced, 1);
        const bulk = await startRegistrationGroupSync(db, scope, groupId, { operationKey: "fixture-second", revision: 2 }, provider);
        assert.equal((await advanceRegistrationSync(db, scope, bulk.operationId, provider)).status, "COMPLETED");
        assert.equal((await getDefaultGroupDetail(db, scope, groupId, {}, provider)).summary.unsynced, 0);
      });
      await t.test("read failure does not report a fabricated total", async () => {
        provider.failure = "read";
        const detail = await getDefaultGroupDetail(db, scope, groupId, {}, provider);
        assert.equal(detail.summary.total, null); assert.equal(detail.items.length, 2);
        provider.failure = null;
      });
      await t.test("unknown write is not retried and external changes are not overwritten", async () => {
        const person = await radio(3); provider.failure = "unknown";
        await syncRegisteredSource(db, "lg", "DISASTER_RADIO", person.id, provider);
        const writes = provider.writes.length; provider.failure = null;
        await syncRegisteredSource(db, "lg", "DISASTER_RADIO", person.id, provider);
        assert.equal(provider.writes.length, writes);
        assert.equal((await db.outreachRegistrationMembership.findFirstOrThrow({ where: { sourceId: person.id } })).syncStatus, "UNKNOWN");
        const member = await db.outreachRegistrationMembership.findUniqueOrThrow({ where: { id: firstMember.id } });
        provider.contacts.get("fixture-radio")!.find(c => c.id === member.zoomContactId)!.displayName = "Edited remotely";
        await syncRegisteredSource(db, "lg", "DISASTER_RADIO", first.id, provider);
        assert.equal(provider.writes.length, writes);
        assert.equal((await db.outreachRegistrationMembership.findUniqueOrThrow({ where: { id: firstMember.id } })).syncStatus, "DIFFERENCE");
      });
      await t.test("withdrawal and active campaigns prevent writes", async () => {
        const person = await radio(4); provider.running = true;
        const writes = provider.writes.length;
        await syncRegisteredSource(db, "lg", "DISASTER_RADIO", person.id, provider);
        assert.equal((await db.outreachRegistrationMembership.findFirstOrThrow({ where: { sourceId: person.id } })).lastErrorCode, "GROUP_IN_USE");
        provider.running = false;
        await db.disasterRadioSubscription.update({ where: { id: person.id }, data: { consentStatus: "NOT_CONSENTED", consentVersion: null, consentedAt: null, syncStatus: "NOT_ELIGIBLE" } });
        await syncRegisteredSource(db, "lg", "DISASTER_RADIO", person.id, provider);
        assert.equal(provider.writes.length, writes);
      });
      await t.test("45 members advance in batches, persist partial success and resume", async () => {
        await bindDefaultGroup(db, scope, "default-lg-elder-watch", { operationKey: "fixture-bind-bulk", revision: 1, accountId: provider.accountId, contactListId: "fixture-bulk" }, provider);
        for (let i = 0; i < 45; i++) {
          const person = await db.municipalContact.create({ data: { siteKey: "lg", name: `Bulk ${i}`, phone: `+8180${String(i).padStart(8, "0")}`, source: "HP", preferences: { create: { topic: "elder-watch", requested: true, consentedAt: new Date(), consentVersion: "v1" } } } });
          await addRegistrationMemberships(db, "lg", "MUNICIPAL_CONTACT", person.id, ["elder-watch"]);
        }
        const op = await startRegistrationGroupSync(db, scope, "default-lg-elder-watch", { operationKey: "fixture-bulk-45", revision: 2 }, provider);
        assert.equal(op.counts.total, 45);
        let result = await advanceRegistrationSync(db, scope, op.operationId, provider);
        assert.equal(result.counts.synced, 20); assert.equal(result.counts.pending, 25);
        provider.failure = "rate";
        result = await advanceRegistrationSync(db, scope, op.operationId, provider);
        assert.equal(result.counts.failed, 20); assert.equal(result.counts.pending, 5);
        provider.failure = null;
        result = await advanceRegistrationSync(db, scope, op.operationId, provider);
        assert.equal(result.status, "PARTIAL"); assert.equal(result.counts.synced, 25);
      });
      assert.equal((await db.disasterRadioSubscription.findUniqueOrThrow({ where: { id: second.id } })).consentStatus, "CONSENTED");
    } finally { await context.close(); }
  });
});

test("default group candidate reads preserve provider lists and enforce binding ownership", { timeout: 180000 }, async t => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl }), db = context.prisma;
    const names = ["光化学スモッグ注意報発令", "未来市-警察_金融機関", "未来市-税務課", "未来大学-入試窓口課", "未来市-防災課"];
    const lists = names.map((name, n) => ({ id: `opaque-${n}`, name, description: "", type: "contact" as const, contactCount: n % 3, revision: "1", updatedAt: null }));
    const requests: (string | undefined)[] = [];
    let failure = 0, currentFailure = 0;
    const provider = {
      accountId: "fixture-account",
      async listContactLists(input: { pageSize?: number; nextPageToken?: string } = {}) {
        requests.push(input.nextPageToken); assert.equal(input.pageSize, 100);
        if (failure) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, failure);
        return { lists: input.nextPageToken ? lists.slice(2) : lists.slice(0, 3), nextPageToken: input.nextPageToken ? null : "opaque-next" };
      },
      async getContactList(id: string) { if (currentFailure) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, currentFailure); return lists.find(row => row.id === id) ?? { ...lists[0], id }; },
    };
    const groupId = "default-lg-elder-watch";
    try {
      await db.user.create({ data: { id: scope.actorId, name: "Fixture", email: "candidates@example.invalid", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      await db.globalDeveloperApiSetting.create({ data: { id: "global", accountId: provider.accountId, clientId: "fixture" } });
      await ensureDefaultGroups(db, "lg"); await ensureDefaultGroups(db, "univ");
      const unchanged = async () => ({ groups: await db.outreachDefaultGroup.findMany({ orderBy: { id: "asc" } }), bindings: await db.zoomResourceBinding.findMany({ orderBy: { id: "asc" } }), operations: await db.outreachOperation.count() });
      await t.test("both tenants see the five original names including empty lists and opaque pagination", async () => {
        const before = await unchanged();
        for (const siteKey of ["lg", "univ"] as const) {
          const id = siteKey === "lg" ? groupId : "default-univ-scholarship";
          const first = await defaultGroupCandidates(db, { ...scope, siteKey }, id, undefined, provider);
          assert.equal(first.nextCursor, "opaque-next"); assert.equal(first.current, null);
          const second = await defaultGroupCandidates(db, { ...scope, siteKey }, id, first.nextCursor!, provider);
          assert.deepEqual([...new Map([...first.items, ...second.items].map(row => [row.id, row.name])).values()], names);
          assert.ok([...first.items, ...second.items].every(row => row.selectable));
        }
        assert.deepEqual(requests, [undefined, "opaque-next", undefined, "opaque-next"]);
        assert.deepEqual(await unchanged(), before);
      });
      await t.test("a current list outside the page remains selectable; same-name IDs bind independently", async () => {
        lists[4].name = lists[0].name;
        await bindDefaultGroup(db, scope, groupId, { operationKey: "fixture-candidate-bind", accountId: provider.accountId, revision: 1, contactListId: lists[4].id }, provider);
        const before = await unchanged();
        const result = await defaultGroupCandidates(db, scope, groupId, undefined, provider);
        assert.equal(result.current?.id, lists[4].id); assert.equal(result.current?.name, lists[0].name); assert.equal(result.current?.selectable, true);
        assert.equal(result.items.some(row => row.id === lists[4].id), false);
        assert.equal((await db.outreachDefaultGroup.findUniqueOrThrow({ where: { id: groupId }, include: { binding: true } })).binding?.zoomId, lists[4].id);
        assert.deepEqual(await unchanged(), before);
      });
      await t.test("only a 404 marks a current list missing; account changes never resolve the old ID", async () => {
        currentFailure = 404;
        assert.equal((await defaultGroupCandidates(db, scope, groupId, undefined, provider)).current?.unavailableReason, "MISSING");
        for (const status of [403, 429, 503]) { currentFailure = status; await assert.rejects(defaultGroupCandidates(db, scope, groupId, undefined, provider), error => error instanceof ZaadZoomError && error.httpStatus === status); }
        provider.accountId = "new-account";
        assert.equal((await defaultGroupCandidates(db, scope, groupId, undefined, provider)).current?.unavailableReason, "ACCOUNT_CHANGED");
        provider.accountId = "fixture-account"; currentFailure = 0;
      });
      await t.test("regular lists are adoptable; other defaults, industries and tombstoned internal lists are disabled", async () => {
        await db.zoomResourceBinding.create({ data: { ownerSiteKey: "lg", accountId: provider.accountId, resourceType: "CONTACT_LIST", zoomId: lists[0].id, purpose: "REGULAR" } });
        await bindDefaultGroup(db, scope, "default-lg-fraud-alert", { operationKey: "fixture-other-default", accountId: provider.accountId, revision: 1, contactListId: lists[1].id }, provider);
        await db.zoomResourceBinding.create({ data: { ownerSiteKey: "univ", accountId: provider.accountId, resourceType: "CONTACT_LIST", zoomId: lists[2].id, purpose: "REGULAR" } });
        await db.zoomResourceBinding.create({ data: { ownerSiteKey: "lg", accountId: provider.accountId, resourceType: "CONTACT_LIST", zoomId: lists[3].id, purpose: "ONE_TIME", tombstone: true } });
        const before = await unchanged();
        const first = await defaultGroupCandidates(db, scope, groupId, undefined, provider);
        const second = await defaultGroupCandidates(db, scope, groupId, first.nextCursor!, provider);
        const map = new Map([...first.items, ...second.items].map(row => [row.id, row]));
        assert.equal(map.get(lists[0].id)?.selectable, true);
        assert.equal(map.get(lists[1].id)?.disabledReason, "ASSIGNED_DEFAULT");
        assert.equal(map.get(lists[2].id)?.disabledReason, "OTHER_INDUSTRY");
        assert.equal(map.get(lists[3].id)?.disabledReason, "INTERNAL_RESOURCE");
        assert.equal(map.get(lists[4].id)?.selectable, true);
        await rejects(defaultGroupCandidates(db, { ...scope, all: false }, groupId, undefined, provider), "FULL_ACCESS_REQUIRED");
        await rejects(defaultGroupCandidates(db, scope, groupId, "x".repeat(2049), provider), "INVALID_CURSOR");
        assert.deepEqual(await unchanged(), before);
      });
      await t.test("empty pages and provider failures are distinct and never mutate state", async () => {
        const before = await unchanged();
        assert.deepEqual((await defaultGroupCandidates(db, scope, groupId, undefined, { ...provider, async listContactLists() { return { lists: [], nextPageToken: null }; } })).items, []);
        for (const status of [403, 429, 503]) { failure = status; await assert.rejects(defaultGroupCandidates(db, scope, groupId, undefined, provider), error => error instanceof ZaadZoomError && error.httpStatus === status); }
        failure = 0;
        assert.deepEqual(await unchanged(), before);
      });
      await t.test("post-read account, revision and ownership conflicts preserve the original binding", async () => {
        const snapshot = await defaultGroupCandidates(db, scope, groupId, undefined, provider);
        const payload = { operationKey: "fixture-after-read", accountId: snapshot.accountId, revision: snapshot.revision, contactListId: lists[0].id };
        await db.globalDeveloperApiSetting.update({ where: { id: "global" }, data: { accountId: "changed" } });
        await rejects(bindDefaultGroup(db, scope, groupId, payload, provider), "ACCOUNT_CHANGED");
        await db.globalDeveloperApiSetting.update({ where: { id: "global" }, data: { accountId: provider.accountId } });
        await db.outreachDefaultGroup.update({ where: { id: groupId }, data: { revision: { increment: 1 } } });
        await rejects(bindDefaultGroup(db, scope, groupId, payload, provider), "VERSION_CONFLICT");
        await bindDefaultGroup(db, scope, "default-lg-procedure-support", { ...payload, operationKey: "fixture-intervening-owner", revision: 1 }, provider);
        await rejects(bindDefaultGroup(db, scope, groupId, { ...payload, revision: snapshot.revision + 1 }, provider), "RESOURCE_OWNERSHIP_CONFLICT");
        assert.equal((await db.outreachDefaultGroup.findUniqueOrThrow({ where: { id: groupId }, include: { binding: true } })).binding?.zoomId, lists[4].id);
      });
    } finally { await context.close(); }
  });
});


test("group list counts use Zoom values, isolate failures and never count pending registrations", { timeout: 180000 }, async () => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl }), db = context.prisma;
    try {
      await db.globalDeveloperApiSetting.create({ data: { id: "global", accountId: "fixture-account", clientId: "fixture" } });
      const calls: string[] = [];
      let failListing = false, active = 0, peak = 0;
      const observed = (id: string) => ({ id, name: id, description: "", type: "contact" as const, contactCount: id.endsWith("0") ? 0 : id.endsWith("1") ? 12 : null, revision: "1", updatedAt: null });
      const unused = async (): Promise<never> => { throw new Error("unexpected provider write or contact enumeration"); };
      const provider = {
        ...groupProvider(),
        async listContactLists() {
          if (failListing) throw new Error("listing unavailable");
          return { lists: ["lg-0", "lg-1", "lg-2", "lg-3", "univ-0", "univ-1", "univ-2", "univ-3", "regular-1"].map(observed), nextPageToken: null };
        },
        async getContactList(id: string) {
          calls.push(id); active++; peak = Math.max(peak, active);
          try { await new Promise(resolve => setTimeout(resolve, 5)); if (id.endsWith("3")) throw new Error("individual failure"); return observed(id); }
          finally { active--; }
        },
        createContactList: unused, updateContactList: unused, deleteContactList: unused,
        createContact: unused, updateContact: unused, deleteContact: unused, listContacts: unused,
      };
      for (const siteKey of ["lg", "univ"] as const) {
        await ensureDefaultGroups(db, siteKey);
        const groups = await db.outreachDefaultGroup.findMany({ where: { siteKey }, orderBy: { id: "asc" } });
        for (const [index, group] of groups.slice(0, 4).entries()) {
          const binding = await db.zoomResourceBinding.create({ data: { ownerSiteKey: siteKey, accountId: provider.accountId, resourceType: "CONTACT_LIST", zoomId: `${siteKey}-${index}`, purpose: "REGULAR" } });
          await db.outreachDefaultGroup.update({ where: { id: group.id }, data: { bindingId: binding.id } });
        }
        for (let index = 0; index < 3; index++) await addRegistrationMemberships(db, siteKey, siteKey === "lg" ? "MUNICIPAL_CONTACT" : "UNIVERSITY_REGISTRATION", `pending-${siteKey}-${index}`, [groups[1].topicKey]);
      }
      await db.zoomResourceBinding.create({ data: { ownerSiteKey: "lg", accountId: provider.accountId, resourceType: "CONTACT_LIST", zoomId: "regular-1", purpose: "REGULAR" } });
      const snapshot = async () => JSON.stringify({ groups: await db.outreachDefaultGroup.findMany({ orderBy: { id: "asc" } }), bindings: await db.zoomResourceBinding.findMany({ orderBy: { id: "asc" } }), memberships: await db.outreachRegistrationMembership.findMany({ orderBy: { id: "asc" } }) });
      const before = await snapshot();
      for (const siteKey of ["lg", "univ"] as const) {
        const result = await listOutreachGroups(db, { ...scope, siteKey }, provider);
        assert.deepEqual(result.items.filter(row => row.kind === "DEFAULT").map(row => row.contactCount).sort((a, b) => (a ?? -1) - (b ?? -1)), [null, null, null, 0, 12]);
        assert.equal(result.items.filter(row => row.kind === "REGULAR").length, siteKey === "lg" ? 1 : 0);
        if (siteKey === "lg") assert.equal(result.items.find(row => row.kind === "REGULAR")?.contactCount, 12);
        assert.ok(result.items.every(row => row.kind === "REGULAR" || row.id.startsWith(`default-${siteKey}-`)));
      }
      assert.equal(calls.length, 0); // Listing values, including null, do not trigger redundant reads.
      failListing = true;
      for (const siteKey of ["lg", "univ"] as const) {
        const result = await listOutreachGroups(db, { ...scope, siteKey }, provider);
        assert.equal(result.items.length, 5);
        assert.equal(result.items.find(row => row.kind === "DEFAULT" && row.contactListId === `${siteKey}-1`)?.contactCount, 12);
        assert.equal(result.items.find(row => row.kind === "DEFAULT" && row.contactListId === `${siteKey}-3`)?.contactCount, null);
      }
      assert.equal(peak, 3); assert.equal(new Set(calls).size, 8); assert.equal(calls.length, 8);
      assert.equal(await snapshot(), before);
      await db.zoomResourceBinding.updateMany({ where: { zoomId: "lg-0" }, data: { accountId: "old-account" } });
      await db.zoomResourceBinding.updateMany({ where: { zoomId: "lg-1" }, data: { tombstone: true } });
      calls.length = 0;
      const invalid = await listOutreachGroups(db, scope, provider);
      for (const id of ["lg-0", "lg-1"]) {
        assert.equal(invalid.items.find(row => row.kind === "DEFAULT" && row.contactListId === id)?.contactCount, null);
        assert.ok(!calls.includes(id));
      }
      failListing = false;
      const restricted = await listOutreachGroups(db, { ...scope, all: false }, provider);
      assert.deepEqual(restricted.items.map(row => row.id), ["regular-1"]);
    } finally { await context.close(); }
  });
});
