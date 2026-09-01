import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  DISASTER_RADIO_CONSENT_VERSIONS,
  parseDisasterRadioResident,
  parsePublicDisasterRadioRegistration,
  type ParsedDisasterRadioResident,
} from "@/lib/disaster-radio-subscriptions/validation";
import { parseZaadResidentCsv } from "@/lib/zaad/csv-import";
import { parseOpaqueId, ZAAD_ERROR_CODES } from "@/lib/zaad/contracts";

import { writeZaadAudit } from "./audit";
import {
  ZaadZoomClient,
  ZaadZoomError,
  type ZoomBatchContactResult,
  type ZoomContactDto,
} from "./zoom-client";

const PAGE_SIZE = 25;
const ZOOM_CONTACT_BATCH_MAX_ITEMS = 100;
const RETRYABLE_RESIDENT_SYNC_ERROR_CODES = new Set<string>([
  ZAAD_ERROR_CODES.zoomNotConfigured,
  ZAAD_ERROR_CODES.zoomCredentialsInvalid,
  ZAAD_ERROR_CODES.zoomContractUnconfirmed,
  ZAAD_ERROR_CODES.zoomScopeRequired,
  ZAAD_ERROR_CODES.zoomRateLimited,
  ZAAD_ERROR_CODES.zoomUnavailable,
  ZAAD_ERROR_CODES.zoomInvalidResponse,
  ZAAD_ERROR_CODES.zoomNotFound,
  ZAAD_ERROR_CODES.zoomContactRejected,
]);

type ResidentSyncSnapshot = {
  id: string;
  name: string;
  normalizedEmail: string;
  normalizedPhone: string;
  consentStatus: string;
  revision: number;
  zoomContactListId: string | null;
  zoomContactId: string | null;
};

type ResidentSyncOutcome =
  | { success: true; contactId?: string }
  | { success: false; code: string; resultUnknown: boolean; clearContactId?: boolean };

type ResidentSyncFailure = Extract<ResidentSyncOutcome, { success: false }>;

type ResidentSyncAuditContext = {
  actorUserId: string | null;
  action: "SYNC_CREATE" | "SYNC_UPDATE" | "SYNC_RETRY" | "SYNC_BATCH_CREATE" | "UPDATE" | "DELETE";
};

export class ZaadResidentError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "ZaadResidentError";
  }
}

export async function registerPublicDisasterRadioResident(prisma: PrismaClient, payload: unknown) {
  const parsed = parsePublicDisasterRadioRegistration(payload);
  if (!parsed.ok) throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400, parsed.errors);
  const created = await createResidentLocal(prisma, parsed.value, "PUBLIC_FORM", null);
  if (created) {
    await syncResidentBestEffort(prisma, created.id, {
      actorUserId: null,
      action: "SYNC_CREATE",
    });
  }
  return { status: "accepted" as const };
}

export async function listZaadResidents(
  prisma: PrismaClient,
  input: { query?: string; cursor?: string },
) {
  const query = (input.query ?? "").trim().normalize("NFKC").slice(0, 100);
  const rawCursor = input.cursor?.trim();
  const cursor = rawCursor ? parseOpaqueId(rawCursor) : undefined;
  if (rawCursor && !cursor) throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400);
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { normalizedEmail: { contains: query, mode: "insensitive" as const } },
          { normalizedPhone: { contains: query } },
        ],
      }
    : undefined;
  const [rows, total, consented, synced, failed] = await Promise.all([
    prisma.disasterRadioSubscription.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.disasterRadioSubscription.count({ where }),
    prisma.disasterRadioSubscription.count({ where: { ...where, consentStatus: "CONSENTED" } }),
    prisma.disasterRadioSubscription.count({ where: { ...where, syncStatus: "SYNCED" } }),
    prisma.disasterRadioSubscription.count({ where: { ...where, syncStatus: "FAILED" } }),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return {
    residents: page.map(toResidentDto),
    metrics: { total, consented, synced, needsAttention: failed },
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}

export async function createZaadResident(prisma: PrismaClient, actorUserId: string, payload: unknown) {
  if (!isRecord(payload) || Object.keys(payload).sort().join(",") !== "consentStatus,email,name,phone") {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400);
  }
  const parsed = parseDisasterRadioResident(payload);
  if (!parsed.ok) throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400, parsed.errors);
  const created = await createResidentLocal(prisma, parsed.value, "ADMIN_FORM", actorUserId);
  if (!created) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
  await syncResidentBestEffort(prisma, created.id, {
    actorUserId,
    action: "SYNC_CREATE",
  });
  const resident = await prisma.disasterRadioSubscription.findUniqueOrThrow({ where: { id: created.id } });
  return toResidentDto(resident);
}

export async function importZaadResidents(prisma: PrismaClient, actorUserId: string, bytes: Uint8Array) {
  const parsed = parseZaadResidentCsv(bytes);
  if (!parsed.ok) throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidCsv, 400, parsed.errors);
  const now = new Date();
  const result = await prisma.$transaction(async (transaction) => {
    const setting = await getRegistrationSetting(transaction);
    const candidates = parsed.rows.map((row) => ({
      id: randomUUID(),
      ...residentCreateData(row, "ADMIN_CSV" as const, actorUserId, setting, now),
    }));
    const inserted = await transaction.disasterRadioSubscription.createMany({
      data: candidates,
      skipDuplicates: true,
    });
    await writeZaadAudit(transaction, {
      actorUserId,
      resourceKind: "resident",
      targetId: `csv:${randomUUID()}`,
      action: "CSV_CREATE",
      result: "SUCCESS",
      changedFieldNames: ["rowCount", "createdCount", "duplicateCount"],
    });
    return { insertedCount: inserted.count, candidateIds: candidates.map(({ id }) => id) };
  });
  const createdRows = await prisma.disasterRadioSubscription.findMany({
    where: { id: { in: result.candidateIds } },
    select: {
      id: true,
      name: true,
      normalizedEmail: true,
      normalizedPhone: true,
      consentStatus: true,
      revision: true,
      zoomContactListId: true,
      zoomContactId: true,
    },
  });
  await syncImportedResidentsBestEffort(prisma, actorUserId, createdRows);
  return {
    totalRows: parsed.totalRows,
    createdCount: result.insertedCount,
    duplicateCount: parsed.duplicateRows + (parsed.rows.length - result.insertedCount),
  };
}

export async function updateZaadResident(
  prisma: PrismaClient,
  actorUserId: string,
  id: string,
  payload: unknown,
) {
  if (!isRecord(payload) || !Number.isSafeInteger(payload.revision) || (payload.revision as number) <= 0) {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400);
  }
  const parsed = parseDisasterRadioResident({
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    consentStatus: payload.consentStatus,
  });
  if (!parsed.ok || Object.keys(payload).sort().join(",") !== "consentStatus,email,name,phone,revision") {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400, parsed.ok ? undefined : parsed.errors);
  }
  const current = await prisma.disasterRadioSubscription.findUnique({ where: { id } });
  if (!current) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentNotFound, 404);
  if (current.revision !== payload.revision) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);

  const withdrawingConsent = current.consentStatus === "CONSENTED" && parsed.value.consentStatus === "NOT_CONSENTED";
  const claimedRevision = withdrawingConsent
    ? await claimRemoteResidentDeletion(prisma, actorUserId, current, "UPDATE")
    : current.revision;
  if (withdrawingConsent && claimedRevision !== current.revision) {
    await deleteRemoteResidentContact(prisma, actorUserId, { ...current, revision: claimedRevision }, "UPDATE");
  }

  const becomingConsented = current.consentStatus === "NOT_CONSENTED" && parsed.value.consentStatus === "CONSENTED";
  const now = new Date();
  let updated;
  try {
    updated = await prisma.$transaction(async (transaction) => {
      const setting = becomingConsented ? await getRegistrationSetting(transaction) : null;
      const result = await transaction.disasterRadioSubscription.updateMany({
        where: { id, revision: claimedRevision },
        data: {
          name: parsed.value.name,
          normalizedEmail: parsed.value.normalizedEmail,
          normalizedPhone: parsed.value.normalizedPhone,
          consentStatus: parsed.value.consentStatus,
          consentVersion: parsed.value.consentStatus === "CONSENTED"
            ? becomingConsented ? DISASTER_RADIO_CONSENT_VERSIONS.adminRecorded : current.consentVersion
            : null,
          consentedAt: parsed.value.consentStatus === "CONSENTED"
            ? becomingConsented ? now : current.consentedAt
            : null,
          ...(parsed.value.consentStatus === "NOT_CONSENTED"
            ? {
                zoomContactListId: null,
                zoomContactListNameSnapshot: null,
                zoomContactId: null,
                syncStatus: "NOT_ELIGIBLE" as const,
                syncErrorCode: null,
                syncedAt: null,
              }
            : becomingConsented
              ? syncSnapshot(setting)
              : {
                  syncStatus: current.zoomContactListId ? "PENDING" as const : "NOT_ASSIGNED" as const,
                  syncErrorCode: null,
                  syncedAt: null,
                }),
          revision: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
      await writeZaadAudit(transaction, {
        actorUserId,
        resourceKind: "resident",
        targetId: id,
        action: "UPDATE",
        result: "SUCCESS",
        changedFieldNames: ["name", "email", "phone", "consentStatus"],
        fromConsentStatus: current.consentStatus,
        toConsentStatus: parsed.value.consentStatus,
      });
      return transaction.disasterRadioSubscription.findUniqueOrThrow({ where: { id } });
    });
  } catch (error) {
    const mapped = isUniqueConflict(error)
      ? new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409)
      : error;
    if (withdrawingConsent && claimedRevision !== current.revision) {
      await recordResidentSyncOutcome(
        prisma,
        { ...current, revision: claimedRevision },
        {
          success: false,
          code: ZAAD_ERROR_CODES.residentConflict,
          resultUnknown: false,
          clearContactId: true,
        },
        { actorUserId, action: "UPDATE" },
      );
    }
    if (isUniqueConflict(error)) throw mapped;
    throw error;
  }
  if (updated.consentStatus === "CONSENTED") {
    await syncResidentBestEffort(prisma, id, {
      actorUserId,
      action: "SYNC_UPDATE",
    });
  }
  return toResidentDto(await prisma.disasterRadioSubscription.findUniqueOrThrow({ where: { id } }));
}

export async function deleteZaadResident(prisma: PrismaClient, actorUserId: string, id: string, revision: number) {
  const current = await prisma.disasterRadioSubscription.findUnique({ where: { id } });
  if (!current) {
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "resident",
      targetId: id,
      action: "DELETE",
      result: "SUCCESS",
      changedFieldNames: [],
      fromConsentStatus: null,
      toConsentStatus: null,
    });
    return { deleted: true as const };
  }
  if (current.revision !== revision) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
  const claimedRevision = await claimRemoteResidentDeletion(prisma, actorUserId, current, "DELETE");
  if (claimedRevision !== current.revision) {
    await deleteRemoteResidentContact(prisma, actorUserId, { ...current, revision: claimedRevision }, "DELETE");
  }
  try {
    await prisma.$transaction(async (transaction) => {
      const deleted = await transaction.disasterRadioSubscription.deleteMany({ where: { id, revision: claimedRevision } });
      if (deleted.count !== 1) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
      await writeZaadAudit(transaction, {
        actorUserId,
        resourceKind: "resident",
        targetId: id,
        action: "DELETE",
        result: "SUCCESS",
        changedFieldNames: ["record"],
        fromConsentStatus: current.consentStatus,
        toConsentStatus: null,
      });
    });
  } catch (error) {
    if (claimedRevision !== current.revision) {
      await recordResidentSyncOutcome(
        prisma,
        { ...current, revision: claimedRevision },
        {
          success: false,
          code: ZAAD_ERROR_CODES.residentConflict,
          resultUnknown: false,
          clearContactId: true,
        },
        { actorUserId, action: "DELETE" },
      );
    }
    throw error;
  }
  return { deleted: true as const };
}

export async function retryZaadResidentSync(prisma: PrismaClient, actorUserId: string, id: string, revision: number) {
  const resident = await prisma.disasterRadioSubscription.findUnique({ where: { id } });
  if (!resident) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentNotFound, 404);
  if (resident.revision !== revision) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
  if (resident.consentStatus !== "CONSENTED" || !resident.zoomContactListId) {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400);
  }
  if (resident.syncErrorCode === ZAAD_ERROR_CODES.zoomResultUnknown) {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.zoomResultUnknown, 409);
  }
  if (resident.syncErrorCode === ZAAD_ERROR_CODES.residentConflict) {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
  }
  if (resident.syncStatus !== "FAILED") {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
  }
  if (!resident.syncErrorCode || !RETRYABLE_RESIDENT_SYNC_ERROR_CODES.has(resident.syncErrorCode)) {
    throw new ZaadResidentError(ZAAD_ERROR_CODES.invalidRequest, 400);
  }
  const pending = await prisma.disasterRadioSubscription.updateMany({
    where: {
      id,
      revision,
      consentStatus: "CONSENTED",
      syncStatus: "FAILED",
      syncErrorCode: resident.syncErrorCode,
    },
    data: {
      syncStatus: "PENDING",
      syncErrorCode: null,
      revision: { increment: 1 },
    },
  });
  if (pending.count !== 1) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
  await syncResidentBestEffort(prisma, id, {
    actorUserId,
    action: "SYNC_RETRY",
  });
  return toResidentDto(await prisma.disasterRadioSubscription.findUniqueOrThrow({ where: { id } }));
}

async function createResidentLocal(
  prisma: PrismaClient,
  resident: ParsedDisasterRadioResident,
  source: "PUBLIC_FORM" | "ADMIN_FORM",
  actorUserId: string | null,
) {
  const id = randomUUID();
  try {
    return await prisma.$transaction(async (transaction) => {
      const setting = await getRegistrationSetting(transaction);
      const row = await transaction.disasterRadioSubscription.create({
        data: { id, ...residentCreateData(resident, source, actorUserId, setting, new Date()) },
        select: { id: true },
      });
      await writeZaadAudit(transaction, {
        actorUserId,
        resourceKind: "resident",
        targetId: id,
        action: "CREATE",
        result: "SUCCESS",
        changedFieldNames: ["name", "email", "phone", "consentStatus", "source", "registrationSetting"],
        fromConsentStatus: null,
        toConsentStatus: resident.consentStatus,
      });
      return row;
    });
  } catch (error) {
    if (isUniqueConflict(error)) return null;
    throw error;
  }
}

function residentCreateData(
  resident: ParsedDisasterRadioResident,
  source: "PUBLIC_FORM" | "ADMIN_FORM" | "ADMIN_CSV",
  actorUserId: string | null,
  setting: { contactListId: string | null; contactListNameSnapshot: string | null },
  now: Date,
) {
  return {
    name: resident.name,
    normalizedEmail: resident.normalizedEmail,
    normalizedPhone: resident.normalizedPhone,
    consentStatus: resident.consentStatus,
    consentVersion: resident.consentStatus === "CONSENTED"
      ? source === "PUBLIC_FORM" ? DISASTER_RADIO_CONSENT_VERSIONS.publicForm : DISASTER_RADIO_CONSENT_VERSIONS.adminRecorded
      : null,
    consentedAt: resident.consentStatus === "CONSENTED" ? now : null,
    source,
    registeredByUserId: actorUserId,
    ...(resident.consentStatus === "CONSENTED" ? syncSnapshot(setting) : syncSnapshot(null)),
  };
}

function syncSnapshot(setting: { contactListId: string | null; contactListNameSnapshot: string | null } | null) {
  if (!setting?.contactListId) {
    return {
      zoomContactListId: null,
      zoomContactListNameSnapshot: null,
      syncStatus: setting === null ? "NOT_ELIGIBLE" as const : "NOT_ASSIGNED" as const,
      syncErrorCode: null,
      syncedAt: null,
    };
  }
  return {
    zoomContactListId: setting.contactListId,
    zoomContactListNameSnapshot: setting.contactListNameSnapshot,
    syncStatus: "PENDING" as const,
    syncErrorCode: null,
    syncedAt: null,
  };
}

async function getRegistrationSetting(prisma: Pick<PrismaClient, "zaadRegistrationSetting">) {
  return prisma.zaadRegistrationSetting.findUniqueOrThrow({
    where: { id: 1 },
    select: { contactListId: true, contactListNameSnapshot: true },
  });
}

async function syncResidentBestEffort(
  prisma: PrismaClient,
  id: string,
  audit: ResidentSyncAuditContext,
) {
  const resident = await prisma.disasterRadioSubscription.findUnique({ where: { id } });
  if (!resident || resident.consentStatus !== "CONSENTED" || !resident.zoomContactListId) {
    return { success: true as const };
  }
  try {
    const client = await ZaadZoomClient.fromDatabase(prisma);
    const contactId = resident.zoomContactId;
    if (contactId) {
      await client.updateContact(resident.zoomContactListId, contactId, {
        name: resident.name,
        phone: resident.normalizedPhone,
        email: resident.normalizedEmail,
      });
    } else {
      const createdId = await client.createContact(resident.zoomContactListId, {
        name: resident.name,
        phone: resident.normalizedPhone,
        email: resident.normalizedEmail,
      });
      const linked = await prisma.disasterRadioSubscription.updateMany({
        where: {
          id,
          revision: resident.revision,
          consentStatus: "CONSENTED",
          zoomContactListId: resident.zoomContactListId,
          zoomContactId: null,
        },
        data: { zoomContactId: createdId },
      });
      if (linked.count !== 1) {
        let cleanupConfirmed = false;
        try {
          await client.deleteContact(resident.zoomContactListId, createdId);
          cleanupConfirmed = true;
        } catch (error) {
          cleanupConfirmed = error instanceof ZaadZoomError && error.code === ZAAD_ERROR_CODES.zoomNotFound;
        }
        return recordResidentSyncOutcome(
          prisma,
          resident,
          cleanupConfirmed
            ? { success: false, code: ZAAD_ERROR_CODES.residentConflict, resultUnknown: false }
            : { success: false, code: ZAAD_ERROR_CODES.zoomResultUnknown, resultUnknown: true },
          audit,
        );
      }
    }
    return recordResidentSyncOutcome(prisma, resident, { success: true }, audit);
  } catch (error) {
    return recordResidentSyncOutcome(prisma, resident, zoomFailureOutcome(error), audit);
  }
}

async function syncImportedResidentsBestEffort(
  prisma: PrismaClient,
  actorUserId: string,
  rows: ResidentSyncSnapshot[],
) {
  const groups = new Map<string, ResidentSyncSnapshot[]>();
  for (const row of rows) {
    if (row.consentStatus !== "CONSENTED" || !row.zoomContactListId || row.zoomContactId) continue;
    const group = groups.get(row.zoomContactListId) ?? [];
    group.push(row);
    groups.set(row.zoomContactListId, group);
  }
  if (groups.size === 0) return;

  let client: ZaadZoomClient;
  try {
    client = await ZaadZoomClient.fromDatabase(prisma);
  } catch (error) {
    const outcome = zoomFailureOutcome(error);
    for (const group of groups.values()) {
      await recordResidentSyncOutcomes(
        prisma,
        group.map((resident) => ({ resident, outcome })),
        { actorUserId, action: "SYNC_BATCH_CREATE" },
      );
    }
    return;
  }

  for (const [contactListId, group] of groups) {
    let before: ZoomContactDto[];
    try {
      before = await client.listContacts(contactListId);
    } catch (error) {
      const outcome = zoomFailureOutcome(error);
      await recordResidentSyncOutcomes(
        prisma,
        group.map((resident) => ({ resident, outcome })),
        { actorUserId, action: "SYNC_BATCH_CREATE" },
      );
      continue;
    }

    const outcomes = new Map<string, ResidentSyncOutcome>();
    for (let offset = 0; offset < group.length; offset += ZOOM_CONTACT_BATCH_MAX_ITEMS) {
      const chunk = group.slice(offset, offset + ZOOM_CONTACT_BATCH_MAX_ITEMS);
      let results: ZoomBatchContactResult[];
      try {
        results = await client.createContactsBatch(contactListId, chunk.map((resident) => ({
          name: resident.name,
          phone: resident.normalizedPhone,
          email: resident.normalizedEmail,
        })));
      } catch (error) {
        const outcome = zoomFailureOutcome(error);
        for (const resident of chunk) outcomes.set(resident.id, outcome);
        if (outcome.resultUnknown) {
          for (const resident of group.slice(offset + chunk.length)) {
            outcomes.set(resident.id, outcome);
          }
          break;
        }
        continue;
      }
      for (let index = 0; index < chunk.length; index += 1) {
        const result = results[index];
        outcomes.set(chunk[index].id, result?.success
          ? { success: true }
          : {
              success: false,
              code: result?.code ?? ZAAD_ERROR_CODES.zoomResultUnknown,
              resultUnknown: result === undefined,
            });
      }
    }

    const successful = group.filter((resident) => outcomes.get(resident.id)?.success);
    if (successful.length > 0) {
      try {
        const after = await client.listContacts(contactListId);
        const beforeIds = new Set(before.map(({ id }) => id));
        const newContacts = after.filter(({ id }) => !beforeIds.has(id));
        const matchesByResident = new Map<string, ZoomContactDto[]>();
        const contactMatchCounts = new Map<string, number>();
        for (const resident of successful) {
          const matches = newContacts.filter((contact) => contactMatchesResident(contact, resident));
          matchesByResident.set(resident.id, matches);
          for (const { id } of matches) contactMatchCounts.set(id, (contactMatchCounts.get(id) ?? 0) + 1);
        }
        for (const resident of successful) {
          const matches = matchesByResident.get(resident.id) ?? [];
          const contact = matches.length === 1 && contactMatchCounts.get(matches[0].id) === 1
            ? matches[0]
            : null;
          outcomes.set(resident.id, contact
            ? { success: true, contactId: contact.id }
            : { success: false, code: ZAAD_ERROR_CODES.zoomResultUnknown, resultUnknown: true });
        }
      } catch {
        for (const resident of successful) {
          outcomes.set(resident.id, {
            success: false,
            code: ZAAD_ERROR_CODES.zoomResultUnknown,
            resultUnknown: true,
          });
        }
      }
    }

    await recordResidentSyncOutcomes(
      prisma,
      group.map((resident) => ({
        resident,
        outcome: outcomes.get(resident.id) ?? {
          success: false,
          code: ZAAD_ERROR_CODES.zoomResultUnknown,
          resultUnknown: true,
        },
      })),
      { actorUserId, action: "SYNC_BATCH_CREATE" },
    );
  }
}

function contactMatchesResident(contact: ZoomContactDto, resident: ResidentSyncSnapshot) {
  const email = resident.normalizedEmail.toLowerCase();
  return contact.emails.some((candidate) => candidate.trim().toLowerCase() === email) &&
    contact.phones.some(({ number }) => number === resident.normalizedPhone);
}

function zoomFailureOutcome(error: unknown): ResidentSyncFailure {
  const resultUnknown = error instanceof ZaadZoomError && error.resultUnknown;
  return {
    success: false,
    code: resultUnknown
      ? ZAAD_ERROR_CODES.zoomResultUnknown
      : error instanceof ZaadZoomError ? error.code : ZAAD_ERROR_CODES.zoomUnavailable,
    resultUnknown,
  };
}

async function recordResidentSyncOutcome(
  prisma: PrismaClient,
  resident: ResidentSyncSnapshot,
  outcome: ResidentSyncOutcome,
  audit: ResidentSyncAuditContext,
) {
  const [effective] = await recordResidentSyncOutcomes(prisma, [{ resident, outcome }], audit);
  return effective;
}

async function recordResidentSyncOutcomes(
  prisma: PrismaClient,
  entries: Array<{ resident: ResidentSyncSnapshot; outcome: ResidentSyncOutcome }>,
  audit: ResidentSyncAuditContext,
) {
  return prisma.$transaction(async (transaction) => {
    const effectiveOutcomes: ResidentSyncOutcome[] = [];
    for (const { resident, outcome } of entries) {
      const effective = await applyResidentSyncOutcome(transaction, resident, outcome);
      effectiveOutcomes.push(effective);
      await writeZaadAudit(transaction, {
        actorUserId: audit.actorUserId,
        resourceKind: "resident",
        targetId: resident.id,
        action: audit.action,
        result: effective.success ? "SUCCESS" : effective.resultUnknown ? "RESULT_UNKNOWN" : "FAILED",
        changedFieldNames: (effective.success && effective.contactId) || (!effective.success && effective.clearContactId)
          ? ["syncStatus", "zoomContactId"]
          : ["syncStatus"],
        stableErrorCode: effective.success ? null : effective.code,
      });
    }
    return effectiveOutcomes;
  });
}

async function applyResidentSyncOutcome(
  transaction: Prisma.TransactionClient,
  resident: ResidentSyncSnapshot,
  outcome: ResidentSyncOutcome,
): Promise<ResidentSyncOutcome> {
  const updated = await transaction.disasterRadioSubscription.updateMany({
    where: {
      id: resident.id,
      revision: resident.revision,
      consentStatus: "CONSENTED",
      zoomContactListId: resident.zoomContactListId,
      ...(!outcome.success && outcome.clearContactId ? { zoomContactId: resident.zoomContactId } : {}),
    },
    data: outcome.success
      ? {
          ...(outcome.contactId ? { zoomContactId: outcome.contactId } : {}),
          syncStatus: "SYNCED",
          syncErrorCode: null,
          syncedAt: new Date(),
        }
      : {
          ...(outcome.clearContactId ? { zoomContactId: null } : {}),
          syncStatus: "FAILED",
          syncErrorCode: outcome.code,
          syncedAt: null,
        },
  });
  if (updated.count === 1) return outcome;

  const conflict: ResidentSyncFailure = outcome.success
    ? {
        success: false,
        code: ZAAD_ERROR_CODES.residentConflict,
        resultUnknown: false,
      }
    : outcome;
  const reconciled = await transaction.disasterRadioSubscription.updateMany({
    where: {
      id: resident.id,
      consentStatus: "CONSENTED",
      zoomContactListId: resident.zoomContactListId,
      ...(conflict.clearContactId ? { zoomContactId: resident.zoomContactId } : {}),
    },
    data: {
      ...(conflict.clearContactId ? { zoomContactId: null } : {}),
      syncStatus: "FAILED",
      syncErrorCode: conflict.code,
      syncedAt: null,
    },
  });
  if (reconciled.count === 0 && conflict.clearContactId) {
    await transaction.disasterRadioSubscription.updateMany({
      where: {
        id: resident.id,
        consentStatus: "CONSENTED",
        zoomContactListId: resident.zoomContactListId,
      },
      data: {
        syncStatus: "FAILED",
        syncErrorCode: conflict.code,
        syncedAt: null,
      },
    });
  }
  return conflict;
}

async function claimRemoteResidentDeletion(
  prisma: PrismaClient,
  actorUserId: string,
  resident: ResidentSyncSnapshot,
  action: "UPDATE" | "DELETE",
) {
  if (!resident.zoomContactListId || !resident.zoomContactId) return resident.revision;
  const claimedRevision = resident.revision + 1;
  try {
    await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.disasterRadioSubscription.updateMany({
        where: {
          id: resident.id,
          revision: resident.revision,
          consentStatus: "CONSENTED",
          zoomContactListId: resident.zoomContactListId,
          zoomContactId: resident.zoomContactId,
        },
        data: {
          revision: { increment: 1 },
          syncStatus: "PENDING",
          syncErrorCode: null,
          syncedAt: null,
        },
      });
      if (claimed.count !== 1) throw new ZaadResidentError(ZAAD_ERROR_CODES.residentConflict, 409);
      await writeZaadAudit(transaction, {
        actorUserId,
        resourceKind: "resident",
        targetId: resident.id,
        action: `${action}_REMOTE_DELETE_CLAIM`,
        result: "SUCCESS",
        changedFieldNames: ["revision", "syncStatus"],
      });
    });
  } catch (error) {
    if (!(error instanceof ZaadResidentError) || error.code !== ZAAD_ERROR_CODES.residentConflict) throw error;
    await writeZaadAudit(prisma, {
      actorUserId,
      resourceKind: "resident",
      targetId: resident.id,
      action: `${action}_REMOTE_DELETE_CLAIM`,
      result: "REJECTED",
      changedFieldNames: [],
      stableErrorCode: ZAAD_ERROR_CODES.residentConflict,
    });
    throw error;
  }
  return claimedRevision;
}

async function deleteRemoteResidentContact(
  prisma: PrismaClient,
  actorUserId: string,
  resident: ResidentSyncSnapshot,
  action: "UPDATE" | "DELETE",
) {
  if (!resident.zoomContactListId || !resident.zoomContactId) return;
  try {
    const client = await ZaadZoomClient.fromDatabase(prisma);
    await client.deleteContact(resident.zoomContactListId, resident.zoomContactId);
  } catch (error) {
    if (error instanceof ZaadZoomError && error.code === ZAAD_ERROR_CODES.zoomNotFound) return;
    const outcome = zoomFailureOutcome(error);
    await recordResidentSyncOutcome(prisma, resident, outcome, { actorUserId, action });
    if (error instanceof ZaadZoomError) {
      throw new ZaadResidentError(outcome.code, error.httpStatus);
    }
    throw new ZaadResidentError(ZAAD_ERROR_CODES.zoomUnavailable, 502);
  }
}

function toResidentDto(resident: {
  id: string;
  name: string;
  normalizedEmail: string;
  normalizedPhone: string;
  consentStatus: string;
  source: string;
  revision: number;
  zoomContactListId: string | null;
  zoomContactListNameSnapshot: string | null;
  syncStatus: string;
  syncErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: resident.id,
    name: resident.name,
    email: resident.normalizedEmail,
    phone: resident.normalizedPhone,
    consentStatus: resident.consentStatus,
    source: resident.source,
    revision: resident.revision,
    contactList: resident.zoomContactListId
      ? { id: resident.zoomContactListId, name: resident.zoomContactListNameSnapshot ?? "" }
      : null,
    syncStatus: resident.syncStatus,
    syncErrorCode: resident.syncErrorCode,
    createdAt: resident.createdAt.toISOString(),
    updatedAt: resident.updatedAt.toISOString(),
  };
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
