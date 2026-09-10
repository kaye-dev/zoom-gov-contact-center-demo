import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { AudioAsset, AudioAssetsPage, AudioCandidate, AudioCandidates, AudioImportResult, ImportedAudioMessage } from "@/lib/zaad/message-import-contracts";
import { parseAudioImport } from "@/lib/zaad/message-import-contracts";
import { operationKey, OutreachContractError } from "@/lib/zaad/outreach-contracts";
import { requireFullAccess, requireOutreachDepartment, type OutreachScope } from "./outreach-scope";
import { databaseError, digest, json } from "./outreach-data";
import { ZaadZoomClient } from "./zoom-client";
import { listOutreachMessages } from "./message-revisions";
import { writeZaadAudit } from "./audit";

export type AudioAssetReader = { accountId: string; listAudioAssets(input: { pageSize: number; nextPageToken?: string }): Promise<AudioAssetsPage>; getAudioAsset(id: string): Promise<AudioAsset> };
type Database = PrismaClient | Prisma.TransactionClient;
type AudioRow = Prisma.OutreachImportedAudioMessageGetPayload<{ include: { binding: true } }>;
const kind = "MESSAGE_AUDIO_IMPORT";
async function assertAccount(db: Database, accountId: string) {
  const setting = await db.globalDeveloperApiSetting.findUnique({ where: { id: "global" }, select: { accountId: true } });
  if (setting?.accountId.trim() !== accountId) throw new OutreachContractError("ACCOUNT_CHANGED", 409);
}
async function ownedAsset(db: Database, scope: OutreachScope, accountId: string, assetId: string, departmentKey?: string) {
  const binding = await db.zoomResourceBinding.findFirst({ where: { accountId, resourceType: "ASSET", zoomId: assetId } });
  if (binding && (binding.ownerSiteKey !== scope.siteKey || binding.tombstone || binding.purpose !== "REGULAR" || binding.dispatchId || !binding.departmentKey || !scope.departments.includes(binding.departmentKey) || (departmentKey && departmentKey !== binding.departmentKey))) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
  // Legacy assets may predate resource bindings. Consult every ownership source
  // before provider metadata is read, including internal dispatch revisions.
  const messages = await db.zaadOutboundMessage.findMany({ where: { zoomAssetId: assetId }, select: { siteKey: true, departmentKey: true } });
  const revisions = await db.messageRevision.findMany({ where: { zoomAssetId: assetId, OR: [{ accountId }, { accountId: null }] }, select: { siteKey: true, message: { select: { departmentKey: true } }, _count: { select: { dispatches: true } } } });
  const audios = await db.zoomAudioRevision.findMany({ where: { accountId, assetId }, select: { siteKey: true, revision: { select: { message: { select: { departmentKey: true } }, _count: { select: { dispatches: true } } } } } });
  const denied = (siteKey: string, department: string | null) => siteKey !== scope.siteKey || !department || !scope.departments.includes(department) || Boolean(departmentKey && department !== departmentKey);
  if (messages.some(row => denied(row.siteKey, row.departmentKey)) || revisions.some(row => denied(row.siteKey, row.message.departmentKey) || row._count.dispatches > 0) || audios.some(row => denied(row.siteKey, row.revision.message.departmentKey) || row.revision._count.dispatches > 0)) throw new OutreachContractError("RESOURCE_OWNERSHIP_CONFLICT", 409);
  return binding;
}
export function audioItemDigest(asset: AudioAsset, item: AudioAsset["items"][number]) {
  return digest({ assetId: asset.assetId, assetName: asset.name, type: asset.type, archived: asset.archived, sourceModifiedAt: asset.sourceModifiedAt, ...item });
}
function validItem(asset: AudioAsset, item: AudioAsset["items"][number]) {
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
          return { assetId: asset.assetId, assetItemId: item.assetItemId, name: item.name, languageCode: item.languageCode, voiceId: item.voiceId, observedDigest: audioItemDigest(asset, item), version: row?.version ?? 0, selectable: validItem(asset, item), disabledReason: validItem(asset, item) ? null : "AUDIO_ITEM_UNAVAILABLE", imported: Boolean(row) };
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
function audioDto(row: AudioRow): ImportedAudioMessage {
  return { id: row.id, sourceKind: "IMPORTED_AUDIO", name: row.name, body: null, bodyState: "UNAVAILABLE", voiceId: row.voiceId, languageCode: row.languageCode, departmentKey: row.binding.departmentKey!, version: row.version, generationState: "IMPORTED_AUDIO", zoomAssetId: row.binding.zoomId, assetItemId: row.assetItemId, updatedAt: row.updatedAt.toISOString() };
}
function audioScope(scope: OutreachScope) {
  return { siteKey: scope.siteKey, binding: { ownerSiteKey: scope.siteKey, departmentKey: { in: scope.departments }, resourceType: "ASSET", purpose: "REGULAR", tombstone: false } };
}
export async function getImportedAudioMessage(db: PrismaClient, scope: OutreachScope, id: string) {
  const row = await db.outreachImportedAudioMessage.findFirst({ where: { ...audioScope(scope), id }, include: { binding: true } });
  if (!row) throw new OutreachContractError("NOT_FOUND", 404);
  return { tenantKey: scope.siteKey, message: audioDto(row) };
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
  const value = parseAudioImport(payload); requireOutreachDepartment(scope, value.departmentKey);
  const unique = { siteKey: scope.siteKey, actorId: scope.actorId, kind, operationKey: value.operationKey };
  const requestDigest = digest({ siteKey: scope.siteKey, accountId: value.accountId, departmentKey: value.departmentKey, items: value.items });
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
      await ownedAsset(db, scope, value.accountId, selected.assetId, value.departmentKey);
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
        let binding = await ownedAsset(tx, scope, value.accountId, selected.assetId, value.departmentKey);
        if (!binding) binding = await tx.zoomResourceBinding.create({ data: { accountId: value.accountId, resourceType: "ASSET", zoomId: selected.assetId, ownerSiteKey: scope.siteKey, departmentKey: value.departmentKey, purpose: "REGULAR" } });
        const current = await tx.outreachImportedAudioMessage.findUnique({ where: { bindingId_assetItemId: { bindingId: binding.id, assetItemId: selected.assetItemId } } });
        if ((current?.version ?? 0) !== selected.version) throw new OutreachContractError("VERSION_CONFLICT", 409);
        const data = { name: item.name, languageCode: item.languageCode, voiceId: item.voiceId, observedDigest: selected.observedDigest, sourceModifiedAt: asset.sourceModifiedAt ? new Date(asset.sourceModifiedAt) : null, updatedBy: scope.actorId };
        const row = current ? current.observedDigest === selected.observedDigest ? current : await tx.outreachImportedAudioMessage.update({ where: { id: current.id }, data: { ...data, version: { increment: 1 } } }) : await tx.outreachImportedAudioMessage.create({ data: { ...data, siteKey: scope.siteKey, bindingId: binding.id, assetItemId: selected.assetItemId, createdBy: scope.actorId } });
        ids.push(row.id);
        if (!current || row.version !== current.version) await writeZaadAudit(tx, scope.siteKey, { actorUserId: scope.actorId, resourceKind: "message-audio-import", targetId: row.id, action: current ? "UPDATE" : "CREATE", result: "SUCCESS", changedFieldNames: ["name", "languageCode", "voiceId", "observedDigest"] });
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
