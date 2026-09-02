import { createHmac, timingSafeEqual } from "node:crypto";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import { normalizeJapanPhone } from "@/lib/disaster-radio-subscriptions/validation";
import {
  parseZaadOneTimeInput,
  ZAAD_ERROR_CODES,
  ZAAD_LIMITS,
  type ZaadOneTimeInput,
  type ZaadOneTimePrepareInput,
} from "@/lib/zaad/contracts";

import { writeZaadAudit } from "./audit";
import {
  ZaadZoomClient,
  ZaadZoomError,
  type ZoomCampaignDto,
  type ZoomOneTimeCampaignProfile,
} from "./zoom-client";

const PREFLIGHT_TTL_SECONDS = 5 * 60;

export class ZaadOneTimeError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly dispatch?: ReturnType<typeof dispatchDto>,
  ) {
    super(code);
    this.name = "ZaadOneTimeError";
  }
}

type RecipientSnapshot = {
  phone: string;
  displayName: string;
  source: "contact-list" | "resident";
};

type ResolvedSnapshot = {
  recipients: RecipientSnapshot[];
  selectedListCount: number;
  selectedResidentCount: number;
  duplicateCount: number;
  campaign: ZoomCampaignDto;
  campaignProfile: ZoomOneTimeCampaignProfile;
};

type DispatchRow = Parameters<typeof dispatchDto>[0];

class CheckpointPersistenceError extends Error {
  constructor(readonly cause: unknown) {
    super("ZAAD one-time checkpoint persistence failed.");
    this.name = "CheckpointPersistenceError";
  }
}

type SignedPreflight = {
  version: 2;
  operationKeyDigest: string;
  requestDigest: string;
  recipientDigest: string;
  settingsDigest: string;
  selectedListCount: number;
  selectedResidentCount: number;
  duplicateCount: number;
  recipientCount: number;
  expiresAt: number;
};

export async function preflightZaadOneTime(prisma: PrismaClient, payload: unknown) {
  const parsed = parseZaadOneTimeInput(payload);
  if (!parsed.ok) throw new ZaadOneTimeError(parsed.code, 400);
  const input = parsed.value as ZaadOneTimeInput;
  const snapshot = await resolveSnapshot(prisma, input);
  const expiresAt = Math.floor(Date.now() / 1_000) + PREFLIGHT_TTL_SECONDS;
  const signed: SignedPreflight = {
    version: 2,
    operationKeyDigest: protectedDigest("operation-key", input.operationKey),
    requestDigest: requestDigest(input),
    recipientDigest: recipientDigest(snapshot.recipients),
    settingsDigest: campaignSettingsDigest(snapshot.campaign, snapshot.campaignProfile),
    selectedListCount: snapshot.selectedListCount,
    selectedResidentCount: snapshot.selectedResidentCount,
    duplicateCount: snapshot.duplicateCount,
    recipientCount: snapshot.recipients.length,
    expiresAt,
  };
  return {
    preflightToken: signPreflight(signed),
    expiresAt: new Date(expiresAt * 1_000).toISOString(),
    selectedListCount: signed.selectedListCount,
    selectedResidentCount: signed.selectedResidentCount,
    duplicateCount: signed.duplicateCount,
    recipientCount: signed.recipientCount,
    operationProfile: {
      callerIdMasked: snapshot.campaign.callerIdMasked,
      queueName: snapshot.campaign.queueName,
      maxConcurrentCalls: snapshot.campaign.maxConcurrentCalls ?? snapshot.campaignProfile.maxConcurrentCalls,
      businessHours: snapshot.campaign.businessHours,
      retryPolicy: snapshot.campaign.retryPolicy,
      dncPolicy: snapshot.campaign.dncPolicy,
      alwaysRunning: false,
    },
  };
}

export async function prepareZaadOneTime(prisma: PrismaClient, actorUserId: string, payload: unknown) {
  const parsed = parseZaadOneTimeInput(payload, true);
  if (!parsed.ok) {
    const operationKey = operationKeyForAudit(payload);
    if (operationKey) await auditPrepareRejection(prisma, actorUserId, operationKey, parsed.code);
    throw new ZaadOneTimeError(parsed.code, 400);
  }
  const input = parsed.value as ZaadOneTimePrepareInput;
  const signed = verifyPreflight(input.preflightToken);
  if (
    !signed ||
    signed.operationKeyDigest !== protectedDigest("operation-key", input.operationKey) ||
    signed.requestDigest !== requestDigest(input)
  ) {
    throw await prepareRejectionError(prisma, actorUserId, input.operationKey, ZAAD_ERROR_CODES.oneTimeSnapshotStale);
  }

  const existing = await findDispatchByOperationKey(prisma, input.operationKey);
  if (existing) {
    if (existing.createdByUserId !== actorUserId || !dispatchMatchesInput(existing, input)) {
      throw await prepareRejectionError(prisma, actorUserId, input.operationKey, ZAAD_ERROR_CODES.oneTimeSnapshotStale);
    }
    return dispatchDto(existing);
  }
  if (signed.expiresAt <= Math.floor(Date.now() / 1_000)) {
    throw await prepareRejectionError(prisma, actorUserId, input.operationKey, ZAAD_ERROR_CODES.oneTimeSnapshotExpired);
  }

  let snapshot: ResolvedSnapshot;
  try {
    snapshot = await resolveSnapshot(prisma, input, actorUserId);
  } catch (error) {
    if (error instanceof ZaadOneTimeError && error.code === ZAAD_ERROR_CODES.oneTimeSnapshotStale) {
      await auditPrepareRejection(prisma, actorUserId, input.operationKey, error.code);
    }
    throw error;
  }
  if (
    signed.recipientDigest !== recipientDigest(snapshot.recipients) ||
    signed.settingsDigest !== campaignSettingsDigest(snapshot.campaign, snapshot.campaignProfile) ||
    signed.recipientCount !== snapshot.recipients.length ||
    signed.duplicateCount !== snapshot.duplicateCount
  ) {
    throw await prepareRejectionError(prisma, actorUserId, input.operationKey, ZAAD_ERROR_CODES.oneTimeSnapshotStale);
  }

  let created: DispatchRow;
  try {
    created = await prisma.$transaction(async (transaction) => {
      const dispatch = await transaction.zaadOneTimeDispatch.create({
        data: {
          operationKey: input.operationKey,
          name: input.name,
          body: input.body,
          languageCode: input.languageCode,
          voiceId: input.voiceId,
          state: "PREPARING",
          baseCampaignId: input.baseCampaignId,
          selectedListCount: signed.selectedListCount,
          selectedResidentCount: signed.selectedResidentCount,
          duplicateCount: signed.duplicateCount,
          recipientCount: signed.recipientCount,
          lastCompletedStep: "SNAPSHOT_VERIFIED",
          createdByUserId: actorUserId,
          sourceLists: {
            create: input.contactListIds.map((contactListId, selectedOrder) => ({ contactListId, selectedOrder })),
          },
          residents: {
            create: input.residentSelections.map((resident, selectedOrder) => ({
              residentId: resident.id,
              residentRevision: resident.revision,
              selectedOrder,
            })),
          },
        },
      });
      await writeZaadAudit(transaction, {
        actorUserId,
        resourceKind: "one-time-dispatch",
        targetId: dispatch.id,
        action: "SNAPSHOT_VERIFY",
        result: "SUCCESS",
        changedFieldNames: ["sourceCounts", "recipientCount", "operationProfile", "state"],
      });
      return dispatch;
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const concurrent = await findDispatchByOperationKey(prisma, input.operationKey);
    if (!concurrent || concurrent.createdByUserId !== actorUserId || !dispatchMatchesInput(concurrent, input)) {
      throw await prepareRejectionError(prisma, actorUserId, input.operationKey, ZAAD_ERROR_CODES.oneTimeSnapshotStale);
    }
    return dispatchDto(concurrent);
  }

  try {
    const client = await ZaadZoomClient.fromDatabase(prisma);
    client.assertOneTimePreparationWritesEnabled();
    const resourceNames = oneTimeResourceNames(created.id, created.createdAt);

    const contactList = await client.createContactList({
      name: resourceNames.contactList,
      description: resourceNames.description,
    });
    created = await persistCheckpoint(prisma, created.id, {
      lastCompletedStep: "CONTACT_LIST_CREATED",
      zoomContactListId: contactList.id,
    });

    for (let offset = 0, batchNumber = 1; offset < snapshot.recipients.length; offset += 100, batchNumber += 1) {
      const batch = snapshot.recipients.slice(offset, offset + 100);
      const results = await client.createContactsBatch(
        contactList.id,
        batch.map((recipient) => ({
          name: recipient.displayName,
          phone: recipient.phone,
          email: "",
        })),
      );
      if (results.length !== batch.length) {
        throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomResultUnknown, 502, true);
      }
      if (results.some((result) => !result.success)) {
        throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomContactRejected, 409);
      }
      created = await persistCheckpoint(prisma, created.id, {
        lastCompletedStep: `CONTACTS_BATCH_${batchNumber}_CREATED`,
      });
    }

    const asset = await client.createTtsAsset({
      name: resourceNames.asset,
      body: input.body,
      languageCode: input.languageCode,
      voiceId: input.voiceId,
    });
    created = await persistCheckpoint(prisma, created.id, {
      lastCompletedStep: "TTS_ASSET_CREATED",
      zoomAssetId: asset.assetId,
      zoomAssetItemId: asset.assetItemId,
    });

    const campaignId = await client.createDraftOneTimeCampaign({
      name: resourceNames.campaign,
      profile: snapshot.campaignProfile,
      contactListId: contactList.id,
    });
    created = await persistCheckpoint(prisma, created.id, {
      lastCompletedStep: "DRAFT_CAMPAIGN_CREATED",
      zoomCampaignId: campaignId,
    });

    const draftReadback = await getCampaignReadbackOrUnknown(client, campaignId);
    if (
      draftReadback.id !== campaignId ||
      draftReadback.dialingMethod.toLowerCase() !== "agentless" ||
      draftReadback.status.toLowerCase() !== "draft" ||
      draftReadback.contactListId !== contactList.id ||
      draftReadback.queueId !== snapshot.campaignProfile.queueId ||
      draftReadback.newFlowId !== snapshot.campaignProfile.newFlowId ||
      !draftReadback.phoneNumberId ||
      draftReadback.alwaysRunning
    ) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    }
    created = await persistCheckpoint(prisma, created.id, {
      lastCompletedStep: "DRAFT_READBACK_VERIFIED",
    });
    const canonicalPhoneNumberId = draftReadback.phoneNumberId;

    await client.configureDraftOneTimeCampaign(campaignId, {
      profile: snapshot.campaignProfile,
      assetId: asset.assetId,
    });
    created = await persistCheckpoint(prisma, created.id, {
      lastCompletedStep: "CAMPAIGN_CONFIGURED",
    });

    const configuredReadback = await getCampaignReadbackOrUnknown(client, campaignId);
    if (
      configuredReadback.id !== campaignId ||
      configuredReadback.dialingMethod.toLowerCase() !== "agentless" ||
      configuredReadback.status.toLowerCase() !== "draft" ||
      configuredReadback.contactListId !== contactList.id ||
      configuredReadback.agentlessAmdOffAction?.toLowerCase() !== "play_media" ||
      configuredReadback.assetId !== asset.assetId ||
      configuredReadback.queueId !== snapshot.campaignProfile.queueId ||
      configuredReadback.newFlowId !== snapshot.campaignProfile.newFlowId ||
      configuredReadback.phoneNumberId !== canonicalPhoneNumberId ||
      configuredReadback.alwaysRunning
    ) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    }
    created = await persistCheckpoint(prisma, created.id, {
      lastCompletedStep: "CONFIGURATION_READBACK_VERIFIED",
    });

    await client.setCampaignStatus(campaignId, "Ready");
    created = await persistCheckpoint(prisma, created.id, {
      lastCompletedStep: "CAMPAIGN_READY_SET",
    });

    const readback = await getCampaignReadbackOrUnknown(client, campaignId);
    if (
      readback.id !== campaignId ||
      readback.dialingMethod.toLowerCase() !== "agentless" ||
      readback.status.toLowerCase() !== "ready" ||
      readback.contactListId !== contactList.id ||
      readback.agentlessAmdOffAction?.toLowerCase() !== "play_media" ||
      readback.assetId !== asset.assetId ||
      readback.queueId !== snapshot.campaignProfile.queueId ||
      readback.newFlowId !== snapshot.campaignProfile.newFlowId ||
      readback.phoneNumberId !== canonicalPhoneNumberId ||
      readback.alwaysRunning
    ) {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInvalidResponse, 502);
    }

    let ready: DispatchRow;
    try {
      ready = await prisma.$transaction(async (transaction) => {
        const row = await transaction.zaadOneTimeDispatch.update({
          where: { id: created.id },
          data: {
            state: "READY",
            lastCompletedStep: "READBACK_VERIFIED",
            stableErrorCode: null,
            revision: { increment: 1 },
          },
        });
        await writeZaadAudit(transaction, {
          actorUserId,
          resourceKind: "one-time-dispatch",
          targetId: created.id,
          action: "PREPARE",
          result: "SUCCESS",
          changedFieldNames: ["state", "lastCompletedStep", "knownResources"],
        });
        return row;
      });
    } catch (error) {
      throw new CheckpointPersistenceError(error);
    }
    return dispatchDto(ready);
  } catch (error) {
    const unknown = error instanceof CheckpointPersistenceError || error instanceof ZaadZoomError && error.resultUnknown;
    const code = error instanceof ZaadZoomError ? error.code : ZAAD_ERROR_CODES.zoomUnavailable;
    const state = unknown ? "RESULT_UNKNOWN" as const : "FAILED" as const;
    const failed = await prisma.$transaction(async (transaction) => {
      const row = await transaction.zaadOneTimeDispatch.update({
        where: { id: created.id },
        data: {
          state,
          stableErrorCode: unknown ? ZAAD_ERROR_CODES.oneTimeResultUnknown : code,
          revision: { increment: 1 },
        },
      });
      await writeZaadAudit(transaction, {
        actorUserId,
        resourceKind: "one-time-dispatch",
        targetId: created.id,
        action: "PREPARE",
        result: unknown ? "RESULT_UNKNOWN" : "FAILED",
        changedFieldNames: ["state", "lastCompletedStep"],
        stableErrorCode: unknown ? ZAAD_ERROR_CODES.oneTimeResultUnknown : code,
      });
      return row;
    });
    throw new ZaadOneTimeError(
      unknown ? ZAAD_ERROR_CODES.oneTimeResultUnknown : code,
      unknown ? 502 : error instanceof ZaadZoomError ? error.httpStatus : 502,
      dispatchDto(failed),
    );
  }
}

export async function listZaadOneTimeDispatches(prisma: PrismaClient) {
  const dispatches = await prisma.zaadOneTimeDispatch.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return { dispatches: dispatches.map(dispatchDto) };
}

export async function getZaadOneTimeDispatch(prisma: PrismaClient, id: string) {
  const dispatch = await prisma.zaadOneTimeDispatch.findUnique({ where: { id } });
  if (!dispatch) throw new ZaadOneTimeError(ZAAD_ERROR_CODES.zoomNotFound, 404);
  return dispatchDto(dispatch);
}

async function resolveSnapshot(
  prisma: PrismaClient,
  input: ZaadOneTimeInput,
  actorUserId: string | null = null,
): Promise<ResolvedSnapshot> {
  let client: ZaadZoomClient;
  try {
    client = await ZaadZoomClient.fromDatabase(prisma);
  } catch (error) {
    throw mapOneTimeError(error);
  }
  let campaign: ZoomCampaignDto;
  let campaignProfile: ZoomOneTimeCampaignProfile;
  try {
    const preparation = await client.getCampaignPreparationProfile(input.baseCampaignId);
    campaign = preparation.campaign;
    campaignProfile = preparation.profile;
  } catch (error) {
    throw mapOneTimeError(error);
  }
  const allowedStatus = new Set(["draft", "ready", "paused", "completed", "not_running"]);
  if (campaign.dialingMethod !== "agentless" || !allowedStatus.has(campaign.status) || campaign.alwaysRunning) {
    throw new ZaadOneTimeError(ZAAD_ERROR_CODES.campaignNotAgentless, 409);
  }
  const ordered: RecipientSnapshot[] = [];
  for (const contactListId of input.contactListIds) {
    try {
      const contactList = await client.getContactList(contactListId);
      if (contactList.type !== "contact") {
        throw new ZaadOneTimeError(ZAAD_ERROR_CODES.oneTimeRecipientsInvalid, 409);
      }
    } catch (error) {
      const mapped = mapOneTimeError(error);
      await writeZaadAudit(prisma, {
        actorUserId,
        resourceKind: "contact-list",
        targetId: contactListId,
        action: "ONE_TIME_SOURCE_VALIDATE",
        result: "REJECTED",
        stableErrorCode: mapped.code,
      });
      throw mapped;
    }
  }
  for (const contactListId of input.contactListIds) {
    let contacts;
    try {
      contacts = await client.listContacts(contactListId);
    } catch (error) {
      throw mapOneTimeError(error);
    }
    for (const contact of contacts) {
      const phone = pickPhone(contact.phones);
      if (phone) ordered.push({ phone, displayName: contact.displayName, source: "contact-list" });
    }
  }

  const residents = await prisma.disasterRadioSubscription.findMany({
    where: { id: { in: input.residentSelections.map(({ id }) => id) } },
  });
  const byId = new Map(residents.map((resident) => [resident.id, resident]));
  for (const selection of input.residentSelections) {
    const resident = byId.get(selection.id);
    if (!resident || resident.revision !== selection.revision || resident.consentStatus !== "CONSENTED") {
      throw new ZaadOneTimeError(ZAAD_ERROR_CODES.oneTimeSnapshotStale, 409);
    }
    const phone = normalizeE164(resident.normalizedPhone);
    if (!phone) throw new ZaadOneTimeError(ZAAD_ERROR_CODES.oneTimeRecipientsInvalid, 409);
    ordered.push({ phone, displayName: resident.name, source: "resident" });
  }

  const deduped = new Map<string, RecipientSnapshot>();
  for (const recipient of ordered) {
    if (!deduped.has(recipient.phone) || recipient.source === "resident") {
      deduped.set(recipient.phone, recipient);
    }
  }
  const recipients = [...deduped.values()];
  if (recipients.length < 1 || recipients.length > ZAAD_LIMITS.recipients) {
    throw new ZaadOneTimeError(ZAAD_ERROR_CODES.oneTimeRecipientsInvalid, 400);
  }
  return {
    recipients,
    selectedListCount: input.contactListIds.length,
    selectedResidentCount: input.residentSelections.length,
    duplicateCount: ordered.length - recipients.length,
    campaign,
    campaignProfile,
  };
}

function requestDigest(input: ZaadOneTimeInput) {
  return protectedDigest("request", {
    operationKey: input.operationKey,
    name: input.name,
    body: input.body,
    languageCode: input.languageCode,
    voiceId: input.voiceId,
    baseCampaignId: input.baseCampaignId,
    contactListIds: input.contactListIds,
    residentSelections: input.residentSelections,
  });
}

function recipientDigest(recipients: RecipientSnapshot[]) {
  return protectedDigest("recipients", recipients.map(({ phone, displayName }) => ({ phone, displayName })));
}

async function findDispatchByOperationKey(prisma: PrismaClient, operationKey: string) {
  return prisma.zaadOneTimeDispatch.findUnique({
    where: { operationKey },
    include: {
      sourceLists: { orderBy: { selectedOrder: "asc" } },
      residents: { orderBy: { selectedOrder: "asc" } },
    },
  });
}

function dispatchMatchesInput(
  dispatch: NonNullable<Awaited<ReturnType<typeof findDispatchByOperationKey>>>,
  input: ZaadOneTimePrepareInput,
) {
  return dispatch.name === input.name &&
    dispatch.body === input.body &&
    dispatch.languageCode === input.languageCode &&
    dispatch.voiceId === input.voiceId &&
    dispatch.baseCampaignId === input.baseCampaignId &&
    dispatch.sourceLists.length === input.contactListIds.length &&
    dispatch.sourceLists.every((source, index) => source.contactListId === input.contactListIds[index]) &&
    dispatch.residents.length === input.residentSelections.length &&
    dispatch.residents.every((resident, index) => {
      const selection = input.residentSelections[index];
      return resident.residentId === selection?.id && resident.residentRevision === selection.revision;
    });
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function campaignSettingsDigest(campaign: ZoomCampaignDto, profile: ZoomOneTimeCampaignProfile) {
  return protectedDigest("campaign-settings", {
    id: campaign.id,
    dialingMethod: campaign.dialingMethod,
    status: campaign.status,
    queueName: campaign.queueName,
    callerIdMasked: campaign.callerIdMasked,
    maxConcurrentCalls: campaign.maxConcurrentCalls,
    businessHours: campaign.businessHours,
    retryPolicy: campaign.retryPolicy,
    dncPolicy: campaign.dncPolicy,
    alwaysRunning: campaign.alwaysRunning,
    revision: campaign.revision,
    profile,
  });
}

async function persistCheckpoint(
  prisma: PrismaClient,
  dispatchId: string,
  data: {
    lastCompletedStep: string;
    zoomContactListId?: string;
    zoomAssetId?: string;
    zoomAssetItemId?: string;
    zoomCampaignId?: string;
  },
): Promise<DispatchRow> {
  try {
    return await prisma.zaadOneTimeDispatch.update({
      where: { id: dispatchId },
      data: {
        ...data,
        revision: { increment: 1 },
      },
    });
  } catch (error) {
    throw new CheckpointPersistenceError(error);
  }
}

async function getCampaignReadbackOrUnknown(client: ZaadZoomClient, campaignId: string) {
  try {
    return await client.getOneTimeCampaignReadback(campaignId);
  } catch (error) {
    throw new ZaadZoomError(
      ZAAD_ERROR_CODES.oneTimeResultUnknown,
      error instanceof ZaadZoomError ? error.httpStatus : 502,
      true,
    );
  }
}

function oneTimeResourceNames(dispatchId: string, createdAt: Date) {
  const shortId = dispatchId.replace(/[^A-Za-z0-9]/gu, "").slice(-12).toUpperCase() || "DISPATCH";
  const timestamp = createdAt.toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14);
  const base = `ZAAD-${timestamp}-${shortId}`;
  return {
    contactList: `${base}-CONTACTS`,
    asset: `${base}-MESSAGE`,
    campaign: `${base}-CAMPAIGN`,
    description: `ZAAD one-time dispatch ${timestamp}-${shortId}`,
  };
}

function protectedDigest(domain: "operation-key" | "request" | "recipients" | "campaign-settings", value: unknown) {
  const digestKey = createHmac("sha256", preflightKey())
    .update(`zaad-preflight-digest-key:v2:${domain}`)
    .digest();
  return createHmac("sha256", digestKey)
    .update(`zaad-preflight-digest-value:v2:${domain}:`)
    .update(JSON.stringify(value))
    .digest("base64url");
}

function signPreflight(payload: SignedPreflight) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = preflightSignature(encoded);
  return `v2.${encoded}.${signature}`;
}

function verifyPreflight(token: string): SignedPreflight | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v2") return null;
  const expected = Buffer.from(preflightSignature(parts[1]), "base64url");
  let supplied: Buffer;
  try {
    supplied = Buffer.from(parts[2], "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as SignedPreflight;
    return value.version === 2 && Number.isSafeInteger(value.expiresAt) ? value : null;
  } catch {
    return null;
  }
}

function preflightSignature(encoded: string) {
  return createHmac("sha256", preflightKey())
    .update("zaad-preflight-token-signature:v2:")
    .update(encoded)
    .digest("base64url");
}

function preflightKey() {
  const configured = process.env.ZAAD_PREFLIGHT_HMAC_KEY?.trim();
  if (configured) return configured;
  const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (authSecret) {
    return createHmac("sha256", authSecret)
      .update("zaad-preflight-key:v1")
      .digest();
  }
  if (process.env.NODE_ENV === "production") throw new ZaadOneTimeError(ZAAD_ERROR_CODES.zoomNotConfigured, 503);
  return "zaad-development-preflight-key-do-not-use-in-production";
}

async function prepareRejectionError(
  prisma: PrismaClient,
  actorUserId: string,
  operationKey: string,
  code: typeof ZAAD_ERROR_CODES.oneTimeSnapshotStale | typeof ZAAD_ERROR_CODES.oneTimeSnapshotExpired,
): Promise<ZaadOneTimeError> {
  await auditPrepareRejection(prisma, actorUserId, operationKey, code);
  return new ZaadOneTimeError(code, 409);
}

async function auditPrepareRejection(
  prisma: PrismaClient,
  actorUserId: string,
  operationKey: string,
  code: string,
) {
  await writeZaadAudit(prisma, {
    actorUserId,
    resourceKind: "one-time-dispatch",
    targetId: operationKey,
    action: "PREPARE",
    result: "REJECTED",
    stableErrorCode: code,
  });
}

function operationKeyForAudit(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("operationKey" in payload)) return null;
  const value = payload.operationKey;
  if (typeof value !== "string") return null;
  const normalized = value.trim().normalize("NFKC");
  return normalized && [...normalized].length <= ZAAD_LIMITS.operationKey && !/[\u0000-\u001F\u007F]/u.test(normalized)
    ? normalized
    : null;
}

function pickPhone(phones: Array<{ type: string; number: string }>) {
  const priorities = ["main", "home", "office", "mobile", "other"];
  for (const priority of priorities) {
    for (const phone of phones) {
      if (phone.type.toLowerCase() === priority) {
        const normalized = normalizeE164(phone.number);
        if (normalized) return normalized;
      }
    }
  }
  for (const phone of phones) {
    const normalized = normalizeE164(phone.number);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeE164(value: string) {
  const japan = normalizeJapanPhone(value);
  if (japan) return japan;
  const normalized = value.trim().normalize("NFKC").replace(/[\s().-]/gu, "");
  return /^\+[1-9]\d{7,14}$/u.test(normalized) ? normalized : null;
}

function dispatchDto(row: {
  id: string;
  operationKey: string;
  name: string;
  body: string;
  languageCode: string;
  voiceId: string;
  state: string;
  baseCampaignId: string;
  selectedListCount: number;
  selectedResidentCount: number;
  duplicateCount: number;
  recipientCount: number;
  lastCompletedStep: string | null;
  zoomContactListId: string | null;
  zoomAssetId: string | null;
  zoomCampaignId: string | null;
  stableErrorCode: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    operationKey: row.operationKey,
    name: row.name,
    body: row.body,
    languageCode: row.languageCode,
    voiceId: row.voiceId,
    state: row.state,
    baseCampaignId: row.baseCampaignId,
    selectedListCount: row.selectedListCount,
    selectedResidentCount: row.selectedResidentCount,
    duplicateCount: row.duplicateCount,
    recipientCount: row.recipientCount,
    lastCompletedStep: row.lastCompletedStep,
    knownResources: {
      contactListId: row.zoomContactListId,
      assetId: row.zoomAssetId,
      campaignId: row.zoomCampaignId,
    },
    stableErrorCode: row.stableErrorCode,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapOneTimeError(error: unknown) {
  if (error instanceof ZaadOneTimeError) return error;
  if (error instanceof ZaadZoomError) return new ZaadOneTimeError(error.code, error.httpStatus);
  return new ZaadOneTimeError(ZAAD_ERROR_CODES.zoomUnavailable, 502);
}
