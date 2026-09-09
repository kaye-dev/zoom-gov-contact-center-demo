import type { PrismaClient } from "@/lib/generated/prisma/client";
import { fields, operationKey, OutreachContractError, record, stringList, whole } from "@/lib/zaad/outreach-contracts";
import { databaseError, digest, json } from "./outreach-data";
import { requireFullAccess, type OutreachScope } from "./outreach-scope";
import { ZaadZoomClient, type ZoomCampaignDto } from "./zoom-client";
import { writeZaadAudit } from "./audit";
export type CampaignReader = Pick<ZaadZoomClient, "accountId" | "listCampaigns" | "getCampaign">;
export async function allCampaigns(client: CampaignReader) {
  const items = new Map<string, ZoomCampaignDto>(), seen = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await client.listCampaigns({ pageSize: 100, nextPageToken: token });
    for (const candidate of result.campaigns) items.set(candidate.id, candidate);
    if (!result.nextPageToken) return [...items.values()];
    if (seen.has(result.nextPageToken)) throw new OutreachContractError("PROVIDER_PAGINATION_LOOP", 502);
    seen.add(result.nextPageToken); token = result.nextPageToken;
  }
  throw new OutreachContractError("PROVIDER_PAGINATION_LIMIT", 502);
}
export async function campaignSyncCandidates(db: PrismaClient, scope: OutreachScope, reader?: CampaignReader, cursor?: string) {
  requireFullAccess(scope);
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  if (cursor && cursor.length > 4096) throw new OutreachContractError("INVALID_CURSOR");
  const page = await client.listCampaigns({ pageSize: 100, nextPageToken: cursor });
  const campaigns = [...new Map(page.campaigns.map(row => [row.id, row])).values()];
  const bindings = await db.zoomResourceBinding.findMany({ where: { accountId: client.accountId, resourceType: "CAMPAIGN", zoomId: { in: campaigns.map(row => row.id) } } });
  const items = [];
  let incomplete = false;
  for (const candidate of campaigns) {
    const binding = bindings.find(row => row.zoomId === candidate.id);
    if (binding && (binding.ownerSiteKey !== scope.siteKey || binding.purpose !== "REGULAR" || binding.tombstone)) continue;
    let observed: ZoomCampaignDto;
    try { observed = await client.getCampaign(candidate.id); }
    catch {
      incomplete = true;
      items.push({ id: candidate.id, name: candidate.name, dialingMethod: "unknown", status: candidate.status, added: Boolean(binding), selectable: false, disabledReason: "DETAIL_UNAVAILABLE" });
      continue;
    }
    if (observed.id !== candidate.id) throw new OutreachContractError("PROVIDER_ID_MISMATCH", 502);
    const added = Boolean(binding);
    items.push({ id: observed.id, name: observed.name, dialingMethod: observed.dialingMethod, status: observed.status, added, selectable: !added && observed.dialingMethod === "agentless", disabledReason: added ? "ALREADY_ADDED" : observed.dialingMethod !== "agentless" ? "AGENTLESS_REQUIRED" : null });
  }
  return { tenantKey: scope.siteKey, accountId: client.accountId, items, total: null, nextCursor: page.nextPageToken || null, incomplete, observedAt: new Date().toISOString() };
}
export async function bindCampaigns(db: PrismaClient, scope: OutreachScope, payload: unknown, reader?: CampaignReader) {
  requireFullAccess(scope);
  const value = record(payload); fields(value, ["operationKey", "campaignIds"]);
  const key = operationKey(value.operationKey), ids = stringList(value.campaignIds, 100).sort();
  if (!ids.length) throw new OutreachContractError("EMPTY_SELECTION");
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const requestDigest = digest({ accountId: client.accountId, ids });
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: "CAMPAIGN_SYNC", operationKey: key };
  const previous = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
  if (previous) {
    if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
    return { tenantKey: scope.siteKey, operationKey: key, status: previous.status, result: previous.result };
  }
  const observed: ZoomCampaignDto[] = [];
  for (const id of ids) {
    const campaign = await client.getCampaign(id);
    if (campaign.id !== id || campaign.dialingMethod !== "agentless") throw new OutreachContractError("CAMPAIGN_CHANGED", 409);
    observed.push(campaign);
  }
  try {
    return await db.$transaction(async tx => {
      for (const campaign of observed) {
        const where = { accountId: client.accountId, resourceType: "CAMPAIGN", zoomId: campaign.id };
        const binding = await tx.zoomResourceBinding.findUnique({ where: { accountId_resourceType_zoomId: where } });
        if (binding && (binding.ownerSiteKey !== scope.siteKey || binding.purpose !== "REGULAR" || binding.tombstone)) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
        if (!binding) await tx.zoomResourceBinding.create({ data: { ...where, ownerSiteKey: scope.siteKey, purpose: "REGULAR", observedDigest: digest(campaign) } });
      }
      const operation = await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "COMPLETED", result: json({ campaignIds: ids, accountId: client.accountId }) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "campaign-binding", targetId: operation.id, action: "CREATE", result: "SUCCESS", changedFieldNames: ["bindings"] });
      return { tenantKey: scope.siteKey, operationKey: key, status: operation.status, result: operation.result };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
export async function campaignSyncOperation(db: PrismaClient, scope: OutreachScope, key: string) {
  requireFullAccess(scope);
  const result = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: { siteKey: scope.siteKey, actorId: scope.actorId, kind: "CAMPAIGN_SYNC", operationKey: operationKey(key) } } });
  if (!result) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, status: result.status, result: result.result };
}
export async function listRegularCampaigns(db: PrismaClient, scope: OutreachScope, reader?: CampaignReader) {
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const bindings = await db.zoomResourceBinding.findMany({ where: { ownerSiteKey: scope.siteKey, accountId: client.accountId, resourceType: "CAMPAIGN", purpose: "REGULAR", tombstone: false, ...(!scope.all ? { departmentKey: { in: scope.departments } } : {}) }, orderBy: { id: "asc" } });
  const items = [];
  for (const binding of bindings) {
    const observed = await client.getCampaign(binding.zoomId);
    if (observed.id !== binding.zoomId || observed.dialingMethod !== "agentless") throw new OutreachContractError("CAMPAIGN_CHANGED", 409);
    items.push({ ...observed, bindingId: binding.id, bindingVersion: binding.version, departmentKey: binding.departmentKey, notificationTopic: binding.notificationTopic, executionReady: false, disabledReason: "LIVE_CONTRACT_NOT_VERIFIED" });
  }
  return { tenantKey: scope.siteKey, items, total: items.length, nextCursor: null, observedAt: new Date().toISOString() };
}

export async function getRegularCampaign(db: PrismaClient, scope: OutreachScope, id: string, reader?: CampaignReader) {
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const binding = await db.zoomResourceBinding.findFirst({ where: { ownerSiteKey: scope.siteKey, accountId: client.accountId, resourceType: "CAMPAIGN", zoomId: id, purpose: "REGULAR", tombstone: false, ...(!scope.all ? { departmentKey: { in: scope.departments } } : {}) } });
  if (!binding) throw new OutreachContractError("NOT_FOUND", 404);
  const campaign = await client.getCampaign(id);
  if (campaign.id !== id || campaign.dialingMethod !== "agentless") throw new OutreachContractError("CAMPAIGN_CHANGED", 409);
  return { tenantKey: scope.siteKey, campaign: { ...campaign, bindingId: binding.id, bindingVersion: binding.version, departmentKey: binding.departmentKey, notificationTopic: binding.notificationTopic, executionReady: false, pauseReady: scope.live && process.env.ZAAD_ZOOM_CAMPAIGN_WRITE_CONTRACT_CONFIRMED === "1" } };
}
export async function pauseRegularCampaign(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown, injected?: CampaignReader & Pick<ZaadZoomClient, "setCampaignStatus">) {
  const value = record(payload); fields(value, ["operationKey", "status", "version", "expectedRevision"]);
  const key = operationKey(value.operationKey);
  if (!scope.live) throw new OutreachContractError("LIVE_DISABLED", 403);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const { campaign } = await getRegularCampaign(db, scope, id, client);
  if (value.status !== "Paused") throw new OutreachContractError("LIVE_CONTRACT_NOT_VERIFIED", 409);
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: "CAMPAIGN_PAUSE", operationKey: key }, requestDigest = digest({ ...value, id, accountId: client.accountId });
  const previous = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
  if (previous) {
    if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
    if (previous.status !== "COMPLETED") throw new OutreachContractError("STOP_RESULT_UNKNOWN", 409);
    return { tenantKey: scope.siteKey, campaign, connectedCalls: "UNKNOWN" };
  }
  if (whole(value.version) !== campaign.bindingVersion || value.expectedRevision !== campaign.revision) throw new OutreachContractError("CAMPAIGN_CHANGED", 409);
  if (!["running", "paused"].includes(campaign.status)) throw new OutreachContractError("CAMPAIGN_STATE_CONFLICT", 409);
  const operation = await db.outreachOperation.create({ data: { ...unique, requestDigest } });
  try {
    if (campaign.status !== "paused") await client.setCampaignStatus(id, "Paused");
    const observed = await client.getCampaign(id);
    if (observed.id !== id || observed.status !== "paused") throw new OutreachContractError("STOP_RESULT_UNKNOWN", 409);
    await db.$transaction(async tx => {
      const changed = await tx.zoomResourceBinding.updateMany({ where: { id: campaign.bindingId, ownerSiteKey: scope.siteKey, version: campaign.bindingVersion }, data: { observedDigest: digest(observed), version: { increment: 1 } } });
      if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
      await tx.outreachOperation.update({ where: { id: operation.id }, data: { status: "COMPLETED", result: json({ id, status: observed.status, connectedCalls: "UNKNOWN" }) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "campaign", targetId: id, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["status"] });
    });
    return { tenantKey: scope.siteKey, campaign: observed, connectedCalls: "UNKNOWN" };
  } catch (error) {
    await db.outreachOperation.update({ where: { id: operation.id }, data: { status: "UNKNOWN" } });
    throw error;
  }
}
