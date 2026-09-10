import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../lib/generated/prisma/client";
import { purposeCampaignKey, type PurposeCandidates } from "../lib/zaad/purpose-campaigns";
import { purposeCampaignCandidates, savePurposeCampaign } from "../lib/server/zaad/purpose-campaign-bindings";
import { loadPurposeCampaignCandidates } from "../app/admin/zaad/outreach-purpose-client";
import type { outreachRequest } from "../app/admin/zaad/outreach-client";
import type { CampaignReader } from "../lib/server/zaad/campaign-bindings";
import type { OutreachScope } from "../lib/server/zaad/outreach-scope";
import type { ZoomCampaignDto } from "../lib/server/zaad/zoom-client";
const scope: OutreachScope = { siteKey: "lg", actorId: "fixture", departments: ["resident-support"], all: true, live: false };
const campaign = (id: string) => ({ id, name: id, dialingMethod: id === "agent" ? "progressive" : "agentless", status: id === "running" ? "running" : "ready" }) as ZoomCampaignDto;
test("PURPOSE-02: only municipal regular purposes and one-time fraud are accepted", async () => {
  for (const purpose of ["ELDER_WATCH", "PROCEDURE_SUPPORT", "SERVICE_CONFIRMATION", "FRAUD_ALERT"]) assert.equal(purposeCampaignKey("lg", "regular", purpose).purpose, purpose);
  assert.equal(purposeCampaignKey("lg", "one-time", "FRAUD_ALERT").mode, "one-time");
  for (const args of [["univ", "regular", "ELDER_WATCH"], ["lg", "one-time", "ELDER_WATCH"], ["lg", "bad", "FRAUD_ALERT"], ["lg", "regular", "bad"]]) assert.throws(() => purposeCampaignKey(...args as [string, string, string]));
  await assert.rejects(purposeCampaignCandidates({} as PrismaClient, { ...scope, all: false }, "regular", "ELDER_WATCH"), /FULL_ACCESS_REQUIRED/);
  await assert.rejects(savePurposeCampaign({} as PrismaClient, { ...scope, all: false }, "regular", "ELDER_WATCH", {}), /FULL_ACCESS_REQUIRED/);
});
test("PURPOSE-02: candidates reject foreign, internal, assigned, non-agentless and running campaigns", async () => {
  const ids = ["new", "regular", "foreign", "internal", "assigned", "agent", "running", "failure"];
  const db = { outreachPurposeCampaign: { async findUnique() { return null; } }, zoomResourceBinding: { async findMany() { return [
    { zoomId: "regular", ownerSiteKey: "lg", purpose: "REGULAR", tombstone: false, purposeCampaigns: [] },
    { zoomId: "foreign", ownerSiteKey: "univ", purpose: "REGULAR", tombstone: false, purposeCampaigns: [] },
    { zoomId: "internal", ownerSiteKey: "lg", purpose: "ONE_TIME", tombstone: false, purposeCampaigns: [] },
    { zoomId: "assigned", ownerSiteKey: "lg", purpose: "REGULAR", tombstone: false, purposeCampaigns: [{ mode: "one-time", purpose: "FRAUD_ALERT" }] },
  ]; } } } as unknown as PrismaClient;
  const reader = { accountId: "fixture-account", async listCampaigns() { return { campaigns: ids.map(campaign), nextPageToken: "next" }; }, async getCampaign(id: string) { if (id === "failure") throw new Error("Unavailable"); return campaign(id); } } as CampaignReader;
  const result = await purposeCampaignCandidates(db, scope, "regular", "ELDER_WATCH", undefined, reader);
  assert.equal(result.revision, 0); assert.equal(result.nextCursor, "next"); assert.equal(result.incomplete, true);
  assert.deepEqual(result.items.map(item => [item.id, item.selectable]), ids.map(id => [id, ["new", "regular"].includes(id)]));
});
test("PURPOSE-02: all candidate pages must complete with matching account and revision", async () => {
  const first = { tenantKey: "lg", accountId: "fixture-account", revision: 0, current: {}, items: [{ id: "one", name: "One", selectable: true, disabledReason: null }], nextCursor: "two", incomplete: false } as PurposeCandidates;
  for (const failure of ["account", "revision", "partial", "loop", "network", "none"]) {
    let calls = 0;
    const request = (async () => {
      calls++;
      if (calls === 1) return first;
      if (failure === "network") throw new Error("Unavailable");
      return { ...first, accountId: failure === "account" ? "changed" : first.accountId, revision: failure === "revision" ? 1 : 0, incomplete: failure === "partial", items: [{ ...first.items[0], id: "two" }], nextCursor: failure === "loop" ? "two" : null };
    }) as typeof outreachRequest;
    const promise = loadPurposeCampaignCandidates("lg", "purpose-campaigns/regular/ELDER_WATCH", new AbortController().signal, request);
    if (failure === "none") assert.deepEqual((await promise).items.map(item => item.id), ["one", "two"]);
    else await assert.rejects(promise);
    assert.equal(calls, 2);
  }
});
