import type { PrismaClient } from "@/lib/generated/prisma/client";
import { parseAudioEdit, type AudioEdit, type AudioItemUpdate } from "@/lib/zaad/message-edit-contracts";
import { parseMessageExpectation, type MessageExpectation } from "@/lib/zaad/message-contracts";
import type { AudioAsset } from "@/lib/zaad/message-import-contracts";
import { fields, operationKey, OutreachContractError, record } from "@/lib/zaad/outreach-contracts";
import { requireFullAccess, type OutreachScope } from "./outreach-scope";
import { databaseError, digest, json } from "./outreach-data";
import { writeZaadAudit } from "./audit";
import { ZaadZoomClient, ZaadZoomError } from "./zoom-client";
import { assertAccount, audioDto, audioItemDigest, audioResourceKey, audioScope, guardAudioResource, importedAudioDigest, ownedAsset, validItem, type AudioAssetReader, type AudioRow, type Database } from "./message-imports";

export type AudioAssetWriter = AudioAssetReader & { updateAudioAssetItem(input: AudioItemUpdate): Promise<void> };
type SafeAsset = Omit<AudioAsset, "items"> & { items: Omit<AudioAsset["items"][number], "fileUrl">[] };
type SavedAttempt = { id: string; before: SafeAsset; explicitSuccess: boolean; errorCode?: string };
const editKind = "MESSAGE_AUDIO_EDIT", unlinkKind = "MESSAGE_AUDIO_UNLINK";
const safeAsset = (asset: AudioAsset): SafeAsset => ({ ...asset, items: asset.items.map(item => ({ assetItemId: item.assetItemId, name: item.name, languageCode: item.languageCode, voiceId: item.voiceId, hasAudioFile: item.hasAudioFile, body: item.body })) });

function assertExpected(row: AudioRow, expected: MessageExpectation) {
  if (row.updatedAt.toISOString() !== expected.expectedUpdatedAt || importedAudioDigest(row) !== expected.expectedDigest) throw new OutreachContractError("CONTENT_CHANGED", 409);
}
async function findAudio(db: Database, scope: OutreachScope, id: string) {
  const row = await db.outreachImportedAudioMessage.findFirst({ where: { ...audioScope(scope), id }, include: { binding: true } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  await assertAccount(db, row.binding.accountId);
  await ownedAsset(db, scope, row.binding.accountId, row.binding.zoomId);
  return row;
}
function targetItem(asset: AudioAsset | SafeAsset, row: AudioRow) {
  const matching = asset.items.filter(item => item.languageCode === row.languageCode);
  if (asset.assetId !== row.binding.zoomId || asset.archived || asset.type !== "audio" || matching.length !== 1 || matching[0].assetItemId !== row.assetItemId || !matching[0].hasAudioFile) throw new OutreachContractError("AUDIO_ASSET_CHANGED", 409);
  return matching[0];
}
function stableItem(item: SafeAsset["items"][number]) {
  return { assetItemId: item.assetItemId, name: item.name, languageCode: item.languageCode, voiceId: item.voiceId, hasAudioFile: item.hasAudioFile, body: item.body };
}
export function verifyAudioUpdate(before: SafeAsset, after: AudioAsset, itemId: string, value: Pick<AudioEdit, "name" | "replaceAudio" | "body" | "voiceId">, explicitSuccess: boolean) {
  const old = before.items.find(item => item.assetItemId === itemId), current = after.items.find(item => item.assetItemId === itemId);
  if (!old || !current || !validItem(after, current) || before.assetId !== after.assetId || before.name !== after.name || after.items.length !== before.items.length || current.languageCode !== old.languageCode || current.name !== value.name) throw new OutreachContractError("AUDIO_UPDATE_READBACK_MISMATCH", 409);
  for (const item of before.items.filter(item => item.assetItemId !== itemId)) {
    const observed = after.items.find(row => row.assetItemId === item.assetItemId);
    if (!observed || digest(stableItem(item)) !== digest(stableItem(observed))) throw new OutreachContractError("AUDIO_UPDATE_READBACK_MISMATCH", 409);
  }
  if (!value.replaceAudio) {
    if (current.voiceId !== old.voiceId || current.body !== old.body) throw new OutreachContractError("AUDIO_UPDATE_READBACK_MISMATCH", 409);
  } else {
    if (current.voiceId !== value.voiceId || (current.body !== null && current.body !== value.body)) throw new OutreachContractError("AUDIO_UPDATE_READBACK_MISMATCH", 409);
    if (current.body === null && !explicitSuccess) throw new OutreachContractError("AUDIO_UPDATE_RESULT_UNKNOWN", 409);
  }
  return current;
}

export async function editImportedAudioMessage(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown, supplied?: AudioAssetWriter) {
  requireFullAccess(scope);
  const value = parseAudioEdit(payload), unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: editKind, operationKey: value.operationKey };
  const requestDigest = digest({ id, ...value });
  const old = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
  if (old && old.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
  if (old?.status === "COMPLETED") return { tenantKey: scope.siteKey, status: old.status, result: old.result };
  if (old?.status === "FAILED") throw new OutreachContractError((old.result as SavedAttempt | null)?.errorCode ?? "AUDIO_UPDATE_REJECTED", 409);
  // Active requests own the lock. A crash can be inspected after the bounded
  // provider request has certainly expired, without submitting another PATCH.
  if (old && old.status !== "OUTCOME_UNKNOWN" && Date.now() - old.createdAt.getTime() < 300_000) throw new OutreachContractError("AUDIO_OPERATION_IN_PROGRESS", 409);
  const row = await findAudio(db, scope, id), client = supplied ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  if (client.accountId !== row.binding.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
  if (value.replaceAudio && row.languageCode !== "ja-JP") throw new OutreachContractError("INVALID_VOICE_OR_BODY");
  const resourceKey = audioResourceKey(client.accountId, row.binding.zoomId, row.assetItemId);
  let attempt = old;
  if (!attempt) {
    try {
      attempt = await db.$transaction(async tx => {
        await guardAudioResource(tx, resourceKey);
        const current = await findAudio(tx, scope, id); assertExpected(current, value);
        const operation = await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "PREPARED" } });
        await tx.outreachMessageLock.create({ data: { resourceKey, operationId: operation.id } });
        return operation;
      });
    } catch (error) { databaseError(error); }
  }
  const operation = attempt!;
  let info = operation.result as SavedAttempt | null, externalStarted = Boolean(old), patchInFlight = false;
  try {
    if (!old) {
      const before = await client.getAudioAsset(row.binding.zoomId), item = targetItem(before, row);
      if (audioItemDigest(before, item as AudioAsset["items"][number]) !== row.observedDigest) throw new OutreachContractError("AUDIO_ASSET_CHANGED", 409);
      info = { id, before: safeAsset(before), explicitSuccess: false };
      await assertAccount(db, client.accountId);
      await ownedAsset(db, scope, client.accountId, before.assetId);
      await db.outreachOperation.update({ where: { id: operation.id }, data: { status: "APPLYING", result: json(info) } });
      externalStarted = true;
      patchInFlight = true;
      await client.updateAudioAssetItem({ assetId: before.assetId, assetItemId: row.assetItemId, languageCode: row.languageCode, name: value.name, ...(value.replaceAudio ? { body: value.body!, voiceId: value.voiceId! } : {}) });
      patchInFlight = false;
      info.explicitSuccess = true;
      await db.outreachOperation.update({ where: { id: operation.id }, data: { status: "VERIFYING", result: json(info) } });
    }
    if (!info?.before) throw new OutreachContractError("AUDIO_UPDATE_RESULT_UNKNOWN", 409);
    const after = await client.getAudioAsset(row.binding.zoomId); targetItem(after, row);
    const item = verifyAudioUpdate(info.before, after, row.assetItemId, value, info.explicitSuccess);
    return await db.$transaction(async tx => {
      await guardAudioResource(tx, resourceKey, operation.id);
      const completed = await tx.outreachOperation.findUniqueOrThrow({ where: { id: operation.id } });
      if (completed.status === "COMPLETED") return { tenantKey: scope.siteKey, status: "COMPLETED", result: completed.result };
      const current = await findAudio(tx, scope, id); assertExpected(current, value);
      const saved = await tx.outreachImportedAudioMessage.update({ where: { id, siteKey: scope.siteKey, updatedAt: current.updatedAt }, data: { name: item.name, voiceId: item.voiceId, providerBody: item.body, submittedBody: value.replaceAudio ? value.body : current.submittedBody, bodyState: item.body !== null ? "PROVIDER_RETURNED" : value.replaceAudio || current.submittedBody ? "USER_AUTHORED" : "UNAVAILABLE", bodyFetchedAt: new Date(), observedDigest: audioItemDigest(after, item), sourceModifiedAt: after.sourceModifiedAt ? new Date(after.sourceModifiedAt) : null, updatedBy: scope.actorId }, include: { binding: true } });
      const result = { id, message: audioDto(saved), bodyReadback: item.body !== null ? "VERIFIED" : "UNAVAILABLE" };
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "message-audio", targetId: id, action: "UPDATE", result: "SUCCESS", changedFieldNames: value.replaceAudio ? ["name", "submittedBody", "voiceId"] : ["name"] });
      await tx.outreachOperation.update({ where: { id: operation.id }, data: { status: "COMPLETED", result: json(result) } });
      await tx.outreachMessageLock.deleteMany({ where: { resourceKey, operationId: operation.id } });
      return { tenantKey: scope.siteKey, status: "COMPLETED", result };
    });
  } catch (error) {
    const knownRejection = patchInFlight && (error instanceof ZaadZoomError && !error.resultUnknown || error instanceof OutreachContractError && error.code === "AUDIO_UPDATE_REJECTED");
    const unknown = externalStarted && !knownRejection;
    const errorCode = error instanceof OutreachContractError || error instanceof ZaadZoomError ? error.code : "AUDIO_UPDATE_RESULT_UNKNOWN";
    // Keep both durable ownership and before-image on uncertain external effects.
    await db.$transaction(async tx => {
      await guardAudioResource(tx, resourceKey, operation.id);
      const latest = await tx.outreachOperation.findUniqueOrThrow({ where: { id: operation.id } });
      if (latest.status === "COMPLETED") return;
      await tx.outreachOperation.update({ where: { id: operation.id }, data: { status: unknown ? "OUTCOME_UNKNOWN" : "FAILED", result: json({ ...info, id, errorCode }) } });
      if (!unknown) await tx.outreachMessageLock.deleteMany({ where: { resourceKey, operationId: operation.id } });
    }).catch(() => undefined);
    if (unknown) throw new OutreachContractError("AUDIO_UPDATE_RESULT_UNKNOWN", 409);
    throw error;
  }
}

export async function unlinkImportedAudioMessage(db: PrismaClient, scope: OutreachScope, id: string, payload: unknown) {
  const value = record(payload); fields(value, ["operationKey", "expectedUpdatedAt", "expectedDigest", "version", "revision"]);
  if (value.version !== undefined || value.revision !== undefined) throw new OutreachContractError("CONTENT_CHANGED", 409);
  const expected = parseMessageExpectation(value), key = operationKey(value.operationKey);
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind: unlinkKind, operationKey: key }, requestDigest = digest({ id, ...expected });
  const replay = async (tx: Database) => {
    const previous = await tx.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
    if (previous && previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
    return previous ? { tenantKey: scope.siteKey, status: previous.status, result: previous.result } : null;
  };
  const previous = await replay(db); if (previous) return previous;
  try {
    return await db.$transaction(async tx => {
      const row = await findAudio(tx, scope, id);
      await guardAudioResource(tx, audioResourceKey(row.binding.accountId, row.binding.zoomId, row.assetItemId));
      const repeated = await replay(tx); if (repeated) return repeated;
      const current = await findAudio(tx, scope, id); assertExpected(current, expected);
      await tx.outreachImportedAudioMessage.update({ where: { id, updatedAt: current.updatedAt }, data: { unlinkedAt: new Date(), updatedBy: scope.actorId } });
      const result = { id, unlinked: true };
      await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "COMPLETED", result: json(result) } });
      await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "message-audio", targetId: id, action: "DELETE", result: "SUCCESS", changedFieldNames: ["unlinkedAt"] });
      return { tenantKey: scope.siteKey, status: "COMPLETED", result };
    });
  } catch (error) { const repeated = await replay(db); if (repeated) return repeated; databaseError(error); }
}
