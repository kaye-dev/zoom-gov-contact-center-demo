import type { PrismaClient } from "@/lib/generated/prisma/client";
import { parseDispatchConfirmation, parseDispatchDraft } from "@/lib/zaad/dispatch-contracts";
import { OutreachContractError, personReference, referenceKey, type PersonReference } from "@/lib/zaad/outreach-contracts";
import { databaseError, digest, json } from "./outreach-data";
import { getContact } from "./contacts";
import { outreachWhere, requireOutreachDepartment, type OutreachScope } from "./outreach-scope";
import { requireZoomBinding, zoomGroupMembers, type GroupClient } from "./zoom-groups";
import { ZaadZoomClient } from "./zoom-client";
import { writeZaadAudit } from "./audit";
export async function dispatchTargets(db: PrismaClient, scope: OutreachScope, draft: ReturnType<typeof parseDispatchDraft>, injected?: GroupClient) {
  const refs: { reference: PersonReference; membershipId?: string; membershipVersion?: number; groupId?: string; providerPhones?: string[] }[] = draft.people.map(reference => ({ reference }));
  const groups: { id: string; name: string; observedAt: string; version: number; digest: string }[] = [], exclusions: Record<string, number> = {}, excludedTargets: { name: string | null; reason: string }[] = [];
  const exclude = (reason: string, name: string | null = null) => { exclusions[reason] = (exclusions[reason] ?? 0) + 1; excludedTargets.push({ name, reason }); };
  for (const id of draft.groupIds) {
    const result = await zoomGroupMembers(db, scope, id, injected);
    if (result.group.departmentKey !== draft.departmentKey) throw new OutreachContractError("DEPARTMENT_MISMATCH", 409);
    if (result.providerState !== "READY") throw new OutreachContractError("SERVICE_UNAVAILABLE", 503);
    groups.push({ id, name: result.group.name, observedAt: new Date().toISOString(), version: result.group.version, digest: digest(result.items) });
    for (const member of result.items) {
      if (!member.mapping?.personId || !member.mapping.personOrigin) { exclude("ZOOM_ONLY", member.displayName); continue; }
      if (member.mapping.syncState !== "LINKED") { exclude("MEMBERSHIP_UNVERIFIED", member.displayName); continue; }
      refs.push({ reference: personReference({ siteKey: scope.siteKey, kind: scope.siteKey === "lg" ? "resident" : "student", origin: member.mapping.personOrigin, id: member.mapping.personId }, scope.siteKey), membershipId: member.mapping.id, membershipVersion: member.mapping.version, groupId: id, providerPhones: member.phones.map(phone => phone.number) });
    }
  }
  const targets = [], phones = new Set<string>();
  for (const selected of refs) {
    let contact;
    try { contact = await getContact(db, scope, selected.reference.origin, selected.reference.id); }
    catch (error) { if (error instanceof OutreachContractError && error.status === 404) { exclude("OUT_OF_SCOPE"); continue; } throw error; }
    if (contact.departmentKey !== draft.departmentKey) { exclude("OUT_OF_SCOPE", contact.name); continue; }
    const legacyDisasterConsent = selected.reference.origin === "DISASTER_RADIO" && draft.topic === "disaster-radio" && contact.status === "CONSENTED";
    if (!legacyDisasterConsent && contact.status !== "ACTIVE") { exclude(contact.status === "WITHDRAWN" || contact.status === "NOT_CONSENTED" ? "WITHDRAWN" : "PENDING_REVIEW", contact.name); continue; }
    if (!legacyDisasterConsent && (!contact.identityVerified || !contact.phoneVerified)) { exclude("PENDING_REVIEW", contact.name); continue; }
    if (!contact.topics.includes(draft.topic)) { exclude("TOPIC_NOT_REQUESTED", contact.name); continue; }
    if (selected.providerPhones && !selected.providerPhones.includes(contact.phone)) { exclude("MEMBERSHIP_DIFFERENCE", contact.name); continue; }
    if (phones.has(contact.phone)) { exclude("DUPLICATE_PHONE", contact.name); continue; }
    phones.add(contact.phone);
    targets.push({ ...selected, name: contact.name, personKey: referenceKey(selected.reference), phone: contact.phone, contactVersion: contact.version, consentDigest: digest(contact.preferences ?? { topics: contact.topics, consentVersion: contact.consentVersion }), departmentKey: contact.departmentKey });
  }
  return { targets, groups, exclusions, excludedTargets, recipientCount: targets.length };
}
export async function preflightDispatch(db: PrismaClient, scope: OutreachScope, payload: unknown, injected?: GroupClient) {
  const draft = parseDispatchDraft(payload, scope.siteKey); requireOutreachDepartment(scope, draft.departmentKey);
  if (draft.parentDispatchId) {
    const parent = await db.zaadOneTimeDispatch.findFirst({ where: { ...outreachWhere(scope), id: draft.parentDispatchId } });
    if (!parent) throw new OutreachContractError("NOT_FOUND", 404);
    if (["UNKNOWN", "RUNNING", "EXECUTION_REQUESTED", "PREPARING"].includes(parent.appState ?? parent.state)) throw new OutreachContractError("DISPATCH_NOT_REPEATABLE", 409);
  }
  let messageRevision = null;
  if (draft.messageRevisionId) {
    messageRevision = await db.messageRevision.findFirst({ where: { siteKey: scope.siteKey, id: draft.messageRevisionId, message: { departmentKey: draft.departmentKey, retiredAt: null } } });
    if (!messageRevision) throw new OutreachContractError("NOT_FOUND", 404);
    if (messageRevision.body !== draft.body || messageRevision.voiceId !== draft.voiceId || messageRevision.languageCode !== draft.languageCode) throw new OutreachContractError("MESSAGE_REVISION_MISMATCH", 409);
  }
  let flow = null;
  if (draft.flowBindingId) {
    const binding = await db.zoomResourceBinding.findFirst({ where: { id: draft.flowBindingId, ownerSiteKey: scope.siteKey, departmentKey: draft.departmentKey, resourceType: "FLOW", tombstone: false } });
    if (!binding) throw new OutreachContractError("NOT_FOUND", 404);
    const client = injected ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
    await requireZoomBinding(db, scope, client, "FLOW", binding.zoomId);
    flow = { bindingId: binding.id, version: binding.version, observedDigest: binding.observedDigest };
  }
  const selection = await dispatchTargets(db, scope, draft, injected);
  const snapshot = { ...selection, name: draft.name, body: draft.body, voiceId: draft.voiceId, languageCode: draft.languageCode, connectionMode: draft.connectionMode, messageRevisionId: messageRevision?.id ?? null, contentDigest: digest({ body: draft.body, voiceId: draft.voiceId, languageCode: draft.languageCode }), flow, actorId: scope.actorId, draftDigest: digest(draft), createdAt: new Date().toISOString() };
  try {
    const row = await db.$transaction(async tx => {
      const prior = await tx.zaadOneTimeDispatch.findUnique({ where: { siteKey_operationKey: { siteKey: scope.siteKey, operationKey: draft.operationKey } } });
      if (prior) {
        if (prior.createdByUserId !== scope.actorId || digest(prior.draft) !== digest(draft)) throw new OutreachContractError("OPERATION_CONFLICT", 409);
        return prior;
      }
      const saved = await tx.zaadOneTimeDispatch.create({ data: { siteKey: scope.siteKey, operationKey: draft.operationKey, departmentKey: draft.departmentKey, appState: "VALIDATING", connectionMode: draft.connectionMode, messageRevisionId: draft.messageRevisionId, flowBindingId: draft.flowBindingId, parentDispatchId: draft.parentDispatchId, name: draft.name, body: draft.body, voiceId: draft.voiceId, languageCode: draft.languageCode, baseCampaignId: "", draft: json(draft), snapshot: json(snapshot), snapshotDigest: digest(snapshot), expiresAt: new Date(Date.now() + 300000), recipientCount: selection.recipientCount, duplicateCount: selection.exclusions.DUPLICATE_PHONE ?? 0, selectedListCount: draft.groupIds.length, selectedResidentCount: draft.people.length, createdByUserId: scope.actorId } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "one-time-dispatch", targetId: saved.id, action: "CREATE", result: "SUCCESS", changedFieldNames: ["draft", "snapshot"] });
      return saved;
    }, { isolationLevel: "Serializable" });
    return { tenantKey: scope.siteKey, id: row.id, version: row.revision, snapshotDigest: row.snapshotDigest, snapshot: row.snapshot, expiresAt: row.expiresAt, appState: row.appState, executionReady: false, disabledReason: row.recipientCount === 0 ? "NO_ELIGIBLE_TARGETS" : draft.connectionMode === "FLOW" ? "FLOW_CONTRACT_NOT_VERIFIED" : "AUDIO_CONTRACT_NOT_VERIFIED" };
  } catch (error) { databaseError(error); }
}
export async function getDispatch(db: PrismaClient, scope: OutreachScope, id: string) {
  const row = await db.zaadOneTimeDispatch.findFirst({ where: { ...outreachWhere(scope), id }, include: { messageRevision: { select: { messageId: true, name: true, revision: true } } } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, dispatch: row, executionReady: false, disabledReason: "LIVE_CONTRACT_NOT_VERIFIED" };
}
export async function listDispatches(db: PrismaClient, scope: OutreachScope) {
  const items = await db.zaadOneTimeDispatch.findMany({ where: outreachWhere(scope), orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, name: true, siteKey: true, departmentKey: true, appState: true, state: true, recipientCount: true, createdAt: true, revision: true, parentDispatchId: true } });
  return { tenantKey: scope.siteKey, items, total: items.length, nextCursor: null };
}
export async function inspectDispatchConfirmation(db: PrismaClient, scope: OutreachScope, id: string, injected?: GroupClient) {
  const result = await getDispatch(db, scope, id), { dispatch } = result;
  let confirmationStatus: "CURRENT" | "TARGET_CHANGED" | "EXPIRED" | "ALREADY_REQUESTED" | "UNAVAILABLE" = "CURRENT";
  if (dispatch.appState !== "VALIDATING") confirmationStatus = "ALREADY_REQUESTED";
  else {
    try { await assertCurrentSelection(db, scope, dispatch, injected); }
    catch (error) {
      confirmationStatus = error instanceof OutreachContractError && ["TARGET_CHANGED", "NOT_FOUND", "DEPARTMENT_MISMATCH"].includes(error.code) ? "TARGET_CHANGED" : "UNAVAILABLE";
    }
    if (confirmationStatus === "CURRENT" && (!dispatch.expiresAt || dispatch.expiresAt < new Date())) confirmationStatus = "EXPIRED";
  }
  return { ...result, confirmationStatus };
}
export async function prepareDispatch(db: PrismaClient, scope: OutreachScope, payload: unknown, injected?: GroupClient) {
  const confirmation = parseDispatchConfirmation(payload), { dispatch } = await getDispatch(db, scope, confirmation.id);
  if (dispatch.operationKey !== confirmation.operationKey || dispatch.revision !== confirmation.version || dispatch.snapshotDigest !== confirmation.snapshotDigest || !dispatch.expiresAt || dispatch.expiresAt < new Date()) throw new OutreachContractError("TARGET_CHANGED", 409);
  if (dispatch.appState !== "VALIDATING") throw new OutreachContractError("DISPATCH_NOT_REPEATABLE", 409);
  await assertCurrentSelection(db, scope, dispatch, injected);
  // Preparation is read-only with respect to Zoom until the live contract is verified.
  throw new OutreachContractError(dispatch.connectionMode === "FLOW" ? "FLOW_CONTRACT_NOT_VERIFIED" : "AUDIO_CONTRACT_NOT_VERIFIED", 409);
}
async function assertCurrentSelection(db: PrismaClient, scope: OutreachScope, dispatch: Awaited<ReturnType<typeof getDispatch>>["dispatch"], injected?: GroupClient) {
  const draft = parseDispatchDraft(dispatch.draft, scope.siteKey);
  requireOutreachDepartment(scope, draft.departmentKey);
  const saved = dispatch.snapshot;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new OutreachContractError("TARGET_CHANGED", 409);
  const current = await dispatchTargets(db, scope, draft, injected);
  // Observation timestamps change on every read; membership, consent and contact
  // versions must still match the immutable confirmation before preparation.
  const groups = (value: unknown) => Array.isArray(value) ? value.map(group => {
    if (!group || typeof group !== "object" || Array.isArray(group)) return null;
    return Object.fromEntries(Object.entries(group).filter(([key]) => key !== "observedAt"));
  }) : null;
  const previousSelection = { targets: saved.targets, groups: groups(saved.groups), exclusions: saved.exclusions, recipientCount: saved.recipientCount };
  const currentSelection = { targets: current.targets, groups: groups(current.groups), exclusions: current.exclusions, recipientCount: current.recipientCount };
  if (digest(previousSelection) !== digest(currentSelection)) throw new OutreachContractError("TARGET_CHANGED", 409);
}
export async function executeDispatch(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown) {
  const confirmation = parseDispatchConfirmation(payload);
  if (confirmation.id !== id) throw new OutreachContractError("TARGET_CHANGED", 409);
  await getDispatch(db, scope, id);
  if (!scope.live) throw new OutreachContractError("LIVE_DISABLED", 403);
  return prepareDispatch(db, scope, payload);
}
