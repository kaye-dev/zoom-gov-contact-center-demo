import { municipalContactDigest } from "./snapshots";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { getAdminAccessActor } from "@/lib/server/admin-access/queries";
import { canAdminAccess } from "@/lib/admin-access/authorization";
import { choice, OutreachContractError, record, stringValue } from "@/lib/zaad/outreach-contracts";
import { MUNICIPAL_PURPOSES, parseWorkflow, type Availability } from "@/lib/zaad/municipal/contracts";
import { eligibleMunicipalTarget, nextDueSlot } from "@/lib/zaad/municipal/workflows";
import { resolveOutreachScope } from "../outreach-scope";
import { json } from "../outreach-data";
import { configuredMunicipalProvider, type MunicipalProvider, type MunicipalSendInput } from "./provider";
import { getWorkflow, requireCurrentMunicipalEvidence, requireMunicipalAssignee } from "./service";
import type { Database } from "../university/permissions";

export async function ensureMunicipalCase(db: Database, siteKey: string, targetSnapshotId: string, reasons: string[]) {
  const target = await db.municipalTargetSnapshot.findFirstOrThrow({ where: { siteKey, id: targetSnapshotId }, include: { run: { include: { workflow: true } } } });
  const workflow = target.run.workflow;
  const existing = await db.municipalSupportCase.findUnique({ where: { siteKey_targetSnapshotId: { siteKey, targetSnapshotId } } });
  if (existing) {
    // Preserve manual completion; delayed observations remain in their receipt/inbox.
    if (existing.status !== "COMPLETED") await db.municipalSupportCase.update({ where: { id: existing.id }, data: { reasons: [...new Set([...existing.reasons, ...reasons])], version: { increment: 1 } } });
    return existing;
  }
  return db.municipalSupportCase.create({ data: { siteKey, targetSnapshotId, departmentKey: workflow.departmentKey, purpose: workflow.purpose, reasons: [...new Set(reasons)], assigneeId: workflow.assigneeId, dueAt: workflow.dueAt } });
}
export async function scheduleMunicipalRetry(db: Database, siteKey: string, attemptId: string, now = new Date()) {
  const attempt = await db.municipalCallAttempt.findFirstOrThrow({ where: { siteKey, id: attemptId }, include: { target: { include: { run: { include: { workflow: true } }, cases: true } } } });
  if (attempt.ackState === "CONFIRMED" || attempt.target.cases.length || !["NO_ANSWER", "BUSY", "REJECTED", "FAILED"].includes(attempt.callState)) return;
  const workflow = attempt.target.run.workflow, settings = parseWorkflow(workflow.settings);
  const snapshot = record(attempt.target.snapshot), evidence = record(snapshot.businessEvidence);
  const windows: Availability[] = [settings.schedule];
  if (evidence.purpose === "ELDER_WATCH") windows.push(evidence.confirmedAvailability as Availability);
  if (evidence.purpose === "SERVICE_CONFIRMATION") windows.push(evidence.contactWindow as Availability);
  const deadline = new Date(Math.min(workflow.dueAt.getTime(), typeof evidence.startsAt === "string" ? Date.parse(evidence.startsAt) : Infinity, typeof evidence.deadline === "string" ? Date.parse(evidence.deadline) : Infinity));
  const dueAt = attempt.attemptNo <= settings.maxRetries ? nextDueSlot(new Date(now.getTime() + settings.retryIntervalMinutes * 60000), deadline, windows) : null;
  if (!dueAt) {
    await ensureMunicipalCase(db, siteKey, attempt.targetSnapshotId, ["NO_ANSWER", "RETRY_LIMIT_REACHED"]);
    return;
  }
  const key = { siteKey, workflowId: workflow.workflowId, scheduleRevision: workflow.revision, dueSlot: dueAt.toISOString(), targetSnapshotId: attempt.targetSnapshotId, attemptNo: attempt.attemptNo + 1 };
  await db.municipalScheduleJob.upsert({ where: { siteKey_workflowId_scheduleRevision_dueSlot_targetSnapshotId_attemptNo: key }, create: { ...key, dueAt }, update: {} });
}

async function latestSendInput(db: PrismaClient, jobId: string, now: Date, provider: MunicipalProvider) {
  const job = await db.municipalScheduleJob.findFirstOrThrow({ where: { id: jobId, siteKey: "lg" }, include: { target: { include: { run: true, cases: true } } } });
  const actor = await getAdminAccessActor(db, job.target.run.actorId);
  if (!actor || !canAdminAccess(actor, "zaad", "UPDATE")) throw new OutreachContractError("ADMIN_ACCESS_DENIED", 403);
  const scope = await resolveOutreachScope(db, actor, "lg");
  if (!scope.live) throw new OutreachContractError("LIVE_DISABLED", 403);
  const workflow = await getWorkflow(db, scope, job.workflowId), settings = parseWorkflow(workflow.settings);
  if (workflow.revision !== job.scheduleRevision || job.target.cases.length || job.target.state === "CONFIRMED") throw new OutreachContractError("TARGET_CHANGED", 409);
  const target = await db.municipalWorkflowTarget.findFirst({ where: { id: job.target.targetId, siteKey: "lg", workflowRevisionId: workflow.id }, include: { contact: { include: { preferences: true } } } });
  if (!target || target.version !== job.target.targetVersion || target.contact.version !== job.target.contactVersion || municipalContactDigest(target.contact) !== municipalContactDigest(record(job.target.snapshot).contact)) throw new OutreachContractError("TARGET_CHANGED", 409);
  const eligibility = eligibleMunicipalTarget({ purpose: choice(workflow.purpose, MUNICIPAL_PURPOSES), contact: target.contact, businessEvidence: target.businessEvidence, allowedDepartments: scope.departments, excluded: target.excluded, dueAt: workflow.dueAt, now, schedule: settings.schedule, dispatch: true });
  if (eligibility.evidence) await requireCurrentMunicipalEvidence(db, "lg", target.contactId, eligibility.evidence);
  if (!eligibility.eligible) throw new OutreachContractError(eligibility.reasons[0], 409);
  await requireMunicipalAssignee(db, scope, workflow.assigneeId, workflow.departmentKey);
  const readiness = await provider.readiness(workflow.flowBindingId);
  if (!readiness.ready || !readiness.accountId || !readiness.flowBindingId) throw new OutreachContractError("PROVIDER_NOT_CONFIGURED", 503);
  return { job, settings, readiness, phone: target.contact.phone };
}
export async function municipalTick(db: PrismaClient, options: { provider?: MunicipalProvider; now?: Date; limit?: number } = {}) {
  const provider = options.provider ?? configuredMunicipalProvider(), now = options.now ?? new Date(), owner = randomUUID();
  const limit = Math.max(1, Math.min(options.limit ?? 20, 20)), started = Date.now();
  let processed = 0, accepted = 0, unknown = 0, blocked = 0;
  // A crashed send is not a new opportunity to issue another non-idempotent POST.
  const expired = await db.municipalScheduleJob.findMany({ where: { siteKey: "lg", state: "CLAIMED", leaseUntil: { lt: now } }, include: { outbox: true }, take: limit });
  for (const job of expired) {
    if (job.outbox) {
      await db.$transaction(async tx => {
        await tx.municipalOutbox.update({ where: { id: job.outbox!.id }, data: { state: "UNKNOWN" } });
        await tx.municipalScheduleJob.update({ where: { id: job.id }, data: { state: "UNKNOWN" } });
      });
    } else await db.municipalScheduleJob.updateMany({ where: { id: job.id, state: "CLAIMED", leaseUntil: { lt: now } }, data: { state: "PENDING", leaseOwner: null, leaseUntil: null } });
  }
  const jobs = await db.municipalScheduleJob.findMany({ where: { siteKey: "lg", state: "PENDING", dueAt: { lte: now } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: limit });
  for (const candidate of jobs) {
    if (Date.now() - started > 10000) break;
    const claim = await db.municipalScheduleJob.updateMany({ where: { id: candidate.id, siteKey: "lg", state: "PENDING" }, data: { state: "CLAIMED", leaseOwner: owner, leaseUntil: new Date(now.getTime() + 60000) } });
    if (claim.count !== 1) continue;
    processed++;
    let prepared: Awaited<ReturnType<typeof latestSendInput>>;
    try { prepared = await latestSendInput(db, candidate.id, options.now ?? new Date(), provider); }
    catch (error) {
      const code = error instanceof OutreachContractError ? error.code : "RECHECK_UNAVAILABLE";
      await db.municipalScheduleJob.updateMany({ where: { id: candidate.id, leaseOwner: owner }, data: { state: "BLOCKED" } });
      await ensureMunicipalCase(db, "lg", candidate.targetSnapshotId, [code]);
      blocked++; continue;
    }
    const correlationId = randomUUID(), key = `municipal-${candidate.id}`;
    const attempt = await db.$transaction(async tx => {
      const row = await tx.municipalCallAttempt.create({ data: { siteKey: "lg", targetSnapshotId: candidate.targetSnapshotId, attemptNo: candidate.attemptNo, questionVersion: prepared.settings.questionVersion, providerAccountId: prepared.readiness.accountId!, flowBindingId: prepared.readiness.flowBindingId! } });
      await tx.municipalOutbox.create({ data: { siteKey: "lg", jobId: candidate.id, operationKey: key, correlationId, state: "SENDING", providerResult: json({ attemptId: row.id }) } });
      return row;
    });
    const input: MunicipalSendInput = { siteKey: "lg", operationKey: key, correlationId, attemptId: attempt.id, phone: prepared.phone, body: prepared.settings.body, voiceId: prepared.settings.voiceId, flowBindingId: prepared.readiness.flowBindingId!, questionVersion: prepared.settings.questionVersion };
    try {
      // Recheck after durable preparation and immediately before crossing the provider boundary.
      await latestSendInput(db, candidate.id, options.now ?? new Date(), provider);
      const result = await provider.send(input);
      const state = result.state === "ACCEPTED" && result.engagementId ? "ACCEPTED" : "UNKNOWN";
      await db.$transaction(async tx => {
        await tx.municipalOutbox.update({ where: { siteKey_jobId: { siteKey: "lg", jobId: candidate.id } }, data: { state, providerResult: json({ ...result, attemptId: attempt.id }) } });
        await tx.municipalCallAttempt.update({ where: { id: attempt.id }, data: { engagementId: result.engagementId ?? null, callState: state === "UNKNOWN" ? "UNKNOWN" : "QUEUED" } });
        await tx.municipalScheduleJob.update({ where: { id: candidate.id }, data: { state: state === "ACCEPTED" ? "SENT" : "UNKNOWN" } });
      });
      if (state === "ACCEPTED") accepted++; else unknown++;
    } catch {
      await db.$transaction(async tx => {
        await tx.municipalOutbox.update({ where: { siteKey_jobId: { siteKey: "lg", jobId: candidate.id } }, data: { state: "UNKNOWN" } });
        await tx.municipalCallAttempt.update({ where: { id: attempt.id }, data: { callState: "UNKNOWN" } });
        await tx.municipalScheduleJob.update({ where: { id: candidate.id }, data: { state: "UNKNOWN" } });
        await ensureMunicipalCase(tx, "lg", candidate.targetSnapshotId, ["SEND_RESULT_UNKNOWN"]);
      });
      unknown++;
    }
  }
  const backlog = await db.municipalScheduleJob.count({ where: { siteKey: "lg", state: "PENDING", dueAt: { lte: now } } });
  return { processed, accepted, unknown, blocked, backlog };
}
export async function reconcileMunicipalOutbox(db: PrismaClient, operationKey: string, provider: MunicipalProvider = configuredMunicipalProvider()) {
  const row = await db.municipalOutbox.findUnique({ where: { siteKey_operationKey: { siteKey: "lg", operationKey } } });
  if (!row || row.state !== "UNKNOWN") throw new OutreachContractError("NOT_FOUND", 404);
  const result = await provider.reconcile({ operationKey, correlationId: row.correlationId });
  if (result.state === "UNKNOWN") return { state: "UNKNOWN" };
  const attemptId = stringValue(record(row.providerResult).attemptId);
  await db.$transaction(async tx => {
    await tx.municipalOutbox.update({ where: { id: row.id }, data: { state: result.state, providerResult: json({ ...result, attemptId }) } });
    await tx.municipalScheduleJob.update({ where: { id: row.jobId }, data: { state: result.state === "ACCEPTED" ? "SENT" : "CANCELLED" } });
    await tx.municipalCallAttempt.update({ where: { id: attemptId, siteKey: "lg" }, data: { engagementId: result.engagementId ?? null, callState: result.state === "ACCEPTED" ? "QUEUED" : "FAILED" } });
  });
  return result;
}

export async function settleMunicipalDeadlines(db: PrismaClient, now = new Date(), limit = 20) {
  const targets = await db.municipalTargetSnapshot.findMany({ where: { siteKey: "lg", state: { not: "CONFIRMED" }, cases: { none: {} }, run: { state: { in: ["QUEUED", "RUNNING", "COMPLETED"] }, workflow: { dueAt: { lte: now } } } }, orderBy: { id: "asc" }, take: Math.max(1, Math.min(limit, 50)) });
  let handedOff = 0;
  for (const target of targets) {
    await db.$transaction(async tx => {
      const fresh = await tx.municipalTargetSnapshot.findFirstOrThrow({ where: { siteKey: "lg", id: target.id }, include: { cases: true } });
      if (fresh.state === "CONFIRMED" || fresh.cases.length) return;
      await ensureMunicipalCase(tx, "lg", target.id, ["UNCONFIRMED", "DEADLINE_REACHED"]);
      await tx.municipalScheduleJob.updateMany({ where: { siteKey: "lg", targetSnapshotId: target.id, state: "PENDING" }, data: { state: "CANCELLED" } });
      handedOff++;
    }, { isolationLevel: "Serializable" });
  }
  return { handedOff };
}
