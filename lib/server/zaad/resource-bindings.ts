import type { PrismaClient } from "@/lib/generated/prisma/client";
import { choice, fields, operationKey, record, stringValue, whole, OutreachContractError } from "@/lib/zaad/outreach-contracts";
import { MUNICIPAL_TOPICS } from "@/lib/zaad/municipal/contracts";
import { TOPICS } from "@/lib/zaad/university/contracts";
import { requireFullAccess, requireOutreachDepartment, type OutreachScope } from "./outreach-scope";
import { databaseError, digest, json } from "./outreach-data";
import { writeZaadAudit } from "./audit";
import { ZaadZoomClient } from "./zoom-client";
const RESOURCE_TYPES = ["CONTACT_LIST", "CAMPAIGN", "FLOW", "ASSET"] as const;
type Reader = Pick<ZaadZoomClient, "accountId" | "getContactList" | "getCampaign" | "getFlow" | "getTtsAsset">;

export async function listResourceBindings(db: PrismaClient, scope: OutreachScope, injected?: Reader) {
  requireFullAccess(scope);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const items = await db.zoomResourceBinding.findMany({ where: { ownerSiteKey: scope.siteKey, accountId: client.accountId, tombstone: false, dispatchId: null }, orderBy: [{ resourceType: "asc" }, { zoomId: "asc" }] });
  return { tenantKey: scope.siteKey, accountId: client.accountId, items, total: items.length, nextCursor: null };
}
export async function previewResourceBinding(db: PrismaClient, scope: OutreachScope, payload: unknown, injected?: Reader) {
  requireFullAccess(scope);
  const value = record(payload); fields(value, ["resourceType", "zoomId"]);
  const resourceType = choice(value.resourceType, RESOURCE_TYPES), zoomId = stringValue(value.zoomId);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const binding = await db.zoomResourceBinding.findFirst({ where: { accountId: client.accountId, resourceType, zoomId, ...(resourceType === "CONTACT_LIST" ? { ownerSiteKey: scope.siteKey } : {}) } })
    ?? (resourceType === "CONTACT_LIST" ? await db.zoomResourceBinding.findFirst({ where: { accountId: client.accountId, resourceType, zoomId } }) : null);
  // Reject foreign IDs before retrieving even metadata from the provider.
  if (binding && (binding.ownerSiteKey !== scope.siteKey || binding.tombstone || binding.dispatchId)) throw new OutreachContractError("NOT_FOUND", 404);
  const observed = resourceType === "CONTACT_LIST" ? await client.getContactList(zoomId) : resourceType === "CAMPAIGN" ? await client.getCampaign(zoomId) : resourceType === "FLOW" ? await client.getFlow(zoomId) : await client.getTtsAsset(zoomId);
  if (("id" in observed ? observed.id : observed.assetId) !== zoomId) throw new OutreachContractError("PROVIDER_ID_MISMATCH", 502);
  if (resourceType === "CAMPAIGN" && "dialingMethod" in observed && observed.dialingMethod !== "agentless") throw new OutreachContractError("AGENTLESS_REQUIRED", 409);
  return { tenantKey: scope.siteKey, accountId: client.accountId, resourceType, zoomId, name: "name" in observed ? observed.name : zoomId, observedDigest: digest(observed), version: binding?.version ?? 0, departmentKey: binding?.departmentKey ?? null, notificationTopic: binding?.notificationTopic ?? null, purpose: binding?.purpose ?? "REGULAR", running: "status" in observed && ["running", "unknown"].includes(observed.status) || "alwaysRunning" in observed && observed.alwaysRunning };
}
export async function saveResourceBinding(db: PrismaClient, scope: OutreachScope, payload: unknown, injected?: Reader) {
  requireFullAccess(scope);
  const value = record(payload); fields(value, ["operationKey", "resourceType", "zoomId", "accountId", "observedDigest", "version", "departmentKey", "notificationTopic"]);
  const key = operationKey(value.operationKey), version = whole(value.version, 0), departmentKey = stringValue(value.departmentKey);
  requireOutreachDepartment(scope, departmentKey);
  const notificationTopic = value.notificationTopic == null || value.notificationTopic === "" ? null : choice(value.notificationTopic, scope.siteKey === "lg" ? MUNICIPAL_TOPICS : TOPICS);
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: "RESOURCE_BINDING", operationKey: key }, requestDigest = digest(value);
  const previousOperation = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
  if (previousOperation) {
    if (previousOperation.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
    return { tenantKey: scope.siteKey, result: previousOperation.result };
  }
  const observed = await previewResourceBinding(db, scope, { resourceType: value.resourceType, zoomId: value.zoomId }, injected);
  if (observed.accountId !== value.accountId || observed.observedDigest !== value.observedDigest || observed.version !== version) throw new OutreachContractError("RESOURCE_CHANGED", 409);
  if (observed.running) throw new OutreachContractError("RESOURCE_IN_USE", 409);
  try {
    return await db.$transaction(async tx => {
      const where = { accountId: observed.accountId, resourceType: observed.resourceType, zoomId: observed.zoomId };
      const current = await tx.zoomResourceBinding.findFirst({ where: { ...where, ...(where.resourceType === "CONTACT_LIST" ? { ownerSiteKey: scope.siteKey } : {}) } });
      if (current && (current.ownerSiteKey !== scope.siteKey || current.tombstone || current.dispatchId || current.version !== version)) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
      if (where.resourceType === "CONTACT_LIST" && await tx.outreachDefaultGroup.count({ where: { binding: { accountId: where.accountId, zoomId: where.zoomId } } })) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
      if (!current && version !== 0) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const result = current ? await tx.zoomResourceBinding.update({ where: { id: current.id, version }, data: { departmentKey, notificationTopic, observedDigest: observed.observedDigest, version: { increment: 1 } } }) : await tx.zoomResourceBinding.create({ data: { ...where, ownerSiteKey: scope.siteKey, departmentKey, notificationTopic, observedDigest: observed.observedDigest, purpose: "REGULAR" } });
      await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "COMPLETED", result: json({ id: result.id, version: result.version }) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "resource-binding", targetId: result.id, action: current ? "UPDATE" : "CREATE", result: "SUCCESS", changedFieldNames: ["departmentKey", "notificationTopic", "observedDigest"] });
      return { tenantKey: scope.siteKey, result: { id: result.id, version: result.version } };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
