import type { PrismaClient } from "@/lib/generated/prisma/client";
import { fields, type PersonOrigin, OutreachContractError, operationKey, personReference, phoneValue, record, stringValue, whole } from "@/lib/zaad/outreach-contracts";
import { type OutreachScope } from "./outreach-scope";
import { ZaadZoomClient, ZaadZoomError, type ZoomContactListDto } from "./zoom-client";
import { allCampaigns } from "./campaign-bindings";
import { databaseError, digest, json } from "./outreach-data";
import { getContact } from "./contacts";
import { writeZaadAudit } from "./audit";
export type GroupClient = Pick<ZaadZoomClient, "accountId" | "listContactLists" | "getContactList" | "createContactList" | "updateContactList" | "deleteContactList" | "listContacts" | "createContact" | "updateContact" | "deleteContact" | "listCampaigns" | "getCampaign">;

export async function requireZoomBinding(db: Pick<PrismaClient, "zoomResourceBinding">, scope: OutreachScope, client: Pick<GroupClient, "accountId">, resourceType: string, zoomId: string) {
  const row = await db.zoomResourceBinding.findFirst({ where: { ownerSiteKey: scope.siteKey, resourceType, zoomId, accountId: client.accountId, tombstone: false, ...(!scope.all ? { defaultGroups: { none: {} } } : {}) } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  return row;
}
export async function listZoomGroups(db: PrismaClient, scope: OutreachScope, injected?: GroupClient) {
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey), all = new Map<string, ZoomContactListDto>(), seen = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await client.listContactLists({ pageSize: 100, nextPageToken: token });
    for (const row of result.lists) all.set(row.id, row);
    if (!result.nextPageToken) break;
    if (seen.has(result.nextPageToken) || page === 99) throw new OutreachContractError("PROVIDER_PAGINATION_LOOP", 502);
    seen.add(result.nextPageToken); token = result.nextPageToken;
  }
  const bindings = await db.zoomResourceBinding.findMany({ where: { ownerSiteKey: scope.siteKey, accountId: client.accountId, resourceType: "CONTACT_LIST", tombstone: false, purpose: "REGULAR", dispatchId: null, ...(!scope.all ? { defaultGroups: { none: {} } } : {}) } });
  const items = bindings.map(binding => {
    const row = all.get(binding.zoomId);
    if (!row) throw new OutreachContractError("PROVIDER_RESOURCE_MISSING", 409);
    return { ...row, bindingId: binding.id, version: binding.version };
  });
  return { tenantKey: scope.siteKey, items, total: items.length, nextCursor: null, observedAt: new Date().toISOString() };
}
export async function zoomGroupMembers(db: PrismaClient, scope: OutreachScope, id: string, injected?: GroupClient, includeMutationBlock = false) {
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const binding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", id), group = await client.getContactList(id);
  if (group.id !== id) throw new OutreachContractError("PROVIDER_ID_MISMATCH", 502);
  let contacts: Awaited<ReturnType<GroupClient["listContacts"]>> = [], providerState = "READY";
  try { contacts = [...new Map((await client.listContacts(id)).map(c => [c.id, c])).values()]; }
  catch (error) { providerState = error instanceof ZaadZoomError ? error.code : "SERVICE_UNAVAILABLE"; }
  const mappings = await db.zoomContactMembership.findMany({ where: { siteKey: scope.siteKey, bindingId: binding.id, syncState: { not: "REMOVED" } } });
  const items = [], linked = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping.personId || !mapping.personOrigin) continue;
    let source;
    try { source = await getContact(db, scope, mapping.personOrigin as PersonOrigin, mapping.personId); }
    catch (error) { if (error instanceof OutreachContractError && [403, 404].includes(error.status)) continue; throw error; }
    if (["WITHDRAWN", "REJECTED", "NOT_CONSENTED"].includes(source.status)) continue;
    const contact = contacts.find(c => c.id === mapping.zoomContactId);
    if (contact) linked.add(contact.id);
    const matches = contact && contact.displayName === source.name && contact.phones.some(p => p.number === source.phone);
    const syncStatus = mapping.syncState === "SYNCING" ? "UNKNOWN" : !contact ? "UNKNOWN" : matches && mapping.observedDigest === digest(contact) && mapping.lastSyncedVersion === source.version ? "SYNCED" : mapping.syncState === "FAILED" ? "FAILED" : "DIFFERENCE";
    items.push({ id: mapping.zoomContactId, displayName: source.name, phones: [{ number: source.phone }], emails: contact?.emails ?? [], observedDigest: contact ? digest(contact) : mapping.observedDigest, mapping: { id: mapping.id, version: mapping.version, personOrigin: mapping.personOrigin, personId: mapping.personId, syncState: mapping.syncState }, source: "SITE", syncStatus, remotePresent: Boolean(contact), noticeConsent: "UNVERIFIED" });
  }
  for (const contact of contacts) if (!linked.has(contact.id)) {
    const unlinked = mappings.find(mapping => mapping.zoomContactId === contact.id && !mapping.personId && !mapping.personOrigin);
    items.push({ ...contact, observedDigest: digest(contact), mapping: unlinked ? { id: unlinked.id, version: unlinked.version, personOrigin: null, personId: null, syncState: unlinked.syncState } : null, source: "Zoom", syncStatus: "REGISTERED", remotePresent: true, noticeConsent: "UNVERIFIED" });
  }
  const mutationBlock = includeMutationBlock ? await groupMutationBlock(client, id) : undefined;
  const summary = providerState === "READY" ? { total: items.length, unsynced: items.filter(i => !["SYNCED", "REGISTERED"].includes(i.syncStatus)).length, synced: items.filter(i => i.syncStatus === "SYNCED").length, zoomOnly: items.filter(i => i.syncStatus === "REGISTERED").length } : { total: null, unsynced: null, synced: null, zoomOnly: null };
  return { tenantKey: scope.siteKey, group: { ...group, version: binding.version, mutationBlock }, items, summary, providerState, total: items.length, nextCursor: null, observedAt: new Date().toISOString() };
}

export async function groupMutationBlock(client: Pick<GroupClient, "accountId" | "listCampaigns" | "getCampaign">, id: string, deleting = false): Promise<"GROUP_IN_USE" | "CAMPAIGN_REFERENCE_UNKNOWN" | null> {
  const campaigns = await allCampaigns(client);
  for (const listed of campaigns) {
    const campaign = await client.getCampaign(listed.id);
    if (campaign.contactListId === id && (deleting || campaign.alwaysRunning || campaign.status === "running" || campaign.status === "unknown")) return "GROUP_IN_USE";
    if (campaign.status === "unknown") return "CAMPAIGN_REFERENCE_UNKNOWN";
  }
  return null;
}
async function assertGroupIdle(client: GroupClient, id: string, deleting = false) {
  const reason = await groupMutationBlock(client, id, deleting);
  if (reason) throw new OutreachContractError(reason, 409);
}
async function providerOperation(db: PrismaClient, scope: OutreachScope, kind: string, keyValue: unknown, input: unknown, execute: () => Promise<unknown>) {
  const key = operationKey(keyValue), requestDigest = digest(input), where = { siteKey: scope.siteKey, actorId: scope.actorId, kind, operationKey: key };
  const previous = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: where } });
  if (previous) {
    if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
    if (previous.status === "COMPLETED") return previous.result;
    throw new OutreachContractError("PROVIDER_RESULT_REQUIRES_RECONCILIATION", 409);
  }
  let operation;
  try { operation = await db.outreachOperation.create({ data: { ...where, requestDigest } }); } catch (error) { databaseError(error); }
  try {
    const result = await execute();
    await db.outreachOperation.update({ where: { id: operation.id }, data: { status: "COMPLETED", result: json(result) } });
    return result;
  } catch (error) {
    const definitelyRejected = error instanceof ZaadZoomError && !error.resultUnknown && [400, 401, 403, 404, 429].includes(error.httpStatus);
    await db.outreachOperation.update({ where: { id: operation.id }, data: { status: definitelyRejected ? "FAILED" : "UNKNOWN", result: json({ code: error instanceof Error ? error.message : "PROVIDER_RESULT_UNKNOWN" }) } });
    throw error;
  }
}
export async function saveZoomGroup(db: PrismaClient, scope: OutreachScope, payload: unknown, id?: string, injected?: GroupClient) {
  const v = { ...record(payload) }; fields(v, ["operationKey", "name", "description", "departmentKey", "version", "expectedRevision"]); delete v.departmentKey;
  const name = stringValue(v.name), description = typeof v.description === "string" && v.description.trim() === "" ? "" : stringValue(v.description, 500);

  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const binding = id ? await requireZoomBinding(db, scope, client, "CONTACT_LIST", id) : null;
  if (binding) {
    if (await db.outreachDefaultGroup.count({ where: { bindingId: binding.id } })) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
    if (whole(v.version) !== binding.version) throw new OutreachContractError("VERSION_CONFLICT", 409);
    await assertGroupIdle(client, id!);
    const current = await client.getContactList(id!);
    if (current.revision !== v.expectedRevision) throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
  }
  return providerOperation(db, scope, id ? "GROUP_UPDATE" : "GROUP_CREATE", v.operationKey, { ...v, id, accountId: client.accountId }, async () => {
    const written = id ? await client.updateContactList(id, { name, description }) : await client.createContactList({ name, description });
    const observed = await client.getContactList(written.id);
    if ((id && observed.id !== id) || observed.name !== name || observed.description !== description) throw new OutreachContractError("PROVIDER_READBACK_MISMATCH", 409);
    await db.$transaction(async tx => {
      if (binding) {
        const changed = await tx.zoomResourceBinding.updateMany({ where: { id: binding.id, ownerSiteKey: scope.siteKey, version: binding.version }, data: { observedDigest: digest(observed), version: { increment: 1 } } });
        if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
      } else await tx.zoomResourceBinding.create({ data: { ownerSiteKey: scope.siteKey, accountId: client.accountId, resourceType: "CONTACT_LIST", zoomId: observed.id, purpose: "REGULAR", observedDigest: digest(observed) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "contact-list", targetId: observed.id, action: id ? "UPDATE" : "CREATE", result: "SUCCESS", changedFieldNames: ["name", "description", "binding"] });
    });
    return { tenantKey: scope.siteKey, group: observed, syncState: "SYNCED" };
  });
}
/** Detach only the current site's group. Zoom data and local CRM memberships are retained. */
export async function deleteZoomGroup(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown, injected?: GroupClient) {
  const v = record(payload); fields(v, ["operationKey", "version"]);
  const key = operationKey(v.operationKey), version = whole(v.version);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: "GROUP_DETACH", operationKey: key };
  const requestDigest = digest({ id, accountId: client.accountId, version });
  try {
    return await db.$transaction(async tx => {
      const previous = await tx.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
      if (previous) {
        if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
        return { tenantKey: scope.siteKey, detached: true };
      }
      const binding = await requireZoomBinding(tx, scope, client, "CONTACT_LIST", id);
      if (binding.version !== version) throw new OutreachContractError("VERSION_CONFLICT", 409);
      if (await tx.outreachDefaultGroup.count({ where: { bindingId: binding.id } })) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
      if (binding.dispatchId || binding.purpose !== "REGULAR") throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
      await tx.zoomResourceBinding.update({ where: { id: binding.id, version }, data: { tombstone: true, version: { increment: 1 } } });
      await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "COMPLETED", result: json({ id, detached: true }) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "resource-binding", targetId: binding.id, action: "DELETE", result: "SUCCESS", changedFieldNames: ["tombstone"] });
      return { tenantKey: scope.siteKey, detached: true };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
export async function saveZoomMember(db: PrismaClient, scope: OutreachScope, listId: string, payload: unknown, contactId?: string, injected?: GroupClient) {
  const v = record(payload); fields(v, ["operationKey", "reference", "name", "phone", "version", "expectedDigest"]);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey), binding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", listId);
  await assertGroupIdle(client, listId);
  const person = !contactId ? personReference(v.reference, scope.siteKey) : null;
  const crm = person ? await getContact(db, scope, person.origin, person.id) : null;
  if (contactId && await db.zoomContactMembership.count({ where: { siteKey: scope.siteKey, bindingId: binding.id, zoomContactId: contactId, syncState: "SYNCING" } })) throw new OutreachContractError("PROVIDER_RESULT_REQUIRES_RECONCILIATION", 409);
  const name = contactId ? stringValue(v.name) : crm!.name, phone = contactId ? phoneValue(v.phone) : crm!.phone;
  if (contactId) {
    const current = (await client.listContacts(listId)).find(row => row.id === contactId);
    if (!current) throw new OutreachContractError("NOT_FOUND", 404);
    if (digest(current) !== v.expectedDigest) throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
  }
  return providerOperation(db, scope, contactId ? "MEMBER_UPDATE" : "MEMBER_CREATE", v.operationKey, { ...v, listId, contactId, accountId: client.accountId }, async () => {
    const id = contactId ?? await client.createContact(listId, { name, phone, email: "" });
    if (contactId) await client.updateContact(listId, contactId, { name, phone, email: "" });
    const observed = (await client.listContacts(listId)).find(row => row.id === id);
    if (!observed || observed.displayName !== name || !observed.phones.some(value => phoneValue(value.number) === phone)) throw new OutreachContractError("PROVIDER_READBACK_MISMATCH", 409);
    await db.zoomContactMembership.upsert({ where: { siteKey_bindingId_zoomContactId: { siteKey: scope.siteKey, bindingId: binding.id, zoomContactId: id } }, create: { siteKey: scope.siteKey, bindingId: binding.id, zoomContactId: id, personOrigin: person?.origin, personId: person?.id, observedDigest: digest(observed), syncState: person ? "LINKED" : "UNLINKED", lastSyncedVersion: crm?.version }, update: { observedDigest: digest(observed), syncState: contactId ? "DIFFERENCE" : "LINKED", version: { increment: 1 } } });
    return { tenantKey: scope.siteKey, member: { ...observed, observedDigest: digest(observed) }, syncState: "SYNCED" };
  });
}
export async function deleteZoomMember(db: PrismaClient, scope: OutreachScope, listId: string, contactId: string, payload: unknown, injected?: GroupClient) {
  const v = record(payload); fields(v, ["operationKey", "expectedDigest"]);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey), binding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", listId);
  await assertGroupIdle(client, listId);
  const current = (await client.listContacts(listId)).find(row => row.id === contactId);
  if (!current) throw new OutreachContractError("NOT_FOUND", 404);
  if (digest(current) !== v.expectedDigest) throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
  return providerOperation(db, scope, "MEMBER_DELETE", v.operationKey, { listId, contactId, accountId: client.accountId }, async () => {
    await client.deleteContact(listId, contactId);
    if ((await client.listContacts(listId)).some(row => row.id === contactId)) throw new OutreachContractError("PROVIDER_READBACK_MISMATCH", 409);
    await db.zoomContactMembership.updateMany({ where: { siteKey: scope.siteKey, bindingId: binding.id, zoomContactId: contactId }, data: { syncState: "REMOVED", version: { increment: 1 } } });
    return { tenantKey: scope.siteKey, deleted: true };
  });
}
export async function linkZoomMember(db: PrismaClient, scope: OutreachScope, listId: string, contactId: string, payload: unknown, injected?: GroupClient) {
  const v = record(payload); fields(v, ["reference", "attestation", "version", "expectedDigest"]);
  const person = personReference(v.reference, scope.siteKey), attestation = stringValue(v.attestation, 2000, true);
  const crm = await getContact(db, scope, person.origin, person.id), client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey), binding = await requireZoomBinding(db, scope, client, "CONTACT_LIST", listId);
  const observed = (await client.listContacts(listId)).find(row => row.id === contactId);
  if (!observed) throw new OutreachContractError("NOT_FOUND", 404);
  if (digest(observed) !== v.expectedDigest) throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
  try {
    return await db.$transaction(async tx => {
      const where = { siteKey: scope.siteKey, bindingId: binding.id, zoomContactId: contactId }, previous = await tx.zoomContactMembership.findUnique({ where: { siteKey_bindingId_zoomContactId: where } });
      if (previous?.syncState === "SYNCING" && await tx.outreachGroupSyncItem.count({ where: { membershipId: previous.id, status: "RUNNING", claimedAt: { gt: new Date(Date.now() - 300_000) } } })) throw new OutreachContractError("PROVIDER_RESULT_REQUIRES_RECONCILIATION", 409);
      if (previous && (v.version !== previous.version || (previous.personId && (previous.personId !== person.id || previous.personOrigin !== person.origin)))) throw new OutreachContractError("MEMBERSHIP_LINK_CONFLICT", 409);
      const mapping = await tx.zoomContactMembership.upsert({ where: { siteKey_bindingId_zoomContactId: where }, create: { ...where, personOrigin: person.origin, personId: person.id, observedDigest: digest(observed), attestation, confirmedBy: scope.actorId, lastSyncedVersion: crm.version, syncState: "LINKED" }, update: { personOrigin: person.origin, personId: person.id, observedDigest: digest(observed), attestation, confirmedBy: scope.actorId, lastSyncedVersion: crm.version, syncState: "LINKED", version: { increment: 1 } } });
      return { tenantKey: scope.siteKey, mapping };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
