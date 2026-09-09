import type { PrismaClient } from "@/lib/generated/prisma/client";
import { audioCapabilities, parseOutreachMessage } from "@/lib/zaad/message-contracts";
import { OutreachContractError, whole } from "@/lib/zaad/outreach-contracts";
import { databaseError, digest } from "./outreach-data";
import { requireOutreachDepartment, type OutreachScope } from "./outreach-scope";
import { writeZaadAudit } from "./audit";
const whereScope = (scope: OutreachScope) => ({ siteKey: scope.siteKey, OR: [{ departmentKey: { in: scope.departments } }, ...(scope.all ? [{ departmentKey: null }] : [])] });
export async function listOutreachMessages(db: PrismaClient, scope: OutreachScope) {
  const rows = await db.zaadOutboundMessage.findMany({ where: { ...whereScope(scope), retiredAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], include: { revisions: { orderBy: { revision: "desc" }, select: { revision: true, generationState: true, zoomAssetId: true, _count: { select: { dispatches: true } } } } } });
  return { tenantKey: scope.siteKey, items: rows.map(row => ({ id: row.id, siteKey: row.siteKey, departmentKey: row.departmentKey, name: row.name, body: row.body, voiceId: row.voiceId, languageCode: row.languageCode, version: row.revision, inUse: row.revisions.some(revision => revision._count.dispatches > 0), generationState: row.revisions[0]?.revision === row.revision ? row.revisions[0].generationState : row.zoomAssetId ? "LEGACY_UNVERIFIED" : "NOT_GENERATED", zoomAssetId: row.revisions[0]?.revision === row.revision ? row.revisions[0].zoomAssetId : row.zoomAssetId, updatedAt: row.updatedAt })), total: rows.length, nextCursor: null, capabilities: audioCapabilities };
}
export async function getOutreachMessage(db: PrismaClient, scope: OutreachScope, id: string) {
  const row = await db.zaadOutboundMessage.findFirst({ where: { ...whereScope(scope), id }, include: { revisions: { orderBy: { revision: "desc" }, include: { audioRevisions: { select: { id: true, syncState: true, errorCode: true } } } } } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, id: row.id, siteKey: row.siteKey, departmentKey: row.departmentKey, name: row.name, body: row.body, voiceId: row.voiceId, languageCode: row.languageCode, version: row.revision, retiredAt: row.retiredAt, revisions: row.revisions, capabilities: audioCapabilities };
}
export async function saveOutreachMessage(db: PrismaClient, scope: OutreachScope, payload: unknown, id?: string) {
  const value = parseOutreachMessage(payload, Boolean(id)); requireOutreachDepartment(scope, value.departmentKey);
  try {
    const savedId = await db.$transaction(async tx => {
      const data = { name: value.name, body: value.body, voiceId: value.voiceId, languageCode: value.languageCode, departmentKey: value.departmentKey };
      let row;
      if (id) {
        const current = await tx.zaadOutboundMessage.findFirst({ where: { ...whereScope(scope), id } });
        if (!current) throw new OutreachContractError("NOT_FOUND", 404);
        if (current.retiredAt || current.revision !== value.version) throw new OutreachContractError("VERSION_CONFLICT", 409);
        // Capture a legacy version before appending; never replace an asset already referenced.
        if (!await tx.messageRevision.findUnique({ where: { siteKey_messageId_revision: { siteKey: scope.siteKey, messageId: id, revision: current.revision } } })) {
          await tx.messageRevision.create({ data: { siteKey: scope.siteKey, messageId: id, revision: current.revision, name: current.name, body: current.body, voiceId: current.voiceId, languageCode: current.languageCode, contentDigest: digest({ body: current.body, voiceId: current.voiceId, languageCode: current.languageCode }), createdBy: current.createdByUserId ?? scope.actorId, zoomAssetId: current.zoomAssetId, zoomAssetItemId: current.zoomAssetItemId, generationState: current.zoomAssetId ? "LEGACY_UNVERIFIED" : "NOT_GENERATED" } });
        }
        const changed = await tx.zaadOutboundMessage.updateMany({ where: { ...whereScope(scope), id, revision: value.version, retiredAt: null }, data: { ...data, revision: { increment: 1 }, updatedByUserId: scope.actorId, zoomAssetId: null, zoomAssetItemId: null, syncStatus: "PENDING", syncedAt: null, syncErrorCode: null } });
        if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
        row = await tx.zaadOutboundMessage.findUniqueOrThrow({ where: { id } });
      } else row = await tx.zaadOutboundMessage.create({ data: { ...data, siteKey: scope.siteKey, createdByUserId: scope.actorId, updatedByUserId: scope.actorId } });
      await tx.messageRevision.create({ data: { siteKey: scope.siteKey, messageId: row.id, revision: row.revision, name: row.name, body: row.body, voiceId: row.voiceId, languageCode: row.languageCode, contentDigest: digest({ body: row.body, voiceId: row.voiceId, languageCode: row.languageCode }), createdBy: scope.actorId } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "message", targetId: row.id, action: id ? "UPDATE" : "CREATE", result: "SUCCESS", changedFieldNames: ["revision", "name", "body", "voiceId"] });
      return row.id;
    }, { isolationLevel: "Serializable" });
    return getOutreachMessage(db, scope, savedId);
  } catch (error) { databaseError(error); }
}
export async function retireOutreachMessage(db: PrismaClient, scope: OutreachScope, id: string, version: unknown, deleteUnused = false) {
  const expected = whole(version);
  try {
    await db.$transaction(async tx => {
      const row = await tx.zaadOutboundMessage.findFirst({ where: { ...whereScope(scope), id }, include: { revisions: { include: { _count: { select: { dispatches: true } }, audioRevisions: true } } } });
      if (!row) throw new OutreachContractError("NOT_FOUND", 404);
      if (row.revision !== expected) throw new OutreachContractError("VERSION_CONFLICT", 409);
      if (deleteUnused && row.revisions.some(rev => rev._count.dispatches > 0)) throw new OutreachContractError("MESSAGE_IN_USE", 409);
      if (deleteUnused && (row.zoomAssetId || row.revisions.some(rev => rev.zoomAssetId || rev.audioRevisions.some(audio => audio.assetId)))) throw new OutreachContractError("ASSET_USAGE_NOT_VERIFIED", 409);
      const changed = await tx.zaadOutboundMessage.updateMany({ where: { ...whereScope(scope), id, revision: expected }, data: { retiredAt: new Date(), revision: { increment: 1 }, updatedByUserId: scope.actorId } });
      if (changed.count !== 1) throw new OutreachContractError("VERSION_CONFLICT", 409);
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "message", targetId: id, action: deleteUnused ? "DELETE" : "UPDATE", result: "SUCCESS", changedFieldNames: ["retiredAt"] });
    }, { isolationLevel: "Serializable" });
    return { tenantKey: scope.siteKey, id, retired: true };
  } catch (error) { databaseError(error); }
}
export async function requireMessageAudio(db: PrismaClient, scope: OutreachScope, id: string, revision: unknown) {
  const message = await getOutreachMessage(db, scope, id);
  if (!message.revisions.some(row => row.revision === whole(revision))) throw new OutreachContractError("NOT_FOUND", 404);
  throw new OutreachContractError("AUDIO_CONTRACT_NOT_VERIFIED", 409);
}
