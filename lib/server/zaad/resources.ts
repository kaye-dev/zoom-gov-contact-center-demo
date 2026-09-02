import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  countZaadTextCharacters,
  parseZaadCampaignStatusInput,
  parseZaadContactListInput,
  parseZaadMessageInput,
  parseZaadRegistrationSettingInput,
  ZAAD_ERROR_CODES,
  ZAAD_LIMITS,
  ZAAD_VOICES,
} from "@/lib/zaad/contracts";

import { writeZaadAudit, type ZaadAuditInput } from "./audit";
import { ZaadZoomClient, ZaadZoomError } from "./zoom-client";

export class ZaadResourceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly resultUnknown = false,
  ) {
    super(code);
    this.name = "ZaadResourceError";
  }
}

export async function getZaadConnection(prisma: PrismaClient) {
  try {
    const client = await ZaadZoomClient.fromDatabase(prisma);
    return { state: await client.probe() };
  } catch (error) {
    if (error instanceof ZaadZoomError && error.code === ZAAD_ERROR_CODES.zoomNotConfigured) {
      return { state: "missing" as const };
    }
    return { state: "outage" as const };
  }
}

export async function listZaadMessages(prisma: PrismaClient) {
  const messages = await prisma.zaadOutboundMessage.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return { messages: messages.map(messageListDto) };
}

export async function getZaadMessage(prisma: PrismaClient, id: string) {
  const message = await prisma.zaadOutboundMessage.findUnique({ where: { id } });
  if (!message) throw new ZaadResourceError(ZAAD_ERROR_CODES.messageNotFound, 404);
  return messageDto(message);
}

export async function createZaadMessage(prisma: PrismaClient, actorUserId: string, payload: unknown) {
  const parsed = parseZaadMessageInput(payload);
  if (!parsed.ok) throw new ZaadResourceError(parsed.code, 400);
  const row = await prisma.$transaction(async (transaction) => {
    const created = await transaction.zaadOutboundMessage.create({
      data: {
        name: parsed.value.name,
        body: parsed.value.body,
        languageCode: parsed.value.languageCode,
        voiceId: parsed.value.voiceId,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });
    await writeZaadAudit(transaction, {
      actorUserId,
      resourceKind: "message",
      targetId: created.id,
      action: "CREATE",
      result: "SUCCESS",
      changedFieldNames: ["name", "body", "languageCode", "voiceId"],
    });
    return created;
  });
  await syncMessageBestEffort(prisma, row.id);
  return messageDto(await prisma.zaadOutboundMessage.findUniqueOrThrow({ where: { id: row.id } }));
}

export async function updateZaadMessage(prisma: PrismaClient, actorUserId: string, id: string, payload: unknown) {
  const parsed = parseZaadMessageInput(payload, true);
  if (!parsed.ok) {
    const current = await prisma.zaadOutboundMessage.findUnique({ where: { id } });
    if (current && countZaadTextCharacters(current.body) > ZAAD_LIMITS.messageBody && payloadKeepsOversizedMessageBody(payload)) {
      await writeZaadAudit(prisma, {
        actorUserId,
        resourceKind: "message",
        targetId: id,
        action: "UPDATE",
        result: "REJECTED",
        changedFieldNames: ["body"],
        stableErrorCode: ZAAD_ERROR_CODES.messageBodyRequiresShortening,
      });
      throw new ZaadResourceError(ZAAD_ERROR_CODES.messageBodyRequiresShortening, 409);
    }
    throw new ZaadResourceError(parsed.code, 400);
  }
  const updated = await prisma.$transaction(async (transaction) => {
    const current = await transaction.zaadOutboundMessage.findUnique({ where: { id } });
    const createResultUnknown = current !== null
      && current.revision === parsed.value.revision
      && isUnreconciledTtsCreate(current);
    const result = await transaction.zaadOutboundMessage.updateMany({
      where: { id, revision: parsed.value.revision },
      data: {
        name: parsed.value.name,
        body: parsed.value.body,
        languageCode: parsed.value.languageCode,
        voiceId: parsed.value.voiceId,
        syncStatus: createResultUnknown ? "SYNC_FAILED" : "PENDING",
        syncErrorCode: createResultUnknown ? ZAAD_ERROR_CODES.zoomResultUnknown : null,
        syncedAt: null,
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });
    if (result.count !== 1) {
      const exists = await transaction.zaadOutboundMessage.findUnique({ where: { id }, select: { id: true } });
      throw new ZaadResourceError(exists ? ZAAD_ERROR_CODES.messageConflict : ZAAD_ERROR_CODES.messageNotFound, exists ? 409 : 404);
    }
    await writeZaadAudit(transaction, {
      actorUserId,
      resourceKind: "message",
      targetId: id,
      action: "UPDATE",
      result: "SUCCESS",
      changedFieldNames: ["name", "body", "languageCode", "voiceId"],
    });
    return transaction.zaadOutboundMessage.findUniqueOrThrow({ where: { id } });
  });
  if (!isUnreconciledTtsCreate(updated)) await syncMessageBestEffort(prisma, updated.id);
  return messageDto(await prisma.zaadOutboundMessage.findUniqueOrThrow({ where: { id } }));
}

export async function retryZaadMessage(prisma: PrismaClient, actorUserId: string, id: string, revision: number) {
  const current = await prisma.zaadOutboundMessage.findUnique({ where: { id } });
  if (current?.revision === revision && countZaadTextCharacters(current.body) > ZAAD_LIMITS.messageBody) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "message",
      targetId: id,
      action: "SYNC_RETRY",
      result: "REJECTED",
      changedFieldNames: ["body", "syncStatus"],
      stableErrorCode: ZAAD_ERROR_CODES.messageBodyRequiresShortening,
    });
    throw new ZaadResourceError(ZAAD_ERROR_CODES.messageBodyRequiresShortening, 409);
  }
  if (current?.revision === revision && isUnreconciledTtsCreate(current)) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "message",
      targetId: id,
      action: "SYNC_RETRY",
      result: "REJECTED",
      changedFieldNames: ["syncStatus"],
      stableErrorCode: ZAAD_ERROR_CODES.zoomResultUnknown,
    });
    throw new ZaadResourceError(ZAAD_ERROR_CODES.zoomResultUnknown, 409, true);
  }
  const result = await prisma.zaadOutboundMessage.updateMany({
    where: { id, revision },
    data: { syncStatus: "PENDING", syncErrorCode: null, revision: { increment: 1 }, updatedByUserId: actorUserId },
  });
  if (result.count !== 1) {
    const exists = await prisma.zaadOutboundMessage.findUnique({ where: { id }, select: { id: true } });
    const code = exists ? ZAAD_ERROR_CODES.messageConflict : ZAAD_ERROR_CODES.messageNotFound;
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "message",
      targetId: id,
      action: "SYNC_RETRY",
      result: "REJECTED",
      changedFieldNames: ["syncStatus"],
      stableErrorCode: code,
    });
    throw new ZaadResourceError(code, exists ? 409 : 404);
  }
  const outcome = await syncMessageBestEffort(prisma, id);
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "message",
    targetId: id,
    action: "SYNC_RETRY",
    result: outcome.success ? "SUCCESS" : outcome.resultUnknown ? "RESULT_UNKNOWN" : "FAILED",
    changedFieldNames: ["syncStatus"],
    stableErrorCode: outcome.success ? null : outcome.code,
  });
  return messageDto(await prisma.zaadOutboundMessage.findUniqueOrThrow({ where: { id } }));
}

export async function deleteZaadMessage(prisma: PrismaClient, actorUserId: string, id: string, revision: number) {
  const row = await prisma.zaadOutboundMessage.findUnique({ where: { id } });
  if (!row) return { deleted: true as const };
  if (row.revision !== revision) throw new ZaadResourceError(ZAAD_ERROR_CODES.messageConflict, 409);
  const inUse = row.zoomAssetId
    ? await prisma.zaadOneTimeDispatch.count({ where: { zoomAssetId: row.zoomAssetId } })
    : 0;
  if (inUse > 0) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "message",
      targetId: id,
      action: "DELETE",
      result: "REJECTED",
      changedFieldNames: ["record"],
      stableErrorCode: ZAAD_ERROR_CODES.messageInUse,
    });
    throw new ZaadResourceError(ZAAD_ERROR_CODES.messageInUse, 409);
  }
  if (row.zoomAssetId) {
    try {
      await callZoom(prisma, (client) => client.deleteTtsAsset(row.zoomAssetId!));
    } catch (error) {
      const mapped = mapResourceError(error);
      const normalized = mapped.code === ZAAD_ERROR_CODES.zoomInUse
        ? new ZaadResourceError(ZAAD_ERROR_CODES.messageInUse, 409)
        : mapped;
      await writeZaadAudit(prisma, {
        actorUserId,
        resourceKind: "message",
        targetId: id,
        action: "DELETE",
        result: normalized.resultUnknown ? "RESULT_UNKNOWN" : "FAILED",
        changedFieldNames: ["record"],
        stableErrorCode: normalized.code,
      });
      throw normalized;
    }
  }
  await prisma.$transaction(async (transaction) => {
    const deleted = await transaction.zaadOutboundMessage.deleteMany({ where: { id, revision } });
    if (deleted.count !== 1) throw new ZaadResourceError(ZAAD_ERROR_CODES.messageConflict, 409);
    await writeZaadAudit(transaction, {
      actorUserId,
      resourceKind: "message",
      targetId: id,
      action: "DELETE",
      result: "SUCCESS",
      changedFieldNames: ["record"],
    });
  });
  return { deleted: true as const };
}

export async function listZaadContactLists(prisma: PrismaClient, nextPageToken?: string) {
  return callZoom(prisma, (client) => client.listContactLists({ pageSize: 25, nextPageToken }));
}

export async function getZaadContactList(prisma: PrismaClient, id: string) {
  return callZoom(prisma, (client) => client.getContactList(id));
}

export async function createZaadContactList(prisma: PrismaClient, actorUserId: string, payload: unknown) {
  const parsed = parseZaadContactListInput(payload);
  if (!parsed.ok) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: "create",
      action: "CREATE",
      result: "REJECTED",
      stableErrorCode: parsed.code,
    });
    throw new ZaadResourceError(parsed.code, 400);
  }
  let list;
  try {
    list = await callZoom(prisma, (client) => client.createContactList(parsed.value));
  } catch (error) {
    throw await auditExternalFailure(prisma, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: "create",
      action: "CREATE",
      changedFieldNames: ["name", "description", "type"],
    }, error);
  }
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "contact-list",
    targetId: list.id,
    action: "CREATE",
    result: "SUCCESS",
    changedFieldNames: ["name", "description", "type"],
  });
  return list;
}

export async function updateZaadContactList(prisma: PrismaClient, actorUserId: string, id: string, payload: unknown) {
  const parsed = parseZaadContactListInput(payload, true);
  if (!parsed.ok) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "UPDATE",
      result: "REJECTED",
      stableErrorCode: parsed.code,
    });
    throw new ZaadResourceError(parsed.code, 400);
  }
  let current;
  try {
    current = await callZoom(prisma, (client) => client.getContactList(id));
  } catch (error) {
    throw await auditExternalFailure(prisma, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "UPDATE",
      changedFieldNames: ["name", "description"],
    }, error);
  }
  if (current.revision !== parsed.value.revision) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "UPDATE",
      result: "REJECTED",
      changedFieldNames: ["name", "description"],
      stableErrorCode: ZAAD_ERROR_CODES.contactListConflict,
    });
    throw new ZaadResourceError(ZAAD_ERROR_CODES.contactListConflict, 409);
  }
  let list;
  try {
    list = await callZoom(prisma, (client) => client.updateContactList(id, parsed.value));
  } catch (error) {
    throw await auditExternalFailure(prisma, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "UPDATE",
      changedFieldNames: ["name", "description"],
    }, error);
  }
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "contact-list",
    targetId: id,
    action: "UPDATE",
    result: "SUCCESS",
    changedFieldNames: ["name", "description"],
  });
  return list;
}

export async function deleteZaadContactList(prisma: PrismaClient, actorUserId: string, id: string) {
  const [settingReferences, residentReferences, dispatchReferences, sourceReferences] = await Promise.all([
    prisma.zaadRegistrationSetting.count({ where: { contactListId: id } }),
    prisma.disasterRadioSubscription.count({ where: { zoomContactListId: id } }),
    prisma.zaadOneTimeDispatch.count({ where: { zoomContactListId: id } }),
    prisma.zaadOneTimeDispatchSourceList.count({ where: { contactListId: id } }),
  ]);
  if (settingReferences + residentReferences + dispatchReferences + sourceReferences > 0) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "DELETE",
      result: "REJECTED",
      changedFieldNames: ["record"],
      stableErrorCode: ZAAD_ERROR_CODES.contactListConflict,
    });
    throw new ZaadResourceError(ZAAD_ERROR_CODES.contactListConflict, 409);
  }
  try {
    await callZoom(prisma, (client) => client.deleteContactList(id));
  } catch (error) {
    throw await auditExternalFailure(prisma, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "DELETE",
      changedFieldNames: ["record"],
    }, error);
  }
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "contact-list",
    targetId: id,
    action: "DELETE",
    result: "SUCCESS",
    changedFieldNames: ["record"],
  });
  return { deleted: true as const };
}

export async function getZaadRegistrationSetting(prisma: PrismaClient) {
  const setting = await prisma.zaadRegistrationSetting.findUniqueOrThrow({
    where: { id: 1 },
  });
  return settingDto(setting);
}

export async function updateZaadRegistrationSetting(prisma: PrismaClient, actorUserId: string, payload: unknown) {
  const parsed = parseZaadRegistrationSettingInput(payload);
  if (!parsed.ok) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "registration-setting",
      targetId: "singleton",
      action: "UPDATE",
      result: "REJECTED",
      stableErrorCode: parsed.code,
    });
    throw new ZaadResourceError(parsed.code, 400);
  }
  let contactListName: string | null = null;
  if (parsed.value.contactListId) {
    let list;
    try {
      list = await callZoom(prisma, (client) => client.getContactList(parsed.value.contactListId!));
    } catch (error) {
      throw await auditExternalFailure(prisma, {
        actorUserId,
        resourceKind: "registration-setting",
        targetId: "singleton",
        action: "UPDATE",
        changedFieldNames: ["contactListId"],
      }, error);
    }
    contactListName = list.name;
  }
  const setting = await prisma.$transaction(async (transaction) => {
    const result = await transaction.zaadRegistrationSetting.updateMany({
      where: { id: 1, revision: parsed.value.revision },
      data: {
        contactListId: parsed.value.contactListId,
        contactListNameSnapshot: contactListName,
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });
    if (result.count !== 1) throw new ZaadResourceError(ZAAD_ERROR_CODES.registrationSettingConflict, 409);
    await writeZaadAudit(transaction, {
      actorUserId,
      resourceKind: "registration-setting",
      targetId: "singleton",
      action: "UPDATE",
      result: "SUCCESS",
      changedFieldNames: ["contactListId"],
    });
    return transaction.zaadRegistrationSetting.findUniqueOrThrow({ where: { id: 1 } });
  });
  return settingDto(setting);
}

export async function listZaadCampaigns(prisma: PrismaClient, nextPageToken?: string) {
  return callZoom(prisma, (client) => client.listCampaigns({ pageSize: 25, nextPageToken }));
}

export async function getZaadCampaign(prisma: PrismaClient, id: string) {
  return callZoom(prisma, (client) => client.getCampaign(id));
}

export async function updateZaadCampaignStatus(prisma: PrismaClient, actorUserId: string, id: string, payload: unknown) {
  const parsed = parseZaadCampaignStatusInput(payload);
  if (!parsed.ok) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "campaign",
      targetId: id,
      action: "STATUS_UPDATE",
      result: "REJECTED",
      changedFieldNames: ["status"],
      stableErrorCode: parsed.code,
    });
    throw new ZaadResourceError(parsed.code, 400);
  }
  const action = campaignAction(parsed.value.status);
  let client;
  try {
    client = await getClient(prisma);
  } catch (error) {
    throw await auditCampaignFailure(prisma, actorUserId, id, action, parsed.value.status, null, error);
  }
  let current;
  try {
    current = await callClient(() => client.getCampaign(id));
  } catch (error) {
    throw await auditCampaignFailure(prisma, actorUserId, id, action, parsed.value.status, null, error);
  }
  if (current.dialingMethod !== "agentless") {
    await auditCampaignRejection(
      prisma,
      actorUserId,
      id,
      action,
      current.status,
      parsed.value.status,
      ZAAD_ERROR_CODES.campaignNotAgentless,
    );
    throw new ZaadResourceError(ZAAD_ERROR_CODES.campaignNotAgentless, 409);
  }
  if (current.status !== parsed.value.expectedStatus) {
    await auditCampaignRejection(
      prisma,
      actorUserId,
      id,
      action,
      current.status,
      parsed.value.status,
      ZAAD_ERROR_CODES.campaignStatusConflict,
    );
    throw new ZaadResourceError(ZAAD_ERROR_CODES.campaignStatusConflict, 409);
  }
  if (current.status === parsed.value.status) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "campaign",
      targetId: id,
      action,
      result: "SUCCESS",
      changedFieldNames: ["status"],
      fromCampaignStatus: current.status,
      toCampaignStatus: current.status,
    });
    return current;
  }
  const valid = (parsed.value.status === "running" && (current.status === "ready" || current.status === "paused")) ||
    (parsed.value.status === "paused" && current.status === "running");
  if (!valid) {
    await auditCampaignRejection(
      prisma,
      actorUserId,
      id,
      action,
      current.status,
      parsed.value.status,
      ZAAD_ERROR_CODES.campaignStatusConflict,
    );
    throw new ZaadResourceError(ZAAD_ERROR_CODES.campaignStatusConflict, 409);
  }
  try {
    await client.setCampaignStatus(id, parsed.value.status === "running" ? "Running" : "Paused");
  } catch (error) {
    const mapped = mapResourceError(error);
    if (!mapped.resultUnknown) {
      throw await auditCampaignFailure(
        prisma,
        actorUserId,
        id,
        action,
        parsed.value.status,
        current.status,
        mapped,
      );
    }
  }
  let readback;
  try {
    readback = await callClient(() => client.getCampaign(id));
  } catch {
    await auditCampaignUnknown(prisma, actorUserId, id, action, current.status, parsed.value.status);
    throw new ZaadResourceError(ZAAD_ERROR_CODES.campaignStatusUnknown, 502, true);
  }
  if (readback.status !== parsed.value.status) {
    await auditCampaignUnknown(prisma, actorUserId, id, action, current.status, parsed.value.status);
    throw new ZaadResourceError(ZAAD_ERROR_CODES.campaignStatusUnknown, 502, true);
  }
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "campaign",
    targetId: id,
    action,
    result: "SUCCESS",
    changedFieldNames: ["status"],
    fromCampaignStatus: current.status,
    toCampaignStatus: readback.status,
  });
  return readback;
}

async function syncMessageBestEffort(prisma: PrismaClient, id: string) {
  const row = await prisma.zaadOutboundMessage.findUnique({ where: { id } });
  if (!row) {
    return { success: false as const, code: ZAAD_ERROR_CODES.messageNotFound, resultUnknown: false };
  }
  if (isUnreconciledTtsCreate(row)) {
    return { success: false as const, code: ZAAD_ERROR_CODES.zoomResultUnknown, resultUnknown: true };
  }
  try {
    if (row.languageCode !== "ja-JP" || !ZAAD_VOICES.includes(row.voiceId as (typeof ZAAD_VOICES)[number])) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    }
    if (Boolean(row.zoomAssetId) !== Boolean(row.zoomAssetItemId)) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    }
    const client = await ZaadZoomClient.fromDatabase(prisma);
    const input = {
      name: row.name,
      body: row.body,
      languageCode: row.languageCode,
      voiceId: row.voiceId as (typeof ZAAD_VOICES)[number],
    } as const;
    const asset = row.zoomAssetId && row.zoomAssetItemId
      ? await client.updateTtsAsset(row.zoomAssetId, row.zoomAssetItemId, input)
      : await client.createTtsAsset(input);
    const saved = await prisma.zaadOutboundMessage.updateMany({
      where: { id, revision: row.revision },
      data: {
        zoomAssetId: asset.assetId,
        zoomAssetItemId: asset.assetItemId,
        syncStatus: "SYNCED",
        syncErrorCode: null,
        syncedAt: new Date(),
      },
    });
    if (saved.count !== 1) {
      return { success: false as const, code: ZAAD_ERROR_CODES.zoomResultUnknown, resultUnknown: true };
    }
    return { success: true as const };
  } catch (error) {
    const resultUnknown = error instanceof ZaadZoomError && error.resultUnknown;
    const code = resultUnknown
      ? ZAAD_ERROR_CODES.zoomResultUnknown
      : error instanceof ZaadZoomError ? error.code : ZAAD_ERROR_CODES.zoomUnavailable;
    await prisma.zaadOutboundMessage.updateMany({
      where: { id, revision: row.revision },
      data: { syncStatus: "SYNC_FAILED", syncErrorCode: code, syncedAt: null },
    });
    return { success: false as const, code, resultUnknown };
  }
}

async function getClient(prisma: PrismaClient) {
  try {
    return await ZaadZoomClient.fromDatabase(prisma);
  } catch (error) {
    throw mapResourceError(error);
  }
}

async function callZoom<T>(prisma: PrismaClient, run: (client: ZaadZoomClient) => Promise<T>) {
  const client = await getClient(prisma);
  return callClient(() => run(client));
}

async function callClient<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    throw mapResourceError(error);
  }
}

function mapResourceError(error: unknown) {
  if (error instanceof ZaadResourceError) return error;
  if (error instanceof ZaadZoomError) {
    return new ZaadResourceError(
      error.resultUnknown ? ZAAD_ERROR_CODES.zoomResultUnknown : error.code,
      error.httpStatus,
      error.resultUnknown,
    );
  }
  return new ZaadResourceError(ZAAD_ERROR_CODES.zoomUnavailable, 502);
}

type ExternalAuditInput = Pick<
  ZaadAuditInput,
  "actorUserId" | "resourceKind" | "targetId" | "action" | "changedFieldNames"
>;

async function auditExternalFailure(
  prisma: PrismaClient,
  input: ExternalAuditInput,
  error: unknown,
) {
  const mapped = mapResourceError(error);
  await writeZaadAudit(prisma, {
    ...input,
    result: mapped.resultUnknown ? "RESULT_UNKNOWN" : "FAILED",
    stableErrorCode: mapped.code,
  });
  return mapped;
}

function campaignAction(status: "running" | "paused") {
  return status === "running" ? "START" : "PAUSE";
}

async function auditCampaignRejection(
  prisma: PrismaClient,
  actorUserId: string,
  id: string,
  action: string,
  fromStatus: string | null,
  toStatus: string,
  stableErrorCode: string,
) {
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "campaign",
    targetId: id,
    action,
    result: "REJECTED",
    changedFieldNames: ["status"],
    fromCampaignStatus: fromStatus,
    toCampaignStatus: toStatus,
    stableErrorCode,
  });
}

async function auditCampaignFailure(
  prisma: PrismaClient,
  actorUserId: string,
  id: string,
  action: string,
  desiredStatus: string,
  currentStatus: string | null,
  error: unknown,
) {
  const mapped = mapResourceError(error);
  if (mapped.resultUnknown) {
    await auditCampaignUnknown(prisma, actorUserId, id, action, currentStatus, desiredStatus);
    return new ZaadResourceError(ZAAD_ERROR_CODES.campaignStatusUnknown, 502, true);
  }
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "campaign",
    targetId: id,
    action,
    result: "FAILED",
    changedFieldNames: ["status"],
    fromCampaignStatus: currentStatus,
    toCampaignStatus: desiredStatus,
    stableErrorCode: mapped.code,
  });
  return mapped;
}

async function auditCampaignUnknown(
  prisma: PrismaClient,
  actorUserId: string,
  id: string,
  action: string,
  fromStatus: string | null,
  toStatus: string,
) {
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "campaign",
    targetId: id,
    action,
    result: "RESULT_UNKNOWN",
    changedFieldNames: ["status"],
    fromCampaignStatus: fromStatus,
    toCampaignStatus: toStatus,
    stableErrorCode: ZAAD_ERROR_CODES.campaignStatusUnknown,
  });
}

type MessageRow = {
  id: string;
  name: string;
  body: string;
  languageCode: string;
  voiceId: string;
  zoomAssetId: string | null;
  zoomAssetItemId: string | null;
  syncStatus: string;
  syncErrorCode: string | null;
  revision: number;
  updatedAt: Date;
};

function isUnreconciledTtsCreate(row: Pick<
  MessageRow,
  "zoomAssetId" | "zoomAssetItemId" | "syncErrorCode"
>) {
  return row.syncErrorCode === ZAAD_ERROR_CODES.zoomResultUnknown
    && row.zoomAssetId === null
    && row.zoomAssetItemId === null;
}

function payloadKeepsOversizedMessageBody(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const body = (payload as Record<string, unknown>).body;
  if (typeof body !== "string") return false;
  return countZaadTextCharacters(body.trim().normalize("NFKC")) > ZAAD_LIMITS.messageBody;
}

function messageDto(row: MessageRow) {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    languageCode: row.languageCode,
    voiceId: row.voiceId,
    zoomAssetId: row.zoomAssetId,
    zoomAssetItemId: row.zoomAssetItemId,
    syncStatus: row.syncStatus,
    syncErrorCode: row.syncErrorCode,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function messageListDto(row: MessageRow) {
  const characters = [...row.body];
  return {
    id: row.id,
    name: row.name,
    bodyPreview: `${characters.slice(0, 80).join("")}${characters.length > 80 ? "…" : ""}`,
    languageCode: row.languageCode,
    voiceId: row.voiceId,
    zoomAssetId: row.zoomAssetId,
    zoomAssetItemId: row.zoomAssetItemId,
    syncStatus: row.syncStatus,
    syncErrorCode: row.syncErrorCode,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function settingDto(row: {
  contactListId: string | null;
  contactListNameSnapshot: string | null;
  revision: number;
  updatedAt: Date;
}) {
  return {
    contactListId: row.contactListId,
    contactListName: row.contactListNameSnapshot,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}
