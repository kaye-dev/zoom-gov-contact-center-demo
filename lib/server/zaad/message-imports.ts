import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { AudioAsset, AudioAssetsPage, AudioCandidate, AudioCandidates, AudioImportResult, ImportedAudioMessage } from "@/lib/zaad/message-import-contracts";
import { parseAudioImport } from "@/lib/zaad/message-import-contracts";
import { operationKey, OutreachContractError } from "@/lib/zaad/outreach-contracts";
import { requireFullAccess, type OutreachScope } from "./outreach-scope";
import { databaseError, digest, json } from "./outreach-data";
import { ZaadZoomClient } from "./zoom-client";
import { lockMessageResource, listOutreachMessages } from "./message-revisions";
import { writeZaadAudit } from "./audit";

export type AudioAssetReader = { accountId: string; listAudioAssets(input: { pageSize: number; nextPageToken?: string }): Promise<AudioAssetsPage>; getAudioAsset(id: string): Promise<AudioAsset> };
export type Database = PrismaClient | Prisma.TransactionClient;
export type AudioRow = Prisma.OutreachImportedAudioMessageGetPayload<{ include: { binding: true } }>;
const kind = "MESSAGE_AUDIO_IMPORT";
export async function assertAccount(db: Database, accountId: string) {
  const setting = await db.globalDeveloperApiSetting.findUnique({ where: { id: "global" }, select: { accountId: true } });
  if (setting?.accountId.trim() !== accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
}
export async function ownedAsset(db: Database, scope: OutreachScope, accountId: string, assetId: string) {
  const binding = await db.zoomResourceBinding.findFirst({ where: { accountId, resourceType: "ASSET", zoomId: assetId } });
  if (binding && (binding.ownerSiteKey !== scope.siteKey || binding.tombstone || binding.purpose !== "REGULAR" || binding.dispatchId)) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
  // Legacy assets may predate resource bindings. Consult every ownership source
  // before provider metadata is read, including internal dispatch revisions.
  const messages = await db.zaadOutboundMessage.findMany({ where: { zoomAssetId: assetId }, select: { siteKey: true } });
  const revisions = await db.messageRevision.findMany({ where: { zoomAssetId: assetId, OR: [{ accountId }, { accountId: null }] }, select: { siteKey: true, _count: { select: { dispatches: true } } } });
  const audios = await db.zoomAudioRevision.findMany({ where: { accountId, assetId }, select: { siteKey: true, revision: { select: { _count: { select: { dispatches: true } } } } } });
  const denied = (siteKey: string) => siteKey !== scope.siteKey;
  if (messages.some(row => denied(row.siteKey)) || revisions.some(row => denied(row.siteKey) || row._count.dispatches > 0) || audios.some(row => denied(row.siteKey) || row.revision._count.dispatches > 0)) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
  return binding;
}
export function audioItemDigest(asset: AudioAsset, item: AudioAsset["items"][number]) {
  return digest({ assetId: asset.assetId, assetName: asset.name, type: asset.type, archived: asset.archived, sourceModifiedAt: asset.sourceModifiedAt, assetItemId: item.assetItemId, name: item.name, languageCode: item.languageCode, voiceId: item.voiceId, hasAudioFile: item.hasAudioFile, body: item.body });
}
export function validItem(asset: AudioAsset, item: AudioAsset["items"][number]) {
  return asset.type === "audio" && !asset.archived && Boolean(item.assetItemId && item.languageCode && item.hasAudioFile);
}
export async function audioImportCandidates(db: PrismaClient, scope: OutreachScope, reader?: AudioAssetReader): Promise<AudioCandidates> {
  requireFullAccess(scope);
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  const seenTokens = new Set<string>(), seenAssets = new Set<string>(), items: AudioCandidate[] = [];
  let nextPageToken: string | undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    await assertAccount(db, client.accountId);
    const page = await client.listAudioAssets({ pageSize: 100, nextPageToken });
    for (let offset = 0; offset < page.assets.length; offset += 4) {
      const batch = page.assets.slice(offset, offset + 4);
      const results = await Promise.all(batch.map(async entry => {
        if (seenAssets.has(entry.assetId)) throw new OutreachContractError("ASSET_PAGINATION_CHANGED", 409);
        seenAssets.add(entry.assetId);
        let binding;
        try { binding = await ownedAsset(db, scope, client.accountId, entry.assetId); }
        catch (error) { if (error instanceof OutreachContractError && error.code === "RESOURCE_OWNERSHIP_CONFLICT") return []; throw error; }
        const asset = await client.getAudioAsset(entry.assetId);
        if (asset.assetId !== entry.assetId) throw new OutreachContractError("INVALID_AUDIO_ASSET_RESPONSE", 502);
        const existing = binding ? await db.outreachImportedAudioMessage.findMany({ where: { siteKey: scope.siteKey, bindingId: binding.id } }) : [];
        return asset.items.map(item => {
          const row = existing.find(saved => saved.assetItemId === item.assetItemId);
          return { assetId: asset.assetId, assetItemId: item.assetItemId, name: item.name, languageCode: item.languageCode, voiceId: item.voiceId, observedDigest: audioItemDigest(asset, item), expectedUpdatedAt: row?.updatedAt.toISOString() ?? null, body: item.body, bodyState: item.body === null ? "UNAVAILABLE" as const : "PROVIDER_RETURNED" as const, selectable: validItem(asset, item), disabledReason: validItem(asset, item) ? null : "AUDIO_ITEM_UNAVAILABLE", imported: Boolean(row && !row.unlinkedAt) };
        });
      }));
      items.push(...results.flat());
    }
    await assertAccount(db, client.accountId);
    if (!page.nextPageToken) return { tenantKey: scope.siteKey, accountId: client.accountId, items, nextCursor: null, incomplete: false };
    if (seenTokens.has(page.nextPageToken)) throw new OutreachContractError("ASSET_PAGINATION_LOOP", 502);
    seenTokens.add(page.nextPageToken); nextPageToken = page.nextPageToken;
  }
  throw new OutreachContractError("ASSET_PAGINATION_LIMIT", 502);
}
export function audioDto(row: AudioRow): ImportedAudioMessage {
  return { id: row.id, sourceKind: "IMPORTED_AUDIO", name: row.name, body: row.bodyState === "USER_AUTHORED" ? row.submittedBody : row.providerBody, bodyState: row.bodyState as ImportedAudioMessage["bodyState"], bodyFetchedAt: row.bodyFetchedAt?.toISOString() ?? null, voiceId: row.voiceId, languageCode: row.languageCode, observedDigest: row.observedDigest, expectedDigest: importedAudioDigest(row), generationState: "IMPORTED_AUDIO", zoomAssetId: row.binding.zoomId, assetItemId: row.assetItemId, updatedAt: row.updatedAt.toISOString() };
}
export function audioScope(scope: OutreachScope) {
  return { siteKey: scope.siteKey, unlinkedAt: null, binding: { ownerSiteKey: scope.siteKey, resourceType: "ASSET", purpose: "REGULAR", tombstone: false, dispatchId: null } };
}
export async function getImportedAudioMessage(db: PrismaClient, scope: OutreachScope, id: string, reader?: AudioAssetReader) {
  const row = await db.outreachImportedAudioMessage.findFirst({ where: { ...audioScope(scope), id }, include: { binding: true } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  await assertAccount(db, row.binding.accountId);
  if (client.accountId !== row.binding.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
  await ownedAsset(db, scope, client.accountId, row.binding.zoomId);
  try {
    const asset = await client.getAudioAsset(row.binding.zoomId), item = asset.items.find(item => item.assetItemId === row.assetItemId);
    if (asset.assetId !== row.binding.zoomId || !item || !validItem(asset, item)) throw new OutreachContractError("AUDIO_ITEM_UNAVAILABLE", 409);
    const current = await db.$transaction(async tx => {
      await guardAudioResource(tx, audioResourceKey(client.accountId, asset.assetId, item.assetItemId));
      await assertAccount(tx, client.accountId);
      await ownedAsset(tx, scope, client.accountId, asset.assetId);
      const saved = await tx.outreachImportedAudioMessage.findFirst({ where: { ...audioScope(scope), id }, include: { binding: true } });
      if (!saved) throw new OutreachContractError("NOT_FOUND", 404);
      if (saved.updatedAt.getTime() !== row.updatedAt.getTime()) return saved;
      const observedDigest = audioItemDigest(asset, item);
      if (saved.observedDigest === observedDigest && saved.bodyState !== "UNCHECKED") return saved;
      return tx.outreachImportedAudioMessage.update({ where: { id, updatedAt: saved.updatedAt }, data: { observedDigest, name: item.name, voiceId: item.voiceId, languageCode: item.languageCode, providerBody: item.body, bodyState: item.body === null ? saved.submittedBody ? "USER_AUTHORED" : "UNAVAILABLE" : "PROVIDER_RETURNED", bodyFetchedAt: new Date() }, include: { binding: true } });
    });
    return { tenantKey: scope.siteKey, message: audioDto(current) };
  } catch (error) {
    if (error instanceof OutreachContractError && ["ACCOUNT_CHANGED", "NOT_FOUND", "RESOURCE_OWNERSHIP_CONFLICT"].includes(error.code)) throw error;
    // A failed provider read is not evidence that text is unavailable. The last
    // fetched body remains a dated reference; do not mutate its stored origin.
    const current = await db.outreachImportedAudioMessage.findFirst({ where: { ...audioScope(scope), id }, include: { binding: true } });
    if (!current) throw new OutreachContractError("NOT_FOUND", 404);
    await assertAccount(db, current.binding.accountId);
    await ownedAsset(db, scope, current.binding.accountId, current.binding.zoomId);
    return { tenantKey: scope.siteKey, message: { ...audioDto(current), bodyState: "UNCHECKED" as const } };
  }
}
export async function messageCatalog(db: PrismaClient, scope: OutreachScope) {
  const [text, audio] = await Promise.all([listOutreachMessages(db, scope), db.outreachImportedAudioMessage.findMany({ where: audioScope(scope), include: { binding: true } })]);
  const items = [...text.items.map(item => ({ ...item, sourceKind: "TEXT" as const, updatedAt: item.updatedAt.toISOString() })), ...audio.map(audioDto)];
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return { tenantKey: scope.siteKey, items, total: items.length, nextCursor: null, capabilities: text.capabilities };
}
export async function audioImportOperation(db: PrismaClient, scope: OutreachScope, key: string) {
  requireFullAccess(scope);
  const row = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: { siteKey: scope.siteKey, actorId: scope.actorId, kind, operationKey: operationKey(key) } } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, status: row.status, result: row.result };
}
export async function importAudioMessages(db: PrismaClient, scope: OutreachScope, payload: unknown, reader?: AudioAssetReader): Promise<AudioImportResult> {
  requireFullAccess(scope);
  const value = parseAudioImport(payload);
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind, operationKey: value.operationKey };
  const requestDigest = digest({ siteKey: scope.siteKey, accountId: value.accountId, items: value.items });
  const replay = async () => {
    const previous = await db.outreachOperation.findUnique({ where: { siteKey_actorId_kind_operationKey: unique } });
    if (!previous) return null;
    if (previous.requestDigest !== requestDigest) throw new OutreachContractError("OPERATION_CONFLICT", 409);
    if (previous.status !== "COMPLETED") throw new OutreachContractError("IMPORT_RESULT_UNKNOWN", 409);
    return { tenantKey: scope.siteKey, status: "COMPLETED" as const, result: previous.result as { ids: string[] } };
  };
  const previous = await replay(); if (previous) return previous;
  const client = reader ?? await ZaadZoomClient.fromDatabase(db, scope.siteKey);
  if (client.accountId !== value.accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
  await assertAccount(db, value.accountId);
  const observed = new Map<string, AudioAsset>();
  for (const selected of value.items) {
    if (!observed.has(selected.assetId)) {
      await ownedAsset(db, scope, value.accountId, selected.assetId);
      observed.set(selected.assetId, await client.getAudioAsset(selected.assetId));
    }
    const asset = observed.get(selected.assetId)!;
    const item = asset.items.find(item => item.assetItemId === selected.assetItemId);
    if (asset.assetId !== selected.assetId || !item || !validItem(asset, item) || audioItemDigest(asset, item) !== selected.observedDigest) throw new OutreachContractError("AUDIO_ASSET_CHANGED", 409);
  }
  try {
    return await db.$transaction(async tx => {
      await assertAccount(tx, value.accountId);
      const ids: string[] = [];
      for (const selected of value.items) {
        const asset = observed.get(selected.assetId)!, item = asset.items.find(item => item.assetItemId === selected.assetItemId)!;
        let binding = await ownedAsset(tx, scope, value.accountId, selected.assetId);
        if (!binding) binding = await tx.zoomResourceBinding.create({ data: { accountId: value.accountId, resourceType: "ASSET", zoomId: selected.assetId, ownerSiteKey: scope.siteKey, purpose: "REGULAR" } });
        await guardAudioResource(tx, audioResourceKey(value.accountId, selected.assetId, selected.assetItemId));
        const current = await tx.outreachImportedAudioMessage.findUnique({ where: { bindingId_assetItemId: { bindingId: binding.id, assetItemId: selected.assetItemId } } });
        if ((current?.updatedAt.toISOString() ?? null) !== selected.expectedUpdatedAt) throw new OutreachContractError("CONTENT_CHANGED", 409);
        const data = { providerBody: item.body, bodyState: item.body === null ? current?.submittedBody ? "USER_AUTHORED" : "UNAVAILABLE" : "PROVIDER_RETURNED", bodyFetchedAt: new Date(), unlinkedAt: null, name: item.name, languageCode: item.languageCode, voiceId: item.voiceId, observedDigest: selected.observedDigest, sourceModifiedAt: asset.sourceModifiedAt ? new Date(asset.sourceModifiedAt) : null, updatedBy: scope.actorId };
        const row = current ? current.observedDigest === selected.observedDigest && current.bodyState !== "UNCHECKED" && !current.unlinkedAt ? current : await tx.outreachImportedAudioMessage.update({ where: { id: current.id }, data }) : await tx.outreachImportedAudioMessage.create({ data: { ...data, siteKey: scope.siteKey, bindingId: binding.id, assetItemId: selected.assetItemId, createdBy: scope.actorId } });
        ids.push(row.id);
        if (!current || row.updatedAt.getTime() !== current.updatedAt.getTime()) await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "message-audio-import", targetId: row.id, action: current ? "UPDATE" : "CREATE", result: "SUCCESS", changedFieldNames: ["name", "languageCode", "voiceId", "observedDigest"] });
      }
      const result = { ids };
      await tx.outreachOperation.create({ data: { ...unique, requestDigest, status: "COMPLETED", result: json(result) } });
      return { tenantKey: scope.siteKey, status: "COMPLETED" as const, result };
    }, { isolationLevel: "Serializable", timeout: 15000 });
  } catch (error) {
    // Concurrent identical requests may win the unique operation key.
    const completed = await replay(); if (completed) return completed;
    databaseError(error);
  }
}

/** Shared by import, refresh, edit and unlink. Never bypass a provider operation. */
export const audioResourceKey = (accountId: string, assetId: string, itemId: string) => JSON.stringify(["audio", accountId, assetId, itemId]);
export async function guardAudioResource(tx: Prisma.TransactionClient, key: string, operationId?: string) {
  await lockMessageResource(tx, key);
  const lock = await tx.outreachMessageLock.findUnique({ where: { resourceKey: key } });
  if (lock && lock.operationId !== operationId) throw new OutreachContractError("AUDIO_OPERATION_IN_PROGRESS", 409);
}
export function importedAudioDigest(row: AudioRow) {
  return digest({ observedDigest: row.observedDigest, name: row.name, languageCode: row.languageCode, voiceId: row.voiceId, providerBody: row.providerBody, submittedBody: row.submittedBody, bodyState: row.bodyState, unlinkedAt: row.unlinkedAt, bindingId: row.bindingId, assetItemId: row.assetItemId });
}
