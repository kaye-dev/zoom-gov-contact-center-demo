import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { createDatabaseContext } from "../../lib/server/prisma";
import { listPurposeCampaigns, purposeCampaignCandidates, purposeCampaignOperation, savePurposeCampaign } from "../../lib/server/zaad/purpose-campaign-bindings";
import type { CampaignReader } from "../../lib/server/zaad/campaign-bindings";
import type { OutreachScope } from "../../lib/server/zaad/outreach-scope";
import { OutreachContractError } from "../../lib/zaad/outreach-contracts";
import { ZaadZoomError, type ZoomCampaignDto } from "../../lib/server/zaad/zoom-client";
import { ZAAD_ERROR_CODES } from "../../lib/zaad/contracts";
const scope: OutreachScope = { siteKey: "lg", actorId: "purpose-admin", all: true, live: false, departments: ["resident-support"] };
const accountId = "purpose-fixture-account";
const reject = (promise: Promise<unknown>, code: string) => assert.rejects(promise, error => error instanceof OutreachContractError && error.code === code);
test("PURPOSE-02: additive mapping migration and transactional campaign binding", { timeout: 180000 }, async t => {
  await withIsolatedPostgresDatabase(async databaseUrl => {
    const context = createDatabaseContext({ ...process.env, DATABASE_URL: databaseUrl }), db = context.prisma;
    const campaigns = new Map<string, ZoomCampaignDto>(["existing", "second", "foreign", "internal", "deleted", "agent", "running", "race-a", "race-b", "race-other"].map(id => [id, { id, name: `Campaign ${id}`, status: id === "running" ? "running" : "ready", dialingMethod: id === "agent" ? "progressive" : "agentless", contactListId: "list", contactListName: "Contact list", revision: "1" } as ZoomCampaignDto]));
    const reader: CampaignReader = { accountId, async listCampaigns() { return { campaigns: [...campaigns.values()], nextPageToken: null }; }, async getCampaign(id) { const row = campaigns.get(id); if (!row) throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotFound, 404); return { ...row }; } };
    const payload = (operationKey: string, campaignId: string, revision = 0) => ({ operationKey, accountId, campaignId, revision });
    try {
      await db.user.create({ data: { id: scope.actorId, email: "purpose@example.invalid", name: "Fixture", emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      await db.globalDeveloperApiSetting.create({ data: { id: "global", accountId, clientId: "fixture" } });
      const existing = await db.zoomResourceBinding.create({ data: { ownerSiteKey: "lg", accountId, resourceType: "CAMPAIGN", zoomId: "existing", purpose: "REGULAR", departmentKey: "resident-support" } });
      const history = await db.zaadOneTimeDispatch.create({ data: { siteKey: "lg", operationKey: "prior-history", name: "Previous notice", body: "Fixture", voiceId: "fixture", baseCampaignId: "existing", zoomCampaignId: "existing", snapshot: { campaignId: "existing", recipients: ["fixture"] } } });
      await t.test("empty mappings produce the five fixed rows without changing provider resources", async () => {
        const result = await listPurposeCampaigns(db, scope, reader);
        assert.equal(result.rows.length, 5); assert.ok(result.rows.every(row => row.version === 0 && row.campaignId === null));
        assert.equal(await db.outreachPurposeCampaign.count(), 0);
      });
      await t.test("existing REGULAR binding is reused and duplicate operation returns the original result", async () => {
        const first = await savePurposeCampaign(db, scope, "regular", "ELDER_WATCH", payload("purpose-first", "existing"), reader);
        const replay = await savePurposeCampaign(db, scope, "regular", "ELDER_WATCH", payload("purpose-first", "existing"), reader);
        assert.deepEqual(first, replay);
        const row = await db.outreachPurposeCampaign.findFirstOrThrow(); assert.equal(row.bindingId, existing.id); assert.equal(row.version, 1);
        assert.equal(await db.zoomResourceBinding.count(), 1); assert.equal(await db.outreachOperation.count(), 1);
        await reject(savePurposeCampaign(db, scope, "regular", "ELDER_WATCH", payload("purpose-first", "second"), reader), "OPERATION_CONFLICT");
        assert.equal((await purposeCampaignOperation(db, scope, "purpose-first")).status, "COMPLETED");
        await reject(purposeCampaignOperation(db, { ...scope, actorId: "other" }, "purpose-first"), "NOT_FOUND");
      });
      await t.test("other purpose, foreign ownership, internal, tombstoned and provider state conflicts cannot save", async () => {
        await reject(savePurposeCampaign(db, scope, "one-time", "FRAUD_ALERT", payload("purpose-duplicate", "existing"), reader), "PURPOSE_ALREADY_ASSIGNED");
        for (const [zoomId, ownerSiteKey, purpose, tombstone] of [["foreign", "univ", "REGULAR", false], ["internal", "lg", "ONE_TIME", false], ["deleted", "lg", "REGULAR", true]] as const) {
          await db.zoomResourceBinding.create({ data: { accountId, resourceType: "CAMPAIGN", zoomId, ownerSiteKey, purpose, tombstone } });
          await reject(savePurposeCampaign(db, scope, "one-time", "FRAUD_ALERT", payload(`purpose-${zoomId}`, zoomId), reader), "RESOURCE_OWNERSHIP_CONFLICT");
        }
        for (const id of ["agent", "running"]) await reject(savePurposeCampaign(db, scope, "one-time", "FRAUD_ALERT", payload(`purpose-${id}`, id), reader), "CAMPAIGN_CHANGED");
        await assert.rejects(savePurposeCampaign(db, scope, "one-time", "FRAUD_ALERT", payload("purpose-missing", "missing"), reader), /ZAAD_ZOOM_NOT_FOUND/);
        await reject(savePurposeCampaign(db, scope, "regular", "ELDER_WATCH", payload("purpose-stale", "second"), reader), "VERSION_CONFLICT");
      });
      await t.test("replacement retains old binding, snapshots and notice history, and GET returns observed data", async () => {
        await savePurposeCampaign(db, scope, "regular", "ELDER_WATCH", payload("purpose-replace", "second", 1), reader);
        assert.deepEqual(await db.zoomResourceBinding.findUnique({ where: { id: existing.id } }), existing);
        assert.deepEqual(await db.zaadOneTimeDispatch.findUnique({ where: { id: history.id } }), history);
        const row = (await listPurposeCampaigns(db, scope, reader)).rows[0];
        assert.equal(row.campaignName, "Campaign second"); assert.equal(row.contactListName, "Contact list"); assert.equal(row.version, 2);
        const audit = await db.zaadAdminAudit.findMany({ where: { resourceKind: "purpose-campaign" } });
        assert.equal(audit.length, 2); assert.ok(audit.every(row => row.changedFieldNames.join() === "bindingId"));
      });
      await t.test("running or deleted current campaign blocks replacement and candidates expose unavailable current", async () => {
        campaigns.get("second")!.status = "running";
        await reject(savePurposeCampaign(db, scope, "regular", "ELDER_WATCH", payload("purpose-running-current", "existing", 2), reader), "CAMPAIGN_CHANGED");
        const old = campaigns.get("second")!; campaigns.delete("second");
        assert.equal((await purposeCampaignCandidates(db, scope, "regular", "ELDER_WATCH", undefined, reader)).current.available, false);
        await reject(savePurposeCampaign(db, scope, "regular", "ELDER_WATCH", payload("purpose-deleted-current", "existing", 2), reader), "CAMPAIGN_CHANGED");
        campaigns.set("second", { ...old, status: "ready" });
      });
      await t.test("account change during provider reads is detected inside the transaction", async () => {
        const racingReader: CampaignReader = { ...reader, async getCampaign(id) { const result = await reader.getCampaign(id); await db.globalDeveloperApiSetting.update({ where: { id: "global" }, data: { accountId: "changed" } }); return result; } };
        await reject(savePurposeCampaign(db, scope, "one-time", "FRAUD_ALERT", payload("purpose-account-race", "existing"), racingReader), "ACCOUNT_CHANGED");
        assert.equal(await db.outreachPurposeCampaign.count(), 1);
        await db.globalDeveloperApiSetting.update({ where: { id: "global" }, data: { accountId } });
        await reject(savePurposeCampaign(db, scope, "one-time", "FRAUD_ALERT", { ...payload("purpose-wrong-account", "existing"), accountId: "wrong" }, reader), "ACCOUNT_CHANGED");
      });
      await t.test("unique binding and composite site FK are enforced by PostgreSQL", async () => {
        const mapping = await db.outreachPurposeCampaign.findFirstOrThrow();
        await assert.rejects(db.outreachPurposeCampaign.create({ data: { siteKey: "lg", mode: "one-time", purpose: "FRAUD_ALERT", bindingId: mapping.bindingId } }));
        const foreign = await db.zoomResourceBinding.findFirstOrThrow({ where: { zoomId: "foreign" } });
        await assert.rejects(db.outreachPurposeCampaign.create({ data: { siteKey: "lg", mode: "one-time", purpose: "FRAUD_ALERT", bindingId: foreign.id } }));
        await assert.rejects(db.outreachPurposeCampaign.create({ data: { siteKey: "lg", mode: "one-time", purpose: "ELDER_WATCH" } }));
      });
      await t.test("concurrent PUTs to a purpose have one winner and preserve its version", async () => {
        const results = await Promise.allSettled(["race-a", "race-b"].map(id => savePurposeCampaign(db, scope, "regular", "PROCEDURE_SUPPORT", payload(`purpose-${id}`, id), reader)));
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        const loser = results.find(result => result.status === "rejected") as PromiseRejectedResult;
        assert.ok(loser.reason instanceof OutreachContractError); assert.equal(loser.reason.status, 409);
        const mapping = await db.outreachPurposeCampaign.findUniqueOrThrow({ where: { siteKey_mode_purpose: { siteKey: "lg", mode: "regular", purpose: "PROCEDURE_SUPPORT" } } });
        assert.equal(mapping.version, 1);
      });
      await t.test("concurrent purposes cannot claim the same campaign", async () => {
        const results = await Promise.allSettled(["SERVICE_CONFIRMATION", "FRAUD_ALERT"].map(purpose => savePurposeCampaign(db, scope, "regular", purpose, payload(`purpose-shared-${purpose}`, "race-other"), reader)));
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        const binding = await db.zoomResourceBinding.findFirstOrThrow({ where: { zoomId: "race-other" } });
        assert.equal(await db.outreachPurposeCampaign.count({ where: { bindingId: binding.id } }), 1);
      });
    } finally { await context.close(); }
  });
});
