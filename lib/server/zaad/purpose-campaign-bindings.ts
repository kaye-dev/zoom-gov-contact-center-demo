import type { PrismaClient } from "@/lib/generated/prisma/client";
import { MUNICIPAL_PURPOSES } from "@/lib/zaad/municipal/contracts";
import { purposeCampaignKey, type PurposeBinding, type PurposeCandidates } from "@/lib/zaad/purpose-campaigns";
import { fields, operationKey, OutreachContractError, record, stringValue, whole } from "@/lib/zaad/outreach-contracts";
import { databaseError, digest, json } from "./outreach-data";
import { requireFullAccess, type OutreachScope } from "./outreach-scope";
import { ZaadZoomClient, ZaadZoomError } from "./zoom-client";
import type { CampaignReader } from "./campaign-bindings";
import { writeZaadAudit } from "./audit";

async function currentBinding(db: PrismaClient, scope: OutreachScope, mode: string, purpose: string, client: CampaignReader): Promise<PurposeBinding> {
  const key = purposeCampaignKey(scope.siteKey, mode, purpose);
  const row = await db.outreachPurposeCampaign.findUnique({ where: { siteKey_mode_purpose: key }, include: { binding: true } });
  const binding = row?.binding;
  const result: PurposeBinding = { mode: key.mode, purpose: key.purpose, version: row?.version ?? 0, campaignId: binding?.zoomId ?? null, campaignName: null, accountId: binding?.accountId ?? null, contactListName: null, status: null, available: !binding };
  if (binding && !scope.all && (!binding.departmentKey || !scope.departments.includes(binding.departmentKey))) return { ...result, campaignId: null, accountId: null, available: false };
  if (!binding || binding.tombstone || binding.accountId !== client.accountId || binding.resourceType !== "CAMPAIGN" || binding.purpose !== "REGULAR") return result;
  const observed = await client.getCampaign(binding.zoomId).catch(error => { if (error instanceof ZaadZoomError && error.httpStatus === 404) return null; throw error; });
  if (!observed) return result;
  if (observed.id !== binding.zoomId || observed.dialingMethod !== "agentless") return result;
  return { ...result, campaignName: observed.name, contactListName: observed.contactListName ?? observed.contactListId ?? null, status: observed.status, available: true };
}
export async function listPurposeCampaigns(db: PrismaClient, scope: OutreachScope, reader?: CampaignReader) {
  purposeCampaignKey(scope.siteKey, "regular", "ELDER_WATCH");
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const rows: PurposeBinding[] = [];
  for (const purpose of MUNICIPAL_PURPOSES) rows.push(await currentBinding(db, scope, "regular", purpose, client));
  rows.push(await currentBinding(db, scope, "one-time", "FRAUD_ALERT", client));
  return { tenantKey: scope.siteKey, accountId: client.accountId, rows };
}
export async function purposeCampaignCandidates(db: PrismaClient, scope: OutreachScope, mode: string, purpose: string, cursor?: string, reader?: CampaignReader): Promise<PurposeCandidates> {
  requireFullAccess(scope); const key = purposeCampaignKey(scope.siteKey, mode, purpose);
  if (cursor && cursor.length > 4096) throw new OutreachContractError("INVALID_CURSOR");
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const current = await currentBinding(db, scope, mode, purpose, client);
  const page = await client.listCampaigns({ pageSize: 100, nextPageToken: cursor });
  const bindings = await db.zoomResourceBinding.findMany({ where: { accountId: client.accountId, resourceType: "CAMPAIGN", zoomId: { in: page.campaigns.map(row => row.id) } }, include: { purposeCampaigns: true } });
  const items: PurposeCandidates["items"] = []; let incomplete = false;
  for (const candidate of page.campaigns) {
    const binding = bindings.find(row => row.zoomId === candidate.id);
    let disabledReason: string | null = null;
    if (binding && (binding.ownerSiteKey !== scope.siteKey || binding.tombstone || binding.purpose !== "REGULAR" || binding.dispatchId)) disabledReason = "RESOURCE_OWNERSHIP_CONFLICT";
    if (binding?.purposeCampaigns.some(row => row.mode !== key.mode || row.purpose !== key.purpose)) disabledReason = "PURPOSE_ALREADY_ASSIGNED";
    try {
      const observed = await client.getCampaign(candidate.id);
      if (observed.id !== candidate.id || observed.dialingMethod !== "agentless") disabledReason = "AGENTLESS_REQUIRED";
      if (observed.status === "running") disabledReason = "CAMPAIGN_RUNNING";
      items.push({ id: candidate.id, name: observed.name, selectable: !disabledReason, disabledReason });
    } catch { incomplete = true; items.push({ id: candidate.id, name: candidate.name, selectable: false, disabledReason: "DETAIL_UNAVAILABLE" }); }
  }
  return { tenantKey: scope.siteKey, accountId: client.accountId, revision: current.version, current, items, nextCursor: page.nextPageToken || null, incomplete };
}
export async function purposeCampaignOperation(db: PrismaClient, scope: OutreachScope, key: string) {
  requireFullAccess(scope); purposeCampaignKey(scope.siteKey, "regular", "ELDER_WATCH");
  const previous = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: { siteKey: scope.siteKey, actorId: scope.actorId, kind: "PURPOSE_CAMPAIGN_BIND", operationKey: operationKey(key) } } });
  if (!previous) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, status: previous.status, result: previous.result };
}
export async function savePurposeCampaign(db: PrismaClient, scope: OutreachScope, mode: string, purpose: string, payload: unknown, reader?: CampaignReader) {
  requireFullAccess(scope); const mappingKey = purposeCampaignKey(scope.siteKey, mode, purpose);
  const value = record(payload); fields(value, ["operationKey", "accountId", "revision", "campaignId"]);
  const key = operationKey(value.operationKey), revision = whole(value.revision, 0), campaignId = stringValue(value.campaignId), accountId = stringValue(value.accountId);
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  if (accountId !== client.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: "PURPOSE_CAMPAIGN_BIND", operationKey: key };
  const requestDigest = digest({ ...mappingKey, accountId, revision, campaignId });
  const previous = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
  if (previous) {
    if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
    return { tenantKey: scope.siteKey, status: previous.status, result: previous.result };
  }
  const current = await currentBinding(db, scope, mode, purpose, client);
  if (current.version !== revision) throw new OutreachContractError("VERSION_CONFLICT", 409);
  if (current.campaignId && (!current.available || current.status === "running")) throw new OutreachContractError("CAMPAIGN_CHANGED", 409);
  const observed = await client.getCampaign(campaignId);
  if (observed.id !== campaignId || observed.dialingMethod !== "agentless" || observed.status === "running") throw new OutreachContractError("CAMPAIGN_CHANGED", 409);

  try {
    return await db.$transaction(async tx => {
      const settings = await tx.globalDeveloperApiSetting.findUnique({ where: { id: "global" }, select: { accountId: true } });
      if (settings?.accountId.trim() !== accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
      let binding = await tx.zoomResourceBinding.findFirst({ where: { accountId, resourceType: "CAMPAIGN", zoomId: campaignId } });
      if (binding && (binding.ownerSiteKey !== scope.siteKey || binding.purpose !== "REGULAR" || binding.tombstone || binding.dispatchId)) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
      if (!binding) binding = await tx.zoomResourceBinding.create({ data: { accountId, resourceType: "CAMPAIGN", zoomId: campaignId, ownerSiteKey: scope.siteKey, purpose: "REGULAR", observedDigest: digest(observed) } });
      const assigned = await tx.outreachPurposeCampaign.findUnique({ where: { bindingId: binding.id } });
      if (assigned && (assigned.siteKey !== scope.siteKey || assigned.mode !== mode || assigned.purpose !== purpose)) throw new OutreachContractError("PURPOSE_ALREADY_ASSIGNED", 409);
      const existing = await tx.outreachPurposeCampaign.findUnique({ where: { siteKey_mode_purpose: mappingKey }, include: { binding: true } });
      if (existing?.binding && (existing.binding.tombstone || existing.binding.accountId !== accountId || existing.binding.purpose !== "REGULAR" || existing.binding.dispatchId)) throw new OutreachContractError("CAMPAIGN_CHANGED", 409);
      if ((existing?.version ?? 0) !== revision) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const mapping = existing ? await tx.outreachPurposeCampaign.update({ where: { id: existing.id }, data: { bindingId: binding.id, version: { increment: 1 } } }) : await tx.outreachPurposeCampaign.create({ data: { ...mappingKey, bindingId: binding.id } });
      const result = { mode, purpose, campaignId, campaignName: observed.name, accountId, version: mapping.version };
      await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "COMPLETED", result: json(result) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "purpose-campaign", targetId: mapping.id, action: existing ? "UPDATE" : "CREATE", result: "SUCCESS", changedFieldNames: ["bindingId"] });
      return { tenantKey: scope.siteKey, status: "COMPLETED", result };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
