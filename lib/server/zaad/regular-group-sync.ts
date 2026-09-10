import type { PrismaClient } from "@/lib/generated/prisma/client";
import { fields, operationKey, OutreachContractError, record, stringList, whole, type PersonOrigin } from "@/lib/zaad/outreach-contracts";
import type { GroupSyncResult } from "@/lib/zaad/default-groups";
import { getContact } from "./contacts";
import { digest, databaseError } from "./outreach-data";
import type { OutreachScope } from "./outreach-scope";
import { groupMutationBlock, requireZoomBinding, zoomGroupMembers, type GroupClient } from "./zoom-groups";
import { ZaadZoomClient, ZaadZoomError } from "./zoom-client";

export async function regularSyncOperation(db: PrismaClient, scope: OutreachScope, id: string, injected?: GroupClient): Promise<GroupSyncResult> {
  const op = await db.outreachGroupSyncOperation.findFirst({ where: { id, siteKey: scope.siteKey, actorId: scope.actorId, groupKind: "REGULAR" }, include: { items: true } });
  if (!op) throw new OutreachContractError("NOT_FOUND", 404);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const binding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", op.groupId);
  if (binding.purpose !== "REGULAR" || binding.dispatchId || await db.outreachDefaultGroup.count({ where: { bindingId: binding.id } })) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
  return { tenantKey: scope.siteKey, operationId: id, status: op.status, counts: { total: op.items.length, pending: op.items.filter(i => ["PENDING", "RUNNING"].includes(i.status)).length, synced: op.items.filter(i => i.status === "SYNCED").length, failed: op.items.filter(i => !["PENDING", "RUNNING", "SYNCED"].includes(i.status)).length } };
}
export async function startRegularGroupSync(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown, injected?: GroupClient) {
  const value = record(payload); fields(value, ["operationKey", "revision", "memberIds"]);
  const key = operationKey(value.operationKey), revision = whole(value.revision), selected = value.memberIds === undefined ? null : stringList(value.memberIds, 1000).sort();
  if (selected && !selected.length) throw new OutreachContractError("EMPTY_SELECTION");
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, operationKey: key }, requestDigest = digest({ kind: "REGULAR", id, revision, selected });
  const prior = await db.outreachGroupSyncOperation.findUnique({ where: { siteKey_actorId_operationKey: unique } });
  if (prior) { if (prior.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409); return regularSyncOperation(db, scope, prior.id, injected); }
  const data = await zoomGroupMembers(db, scope, id, injected);
  if (data.group.version !== revision) throw new OutreachContractError("VERSION_CONFLICT", 409);
  const members = data.items.filter(m => m.mapping?.personId && (selected ? selected.includes(m.mapping.id) : m.syncStatus !== "SYNCED"));
  if (selected && members.length !== new Set(selected).size) throw new OutreachContractError("NOT_FOUND", 404);
  try {
    const op = await db.outreachGroupSyncOperation.create({ data: { ...unique, requestDigest, groupKind: "REGULAR", groupId: id, revision, status: members.length ? "PENDING" : "COMPLETED", items: { create: members.map(m => ({ membershipId: m.mapping!.id, version: m.mapping!.version })) } } });
    return regularSyncOperation(db, scope, op.id, injected);
  } catch (error) {
    const raced = await db.outreachGroupSyncOperation.findUnique({ where: { siteKey_actorId_operationKey: unique } });
    if (raced?.requestDigest === requestDigest) return regularSyncOperation(db, scope, raced.id, injected);
    databaseError(error);
  }
}
export async function advanceRegularSync(db: PrismaClient, scope: OutreachScope, id: string, injected?: GroupClient) {
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  await regularSyncOperation(db, scope, id, client);
  await db.outreachGroupSyncItem.updateMany({ where: { operationId: id, status: "RUNNING", claimedAt: { lt: new Date(Date.now() - 300_000) } }, data: { status: "UNKNOWN", errorCode: "PROVIDER_RESULT_REQUIRES_RECONCILIATION" } });
  const op = await db.outreachGroupSyncOperation.findUniqueOrThrow({ where: { id }, include: { items: { where: { status: "PENDING" }, take: 20, orderBy: { id: "asc" } } } });
  const deadline = Date.now() + 20_000;
  for (const item of op.items) {
    if (Date.now() >= deadline) break;
    const claim = await db.outreachGroupSyncItem.updateMany({ where: { id: item.id, status: "PENDING" }, data: { status: "RUNNING", claimedAt: new Date() } });
    if (!claim.count) continue;
    let claimed = false, attempted = false, result = "FAILED", errorCode: string | null = null;
    try {
      const binding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", op.groupId);
      if (binding.version !== op.revision || binding.purpose !== "REGULAR" || binding.dispatchId || await db.outreachDefaultGroup.count({ where: { bindingId: binding.id } })) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const member = await db.zoomContactMembership.findFirst({ where: { id: item.membershipId, siteKey: scope.siteKey, bindingId: binding.id, version: item.version } });
      if (!member?.personId || !member.personOrigin) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const source = await getContact(db, scope, member.personOrigin as PersonOrigin, member.personId);
      if (source.departmentKey !== binding.departmentKey || ["WITHDRAWN", "REJECTED", "NOT_CONSENTED"].includes(source.status)) throw new OutreachContractError("CONSENT_WITHDRAWN", 409);
      if (member.syncState === "SYNCING") throw new OutreachContractError("PROVIDER_RESULT_REQUIRES_RECONCILIATION", 409);
      const recentRateLimit = await db.outreachGroupSyncItem.count({ where: { membershipId: member.id, errorCode: "ZAAD_ZOOM_RATE_LIMITED", claimedAt: { gt: new Date(Date.now() - 60_000) } } });
      if (recentRateLimit) throw new OutreachContractError("RATE_LIMITED", 429);
      const locked = await db.zoomContactMembership.updateMany({ where: { id: member.id, version: item.version, syncState: member.syncState }, data: { syncState: "SYNCING", version: { increment: 1 } } });
      if (!locked.count) throw new OutreachContractError("VERSION_CONFLICT", 409);
      claimed = true;
      const block = await groupMutationBlock(client, op.groupId);
      if (block) throw new OutreachContractError(block, 409);
      const observed = (await client.listContacts(op.groupId)).find(c => c.id === member.zoomContactId);
      if (!observed) throw new OutreachContractError("PROVIDER_RESULT_REQUIRES_RECONCILIATION", 409);
      const matches = observed.displayName === source.name && observed.phones.some(p => p.number === source.phone);
      if (digest(observed) !== member.observedDigest && !matches) throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
      const fresh = await getContact(db, scope, member.personOrigin as PersonOrigin, member.personId);
      const settings = await db.globalDeveloperApiSetting.findUnique({ where: { id: "global" } });
      const current = await requireZoomBinding(db, scope, client, "CONTACT_LIST", op.groupId);
      if (fresh.version !== source.version || current.version !== op.revision || settings?.accountId.trim() !== client.accountId) throw new OutreachContractError("VERSION_CONFLICT", 409);
      if (!matches) { attempted = true; await client.updateContact(op.groupId, member.zoomContactId, { name: source.name, phone: source.phone, email: observed.emails[0] ?? "" }); }
      const readback = (await client.listContacts(op.groupId)).find(c => c.id === member.zoomContactId);
      if (!readback || readback.displayName !== source.name || !readback.phones.some(p => p.number === source.phone)) throw new OutreachContractError("PROVIDER_READBACK_MISMATCH", 409);
      const finalSource = await getContact(db, scope, member.personOrigin as PersonOrigin, member.personId);
      const finalBinding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", op.groupId);
      const finalSettings = await db.globalDeveloperApiSetting.findUnique({ where: { id: "global" } });
      if (finalSource.version !== source.version || finalBinding.version !== op.revision || finalSettings?.accountId.trim() !== client.accountId) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const saved = await db.zoomContactMembership.updateMany({ where: { id: member.id, version: item.version + 1, syncState: "SYNCING" }, data: { syncState: "LINKED", observedDigest: digest(readback), lastSyncedVersion: source.version, version: { increment: 1 } } });
      if (!saved.count) throw new OutreachContractError("VERSION_CONFLICT", 409);
      result = "SYNCED";
    } catch (error) {
      errorCode = error instanceof OutreachContractError || error instanceof ZaadZoomError ? error.code : "SERVICE_UNAVAILABLE";
      const definite = error instanceof ZaadZoomError && !error.resultUnknown && [400, 401, 403, 404, 429].includes(error.httpStatus);
      result = attempted && !definite || errorCode === "PROVIDER_RESULT_REQUIRES_RECONCILIATION" ? "UNKNOWN" : errorCode === "PROVIDER_RESOURCE_CHANGED" ? "DIFFERENCE" : "FAILED";
      if (claimed) await db.zoomContactMembership.updateMany({ where: { id: item.membershipId, version: item.version + 1, syncState: "SYNCING" }, data: { syncState: result, version: { increment: 1 } } });
    }
    await db.outreachGroupSyncItem.updateMany({ where: { id: item.id, status: "RUNNING" }, data: { status: result, errorCode } });
  }
  if (!await db.outreachGroupSyncItem.count({ where: { operationId: id, status: { in: ["PENDING", "RUNNING"] } } })) {
    const failures = await db.outreachGroupSyncItem.count({ where: { operationId: id, status: { not: "SYNCED" } } });
    await db.outreachGroupSyncOperation.update({ where: { id }, data: { status: failures ? "PARTIAL" : "COMPLETED" } });
  }
  return regularSyncOperation(db, scope, id, client);
}
