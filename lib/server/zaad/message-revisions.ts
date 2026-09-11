import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { audioCapabilities, parseOutreachMessage, parseMessageExpectation, type MessageExpectation } from "@/lib/zaad/message-contracts";
import { OutreachContractError, fields, record, stringValue } from "@/lib/zaad/outreach-contracts";
import { databaseError, digest } from "./outreach-data";
import type { OutreachScope } from "./outreach-scope";
import { writeZaadAudit } from "./audit";

const whereScope = (scope: OutreachScope) => ({ siteKey: scope.siteKey });
type Message = Prisma.ZaadOutboundMessageGetPayload<object>;
export const messageContentDigest = (row: Pick<Message, "name" | "body" | "voiceId" | "languageCode" | "retiredAt" | "currentRevisionId">) => digest({ name: row.name, body: row.body, voiceId: row.voiceId, languageCode: row.languageCode, retiredAt: row.retiredAt, currentRevisionId: row.currentRevisionId });
export async function lockMessageResource(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
function assertContent(row: Message, expected: Partial<MessageExpectation>) {
  if (row.updatedAt.toISOString() !== expected.expectedUpdatedAt || messageContentDigest(row) !== expected.expectedDigest) throw new OutreachContractError("CONTENT_CHANGED", 409);
}
export async function listOutreachMessages(db: PrismaClient, scope: OutreachScope) {
  const rows = await db.zaadOutboundMessage.findMany({ where: { ...whereScope(scope), retiredAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], include: { currentRevision: true, revisions: { select: { _count: { select: { dispatches: true } } } } } });
  return { tenantKey: scope.siteKey, items: rows.map(row => ({ id: row.id, siteKey: row.siteKey, name: row.name, body: row.body, voiceId: row.voiceId, languageCode: row.languageCode, currentRevisionId: row.currentRevisionId, expectedDigest: messageContentDigest(row), inUse: row.revisions.some(snapshot => snapshot._count.dispatches > 0), generationState: row.currentRevision?.generationState ?? (row.zoomAssetId ? "LEGACY_UNVERIFIED" : "NOT_GENERATED"), zoomAssetId: row.currentRevision?.zoomAssetId ?? row.zoomAssetId, updatedAt: row.updatedAt })), total: rows.length, nextCursor: null, capabilities: audioCapabilities };
}
export async function getOutreachMessage(db: PrismaClient, scope: OutreachScope, id: string) {
  const row = await db.zaadOutboundMessage.findFirst({ where: { ...whereScope(scope), id }, include: { revisions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { audioRevisions: { select: { id: true, syncState: true, errorCode: true } } } } } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, id: row.id, siteKey: row.siteKey, name: row.name, body: row.body, voiceId: row.voiceId, languageCode: row.languageCode, currentRevisionId: row.currentRevisionId, expectedDigest: messageContentDigest(row), updatedAt: row.updatedAt, retiredAt: row.retiredAt, revisions: row.revisions, capabilities: audioCapabilities };
}
export async function saveOutreachMessage(db: PrismaClient, scope: OutreachScope, payload: unknown, id?: string) {
  const value = parseOutreachMessage(payload, Boolean(id));
  try {
    const savedId = await db.$transaction(async tx => {
      if (id) await lockMessageResource(tx, `text:${scope.siteKey}:${id}`);
      const data = { name: value.name, body: value.body, voiceId: value.voiceId, languageCode: value.languageCode };
      let row: Message;
      if (id) {
        const current = await tx.zaadOutboundMessage.findFirst({ where: { ...whereScope(scope), id } });
        if (!current) throw new OutreachContractError("NOT_FOUND", 404);
        assertContent(current, value);
        if (current.retiredAt) throw new OutreachContractError("CONTENT_CHANGED", 409);
        const changed = await tx.zaadOutboundMessage.updateMany({ where: { ...whereScope(scope), id, updatedAt: current.updatedAt, retiredAt: null }, data: { ...data, updatedByUserId: scope.actorId, zoomAssetId: null, zoomAssetItemId: null, syncStatus: "PENDING", syncedAt: null, syncErrorCode: null } });
        if (changed.count !== 1) throw new OutreachContractError("CONTENT_CHANGED", 409);
        row = await tx.zaadOutboundMessage.findUniqueOrThrow({ where: { id } });
      } else row = await tx.zaadOutboundMessage.create({ data: { ...data, siteKey: scope.siteKey, createdByUserId: scope.actorId, updatedByUserId: scope.actorId } });
      const snapshot = await tx.messageRevision.create({ data: { siteKey: scope.siteKey, messageId: row.id, ...data, contentDigest: digest({ body: row.body, voiceId: row.voiceId, languageCode: row.languageCode }), createdBy: scope.actorId } });
      await tx.zaadOutboundMessage.update({ where: { id: row.id, siteKey: scope.siteKey }, data: { currentRevisionId: snapshot.id } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "message", targetId: row.id, action: id ? "UPDATE" : "CREATE", result: "SUCCESS", changedFieldNames: ["currentRevisionId", "name", "body", "voiceId"] });
      return row.id;
    });
    return getOutreachMessage(db, scope, savedId);
  } catch (error) { databaseError(error); }
}
export async function retireOutreachMessage(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown, deleteUnused = false) {
  const value = record(payload); fields(value, ["expectedUpdatedAt", "expectedDigest", "version", "revision"]);
  if (value.version !== undefined || value.revision !== undefined) throw new OutreachContractError("CONTENT_CHANGED", 409);
  const expected = parseMessageExpectation(value);
  try {
    await db.$transaction(async tx => {
      await lockMessageResource(tx, `text:${scope.siteKey}:${id}`);
      const row = await tx.zaadOutboundMessage.findFirst({ where: { ...whereScope(scope), id }, include: { revisions: { include: { _count: { select: { dispatches: true } }, audioRevisions: true } } } });
      if (!row) throw new OutreachContractError("NOT_FOUND", 404);
      assertContent(row, expected);
      if (deleteUnused && row.revisions.some(snapshot => snapshot._count.dispatches > 0)) throw new OutreachContractError("MESSAGE_IN_USE", 409);
      if (deleteUnused && (row.zoomAssetId || row.revisions.some(snapshot => snapshot.zoomAssetId || snapshot.audioRevisions.some(audio => audio.assetId)))) throw new OutreachContractError("ASSET_USAGE_NOT_VERIFIED", 409);
      const changed = await tx.zaadOutboundMessage.updateMany({ where: { ...whereScope(scope), id, updatedAt: row.updatedAt }, data: { retiredAt: new Date(), updatedByUserId: scope.actorId } });
      if (changed.count !== 1) throw new OutreachContractError("CONTENT_CHANGED", 409);
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "message", targetId: id, action: deleteUnused ? "DELETE" : "UPDATE", result: "SUCCESS", changedFieldNames: ["retiredAt"] });
    });
    return { tenantKey: scope.siteKey, id, retired: true };
  } catch (error) { databaseError(error); }
}
export async function requireMessageAudio(db: PrismaClient, scope: OutreachScope, id: string, snapshotId: unknown) {
  const message = await getOutreachMessage(db, scope, id);
  if (!message.revisions.some(row => row.id === stringValue(snapshotId))) throw new OutreachContractError("NOT_FOUND", 404);
  throw new OutreachContractError("AUDIO_CONTRACT_NOT_VERIFIED", 409);
}
