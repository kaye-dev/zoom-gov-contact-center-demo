import { regularSyncOperation, advanceRegularSync } from "./regular-group-sync";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { TenantKey } from "@/lib/tenants";
import { type DefaultGroupDetail, type GroupSyncResult, type MemberSyncStatus, type RegistrationOrigin, type SyncedGroupMember, isPendingSync } from "@/lib/zaad/default-groups";
import { fields, operationKey, OutreachContractError, record, stringList, stringValue, whole } from "@/lib/zaad/outreach-contracts";
import { defaultGroupDto, requireDefaultGroup } from "./default-groups";
import { requireFullAccess, type OutreachScope } from "./outreach-scope";
import { databaseError, digest } from "./outreach-data";
import { writeZaadAudit } from "./audit";
import { groupMutationBlock, type GroupClient } from "./zoom-groups";
import { ZaadZoomClient, ZaadZoomError, type ZoomContactDto } from "./zoom-client";

type Database = Prisma.TransactionClient;
type Membership = Prisma.OutreachRegistrationMembershipGetPayload<{ include: { group: true } }>;
export type RegistrationGroupClient = Pick<GroupClient, "accountId" | "getContactList" | "listContacts" | "createContact" | "updateContact" | "listCampaigns" | "getCampaign">;
const LEASE_MS = 5 * 60_000;
const MAX_ADVANCE = 20;
const codeOf = (error: unknown) => error instanceof OutreachContractError || error instanceof ZaadZoomError ? error.code : "SERVICE_UNAVAILABLE";

/** Public requests are consent records, not approved CRM contacts. Read the
 * authoritative source again before every write, including withdrawal checks. */
export async function registrationSource(db: Database, member: Membership) {
  const { siteKey, sourceId, origin, group } = member;
  if (origin === "UNIVERSITY_REGISTRATION" && siteKey === "univ") {
    const row = await db.universityStudentRegistration.findFirst({ where: { id: sourceId, siteKey }, include: { contact: { include: { preferences: true } } } });
    if (!row || !row.consentedAt || !row.consentVersion || ["WITHDRAWN", "REJECTED"].includes(row.status)) return null;
    if (row.contact && (row.contact.deletedAt || row.contact.preferences.some(p => p.topicId === group.topicKey && p.withdrawnAt))) return null;
    const topics = row.reviewedAt ? row.reviewedTopicIds : row.topicIds;
    if (!topics.includes(group.topicKey)) return null;
    return { name: row.reviewedName ?? row.name, phone: row.reviewedPhone ?? row.phone, version: row.version };
  }
  if (origin === "MUNICIPAL_CONTACT" && siteKey === "lg") {
    const row = await db.municipalContact.findFirst({ where: { siteKey, id: sourceId }, include: { preferences: true } });
    const preference = row?.preferences.find(p => p.topic === group.topicKey);
    if (!row || row.deletedAt || row.status === "WITHDRAWN" || !preference?.requested || preference.withdrawnAt || !preference.consentedAt) return null;
    return { name: row.name, phone: row.phone, version: row.version };
  }
  if (origin === "DISASTER_RADIO" && siteKey === "lg" && group.topicKey === "disaster-radio") {
    const row = await db.disasterRadioSubscription.findFirst({ where: { siteKey, id: sourceId, consentStatus: "CONSENTED" } });
    return row ? { name: row.name, phone: row.normalizedPhone, version: row.revision } : null;
  }
  return null;
}
const matches = (contact: ZoomContactDto, source: { name: string; phone: string }) => contact.displayName === source.name && contact.phones.some(p => p.number === source.phone);

async function readMembers(db: PrismaClient, scope: OutreachScope, id: string, injected?: RegistrationGroupClient) {
  const group = await requireDefaultGroup(db, scope, id), dto = await defaultGroupDto(db, group);
  const local = await db.outreachRegistrationMembership.findMany({ where: { siteKey: scope.siteKey, defaultGroupId: id }, include: { group: true }, orderBy: { id: "asc" } });
  let contacts: ZoomContactDto[] = [], providerState: string = dto.bindingState;
  if (dto.bindingState === "CONFIGURED") {
    try {
      const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
      if (client.accountId !== dto.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
      const observed = await client.getContactList(dto.contactListId!);
      if (observed.id !== dto.contactListId) throw new OutreachContractError("PROVIDER_ID_MISMATCH", 502);
      contacts = [...new Map((await client.listContacts(dto.contactListId!)).map(c => [c.id, c])).values()];
      providerState = "READY";
    } catch (error) { providerState = codeOf(error); }
  }
  const items: SyncedGroupMember[] = [];
  const linked = new Set<string>();
  for (const member of local) {
    const source = await registrationSource(db, member);
    if (!source) continue;
    const observed = member.bindingRevision === group.revision ? contacts.find(c => c.id === member.zoomContactId) : undefined;
    let status = member.syncStatus as MemberSyncStatus;
    if (observed) {
      linked.add(observed.id);
      if (member.observedDigest !== digest(observed) || member.desiredDigest !== digest(source)) status = "DIFFERENCE";
    } else if (status === "SYNCED" && providerState === "READY") status = "UNKNOWN";
    if (status === "SYNCING" && member.leaseUntil && member.leaseUntil < new Date()) status = "UNKNOWN";
    items.push({ id: member.id, displayName: source.name, phones: [{ number: source.phone }], source: "SITE", syncStatus: status, zoomContactId: member.zoomContactId, version: member.version, lastErrorCode: member.lastErrorCode, observedDigest: observed ? digest(observed) : null, retryAfter: member.retryAfter?.toISOString() ?? null });
  }
  for (const contact of contacts) if (!linked.has(contact.id)) items.push({ id: `zoom:${contact.id}`, displayName: contact.displayName, phones: contact.phones, source: "Zoom", syncStatus: "REGISTERED", zoomContactId: contact.id, version: 0, lastErrorCode: null, observedDigest: digest(contact), retryAfter: null });
  // An unavailable remote page must never masquerade as a complete total.
  const complete = providerState === "READY" || dto.bindingState === "MISSING";
  const summary = complete ? { total: items.length, unsynced: items.filter(i => isPendingSync(i.syncStatus)).length, synced: items.filter(i => i.syncStatus === "SYNCED").length, zoomOnly: items.filter(i => i.syncStatus === "REGISTERED").length } : { total: null, unsynced: null, synced: null, zoomOnly: null };
  return { group: dto, items, summary, providerState };
}
export async function getDefaultGroupDetail(db: PrismaClient, scope: OutreachScope, id: string, query: { cursor?: string; query?: string } = {}, injected?: RegistrationGroupClient): Promise<DefaultGroupDetail> {
  const data = await readMembers(db, scope, id, injected);
  const q = (query.query ?? "").trim().normalize("NFKC").toLowerCase();
  if (q.length > 100 || query.cursor && !/^\d{1,9}$/.test(query.cursor)) throw new OutreachContractError("INVALID_REQUEST");
  const filtered = data.items.filter(row => !q || `${row.displayName} ${row.phones.map(p => p.number).join(" ")}`.normalize("NFKC").toLowerCase().includes(q));
  const offset = Number(query.cursor ?? 0), limit = 100;
  return { ...data, tenantKey: scope.siteKey, items: filtered.slice(offset, offset + limit), total: filtered.length, nextCursor: offset + limit < filtered.length ? String(offset + limit) : null, observedAt: new Date().toISOString() };
}

export async function startRegistrationGroupSync(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown, injected?: RegistrationGroupClient): Promise<GroupSyncResult> {
  const group = await requireDefaultGroup(db, scope, id);
  const v = record(payload); fields(v, ["operationKey", "revision", "memberIds"]);
  const key = operationKey(v.operationKey), revision = whole(v.revision);
  const selected = v.memberIds === undefined ? null : stringList(v.memberIds, 1000).sort();
  if (selected && !selected.length) throw new OutreachContractError("EMPTY_SELECTION");
  const requestDigest = digest({ id, revision, selected });
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, operationKey: key };
  const prior = await db.outreachGroupSyncOperation.findUnique({ where: { siteKey_actorId_operationKey: unique } });
  if (prior) { if (prior.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409); return getRegistrationSyncOperation(db, scope, prior.id); }
  if (revision !== group.revision) throw new OutreachContractError("VERSION_CONFLICT", 409);
  const snapshot = await readMembers(db, scope, id, injected);
  if (snapshot.group.bindingState !== "CONFIGURED") throw new OutreachContractError("GROUP_NOT_CONFIGURED", 409);
  // Explicit selection may reconcile an unknown remote result. A bulk request
  // includes all locally represented pending rows, not just the displayed page.
  const members = snapshot.items.filter(row => row.source === "SITE" && (selected ? selected.includes(row.id) : isPendingSync(row.syncStatus)));
  if (selected && members.length !== new Set(selected).size) throw new OutreachContractError("NOT_FOUND", 404);
  try {
    const operation = await db.$transaction(async tx => {
      const current = await requireDefaultGroup(tx, scope, id);
      if (current.revision !== revision) throw new OutreachContractError("VERSION_CONFLICT", 409);
      return tx.outreachGroupSyncOperation.create({ data: { ...unique, groupId: id, revision, requestDigest, status: members.length ? "PENDING" : "COMPLETED", items: { create: members.map(m => ({ membershipId: m.id, version: m.version })) } } });
    }, { isolationLevel: "Serializable" });
    return getRegistrationSyncOperation(db, scope, operation.id);
  } catch (error) {
    const raced = await db.outreachGroupSyncOperation.findUnique({ where: { siteKey_actorId_operationKey: unique } });
    if (raced && raced.requestDigest === requestDigest) return getRegistrationSyncOperation(db, scope, raced.id);
    databaseError(error);
  }
}
export async function getRegistrationSyncOperation(db: PrismaClient, scope: OutreachScope, id: string): Promise<GroupSyncResult> {
  const op = await db.outreachGroupSyncOperation.findFirst({ where: { id, siteKey: scope.siteKey, actorId: scope.actorId }, include: { items: true } });
  if (!op) throw new OutreachContractError("NOT_FOUND", 404);
  if (op.groupKind === "REGULAR") return regularSyncOperation(db, scope, id);
  requireFullAccess(scope);
  await requireDefaultGroup(db, scope, op.groupId);
  return { tenantKey: scope.siteKey, operationId: id, status: op.status, counts: { total: op.items.length, pending: op.items.filter(i => ["PENDING", "RUNNING"].includes(i.status)).length, synced: op.items.filter(i => i.status === "SYNCED").length, failed: op.items.filter(i => !["PENDING", "RUNNING", "SYNCED"].includes(i.status)).length } };
}

async function syncMembership(db: PrismaClient, scope: OutreachScope, memberId: string, revision: number, version: number, injected?: RegistrationGroupClient) {
  const token = randomUUID();
  let attemptedWrite = false;
  let client: RegistrationGroupClient | undefined;
  const claimed = await db.$transaction(async tx => {
    const member = await tx.outreachRegistrationMembership.findFirst({ where: { id: memberId, siteKey: scope.siteKey }, include: { group: true } });
    if (!member) throw new OutreachContractError("NOT_FOUND", 404);
    await requireDefaultGroup(tx, scope, member.defaultGroupId);
    if (member.group.revision !== revision || member.version !== version) return null;
    if (member.syncStatus === "SYNCING") {
      if (member.leaseUntil && member.leaseUntil <= new Date()) await tx.outreachRegistrationMembership.updateMany({ where: { id: memberId, version, claimToken: member.claimToken }, data: { syncStatus: "UNKNOWN", lastErrorCode: "PROVIDER_RESULT_REQUIRES_RECONCILIATION", claimToken: null, leaseUntil: null, version: { increment: 1 } } });
      return null;
    }
    if (member.retryAfter && member.retryAfter > new Date()) return null;
    if (member.syncStatus === "UNKNOWN" && !member.zoomContactId) return null;
    const changed = await tx.outreachRegistrationMembership.updateMany({ where: { id: memberId, version, syncStatus: member.syncStatus }, data: { syncStatus: "SYNCING", claimToken: token, leaseUntil: new Date(Date.now() + LEASE_MS), lastAttemptAt: new Date() } });
    return changed.count ? member : null;
  }, { isolationLevel: "Serializable" });
  if (!claimed) return "SKIPPED";
  try {
    const group = await requireDefaultGroup(db, scope, claimed.defaultGroupId), source = await registrationSource(db, claimed);
    if (!source) throw new OutreachContractError("CONSENT_WITHDRAWN", 409);
    const dto = await defaultGroupDto(db, group);
    if (dto.bindingState !== "CONFIGURED" || group.revision !== revision) throw new OutreachContractError("GROUP_NOT_CONFIGURED", 409);
    client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
    if (client.accountId !== dto.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
    const block = await groupMutationBlock(client, dto.contactListId!);
    if (block) throw new OutreachContractError(block, 409);
    const contacts = await client.listContacts(dto.contactListId!);
    const existing = claimed.zoomContactId ? contacts.find(c => c.id === claimed.zoomContactId) : null;
    if (claimed.zoomContactId && !existing) throw new OutreachContractError("PROVIDER_RESULT_REQUIRES_RECONCILIATION", 409);
    if (existing && claimed.observedDigest && digest(existing) !== claimed.observedDigest) throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
    if (existing && !claimed.observedDigest && !matches(existing, source)) throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
    // Revalidate the consent, binding and global account immediately before the write.
    const freshSource = await registrationSource(db, claimed), freshGroup = await requireDefaultGroup(db, scope, group.id);
    const currentSettings = await db.globalDeveloperApiSetting.findUnique({ where: { id: "global" }, select: { accountId: true } });
    if (!freshSource || digest(freshSource) !== digest(source)) throw new OutreachContractError("SOURCE_CHANGED", 409);
    if (freshGroup.revision !== revision || currentSettings?.accountId.trim() !== client.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
    let zoomId = existing?.id;
    if (!existing) {
      attemptedWrite = true;
      zoomId = await client.createContact(dto.contactListId!, { name: source.name, phone: source.phone, email: "" });
      await db.outreachRegistrationMembership.updateMany({ where: { id: memberId, claimToken: token }, data: { zoomContactId: zoomId, bindingRevision: revision } });
    } else if (!matches(existing, source)) {
      attemptedWrite = true;
      await client.updateContact(dto.contactListId!, existing.id, { name: source.name, phone: source.phone, email: existing.emails[0] ?? "" });
    }
    const observed = (await client.listContacts(dto.contactListId!)).find(c => c.id === zoomId);
    if (!observed || !matches(observed, source)) throw new OutreachContractError("PROVIDER_READBACK_MISMATCH", 409);
    const finalSource = await registrationSource(db, claimed);
    if (!finalSource || digest(finalSource) !== digest(source)) throw new OutreachContractError("SOURCE_CHANGED", 409);
    await db.$transaction(async tx => {
      const finalGroup = await requireDefaultGroup(tx, scope, claimed.defaultGroupId);
      const finalSettings = await tx.globalDeveloperApiSetting.findUnique({ where: { id: "global" } });
      if (finalGroup.revision !== revision || finalSettings?.accountId.trim() !== client!.accountId) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const result = await tx.outreachRegistrationMembership.updateMany({ where: { id: memberId, claimToken: token, version }, data: { syncStatus: "SYNCED", zoomContactId: zoomId, bindingRevision: revision, observedDigest: digest(observed), desiredDigest: digest(source), lastErrorCode: null, retryAfter: null, claimToken: null, leaseUntil: null, version: { increment: 1 } } });
      if (result.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId.startsWith("public:") ? null : scope.actorId, resourceKind: "registration-membership", targetId: memberId, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["syncStatus", "zoomContactId"] });
    });
    return "SYNCED";
  } catch (error) {
    const code = codeOf(error);
    const definite = error instanceof ZaadZoomError && !error.resultUnknown && [400, 401, 403, 404, 429].includes(error.httpStatus);
    const status = code === "CONSENT_WITHDRAWN" ? "WITHDRAWN" : code === "PROVIDER_RESOURCE_CHANGED" ? "DIFFERENCE" : attemptedWrite && !definite || code === "PROVIDER_RESULT_REQUIRES_RECONCILIATION" ? "UNKNOWN" : "FAILED";
    await db.outreachRegistrationMembership.updateMany({ where: { id: memberId, claimToken: token }, data: { syncStatus: status, lastErrorCode: code, retryAfter: error instanceof ZaadZoomError && error.httpStatus === 429 ? new Date(Date.now() + 60_000) : null, claimToken: null, leaseUntil: null, version: { increment: 1 } } });
    return status;
  }
}
export async function advanceRegistrationSync(db: PrismaClient, scope: OutreachScope, id: string, injected?: RegistrationGroupClient): Promise<GroupSyncResult> {
  await getRegistrationSyncOperation(db, scope, id);
  const kind = await db.outreachGroupSyncOperation.findUniqueOrThrow({ where: { id }, select: { groupKind: true } });
  if (kind.groupKind === "REGULAR") return advanceRegularSync(db, scope, id);
  const expired = await db.outreachGroupSyncItem.findMany({ where: { operationId: id, status: "RUNNING", claimedAt: { lt: new Date(Date.now() - LEASE_MS) } } });
  for (const item of expired) {
    const membership = await db.outreachRegistrationMembership.findUnique({ where: { id: item.membershipId } });
    const result = membership?.syncStatus === "SYNCED" ? "SYNCED" : "UNKNOWN";
    await db.outreachGroupSyncItem.updateMany({ where: { id: item.id, status: "RUNNING", claimedAt: item.claimedAt }, data: { status: result, errorCode: result === "SYNCED" ? null : "PROVIDER_RESULT_REQUIRES_RECONCILIATION" } });
  }
  const op = await db.outreachGroupSyncOperation.findUniqueOrThrow({ where: { id }, include: { items: { where: { status: "PENDING" }, take: MAX_ADVANCE, orderBy: { id: "asc" } } } });
  const deadline = Date.now() + 20_000;
  for (const item of op.items) {
    if (Date.now() >= deadline) break;
    const claim = await db.outreachGroupSyncItem.updateMany({ where: { id: item.id, status: "PENDING" }, data: { status: "RUNNING", claimedAt: new Date() } });
    if (!claim.count) continue;
    let result: string;
    try { result = await syncMembership(db, scope, item.membershipId, op.revision, item.version, injected); }
    catch (error) { result = codeOf(error); }
    await db.outreachGroupSyncItem.updateMany({ where: { id: item.id, status: "RUNNING" }, data: { status: result, errorCode: result === "SYNCED" ? null : result } });
  }
  const pending = await db.outreachGroupSyncItem.count({ where: { operationId: id, status: { in: ["PENDING", "RUNNING"] } } });
  if (!pending) {
    const failures = await db.outreachGroupSyncItem.count({ where: { operationId: id, status: { not: "SYNCED" } } });
    await db.outreachGroupSyncOperation.update({ where: { id }, data: { status: failures ? "PARTIAL" : "COMPLETED" } });
  }
  return getRegistrationSyncOperation(db, scope, id);
}
export async function syncRegisteredSource(db: PrismaClient, siteKey: TenantKey, origin: RegistrationOrigin, sourceId: string, injected?: RegistrationGroupClient) {
  // The receipt has committed. Provider failure must never undo acceptance.
  const scope: OutreachScope = { siteKey, actorId: `public:${origin}:${sourceId}`, all: true, departments: [], live: false };
  try {
    const memberships = await db.outreachRegistrationMembership.findMany({ where: { siteKey, origin, sourceId }, include: { group: true } });
    for (const member of memberships) {
      await syncMembership(db, scope, member.id, member.group.revision, member.version, injected);
    }
  } catch { /* Durable pending memberships are retried from the administration UI. */ }
}

/** Explicit reconciliation for an indeterminate write; never infer identity from
 * matching telephone numbers. The operator attests the provider contact ID. */
export async function linkRegistrationMember(db: PrismaClient, scope: OutreachScope, groupId: string, memberId: string, payload: unknown, injected?: RegistrationGroupClient) {
  const group = await requireDefaultGroup(db, scope, groupId), dto = await defaultGroupDto(db, group);
  const v = record(payload); fields(v, ["version", "contactId", "expectedDigest", "attestation"]);
  const version = whole(v.version), contactId = stringValue(v.contactId), expectedDigest = stringValue(v.expectedDigest);
  const attestation = stringValue(v.attestation, 2000);
  if (dto.bindingState !== "CONFIGURED") throw new OutreachContractError("GROUP_NOT_CONFIGURED", 409);
  const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  if (client.accountId !== dto.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
  const contact = (await client.listContacts(dto.contactListId!)).find(c => c.id === contactId);
  if (!contact || digest(contact) !== expectedDigest) throw new OutreachContractError("PROVIDER_RESOURCE_CHANGED", 409);
  const member = await db.outreachRegistrationMembership.findFirst({ where: { id: memberId, siteKey: scope.siteKey, defaultGroupId: groupId, version }, include: { group: true } });
  if (!member || member.syncStatus === "SYNCING") throw new OutreachContractError("VERSION_CONFLICT", 409);
  const source = await registrationSource(db, member);
  if (!source) throw new OutreachContractError("CONSENT_WITHDRAWN", 409);
  try {
    await db.$transaction(async tx => {
      if (await tx.outreachRegistrationMembership.count({ where: { siteKey: scope.siteKey, defaultGroupId: groupId, zoomContactId: contactId, id: { not: memberId } } })) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
      const currentGroup = await requireDefaultGroup(tx, scope, groupId);
      const currentSettings = await tx.globalDeveloperApiSetting.findUnique({ where: { id: "global" } });
      if (currentGroup.revision !== group.revision || currentSettings?.accountId.trim() !== client.accountId) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const freshSource = await registrationSource(tx, member);
      if (!freshSource || digest(freshSource) !== digest(source)) throw new OutreachContractError("SOURCE_CHANGED", 409);
      const updated = await tx.outreachRegistrationMembership.updateMany({ where: { id: memberId, version, syncStatus: { not: "SYNCING" } }, data: { attestation, reconciledBy: scope.actorId, reconciledAt: new Date(), zoomContactId: contactId, bindingRevision: group.revision, observedDigest: digest(contact), desiredDigest: digest(source), syncStatus: matches(contact, source) ? "SYNCED" : "DIFFERENCE", lastErrorCode: null, version: { increment: 1 } } });
      if (!updated.count) throw new OutreachContractError("VERSION_CONFLICT", 409);
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "registration-membership", targetId: memberId, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["zoomContactId", "attestation"] });
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
  return { tenantKey: scope.siteKey, linked: true };
}
