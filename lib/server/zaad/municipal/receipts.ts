import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { choice, dateValue, fields, OutreachContractError, record, stringValue, whole } from "@/lib/zaad/outreach-contracts";
import { MUNICIPAL_PURPOSES, parseAnswers } from "@/lib/zaad/municipal/contracts";
import { classifyMunicipalAnswers, nextCallState } from "@/lib/zaad/municipal/workflows";
import { digest, json } from "../outreach-data";
import { ensureMunicipalCase, scheduleMunicipalRetry } from "./scheduler";
import type { Database } from "../university/permissions";

export function secretMatches(received: string | null, expected: string | undefined) {
  if (!received || !expected || expected.length < 32) return false;
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyZoomSignature(raw: string, headers: Headers, secret: string | undefined, now = new Date()) {
  const timestamp = headers.get("x-zm-request-timestamp");
  if (!secret || secret.length < 32 || !timestamp || !/^\d{10}$/u.test(timestamp) || Math.abs(now.getTime() / 1000 - Number(timestamp)) > 300) throw new OutreachContractError("INVALID_SIGNATURE", 401);
  const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${raw}`).digest("hex")}`;
  if (!secretMatches(headers.get("x-zm-signature"), signature)) throw new OutreachContractError("INVALID_SIGNATURE", 401);
}
const capDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function issueAttemptCapability(db: PrismaClient, payload: unknown, authorization: string | null, secret = process.env.MUNICIPAL_FLOW_RECEIPT_SECRET, now = new Date()) {
  if (!secretMatches(authorization, secret ? `Bearer ${secret}` : undefined)) throw new OutreachContractError("INVALID_RECEIPT_AUTH", 401);
  const v = record(payload); fields(v, ["correlationId", "providerAccountId", "flowBindingId", "engagementId"]);
  const correlationId = stringValue(v.correlationId), accountId = stringValue(v.providerAccountId), flowBindingId = stringValue(v.flowBindingId), engagementId = stringValue(v.engagementId);
  const outbox = await db.municipalOutbox.findFirst({ where: { siteKey: "lg", correlationId }, include: { job: true } });
  if (!outbox) throw new OutreachContractError("SCOPE_MISMATCH", 403);
  const attempt = await db.municipalCallAttempt.findFirst({ where: { siteKey: "lg", targetSnapshotId: outbox.job.targetSnapshotId, attemptNo: outbox.job.attemptNo, providerAccountId: accountId, flowBindingId, engagementId } });
  if (!attempt) throw new OutreachContractError("SCOPE_MISMATCH", 403);
  const capability = randomBytes(32).toString("base64url"), expiresAt = new Date(now.getTime() + 5 * 60000);
  await db.municipalCallAttempt.update({ where: { id: attempt.id }, data: { capabilityDigest: capDigest(capability), capabilityExpiresAt: expiresAt } });
  return { attemptCapability: capability, expiresAt: expiresAt.toISOString() };
}
export async function acceptProviderEvent(db: PrismaClient, raw: string, headers: Headers, secret = process.env.MUNICIPAL_ZOOM_WEBHOOK_SECRET, now = new Date()) {
  verifyZoomSignature(raw, headers, secret, now);
  let payload: unknown; try { payload = JSON.parse(raw); } catch { throw new OutreachContractError("INVALID_REQUEST"); }
  const root = record(payload), event = stringValue(root.event), body = record(root.payload);
  if (event === "endpoint.url_validation") {
    const plainToken = stringValue(body.plainToken, 500);
    return { plainToken, encryptedToken: createHmac("sha256", secret!).update(plainToken).digest("hex") };
  }
  if (event !== "contact_center.outbound_campaign_dialer_status") throw new OutreachContractError("UNSUPPORTED_EVENT");
  const eventTimestamp = whole(root.event_ts, 1, now.getTime() + 300000);
  const object = record(body.object), accountId = stringValue(body.account_id), engagementId = stringValue(object.engagement_id);
  const status = choice(object.campaign_dialer_status, ["consumer_answer", "consumer_no_answer", "consumer_reject", "agent_abandoned", "number_invalid", "number_blocked", "other_errors", "consumer_busy"]);
  const occurredAt = dateValue(object.date_time_ms);
  if (Date.parse(occurredAt) > now.getTime() + 300000 || Date.parse(occurredAt) > eventTimestamp + 300000) throw new OutreachContractError("INVALID_EVENT_TIME");
  const dedupKey = digest({ accountId, event, engagementId, occurredAt, status });
  // Only durable receipt happens on the webhook's response path. A worker applies it.
  await db.municipalProviderInbox.upsert({ where: { dedupKey }, update: {}, create: { accountId, dedupKey, eventKind: event, engagementId, occurredAt: new Date(occurredAt), payload: json(payload) } });
  return { accepted: true };
}
async function quarantineReceipt(db: PrismaClient, accountId: string, value: Record<string, unknown>, code: string) {
  const safe = { ...value }; delete safe.attemptCapability;
  const dedupKey = digest({ kind: "answer-receipt", code, safe });
  await db.municipalProviderInbox.upsert({ where: { dedupKey }, update: {}, create: { siteKey: "lg", accountId, dedupKey, eventKind: "answer-receipt", engagementId: typeof value.engagementId === "string" ? value.engagementId : null, occurredAt: new Date(dateValue(value.occurredAt)), payload: json(safe), state: "QUARANTINED", errorCode: code } });
}
export async function acceptAnswerReceipt(db: PrismaClient, payload: unknown, authorization: string | null, secret = process.env.MUNICIPAL_FLOW_RECEIPT_SECRET, now = new Date()) {
  if (!secretMatches(authorization, secret ? `Bearer ${secret}` : undefined)) throw new OutreachContractError("INVALID_RECEIPT_AUTH", 401);
  const v = record(payload); fields(v, ["receiptId", "attemptCapability", "providerAccountId", "flowBindingId", "engagementId", "questionVersion", "identityState", "ackState", "recognitionState", "answers", "occurredAt"]);
  const capability = stringValue(v.attemptCapability, 100), receiptId = stringValue(v.receiptId), providerAccountId = stringValue(v.providerAccountId), flowBindingId = stringValue(v.flowBindingId), engagementId = stringValue(v.engagementId), questionVersion = stringValue(v.questionVersion), occurredAt = new Date(dateValue(v.occurredAt));
  const attempt = await db.municipalCallAttempt.findFirst({ where: { capabilityDigest: capDigest(capability), siteKey: "lg" }, include: { target: { include: { run: { include: { workflow: true } } } } } });
  if (!attempt || !attempt.capabilityExpiresAt || attempt.capabilityExpiresAt <= now) throw new OutreachContractError("INVALID_ATTEMPT_CAPABILITY", 401);
  if (attempt.providerAccountId !== providerAccountId || attempt.flowBindingId !== flowBindingId || attempt.engagementId !== engagementId) throw new OutreachContractError("SCOPE_MISMATCH", 403);
  if (occurredAt > new Date(now.getTime() + 300000) || occurredAt < attempt.createdAt) throw new OutreachContractError("INVALID_RECEIPT_TIME");
  if (attempt.questionVersion !== questionVersion) {
    await quarantineReceipt(db, providerAccountId, v, "QUESTION_VERSION_MISMATCH");
    throw new OutreachContractError("ANSWER_RECONCILIATION_REQUIRED", 409);
  }
  const purpose = choice(attempt.target.run.workflow.purpose, MUNICIPAL_PURPOSES), answers = parseAnswers(v.answers, purpose);
  const identityState = choice(v.identityState, ["UNVERIFIED", "SELF_ATTESTED", "VERIFIED", "OTHER_PERSON", "VOICEMAIL"]), ackState = choice(v.ackState, ["UNCONFIRMED", "CONFIRMED"]), recognitionState = choice(v.recognitionState, ["NONE", "CLEAR", "AMBIGUOUS", "ERROR"]);
  const requestDigest = digest({ receiptId, providerAccountId, flowBindingId, engagementId, questionVersion, identityState, ackState, recognitionState, answers, occurredAt: occurredAt.toISOString() });
  const previous = await db.municipalResponse.findUnique({ where: { siteKey_attemptId_receiptId: { siteKey: "lg", attemptId: attempt.id, receiptId } } });
  if (previous) {
    if (previous.requestDigest === requestDigest) return { accepted: true, duplicate: true };
    await quarantineReceipt(db, providerAccountId, v, "RECEIPT_CONFLICT");
    throw new OutreachContractError("ANSWER_RECONCILIATION_REQUIRED", 409);
  }
  // A new, contradictory answer must be reviewed; it cannot overwrite an earlier receipt.
  const priorAnswer = await db.municipalResponse.findFirst({ where: { siteKey: "lg", attemptId: attempt.id } });
  if (priorAnswer) {
    await quarantineReceipt(db, providerAccountId, v, "ADDITIONAL_RECEIPT_REQUIRES_REVIEW");
    throw new OutreachContractError("ANSWER_RECONCILIATION_REQUIRED", 409);
  }
  try { await db.$transaction(async tx => {
    const fresh = await tx.municipalCallAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const outcome = classifyMunicipalAnswers(purpose, { callState: fresh.callState, identityState, ackState, recognitionState, answers });
    await tx.municipalResponse.create({ data: { siteKey: "lg", attemptId: attempt.id, receiptId, requestDigest, questionVersion, answers: json(answers), outcome: json(outcome), occurredAt } });
    await tx.municipalCallAttempt.update({ where: { id: attempt.id, version: fresh.version }, data: { identityState, ackState, recognitionState, version: { increment: 1 } } });
    await applyMunicipalAnswerOutcome(tx, attempt.id);
  }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) {
      const previous = await db.municipalResponse.findUnique({ where: { siteKey_attemptId_receiptId: { siteKey: "lg", attemptId: attempt.id, receiptId } } });
      if (previous?.requestDigest === requestDigest) return { accepted: true, duplicate: true };
      throw new OutreachContractError("RECEIPT_CONFLICT", 409);
    }
    throw error;
  }
  return { accepted: true, duplicate: false };
}
async function applyMunicipalAnswerOutcome(db: Database, attemptId: string) {
  const attempt = await db.municipalCallAttempt.findFirstOrThrow({ where: { id: attemptId, siteKey: "lg" }, include: { responses: { orderBy: { receivedAt: "desc" }, take: 1 }, target: { include: { run: { include: { workflow: true } } } } } });
  if (!attempt.responses.length) return;
  const purpose = choice(attempt.target.run.workflow.purpose, MUNICIPAL_PURPOSES), answers = parseAnswers(attempt.responses[0].answers, purpose);
  const outcome = classifyMunicipalAnswers(purpose, { ...attempt, answers });
  if (outcome.requiresStaff) {
    await ensureMunicipalCase(db, "lg", attempt.targetSnapshotId, outcome.reasons);
    await db.municipalScheduleJob.updateMany({ where: { siteKey: "lg", targetSnapshotId: attempt.targetSnapshotId, state: "PENDING" }, data: { state: "CANCELLED" } });
  } else if (outcome.phoneConfirmed) {
    await db.municipalTargetSnapshot.update({ where: { id: attempt.targetSnapshotId }, data: { state: outcome.classification === "SUBMISSION_PLANNED" ? "WAITING_FOR_DEADLINE" : "CONFIRMED" } });
    await db.municipalScheduleJob.updateMany({ where: { siteKey: "lg", targetSnapshotId: attempt.targetSnapshotId, state: "PENDING" }, data: { state: "CANCELLED" } });
  }
}
export async function processMunicipalInbox(db: PrismaClient, limit = 20) {
  const rows = await db.municipalProviderInbox.findMany({ where: { state: "RECEIVED" }, orderBy: { receivedAt: "asc" }, take: Math.max(1, Math.min(limit, 20)) });
  let applied = 0, quarantined = 0;
  for (const row of rows) {
    await db.$transaction(async tx => {
      const fresh = await tx.municipalProviderInbox.findUniqueOrThrow({ where: { id: row.id } });
      if (fresh.state !== "RECEIVED") return;
      const attempt = await tx.municipalCallAttempt.findFirst({ where: { providerAccountId: row.accountId, engagementId: row.engagementId, siteKey: "lg" } });
      if (!attempt) { await tx.municipalProviderInbox.update({ where: { id: row.id }, data: { state: "QUARANTINED", errorCode: "UNKNOWN_ENGAGEMENT" } }); quarantined++; return; }
      if (row.occurredAt < attempt.createdAt) { await tx.municipalProviderInbox.update({ where: { id: row.id }, data: { state: "QUARANTINED", errorCode: "EVENT_BEFORE_ATTEMPT" } }); quarantined++; return; }
      const object = record(record(record(row.payload).payload).object);
      const callState = nextCallState(attempt.callState, stringValue(object.campaign_dialer_status));
      await tx.municipalCallAttempt.update({ where: { id: attempt.id, version: attempt.version }, data: { callState, version: { increment: 1 } } });
      await tx.municipalProviderInbox.update({ where: { id: row.id }, data: { siteKey: "lg", state: "APPLIED" } });
      if (callState === "ANSWERED") await tx.municipalScheduleJob.updateMany({ where: { siteKey: "lg", targetSnapshotId: attempt.targetSnapshotId, state: "PENDING" }, data: { state: "CANCELLED" } });
      await applyMunicipalAnswerOutcome(tx, attempt.id);
      await scheduleMunicipalRetry(tx, "lg", attempt.id);
      applied++;
    }, { isolationLevel: "Serializable" });
  }
  return { applied, quarantined };
}
