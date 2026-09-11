import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { DEFAULT_GROUP_TOPICS, defaultGroupId, type DefaultGroupDto, type RegistrationOrigin, type DefaultGroupCandidate, type DefaultGroupCandidatesResponse } from "@/lib/zaad/default-groups";
import type { TenantKey } from "@/lib/tenants";
import { fields, operationKey, OutreachContractError, record, stringValue, whole } from "@/lib/zaad/outreach-contracts";
import { requireFullAccess, type OutreachScope } from "./outreach-scope";
import { databaseError, digest, json } from "./outreach-data";
import { writeZaadAudit } from "./audit";
import { ZaadZoomClient, ZaadZoomError } from "./zoom-client";
import { listZoomGroups } from "./zoom-groups";

type Database = Prisma.TransactionClient;
export async function ensureDefaultGroups(db: Database, siteKey: TenantKey) {
  await db.outreachDefaultGroup.createMany({ data: DEFAULT_GROUP_TOPICS[siteKey].map(topicKey => ({ id: defaultGroupId(siteKey, topicKey), siteKey, topicKey })), skipDuplicates: true });
}
export async function addRegistrationMemberships(db: Database, siteKey: TenantKey, origin: RegistrationOrigin, sourceId: string, topics: readonly string[]) {
  const expectedSite = origin === "UNIVERSITY_REGISTRATION" ? "univ" : "lg";
  if (siteKey !== expectedSite || topics.some(topic => !(DEFAULT_GROUP_TOPICS[siteKey] as readonly string[]).includes(topic))) throw new OutreachContractError("INVALID_REQUEST");
  await ensureDefaultGroups(db, siteKey);
  await db.outreachRegistrationMembership.createMany({ data: [...new Set(topics)].map(topic => ({ siteKey, defaultGroupId: defaultGroupId(siteKey, topic), origin, sourceId })), skipDuplicates: true });
}
export async function requireDefaultGroup(db: Database, scope: OutreachScope, id: string) {
  requireFullAccess(scope);
  const group = await db.outreachDefaultGroup.findFirst({ where: { id, siteKey: scope.siteKey }, include: { binding: true } });
  if (!group) throw new OutreachContractError("NOT_FOUND", 404);
  return group;
}
export async function defaultGroupDto(db: Database, group: Awaited<ReturnType<typeof requireDefaultGroup>>): Promise<DefaultGroupDto> {
  const settings = await db.globalDeveloperApiSetting.findUnique({ where: { id: "global" }, select: { accountId: true } });
  const accountId = settings?.accountId.trim() || null;
  return { id: group.id, kind: "DEFAULT", defaultGroupId: group.id, topicKey: group.topicKey, name: group.topicKey, description: "", version: group.revision, revision: String(group.revision), accountId, contactListId: group.binding?.zoomId ?? null,
    rebindCount: await db.outreachRegistrationMembership.count({ where: { siteKey: group.siteKey, defaultGroupId: group.id, syncStatus: { not: "UNKNOWN" } } }), contactCount: null, bindingState: !group.binding || group.binding.tombstone ? "MISSING" : group.binding.accountId !== accountId ? "ACCOUNT_CHANGED" : "CONFIGURED" };
}
export async function listOutreachGroups(db: PrismaClient, scope: OutreachScope, injected?: Parameters<typeof listZoomGroups>[2]) {
  const defaults = scope.all ? await db.outreachDefaultGroup.findMany({ where: { siteKey: scope.siteKey }, include: { binding: true }, orderBy: { id: "asc" } }) : [];
  const items: Array<DefaultGroupDto | (Awaited<ReturnType<typeof listZoomGroups>>["items"][number] & { kind: "REGULAR" })> = [];
  for (const topic of DEFAULT_GROUP_TOPICS[scope.siteKey]) {
    const group = defaults.find(row => row.topicKey === topic);
    if (group) items.push(await defaultGroupDto(db, group));
  }
  let providerState = "connected";
  let client = injected;
  const counts = new Map<string, number | null>();
  try {
    client ??= await ZaadZoomClient.fromDatabase(db, scope.siteKey);
    const regular = await listZoomGroups(db, scope, client);
    for (const row of regular.items) counts.set(row.id, row.contactCount);
    items.push(...regular.items.filter(row => !defaults.some(group => group.bindingId === row.bindingId)).map(row => ({ ...row, kind: "REGULAR" as const })));
  } catch (error) {
    // The local default groups stay accessible when the provider is unavailable.
    if (!scope.all) throw error;
    providerState = error instanceof Error ? error.message : "SERVICE_UNAVAILABLE";
  }
  if (client) {
    const currentClient = client;
    const configured = items.filter((row): row is DefaultGroupDto => row.kind === "DEFAULT" && row.bindingState === "CONFIGURED" && row.accountId === currentClient.accountId);
    const pendingIds = [...new Set(configured.flatMap(row => row.contactListId && !counts.has(row.contactListId) ? [row.contactListId] : []))];
    // Bound fallback reads and keep failures local to the affected list.
    await Promise.all(Array.from({ length: Math.min(3, pendingIds.length) }, async () => {
      let id: string | undefined;
      while ((id = pendingIds.shift()) !== undefined) {
        try {
          const observed = await currentClient.getContactList(id);
          if (observed.id === id && observed.type === "contact") counts.set(id, observed.contactCount);
        } catch { /* Unknown counts stay null; never substitute local memberships. */ }
      }
    }));
    for (const row of configured) row.contactCount = counts.get(row.contactListId!) ?? null;
  }
  return { tenantKey: scope.siteKey, items, total: items.length, nextCursor: null, providerState };
}
export async function defaultGroupCandidates(db: PrismaClient, scope: OutreachScope, id: string, cursor?: string, injected?: Pick<ZaadZoomClient, "accountId" | "listContactLists" | "getContactList">): Promise<DefaultGroupCandidatesResponse> {
  const group = await requireDefaultGroup(db, scope, id);
  if (cursor && (cursor.length > 2048 || /[\u0000-\u001f]/.test(cursor))) throw new OutreachContractError("INVALID_CURSOR");
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const page = await client.listContactLists({ pageSize: 100, nextPageToken: cursor });
  const ids = [...new Set([...page.lists.map(row => row.id), ...(group.binding ? [group.binding.zoomId] : [])])];
  const bindings = await db.zoomResourceBinding.findMany({ where: { accountId: client.accountId, resourceType: "CONTACT_LIST", zoomId: { in: ids } }, include: { defaultGroups: true } });
  function reason(listId: string): DefaultGroupCandidate["disabledReason"] {
    const matches = bindings.filter(row => row.zoomId === listId);
    if (matches.some(row => row.dispatchId || row.purpose !== "REGULAR")) return "INTERNAL_RESOURCE";
    if (matches.some(row => row.ownerSiteKey !== scope.siteKey && !row.tombstone)) return "OTHER_INDUSTRY";
    if (matches.some(row => row.defaultGroups.some(other => other.id !== id))) return "ASSIGNED_DEFAULT";
    return null;
  }
  const items = page.lists.map(row => { const disabledReason = reason(row.id); return { id: row.id, name: row.name, selectable: !disabledReason, disabledReason }; });
  let current: DefaultGroupCandidatesResponse["current"] = null;
  if (group.binding) {
    const binding = group.binding;
    current = { id: binding.zoomId, name: "", selectable: false, unavailableReason: "MISSING" };
    if (binding.accountId !== client.accountId) current.unavailableReason = "ACCOUNT_CHANGED";
    else {
      try {
        const observed = await client.getContactList(binding.zoomId);
        if (observed.id !== binding.zoomId || observed.type !== "contact") throw new OutreachContractError("PROVIDER_ID_MISMATCH", 409);
        current = { id: observed.id, name: observed.name, selectable: !reason(observed.id), unavailableReason: reason(observed.id) ? "CONFLICT" : null };
      } catch (error) { if (!(error instanceof ZaadZoomError && error.httpStatus === 404)) throw error; }
    }
  }
  return { tenantKey: scope.siteKey, accountId: client.accountId, revision: group.revision, items, current, nextCursor: page.nextPageToken || null };
}

export async function bindDefaultGroup(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown, injected?: Pick<ZaadZoomClient, "accountId" | "getContactList">) {
  requireFullAccess(scope);
  const v = record(payload); fields(v, ["operationKey", "revision", "accountId", "contactListId"]);
  const key = operationKey(v.operationKey), revision = whole(v.revision), accountId = stringValue(v.accountId), listId = stringValue(v.contactListId);
  const requestDigest = digest({ id, revision, accountId, listId });
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: "DEFAULT_GROUP_BIND", operationKey: key };
  const previous = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
  if (previous) { if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409); return { tenantKey: scope.siteKey, group: await defaultGroupDto(db, await requireDefaultGroup(db, scope, id)) }; }
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  if (client.accountId !== accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
  const observed = await client.getContactList(listId);
  if (observed.id !== listId || observed.type !== "contact") throw new OutreachContractError("PROVIDER_ID_MISMATCH", 409);
  try {
    await db.$transaction(async tx => {
      const group = await requireDefaultGroup(tx, scope, id);
      if (group.revision !== revision) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const global = await tx.globalDeveloperApiSetting.findUnique({ where: { id: "global" } });
      if (global?.accountId.trim() !== accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
      // A live claim excludes re-binding while a write could be in flight. Expired
      // claims also require reconciliation: a time limit is not proof of no write.
      if (await tx.outreachRegistrationMembership.count({ where: { defaultGroupId: id, siteKey: scope.siteKey, syncStatus: { in: group.bindingId ? ["SYNCING", "UNKNOWN"] : ["SYNCING"] } } })) throw new OutreachContractError("SYNC_RECONCILIATION_REQUIRED", 409);
      const bindings = await tx.zoomResourceBinding.findMany({ where: { accountId, resourceType: "CONTACT_LIST", zoomId: listId }, include: { defaultGroups: true } });
      if (bindings.some(b => b.ownerSiteKey !== scope.siteKey && !b.tombstone || b.dispatchId || b.purpose !== "REGULAR" || b.defaultGroups.some(g => g.id !== id))) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
      if (await tx.zoomContactMembership.count({ where: { bindingId: { in: bindings.map(b => b.id) }, syncState: "SYNCING" } })) throw new OutreachContractError("SYNC_RECONCILIATION_REQUIRED", 409);
      let binding = bindings.find(b => b.ownerSiteKey === scope.siteKey);
      if (!binding) binding = await tx.zoomResourceBinding.create({ data: { ownerSiteKey: scope.siteKey, accountId, resourceType: "CONTACT_LIST", zoomId: listId, purpose: "REGULAR", observedDigest: digest(observed) }, include: { defaultGroups: true } });
      else if (binding.tombstone) binding = await tx.zoomResourceBinding.update({ where: { id: binding.id }, data: { tombstone: false, version: { increment: 1 } }, include: { defaultGroups: true } });
      if (group.bindingId !== binding.id) {
        await tx.outreachRegistrationMembership.updateMany({ where: { siteKey: scope.siteKey, defaultGroupId: id, syncStatus: { not: "UNKNOWN" } }, data: { zoomContactId: null, observedDigest: null, syncStatus: "PENDING", bindingRevision: revision + 1, lastErrorCode: null, retryAfter: null, version: { increment: 1 } } });
        await tx.outreachDefaultGroup.update({ where: { id, revision }, data: { bindingId: binding.id, revision: { increment: 1 } } });
      }
      await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "COMPLETED", result: json({ id, bindingId: binding.id }) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "default-group", targetId: id, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["bindingId"] });
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
  return { tenantKey: scope.siteKey, group: await defaultGroupDto(db, await requireDefaultGroup(db, scope, id)) };
}
