import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  parseZaadCampaignStatusInput,
  parseZaadContactListInput,
  parseZaadRegistrationSettingInput,
  ZAAD_ERROR_CODES,
} from "@/lib/zaad/contracts";

import { writeZaadAudit, type ZaadAuditInput } from "./audit";
import { ZaadZoomClient, ZaadZoomError } from "./zoom-client";

// NOTE: ZAAD はテナント引数の配線を次段へ送っているため、既定テナントを直接参照する。
// features.zaad が lg 限定である前提に依存する。
import type { TenantKey } from "@/lib/tenants";

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

export async function getZaadConnection(prisma: PrismaClient, tenantKey: TenantKey) {
  try {
    const client = await ZaadZoomClient.fromDatabase(prisma, tenantKey);
    return { state: await client.probe() };
  } catch (error) {
    if (error instanceof ZaadZoomError && error.code === ZAAD_ERROR_CODES.zoomNotConfigured) {
      return { state: "missing" as const };
    }
    return { state: "outage" as const };
  }
}

export async function listZaadContactLists(prisma: PrismaClient, tenantKey: TenantKey, nextPageToken?: string) {
  return callZoom(prisma, tenantKey, (client) => client.listContactLists({ pageSize: 25, nextPageToken }));
}

export async function getZaadContactList(prisma: PrismaClient, tenantKey: TenantKey, id: string) {
  return callZoom(prisma, tenantKey, (client) => client.getContactList(id));
}

export async function createZaadContactList(prisma: PrismaClient, tenantKey: TenantKey, actorUserId: string, payload: unknown) {
  const parsed = parseZaadContactListInput(payload);
  if (!parsed.ok) {
    await writeZaadAudit(prisma, tenantKey, {
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
    list = await callZoom(prisma, tenantKey, (client) => client.createContactList(parsed.value));
  } catch (error) {
    throw await auditExternalFailure(prisma, tenantKey, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: "create",
      action: "CREATE",
      changedFieldNames: ["name", "description", "type"],
    }, error);
  }
  await writeZaadAudit(prisma, tenantKey, {
    actorUserId,
    resourceKind: "contact-list",
    targetId: list.id,
    action: "CREATE",
    result: "SUCCESS",
    changedFieldNames: ["name", "description", "type"],
  });
  return list;
}

export async function updateZaadContactList(prisma: PrismaClient, tenantKey: TenantKey, actorUserId: string, id: string, payload: unknown) {
  const parsed = parseZaadContactListInput(payload, true);
  if (!parsed.ok) {
    await writeZaadAudit(prisma, tenantKey, {
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
    current = await callZoom(prisma, tenantKey, (client) => client.getContactList(id));
  } catch (error) {
    throw await auditExternalFailure(prisma, tenantKey, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "UPDATE",
      changedFieldNames: ["name", "description"],
    }, error);
  }
  if (current.revision !== parsed.value.revision) {
    await writeZaadAudit(prisma, tenantKey, {
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
    list = await callZoom(prisma, tenantKey, (client) => client.updateContactList(id, parsed.value));
  } catch (error) {
    throw await auditExternalFailure(prisma, tenantKey, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "UPDATE",
      changedFieldNames: ["name", "description"],
    }, error);
  }
  await writeZaadAudit(prisma, tenantKey, {
    actorUserId,
    resourceKind: "contact-list",
    targetId: id,
    action: "UPDATE",
    result: "SUCCESS",
    changedFieldNames: ["name", "description"],
  });
  return list;
}

export async function deleteZaadContactList(prisma: PrismaClient, tenantKey: TenantKey, actorUserId: string, id: string) {
  const [settingReferences, residentReferences, dispatchReferences, sourceReferences] = await Promise.all([
    prisma.zaadRegistrationSetting.count({ where: { siteKey: tenantKey, contactListId: id } }),
    prisma.disasterRadioSubscription.count({ where: { siteKey: tenantKey, zoomContactListId: id } }),
    prisma.zaadOneTimeDispatch.count({ where: { siteKey: tenantKey, zoomContactListId: id } }),
    prisma.zaadOneTimeDispatchSourceList.count({ where: { contactListId: id, dispatch: { siteKey: tenantKey } } }),
  ]);
  if (settingReferences + residentReferences + dispatchReferences + sourceReferences > 0) {
    await writeZaadAudit(prisma, tenantKey, {
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
    await callZoom(prisma, tenantKey, (client) => client.deleteContactList(id));
  } catch (error) {
    throw await auditExternalFailure(prisma, tenantKey, {
      actorUserId,
      resourceKind: "contact-list",
      targetId: id,
      action: "DELETE",
      changedFieldNames: ["record"],
    }, error);
  }
  await writeZaadAudit(prisma, tenantKey, {
    actorUserId,
    resourceKind: "contact-list",
    targetId: id,
    action: "DELETE",
    result: "SUCCESS",
    changedFieldNames: ["record"],
  });
  return { deleted: true as const };
}

export async function getZaadRegistrationSetting(prisma: PrismaClient, tenantKey: TenantKey) {
  const setting = await prisma.zaadRegistrationSetting.findUniqueOrThrow({
    where: { siteKey: tenantKey },
  });
  return settingDto(setting);
}

export async function updateZaadRegistrationSetting(prisma: PrismaClient, tenantKey: TenantKey, actorUserId: string, payload: unknown) {
  const parsed = parseZaadRegistrationSettingInput(payload);
  if (!parsed.ok) {
    await writeZaadAudit(prisma, tenantKey, {
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
      list = await callZoom(prisma, tenantKey, (client) => client.getContactList(parsed.value.contactListId!));
    } catch (error) {
      throw await auditExternalFailure(prisma, tenantKey, {
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
      where: { siteKey: tenantKey, revision: parsed.value.revision },
      data: {
        contactListId: parsed.value.contactListId,
        contactListNameSnapshot: contactListName,
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });
    if (result.count !== 1) throw new ZaadResourceError(ZAAD_ERROR_CODES.registrationSettingConflict, 409);
    await writeZaadAudit(transaction, tenantKey, {
      actorUserId,
      resourceKind: "registration-setting",
      targetId: "singleton",
      action: "UPDATE",
      result: "SUCCESS",
      changedFieldNames: ["contactListId"],
    });
    return transaction.zaadRegistrationSetting.findUniqueOrThrow({ where: { siteKey: tenantKey } });
  });
  return settingDto(setting);
}

export async function listZaadCampaigns(prisma: PrismaClient, tenantKey: TenantKey, nextPageToken?: string) {
  return callZoom(prisma, tenantKey, (client) => client.listCampaigns({ pageSize: 25, nextPageToken }));
}

export async function getZaadCampaign(prisma: PrismaClient, tenantKey: TenantKey, id: string) {
  return callZoom(prisma, tenantKey, (client) => client.getCampaign(id));
}

export async function updateZaadCampaignStatus(prisma: PrismaClient, tenantKey: TenantKey, actorUserId: string, id: string, payload: unknown) {
  const parsed = parseZaadCampaignStatusInput(payload);
  if (!parsed.ok) {
    await writeZaadAudit(prisma, tenantKey, {
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
    client = await getClient(prisma, tenantKey);
  } catch (error) {
    throw await auditCampaignFailure(prisma, tenantKey, actorUserId, id, action, parsed.value.status, null, error);
  }
  let current;
  try {
    current = await callClient(() => client.getCampaign(id));
  } catch (error) {
    throw await auditCampaignFailure(prisma, tenantKey, actorUserId, id, action, parsed.value.status, null, error);
  }
  if (current.dialingMethod !== "agentless") {
    await auditCampaignRejection(
      prisma,
      tenantKey,
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
      tenantKey,
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
    await writeZaadAudit(prisma, tenantKey, {
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
      tenantKey,
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
        tenantKey,
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
    await auditCampaignUnknown(prisma, tenantKey, actorUserId, id, action, current.status, parsed.value.status);
    throw new ZaadResourceError(ZAAD_ERROR_CODES.campaignStatusUnknown, 502, true);
  }
  if (readback.status !== parsed.value.status) {
    await auditCampaignUnknown(prisma, tenantKey, actorUserId, id, action, current.status, parsed.value.status);
    throw new ZaadResourceError(ZAAD_ERROR_CODES.campaignStatusUnknown, 502, true);
  }
  await writeZaadAudit(prisma, tenantKey, {
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

async function getClient(prisma: PrismaClient, tenantKey: TenantKey) {
  try {
    return await ZaadZoomClient.fromDatabase(prisma, tenantKey);
  } catch (error) {
    throw mapResourceError(error);
  }
}

async function callZoom<T>(
  prisma: PrismaClient,
  tenantKey: TenantKey,
  run: (client: ZaadZoomClient) => Promise<T>,
) {
  const client = await getClient(prisma, tenantKey);
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
  tenantKey: TenantKey,
  input: ExternalAuditInput,
  error: unknown,
) {
  const mapped = mapResourceError(error);
  await writeZaadAudit(prisma, tenantKey, {
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
  tenantKey: TenantKey,
  actorUserId: string,
  id: string,
  action: string,
  fromStatus: string | null,
  toStatus: string,
  stableErrorCode: string,
) {
  await writeZaadAudit(prisma, tenantKey, {
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
  tenantKey: TenantKey,
  actorUserId: string,
  id: string,
  action: string,
  desiredStatus: string,
  currentStatus: string | null,
  error: unknown,
) {
  const mapped = mapResourceError(error);
  if (mapped.resultUnknown) {
    await auditCampaignUnknown(prisma, tenantKey, actorUserId, id, action, currentStatus, desiredStatus);
    return new ZaadResourceError(ZAAD_ERROR_CODES.campaignStatusUnknown, 502, true);
  }
  await writeZaadAudit(prisma, tenantKey, {
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
  tenantKey: TenantKey,
  actorUserId: string,
  id: string,
  action: string,
  fromStatus: string | null,
  toStatus: string,
) {
  await writeZaadAudit(prisma, tenantKey, {
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
