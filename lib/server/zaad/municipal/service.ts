import { municipalContactDigest } from "./snapshots";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { canAdminAccess } from "@/lib/admin-access/authorization";
import { getAdminAccessActor } from "@/lib/server/admin-access/queries";
import { fields, OutreachContractError, record, stringList, stringValue, whole, operationKey, choice } from "@/lib/zaad/outreach-contracts";
import { MUNICIPAL_PURPOSES, parseAnswers, parseBusinessEvidence, parseCaseUpdate, parseWorkflow, type BusinessEvidence, type CaseState } from "@/lib/zaad/municipal/contracts";
import { classifyMunicipalAnswers, eligibleMunicipalTarget, nextDueSlot, requireCaseTransition } from "@/lib/zaad/municipal/workflows";
import { resolveOutreachScope, outreachWhere, type OutreachScope } from "../outreach-scope";
import type { Database } from "../university/permissions";
import { databaseError, digest, json } from "../outreach-data";
import { writeZaadAudit } from "../audit";
import { configuredMunicipalProvider, type MunicipalProvider } from "./provider";

export async function requireMunicipalAssignee(db: Database, scope: OutreachScope, assigneeId: string) {
  const actor = await getAdminAccessActor(db, assigneeId);
  if (!actor || !canAdminAccess(actor, "zaad", "UPDATE")) throw new OutreachContractError("ASSIGNEE_UNAVAILABLE", 422);
  await resolveOutreachScope(db, actor, scope.siteKey);
}
function municipal(scope: OutreachScope) { if (scope.siteKey !== "lg") throw new OutreachContractError("NOT_FOUND", 404); }
export async function getWorkflow(db: Database, scope: OutreachScope, workflowId: string) {
  municipal(scope);
  const row = await db.municipalWorkflowRevision.findFirst({ where: { ...outreachWhere(scope), workflowId }, orderBy: { revision: "desc" } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  return row;
}
export async function listWorkflows(db: Database, scope: OutreachScope, provider = configuredMunicipalProvider()) {
  municipal(scope);
  const rows = await db.municipalWorkflowRevision.findMany({ where: outreachWhere(scope), orderBy: [{ workflowId: "asc" }, { revision: "desc" }], distinct: ["workflowId"] });
  const items = await Promise.all(rows.map(async row => ({ ...row, readiness: await provider.readiness(row.flowBindingId) })));
  return { tenantKey: scope.siteKey, items, total: items.length, nextCursor: null, observedAt: new Date().toISOString() };
}
export async function saveWorkflow(db: PrismaClient, scope: OutreachScope, payload: unknown, workflowId?: string) {
  municipal(scope);
  const request = record(payload), { initialTargets: rawTargets, ...settings } = request;
  const input = parseWorkflow(settings);
  if (rawTargets !== undefined && (workflowId || !Array.isArray(rawTargets) || rawTargets.length > 1000)) throw new OutreachContractError("INVALID_TARGETS");
  const initialTargets = (rawTargets as unknown[] | undefined ?? []).map(raw => { const target = record(raw); fields(target, ["contactId", "businessEvidence", "excluded"]); if (typeof target.excluded !== "boolean") throw new OutreachContractError("INVALID_TARGETS"); const evidence = parseBusinessEvidence(target.businessEvidence, input.purpose); if (evidence.purpose === "FRAUD_ALERT") evidence.verifiedBy = scope.actorId; return { contactId: stringValue(target.contactId), evidence, excluded: target.excluded }; });
  if (new Set(initialTargets.map(target => target.contactId)).size !== initialTargets.length) throw new OutreachContractError("INVALID_TARGETS");
  await requireMunicipalAssignee(db, scope, input.assigneeId);
  if (input.flowBindingId) {
    const binding = await db.zoomResourceBinding.findFirst({ where: { id: input.flowBindingId, ownerSiteKey: scope.siteKey, resourceType: "FLOW", tombstone: false } });
    if (!binding) throw new OutreachContractError("NOT_FOUND", 404);
  }
  try {
    return await db.$transaction(async tx => {
      const previous = workflowId ? await getWorkflow(tx, scope, workflowId) : null;
      if (previous && (input.version !== previous.revision || previous.purpose !== input.purpose)) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const row = await tx.municipalWorkflowRevision.create({ data: { siteKey: scope.siteKey, workflowId: workflowId ?? randomUUID(), revision: (previous?.revision ?? 0) + 1, purpose: input.purpose, name: input.name, questionVersion: input.questionVersion, settings: json(input), flowBindingId: input.flowBindingId, assigneeId: input.assigneeId, dueAt: new Date(input.dueAt), enabled: false, createdBy: scope.actorId } });
      if (previous) {
        const targets = await tx.municipalWorkflowTarget.findMany({ where: { siteKey: scope.siteKey, workflowRevisionId: previous.id } });
        await tx.municipalWorkflowTarget.createMany({ data: targets.map(target => ({ siteKey: scope.siteKey, workflowRevisionId: row.id, contactId: target.contactId, businessEvidence: json(target.businessEvidence), excluded: target.excluded, verifiedBy: target.verifiedBy, verifiedAt: target.verifiedAt, version: target.version })) });
        await tx.municipalScheduleJob.updateMany({ where: { siteKey: scope.siteKey, workflowId: previous.workflowId, state: "PENDING" }, data: { state: "CANCELLED" } });
      }
      const createdTargets = [];
      for (const target of initialTargets) {
        const contact = await tx.municipalContact.findFirst({ where: { ...outreachWhere(scope), id: target.contactId } });
        if (!contact) throw new OutreachContractError("NOT_FOUND", 404);
        await requireCurrentMunicipalEvidence(tx, scope.siteKey, contact.id, target.evidence);
        createdTargets.push(await tx.municipalWorkflowTarget.create({ data: { siteKey: scope.siteKey, workflowRevisionId: row.id, contactId: contact.id, businessEvidence: json(target.evidence), excluded: target.excluded, verifiedBy: scope.actorId, verifiedAt: new Date() } }));
      }
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "municipal-workflow", targetId: row.id, action: previous ? "UPDATE" : "CREATE", result: "SUCCESS", changedFieldNames: ["revision", "settings"] });
      return { tenantKey: scope.siteKey, workflow: row, targets: createdTargets };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
export async function requireCurrentMunicipalEvidence(db: Database, siteKey: string, contactId: string, evidence: BusinessEvidence) {
  if (evidence.purpose !== "ELDER_WATCH") return;
  const latest = await db.municipalAvailability.findFirst({ where: { siteKey, contactId }, orderBy: { revision: "desc" } });
  if (!latest?.confirmed || latest.revision !== evidence.availabilityRevision || digest(latest.confirmed) !== digest(evidence.confirmedAvailability)) throw new OutreachContractError("AVAILABILITY_CHANGED", 409);
}
export async function setWorkflowTarget(db: PrismaClient, scope: OutreachScope, workflowId: string, payload: unknown) {
  const v = record(payload); fields(v, ["version", "contactId", "targetVersion", "businessEvidence", "excluded"]);
  const workflow = await getWorkflow(db, scope, workflowId), contactId = stringValue(v.contactId);
  if (whole(v.version) !== workflow.revision || typeof v.excluded !== "boolean") throw new OutreachContractError("VERSION_CONFLICT", 409);
  const contact = await db.municipalContact.findFirst({ where: { ...outreachWhere(scope), id: contactId } });
  if (!contact) throw new OutreachContractError("NOT_FOUND", 404);
  const evidence = parseBusinessEvidence(v.businessEvidence, choice(workflow.purpose, MUNICIPAL_PURPOSES));
  if (evidence.purpose === "FRAUD_ALERT") evidence.verifiedBy = scope.actorId;
  try {
    return await db.$transaction(async tx => {
      const latest = await getWorkflow(tx, scope, workflowId);
      if (latest.revision !== workflow.revision) throw new OutreachContractError("VERSION_CONFLICT", 409);
      await requireCurrentMunicipalEvidence(tx, scope.siteKey, contactId, evidence);
      const previous = await tx.municipalWorkflowTarget.findUnique({ where: { siteKey_workflowRevisionId_contactId: { siteKey: scope.siteKey, workflowRevisionId: workflow.id, contactId } } });
      if (previous && v.targetVersion !== previous.version) throw new OutreachContractError("VERSION_CONFLICT", 409);
      const target = previous ? await tx.municipalWorkflowTarget.update({ where: { id: previous.id, version: previous.version }, data: { businessEvidence: json(evidence), excluded: v.excluded as boolean, verifiedBy: scope.actorId, verifiedAt: new Date(), version: { increment: 1 } } })
        : await tx.municipalWorkflowTarget.create({ data: { siteKey: scope.siteKey, workflowRevisionId: workflow.id, contactId, businessEvidence: json(evidence), excluded: v.excluded as boolean, verifiedBy: scope.actorId, verifiedAt: new Date() } });
      if (v.excluded || (evidence.purpose === "PROCEDURE_SUPPORT" && evidence.status !== "INCOMPLETE") || (evidence.purpose === "SERVICE_CONFIRMATION" && evidence.status !== "CONFIRMED")) {
        const snapshots = await tx.municipalTargetSnapshot.findMany({ where: { siteKey: scope.siteKey, targetId: target.id }, select: { id: true } });
        await tx.municipalScheduleJob.updateMany({ where: { siteKey: scope.siteKey, targetSnapshotId: { in: snapshots.map(row => row.id) }, state: "PENDING" }, data: { state: "CANCELLED" } });
      }
      return { tenantKey: scope.siteKey, target };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
export async function workflowTargets(db: Database, scope: OutreachScope, workflowId: string, now = new Date()) {
  const workflow = await getWorkflow(db, scope, workflowId), settings = parseWorkflow(workflow.settings);
  const rows = await db.municipalWorkflowTarget.findMany({ where: { siteKey: scope.siteKey, workflowRevisionId: workflow.id, contact: outreachWhere(scope) }, include: { contact: { include: { preferences: true } } }, orderBy: { id: "asc" } });
  return { tenantKey: scope.siteKey, workflow, items: rows.map(row => ({ id: row.id, version: row.version, contactId: row.contactId, contactVersion: row.contact.version, contactDigest: municipalContactDigest(row.contact), name: row.contact.name, phoneLast4: row.contact.phone.slice(-4), businessEvidence: row.businessEvidence, excluded: row.excluded, ...eligibleMunicipalTarget({ purpose: settings.purpose, contact: row.contact, businessEvidence: row.businessEvidence, excluded: row.excluded, dueAt: workflow.dueAt, now, schedule: settings.schedule }) })) };
}
export async function previewWorkflowRun(db: PrismaClient, scope: OutreachScope, workflowId: string, payload: unknown, provider: MunicipalProvider = configuredMunicipalProvider()) {
  const v = record(payload); fields(v, ["version", "selection", "operationKey"]);
  const selection = stringList(v.selection, 1000).sort(), key = operationKey(v.operationKey);
  if (!selection.length) throw new OutreachContractError("EMPTY_SELECTION");
  const current = await workflowTargets(db, scope, workflowId), workflow = current.workflow;
  if (whole(v.version) !== workflow.revision) throw new OutreachContractError("VERSION_CONFLICT", 409);
  if (selection.some(id => !current.items.some(row => row.id === id))) throw new OutreachContractError("NOT_FOUND", 404);
  const eligible = current.items.filter(row => selection.includes(row.id) && row.eligible), excluded = current.items.filter(row => selection.includes(row.id) && !row.eligible);
  const readiness = await provider.readiness(workflow.flowBindingId);
  const snapshot = { scopeContract: "tenant-v1", workflow, selected: selection, eligible, excluded }, snapshotDigest = digest(snapshot);
  try {
    const run = await db.$transaction(async tx => {
      const previous = await tx.municipalOutreachRun.findUnique({ where: { siteKey_actorId_operationKey: { siteKey: scope.siteKey, actorId: scope.actorId, operationKey: key } } });
      if (previous) { if (previous.digest !== snapshotDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409); return previous; }
      const row = await tx.municipalOutreachRun.create({ data: { siteKey: scope.siteKey, workflowRevisionId: workflow.id, actorId: scope.actorId, operationKey: key, digest: snapshotDigest, snapshot: json(snapshot), expiresAt: new Date(Date.now() + 5 * 60000) } });
      for (const target of eligible) {
        const contact = await tx.municipalContact.findFirstOrThrow({ where: { ...outreachWhere(scope), id: target.contactId }, include: { preferences: true } });
        if (contact.version !== target.contactVersion || municipalContactDigest(contact) !== target.contactDigest) throw new OutreachContractError("TARGET_CHANGED", 409);
        await tx.municipalTargetSnapshot.create({ data: { siteKey: scope.siteKey, runId: row.id, contactId: contact.id, contactVersion: contact.version, targetId: target.id, targetVersion: target.version, snapshot: json({ contact, businessEvidence: target.businessEvidence, questionVersion: workflow.questionVersion, settings: workflow.settings }) } });
      }
      return row;
    }, { isolationLevel: "Serializable" });
    return { tenantKey: scope.siteKey, snapshotId: run.id, digest: run.digest, eligible: eligible.length, excluded, readiness, expiresAt: run.expiresAt.toISOString() };
  } catch (error) { databaseError(error); }
}
export async function queueWorkflowRun(db: PrismaClient, scope: OutreachScope, workflowId: string, payload: unknown, provider: MunicipalProvider = configuredMunicipalProvider()) {
  const v = record(payload); fields(v, ["version", "snapshotId", "digest", "operationKey"]);
  const workflow = await getWorkflow(db, scope, workflowId), settings = parseWorkflow(workflow.settings), key = operationKey(v.operationKey);
  if (!scope.live) throw new OutreachContractError("LIVE_DISABLED", 403);
  const readiness = await provider.readiness(workflow.flowBindingId);
  if (!readiness.ready) throw new OutreachContractError("PROVIDER_NOT_CONFIGURED", 503);
  await requireMunicipalAssignee(db, scope, workflow.assigneeId);
  const current = await workflowTargets(db, scope, workflowId);
  try {
    return await db.$transaction(async tx => {
      const freshWorkflow = await getWorkflow(tx, scope, workflowId);
      if (freshWorkflow.id !== workflow.id || freshWorkflow.revision !== workflow.revision) throw new OutreachContractError("TARGET_CHANGED", 409);
      const run = await tx.municipalOutreachRun.findFirst({ where: { id: stringValue(v.snapshotId), ...outreachWhere(scope), actorId: scope.actorId }, include: { targets: true } });
      if (!run) throw new OutreachContractError("NOT_FOUND", 404);
      if (run.operationKey !== key || run.digest !== v.digest || whole(v.version) !== workflow.revision || run.workflowRevisionId !== workflow.id) throw new OutreachContractError("TARGET_CHANGED", 409);
      if (run.state === "QUEUED") return { tenantKey: scope.siteKey, runId: run.id, state: run.state };
      if (record(run.snapshot).scopeContract !== "tenant-v1") throw new OutreachContractError("TARGET_CHANGED", 409);
      if (run.state !== "PREVIEW" || run.expiresAt <= new Date() || !run.targets.length) throw new OutreachContractError("PREVIEW_EXPIRED", 409);
      if (run.targets.some(target => !current.items.some(item => item.id === target.targetId && item.eligible && item.version === target.targetVersion && item.contactVersion === target.contactVersion))) throw new OutreachContractError("TARGET_CHANGED", 409);
      for (const target of run.targets) {
        const currentTarget = await tx.municipalWorkflowTarget.findFirst({ where: { id: target.targetId, siteKey: scope.siteKey, workflowRevisionId: workflow.id }, include: { contact: { include: { preferences: true } } } });
        const snapshot = record(target.snapshot);
        if (!currentTarget || currentTarget.version !== target.targetVersion || municipalContactDigest(currentTarget.contact) !== municipalContactDigest(snapshot.contact)) throw new OutreachContractError("TARGET_CHANGED", 409);
        const eligibility = eligibleMunicipalTarget({ purpose: settings.purpose, contact: currentTarget.contact, businessEvidence: currentTarget.businessEvidence, excluded: currentTarget.excluded, dueAt: workflow.dueAt, now: new Date(), schedule: settings.schedule });
        if (!eligibility.eligible || !eligibility.evidence) throw new OutreachContractError("TARGET_CHANGED", 409);
        await requireCurrentMunicipalEvidence(tx, scope.siteKey, currentTarget.contactId, eligibility.evidence);
        const evidence = eligibility.evidence, windows = [settings.schedule];
        if (evidence.purpose === "ELDER_WATCH") windows.push(evidence.confirmedAvailability);
        if (evidence.purpose === "SERVICE_CONFIRMATION") windows.push(evidence.contactWindow);
        const deadline = new Date(Math.min(workflow.dueAt.getTime(), evidence.purpose === "SERVICE_CONFIRMATION" ? Date.parse(evidence.startsAt) : Infinity, evidence.purpose === "PROCEDURE_SUPPORT" ? Date.parse(evidence.deadline) : Infinity));
        const dueAt = nextDueSlot(new Date(), deadline, windows);
        if (!dueAt) throw new OutreachContractError("NO_VALID_TIME_SLOT", 409);
        await tx.municipalScheduleJob.create({ data: { siteKey: scope.siteKey, workflowId, scheduleRevision: workflow.revision, targetSnapshotId: target.id, dueSlot: dueAt.toISOString(), dueAt, attemptNo: 1 } });
      }
      await tx.municipalOutreachRun.update({ where: { id: run.id }, data: { state: "QUEUED" } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "municipal-run", targetId: run.id, action: "QUEUE", result: "SUCCESS", changedFieldNames: ["state", "schedule"] });
      return { tenantKey: scope.siteKey, runId: run.id, state: "QUEUED" };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}
export async function getMunicipalRun(db: Database, scope: OutreachScope, id: string) {
  municipal(scope);
  const run = await db.municipalOutreachRun.findFirst({ where: { id, ...outreachWhere(scope) }, include: { workflow: true, targets: { include: { attempts: { orderBy: { attemptNo: "asc" }, select: { id: true, attemptNo: true, callState: true, identityState: true, ackState: true, recognitionState: true, questionVersion: true, responses: { select: { answers: true, outcome: true, occurredAt: true } } } }, cases: true } } } });
  if (!run) throw new OutreachContractError("NOT_FOUND", 404);
  const purpose = choice(run.workflow.purpose, MUNICIPAL_PURPOSES);
  const attempts = await db.municipalCallAttempt.findMany({ where: { siteKey: scope.siteKey, target: { runId: run.id } }, select: { providerAccountId: true, engagementId: true } });
  const matches = attempts.filter(attempt => attempt.engagementId).map(attempt => ({ accountId: attempt.providerAccountId, engagementId: attempt.engagementId }));
  const eventIssues = matches.length ? await db.municipalProviderInbox.findMany({ where: { state: "QUARANTINED", OR: matches }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, errorCode: true, eventKind: true, occurredAt: true, receivedAt: true } }) : [];
  return { tenantKey: scope.siteKey, run: { ...run, eventIssues, targets: run.targets.map(target => ({ ...target, attempts: target.attempts.map(attempt => ({ ...attempt, responses: attempt.responses.map(response => ({ ...response, outcome: classifyMunicipalAnswers(purpose, { ...attempt, answers: parseAnswers(response.answers, purpose) }) })) })) })) } };
}
export async function getMunicipalCase(db: Database, scope: OutreachScope, id: string) {
  municipal(scope);
  const row = await db.municipalSupportCase.findFirst({ where: { ...outreachWhere(scope), id }, include: { target: { select: { snapshot: true, runId: true } }, actions: { orderBy: { createdAt: "asc" } } } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, case: row };
}
export async function listMunicipalCases(db: Database, scope: OutreachScope, query: { status?: string; purpose?: string; assigneeId?: string; overdue?: boolean; unconfirmed?: boolean; cursor?: string }) {
  municipal(scope);
  const where = { ...outreachWhere(scope), ...(query.status ? { status: choice(query.status, ["OPEN", "IN_PROGRESS", "HANDOFF_PENDING", "HANDOFF_RECEIVED", "COMPLETED"]) } : {}), ...(query.purpose ? { purpose: choice(query.purpose, MUNICIPAL_PURPOSES) } : {}), ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}), ...(query.overdue ? { dueAt: { lt: new Date() } } : {}), ...(query.unconfirmed ? { reasons: { hasSome: ["UNCONFIRMED", "NO_ANSWER"] } } : {}) };
  if (query.cursor && !await db.municipalSupportCase.findFirst({ where: { ...where, id: query.cursor } })) throw new OutreachContractError("INVALID_CURSOR");
  const rows = await db.municipalSupportCase.findMany({ where, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 26, include: { target: { select: { snapshot: true, runId: true } } } });
  return { tenantKey: scope.siteKey, items: rows.slice(0, 25), total: await db.municipalSupportCase.count({ where }), nextCursor: rows.length > 25 ? rows[24].id : null, observedAt: new Date().toISOString() };
}
export async function updateMunicipalCase(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown) {
  municipal(scope);
  const raw = record(payload);
  try {
    return await db.$transaction(async tx => {
      const current = await tx.municipalSupportCase.findFirst({ where: { ...outreachWhere(scope), id } });
      if (!current) throw new OutreachContractError("NOT_FOUND", 404);
      const input = parseCaseUpdate({ ...raw, handoff: raw.handoff ?? current.handoff, businessVerification: raw.businessVerification ?? (current.businessVerification ? undefined : null) });
      const requestDigest = digest(raw), unique = { siteKey: scope.siteKey, caseId: id, actorId: scope.actorId, operationKey: input.operationKey };
      const previous = await tx.municipalCaseAction.findUnique({ where: { siteKey_caseId_actorId_operationKey: unique } });
      if (previous) { if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409); return { tenantKey: scope.siteKey, case: current }; }
      if (current.version !== input.version) throw new OutreachContractError("VERSION_CONFLICT", 409);
      requireCaseTransition(current.status as CaseState, input.status);
      await requireMunicipalAssignee(tx, scope, input.assigneeId);
      if (input.handoff) await requireMunicipalAssignee(tx, scope, input.handoff.recipientId);
      if (input.handoff?.receivedBy) await requireMunicipalAssignee(tx, scope, input.handoff.receivedBy);
      const verification = input.businessVerification;
      if (verification && ((verification.type === "VERIFIED_COMPLETE" && current.purpose !== "PROCEDURE_SUPPORT") || (verification.type === "CHANGE_VERIFIED" && current.purpose !== "SERVICE_CONFIRMATION"))) throw new OutreachContractError("PURPOSE_MISMATCH", 422);
      if (input.status === "COMPLETED" && !verification && !current.businessVerification && ((current.purpose === "PROCEDURE_SUPPORT" && current.reasons.includes("COMPLETION_REPORTED")) || (current.purpose === "SERVICE_CONFIRMATION" && current.reasons.some(reason => ["CHANGE_REQUESTED", "CANCELLATION_REQUESTED"].includes(reason))))) throw new OutreachContractError("BUSINESS_VERIFICATION_REQUIRED", 422);
      const updated = await tx.municipalSupportCase.updateMany({ where: { id, ...outreachWhere(scope), version: input.version }, data: { assigneeId: input.assigneeId, dueAt: new Date(input.dueAt), status: input.status, ...(input.handoff ? { handoff: json(input.handoff) } : {}), ...(verification ? { businessVerification: json({ ...verification, actorId: scope.actorId }) } : {}), version: { increment: 1 } } });
      if (updated.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
      await tx.municipalCaseAction.create({ data: { ...unique, requestDigest, fromVersion: current.version, toVersion: current.version + 1, details: json({ ...input, actorId: scope.actorId }) } });
      if (input.status === "COMPLETED" || verification) await tx.municipalScheduleJob.updateMany({ where: { siteKey: scope.siteKey, targetSnapshotId: current.targetSnapshotId, state: "PENDING" }, data: { state: "CANCELLED" } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "municipal-case", targetId: id, action: "UPDATE", result: "SUCCESS", changedFieldNames: ["status", "assignee", "action"] });
      return { tenantKey: scope.siteKey, case: await tx.municipalSupportCase.findUniqueOrThrow({ where: { id } }) };
    }, { isolationLevel: "Serializable" });
  } catch (error) { databaseError(error); }
}

export async function listMunicipalAssignees(db: PrismaClient, scope: OutreachScope) {
  municipal(scope);
  const users = await db.user.findMany({ where: { OR: [{ banned: false }, { banned: null }] }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  const items = [];
  for (const user of users) {
    const actor = await getAdminAccessActor(db, user.id);
    if (!actor || !canAdminAccess(actor, "zaad", "UPDATE")) continue;
    try {
      await resolveOutreachScope(db, actor, "lg");
      items.push({ id: user.id, name: user.name });
    } catch (error) { if (!(error instanceof OutreachContractError)) throw error; }
  }
  return { tenantKey: scope.siteKey, items, total: items.length, nextCursor: null };
}
