import type { PrismaClient } from "@/lib/generated/prisma/client";
import { fields, operationKey, OutreachContractError, record, stringList, stringValue } from "@/lib/zaad/outreach-contracts";
import { requireFullAccess, type OutreachScope } from "./outreach-scope";
import { ZaadZoomClient, type ZoomContactListDto } from "./zoom-client";
import { databaseError, digest, json } from "./outreach-data";
import { writeZaadAudit } from "./audit";

export type ContactListReader = Pick<ZaadZoomClient, "accountId" | "listContactLists" | "getContactList">;
export type GroupSyncCandidate = ZoomContactListDto & { added: boolean; selectable: boolean };

// Reading the candidate inventory is part of the privileged sync operation, not ordinary group browsing.
export async function groupSyncCandidates(db: PrismaClient, scope: OutreachScope, reader?: ContactListReader, cursor?: string) {
  requireFullAccess(scope);
  if (cursor && cursor.length > 4096) throw new OutreachContractError("INVALID_CURSOR");
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const result = await client.listContactLists({ pageSize: 100, nextPageToken: cursor });
  const lists = [...new Map(result.lists.map(row => [row.id, row])).values()];
  const bindings = await db.zoomResourceBinding.findMany({
    where: { accountId: client.accountId, resourceType: "CONTACT_LIST", zoomId: { in: lists.map(row => row.id) } },
  });
  const items: GroupSyncCandidate[] = [];
  for (const list of lists) {
    // Internally generated dispatch resources are not regular groups, even in the other site.
    if (bindings.some(row => row.zoomId === list.id && (row.dispatchId !== null || row.purpose !== "REGULAR"))) continue;
    const added = bindings.some(row => row.zoomId === list.id && row.ownerSiteKey === scope.siteKey && !row.tombstone);
    items.push({ ...list, added, selectable: !added });
  }
  return { tenantKey: scope.siteKey, accountId: client.accountId, items, total: null, nextCursor: result.nextPageToken, observedAt: new Date().toISOString() };
}

export async function syncContactLists(db: PrismaClient, scope: OutreachScope, payload: unknown, reader?: ContactListReader) {
  requireFullAccess(scope);
  const value = record(payload);
  fields(value, ["operationKey", "accountId", "contactListIds"]);
  const key = operationKey(value.operationKey), accountId = stringValue(value.accountId), ids = stringList(value.contactListIds, 100).sort();
  if (!ids.length) throw new OutreachContractError("EMPTY_SELECTION");
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  if (accountId !== client.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: "CONTACT_LIST_SYNC", operationKey: key };
  const requestDigest = digest({ accountId, ids });
  const previous = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
  if (previous) {
    if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
    return { tenantKey: scope.siteKey, operationKey: key, status: previous.status, result: previous.result };
  }
  const observed: ZoomContactListDto[] = [];
  for (const id of ids) {
    const list = await client.getContactList(id);
    if (list.id !== id || list.type !== "contact") throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
    observed.push(list);
  }
  // Re-read ownership inside the serializable transaction: no provider mutations or CRM imports here.
  try {
    return await db.$transaction(async tx => {
      const settings = await tx.siteDeveloperApiSetting.findUnique({ where: { siteKey: scope.siteKey }, select: { accountId: true } });
      if (settings?.accountId.trim() !== accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
      const currentOperation = await tx.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
      if (currentOperation) {
        if (currentOperation.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
        return { tenantKey: scope.siteKey, operationKey: key, status: currentOperation.status, result: currentOperation.result };
      }
      const bindings = await tx.zoomResourceBinding.findMany({ where: { accountId, resourceType: "CONTACT_LIST", zoomId: { in: ids } } });
      for (const list of observed) {
        if (bindings.some(row => row.zoomId === list.id && (row.dispatchId !== null || row.purpose !== "REGULAR"))) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
        const existing = bindings.find(row => row.zoomId === list.id && row.ownerSiteKey === scope.siteKey);
        if (!existing) {
          await tx.zoomResourceBinding.create({ data: { accountId, resourceType: "CONTACT_LIST", zoomId: list.id, ownerSiteKey: scope.siteKey, departmentKey: null, purpose: "REGULAR", observedDigest: digest(list) } });
        } else if (existing.tombstone) {
          // Restore the same binding so local memberships remain intact after detach/re-add.
          await tx.zoomResourceBinding.update({ where: { id: existing.id, version: existing.version }, data: { tombstone: false, observedDigest: digest(list), version: { increment: 1 } } });
        }
      }
      const operation = await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "COMPLETED", result: json({ accountId, contactListIds: ids }) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "resource-binding", targetId: operation.id, action: "CREATE", result: "SUCCESS", changedFieldNames: ["bindings"] });
      return { tenantKey: scope.siteKey, operationKey: key, status: operation.status, result: operation.result };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}

export async function groupSyncOperation(db: PrismaClient, scope: OutreachScope, key: string) {
  requireFullAccess(scope);
  const result = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: { siteKey: scope.siteKey, actorId: scope.actorId, kind: "CONTACT_LIST_SYNC", operationKey: operationKey(key) } } });
  if (!result) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, status: result.status, result: result.result };
}
