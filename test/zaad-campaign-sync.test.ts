import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../lib/generated/prisma/client";
import { allCampaigns, campaignSyncCandidates, type CampaignReader } from "../lib/server/zaad/campaign-bindings";
import type { OutreachScope } from "../lib/server/zaad/outreach-scope";
import { OutreachContractError } from "../lib/zaad/outreach-contracts";
import type { ZoomCampaignDto } from "../lib/server/zaad/zoom-client";

const scope: OutreachScope = { siteKey: "lg", actorId: "actor", all: true, live: false };
const campaign = (id: string, dialingMethod = "agentless") => ({ id, name: `Campaign ${id}`, dialingMethod, status: "ready" }) as ZoomCampaignDto;
test("sync excludes foreign and one-time bindings and keeps existing or non-agentless campaigns disabled", async () => {
  const rows = [campaign("new"), campaign("existing"), campaign("foreign"), campaign("one-time"), campaign("agent", "progressive")];
  const bindings = [{ zoomId: "existing", ownerSiteKey: "lg", purpose: "REGULAR", tombstone: false }, { zoomId: "foreign", ownerSiteKey: "univ", purpose: "REGULAR", tombstone: false }, { zoomId: "one-time", ownerSiteKey: "lg", purpose: "ONE_TIME", tombstone: false }];
  const db = { zoomResourceBinding: { async findMany() { return bindings; } } } as unknown as PrismaClient;
  let detailReads = 0;
  const reader = { accountId: "account", async listCampaigns() { return { campaigns: rows, nextPageToken: null }; }, async getCampaign(id: string) { detailReads++; return rows.find(row => row.id === id)!; } } as CampaignReader;
  const result = await campaignSyncCandidates(db, scope, reader);
  assert.deepEqual(result.items.map(row => [row.id, row.selectable, row.disabledReason]), [["new", true, null], ["existing", false, "ALREADY_ADDED"], ["agent", false, "AGENTLESS_REQUIRED"]]);
  assert.equal(detailReads, 3);
  await assert.rejects(campaignSyncCandidates(db, { ...scope, all: false }, reader));
  assert.equal(detailReads, 3);
});
test("campaign inventory follows pagination and rejects a repeated cursor", async () => {
  let count = 0;
  const reader = { accountId: "account", async listCampaigns() { count++; return { campaigns: [campaign(String(count))], nextPageToken: "repeated" }; } } as CampaignReader;
  await assert.rejects(allCampaigns(reader), error => error instanceof OutreachContractError && error.code === "PROVIDER_PAGINATION_LOOP");
  assert.equal(count, 2);
});

test("sync exposes a resumable provider page without losing verified rows on a detail failure", async () => {
  const db = { zoomResourceBinding: { async findMany() { return []; } } } as unknown as PrismaClient;
  const calls: Array<string | undefined> = [];
  let detailFails = true;
  const reader = { accountId: "account", async listCampaigns(input: { nextPageToken?: string }) { calls.push(input.nextPageToken); return { campaigns: [campaign("good"), campaign("retry")], nextPageToken: "page-3" }; }, async getCampaign(id: string) { if (id === "retry" && detailFails) throw new Error("provider unavailable"); return campaign(id); } } as CampaignReader;
  const partial = await campaignSyncCandidates(db, scope, reader, "page-2");
  assert.equal(partial.incomplete, true);
  assert.equal(partial.total, null);
  assert.equal(partial.nextCursor, "page-3");
  assert.deepEqual(partial.items.map(row => [row.id, row.selectable, row.disabledReason]), [["good", true, null], ["retry", false, "DETAIL_UNAVAILABLE"]]);
  detailFails = false;
  const retried = await campaignSyncCandidates(db, scope, reader, "page-2");
  assert.equal(retried.incomplete, false);
  assert.deepEqual(retried.items.map(row => row.selectable), [true, true]);
  assert.deepEqual(calls, ["page-2", "page-2"]);
});
