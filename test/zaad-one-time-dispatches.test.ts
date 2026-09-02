import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  preflightZaadOneTime,
  prepareZaadOneTime,
  ZaadOneTimeError,
} from "../lib/server/zaad/one-time";
import {
  ZaadZoomClient,
  ZaadZoomError,
  type ZoomCampaignDto,
  type ZoomContactListDto,
  type ZoomOneTimeCampaignProfile,
} from "../lib/server/zaad/zoom-client";
import {
  parseZaadMessageInput,
  parseZaadOneTimeInput,
  ZAAD_ERROR_CODES,
  ZAAD_LIMITS,
} from "../lib/zaad/contracts";

const valid = {
  operationKey: "operation-20260901-001",
  name: "大雨警報",
  body: "未来市に大雨警報が発表されました。",
  languageCode: "ja-JP" as const,
  voiceId: "Tomoko" as const,
  baseCampaignId: "campaign-001",
  contactListIds: ["list-001", "list-002"],
  residentSelections: [
    { id: "resident-001", revision: 1 },
    { id: "resident-002", revision: 2 },
  ],
};

type AuditRecord = {
  actorUserId: string | null;
  resourceKind: string;
  targetRef: string;
  action: string;
  result: string;
  changedFieldNames: string[];
  stableErrorCode: string | null;
};

const campaignFixture: ZoomCampaignDto = {
  id: valid.baseCampaignId,
  name: "PRIVATE CAMPAIGN NAME",
  dialingMethod: "agentless",
  status: "ready",
  contactListId: null,
  contactListName: null,
  contactCount: 1,
  queueName: "PRIVATE QUEUE NAME",
  callerIdMasked: "***-***-1234",
  maxConcurrentCalls: 1,
  businessHours: "PRIVATE BUSINESS HOURS",
  retryPolicy: "PRIVATE RETRY POLICY",
  dncPolicy: "PRIVATE DNC POLICY",
  alwaysRunning: false,
  revision: "PRIVATE CAMPAIGN REVISION",
};

const campaignProfileFixture: ZoomOneTimeCampaignProfile = {
  queueId: "PRIVATE QUEUE ID",
  phoneNumberId: "PRIVATE PHONE NUMBER ID",
  assignType: null,
  maxConcurrentCalls: 1,
  newFlowId: "PRIVATE FLOW ID",
  oldFlowId: null,
  outboundCampaignPriority: null,
  dncListIds: [],
  exclusionLogic: null,
  maxAttemptsPerContact: null,
  attemptsUseSamePeriod: null,
  secondAttemptPeriod: null,
  thirdAttemptPeriod: null,
  otherAttemptPeriod: null,
  retryPeriod: null,
  retryPeriodUnit: null,
  dialSequence: null,
  enableMaxRingTime: null,
  maxRingTime: null,
  businessHourSource: null,
  businessHourId: null,
  enableClosureHour: null,
  closureSetId: null,
  contactTimezoneSource: null,
  contactPhoneOrder: null,
  enableDiagnostics: null,
  localCallingWindows: [],
};

const campaignReferenceReadback = {
  queueId: campaignProfileFixture.queueId,
  phoneNumberId: "CANONICAL PRIVATE PHONE NUMBER ID",
  newFlowId: campaignProfileFixture.newFlowId,
};

function contactListFixture(id: string): ZoomContactListDto {
  return {
    id,
    name: "PRIVATE CONTACT LIST NAME",
    description: "PRIVATE CONTACT LIST DESCRIPTION",
    type: "contact",
    contactCount: 1,
    revision: "PRIVATE CONTACT LIST REVISION",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function persistedDispatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "dispatch-persisted-id",
    operationKey: valid.operationKey,
    name: valid.name,
    body: valid.body,
    languageCode: valid.languageCode,
    voiceId: valid.voiceId,
    state: "RESULT_UNKNOWN",
    baseCampaignId: valid.baseCampaignId,
    selectedListCount: valid.contactListIds.length,
    selectedResidentCount: valid.residentSelections.length,
    duplicateCount: 1,
    recipientCount: 3,
    lastCompletedStep: "CONTACT_LIST_CREATED",
    zoomContactListId: "zoom-list-persisted-id",
    zoomAssetId: "zoom-asset-persisted-id",
    zoomAssetItemId: null,
    zoomCampaignId: "zoom-campaign-persisted-id",
    stableErrorCode: ZAAD_ERROR_CODES.oneTimeResultUnknown,
    revision: 4,
    createdByUserId: "actor-user",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:05:00.000Z"),
    sourceLists: valid.contactListIds.map((contactListId, selectedOrder) => ({ contactListId, selectedOrder })),
    residents: valid.residentSelections.map((resident, selectedOrder) => ({
      residentId: resident.id,
      residentRevision: resident.revision,
      selectedOrder,
    })),
    ...overrides,
  };
}

function prismaFixture(existing: ReturnType<typeof persistedDispatch> | null = null) {
  const audits: AuditRecord[] = [];
  const residents = valid.residentSelections.map((selection, index) => ({
    id: selection.id,
    revision: selection.revision,
    consentStatus: "CONSENTED",
    normalizedPhone: `+81901234567${index}`,
    name: `PRIVATE RESIDENT ${index}`,
  }));
  const prisma = {
    zaadAdminAudit: {
      create: async ({ data }: { data: AuditRecord }) => {
        audits.push(data);
        return { id: `audit-${audits.length}`, ...data };
      },
    },
    zaadOneTimeDispatch: {
      findUnique: async () => existing,
    },
    disasterRadioSubscription: {
      findMany: async () => residents,
    },
  };
  return { prisma: prisma as unknown as PrismaClient, audits };
}

function writablePrismaFixture(residentCount = valid.residentSelections.length) {
  const audits: AuditRecord[] = [];
  const checkpoints: string[] = [];
  const residents = Array.from({ length: residentCount }, (_, index) => ({
    id: `resident-${String(index + 1).padStart(3, "0")}`,
    revision: index + 1,
    consentStatus: "CONSENTED",
    normalizedPhone: `+8190${String(index).padStart(8, "0")}`,
    name: `PRIVATE RESIDENT ${index}`,
  }));
  let stored: ReturnType<typeof persistedDispatch> | null = null;
  let createCount = 0;
  const client: Record<string, unknown> = {
    zaadAdminAudit: {
      create: async ({ data }: { data: AuditRecord }) => {
        audits.push(data);
        return { id: `audit-${audits.length}`, ...data };
      },
    },
    zaadOneTimeDispatch: {
      findUnique: async () => stored,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createCount += 1;
        const sourceCreate = (data.sourceLists as { create: Array<{ contactListId: string; selectedOrder: number }> }).create;
        const residentCreate = (data.residents as { create: Array<{ residentId: string; residentRevision: number; selectedOrder: number }> }).create;
        stored = persistedDispatch({
          id: "dispatch-created-0123456789",
          operationKey: data.operationKey,
          name: data.name,
          body: data.body,
          languageCode: data.languageCode,
          voiceId: data.voiceId,
          state: data.state,
          baseCampaignId: data.baseCampaignId,
          selectedListCount: data.selectedListCount,
          selectedResidentCount: data.selectedResidentCount,
          duplicateCount: data.duplicateCount,
          recipientCount: data.recipientCount,
          lastCompletedStep: data.lastCompletedStep,
          zoomContactListId: null,
          zoomAssetId: null,
          zoomAssetItemId: null,
          zoomCampaignId: null,
          stableErrorCode: null,
          revision: 1,
          createdByUserId: data.createdByUserId,
          createdAt: new Date("2026-09-01T01:02:03.000Z"),
          updatedAt: new Date("2026-09-01T01:02:03.000Z"),
          sourceLists: sourceCreate,
          residents: residentCreate,
        });
        return stored;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        assert.ok(stored);
        const revision = data.revision as { increment?: number } | number | undefined;
        const nextRevision = typeof revision === "number"
          ? revision
          : stored.revision + (revision?.increment ?? 0);
        const lastCompletedStep = typeof data.lastCompletedStep === "string"
          ? data.lastCompletedStep
          : stored.lastCompletedStep;
        if (typeof data.lastCompletedStep === "string") checkpoints.push(data.lastCompletedStep);
        stored = persistedDispatch({
          ...stored,
          ...data,
          lastCompletedStep,
          revision: nextRevision,
          updatedAt: new Date(stored.updatedAt.getTime() + 1_000),
          sourceLists: stored.sourceLists,
          residents: stored.residents,
        });
        return stored;
      },
    },
    disasterRadioSubscription: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        residents.filter((resident) => where.id.in.includes(resident.id)),
    },
  };
  client.$transaction = async (callback: (transaction: unknown) => unknown) => callback(client);
  return {
    prisma: client as unknown as PrismaClient,
    audits,
    checkpoints,
    residents,
    get stored() { return stored; },
    get createCount() { return createCount; },
  };
}

function stubZoom(t: TestContext, zoom: Partial<ZaadZoomClient>) {
  const original = Object.getOwnPropertyDescriptor(ZaadZoomClient, "fromDatabase");
  Object.defineProperty(ZaadZoomClient, "fromDatabase", {
    configurable: true,
    value: async () => zoom as ZaadZoomClient,
  });
  t.after(() => {
    if (original) Object.defineProperty(ZaadZoomClient, "fromDatabase", original);
  });
}

function workingZoom(overrides: Partial<ZaadZoomClient> = {}): Partial<ZaadZoomClient> {
  return {
    assertOneTimePreparationWritesEnabled: () => {},
    getCampaign: async () => campaignFixture,
    getCampaignPreparationProfile: async () => ({
      campaign: campaignFixture,
      profile: campaignProfileFixture,
    }),
    getContactList: async (id: string) => contactListFixture(id),
    listContacts: async (id: string) => [{
      id: `contact-${id}`,
      displayName: `PRIVATE CONTACT ${id}`,
      phones: [{ type: "main", number: id === "list-001" ? "+819011111111" : "+819022222222" }],
      emails: [],
    }],
    ...overrides,
  };
}

function writableZoom(
  events: string[],
  batches: number[],
  overrides: Partial<ZaadZoomClient> = {},
): Partial<ZaadZoomClient> {
  let configured = false;
  let statusSet = false;
  return workingZoom({
    createContactList: async (input) => {
      events.push("create-contact-list");
      assert.match(input.name, /^ZAAD-\d{14}-[A-Z0-9]+-CONTACTS$/u);
      assert.equal(input.name.includes(valid.name), false);
      assert.equal(input.description.includes(valid.body), false);
      return contactListFixture("temporary-list-id");
    },
    createContactsBatch: async (_contactListId, contacts) => {
      events.push("create-contacts-batch");
      batches.push(contacts.length);
      return contacts.map(() => ({ success: true as const }));
    },
    createTtsAsset: async (input) => {
      events.push("create-tts-asset");
      assert.match(input.name, /^ZAAD-\d{14}-[A-Z0-9]+-MESSAGE$/u);
      return { assetId: "temporary-asset-id", assetItemId: "temporary-asset-item-id" };
    },
    createDraftOneTimeCampaign: async (input) => {
      events.push("create-draft-campaign");
      assert.equal(input.contactListId, "temporary-list-id");
      assert.match(input.name, /^ZAAD-\d{14}-[A-Z0-9]+-CAMPAIGN$/u);
      return "temporary-campaign-id";
    },
    configureDraftOneTimeCampaign: async (id, input) => {
      events.push("configure-draft-campaign");
      assert.equal(id, "temporary-campaign-id");
      assert.equal(input.assetId, "temporary-asset-id");
      configured = true;
    },
    setCampaignStatus: async (id, status) => {
      events.push(`set-status-${status}`);
      assert.equal(id, "temporary-campaign-id");
      assert.equal(status, "Ready");
      statusSet = true;
    },
    getOneTimeCampaignReadback: async (id) => {
      events.push(statusSet ? "readback-ready" : configured ? "readback-configured" : "readback-draft");
      return {
        id,
        dialingMethod: "agentless",
        status: statusSet ? "ready" : "draft",
        contactListId: "temporary-list-id",
        agentlessAmdOffAction: configured ? "play_media" : "hang_up",
        assetId: configured ? "temporary-asset-id" : null,
        alwaysRunning: false,
        ...campaignReferenceReadback,
      };
    },
    ...overrides,
  });
}

function assertOneTimeError(error: unknown, code: string) {
  assert.ok(error instanceof ZaadOneTimeError);
  assert.equal(error.code, code);
  return true;
}

function assertOpaqueSafeAudits(audits: AuditRecord[], forbidden: string[]) {
  const serialized = JSON.stringify(audits);
  for (const value of forbidden) assert.equal(serialized.includes(value), false, `audit leaked ${value}`);
  for (const audit of audits) assert.match(audit.targetRef, /^[A-Za-z0-9_-]{43}$/u);
}

async function expiredPreflight(t: TestContext, prisma: PrismaClient) {
  const originalNow = Date.now;
  Date.now = () => originalNow() - 10 * 60 * 1_000;
  t.after(() => { Date.now = originalNow; });
  try {
    return await preflightZaadOneTime(prisma, valid);
  } finally {
    Date.now = originalNow;
  }
}

test("one-time campaign accepts combined lists and residents but requires at least one source", () => {
  const parsed = parseZaadOneTimeInput(valid);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, valid);

  assert.deepEqual(
    parseZaadOneTimeInput({
      ...valid,
      contactListIds: [],
      residentSelections: [],
    }),
    { ok: false, code: ZAAD_ERROR_CODES.invalidRequest },
  );
});

test("message and one-time contracts share Zoom's 500-character boundary", () => {
  assert.equal(ZAAD_LIMITS.messageBody, 500);
  const exactBoundary = "あ".repeat(500);
  const overBoundary = `${exactBoundary}あ`;

  assert.equal(parseZaadMessageInput({
    name: "境界テスト",
    body: exactBoundary,
    languageCode: "ja-JP",
    voiceId: "Tomoko",
  }).ok, true);
  assert.equal(parseZaadOneTimeInput({ ...valid, body: exactBoundary }).ok, true);
  assert.deepEqual(parseZaadMessageInput({
    name: "境界テスト",
    body: overBoundary,
    languageCode: "ja-JP",
    voiceId: "Tomoko",
  }), { ok: false, code: ZAAD_ERROR_CODES.invalidRequest });
  assert.deepEqual(
    parseZaadOneTimeInput({ ...valid, body: overBoundary }),
    { ok: false, code: ZAAD_ERROR_CODES.invalidRequest },
  );
});

test("one-time campaign rejects duplicate sources and stale-shaped selections", () => {
  for (const payload of [
    { ...valid, contactListIds: ["list-001", "list-001"] },
    {
      ...valid,
      residentSelections: [
        { id: "resident-001", revision: 1 },
        { id: "resident-001", revision: 1 },
      ],
    },
    { ...valid, residentSelections: [{ id: "resident-001", revision: 0 }] },
  ]) {
    assert.deepEqual(parseZaadOneTimeInput(payload), {
      ok: false,
      code: ZAAD_ERROR_CODES.invalidRequest,
    });
  }
});

test("prepare requires an acknowledged signed preflight shape", () => {
  const prepared = {
    ...valid,
    preflightToken: "v1.abcdefghijklmnopqrstuvwxyz.signature",
    acknowledged: true,
  };
  assert.equal(parseZaadOneTimeInput(prepared, true).ok, true);
  assert.deepEqual(
    parseZaadOneTimeInput({ ...prepared, acknowledged: false }, true),
    { ok: false, code: ZAAD_ERROR_CODES.invalidRequest },
  );
  assert.deepEqual(
    parseZaadOneTimeInput({ ...prepared, preflightToken: "short" }, true),
    { ok: false, code: ZAAD_ERROR_CODES.invalidRequest },
  );
});

test("preflight validates every selected list as a contact list before enumerating contacts", async (t) => {
  const { prisma } = prismaFixture();
  const calls: string[] = [];
  stubZoom(t, workingZoom({
    getContactList: async (id: string) => {
      calls.push(`get:${id}`);
      return contactListFixture(id);
    },
    listContacts: async (id: string) => {
      calls.push(`list:${id}`);
      return [{
        id: `contact-${id}`,
        displayName: id,
        phones: [{ type: "main", number: "+819011111111" }],
        emails: [],
      }];
    },
  }));

  await preflightZaadOneTime(prisma, valid);

  assert.deepEqual(calls, ["get:list-001", "get:list-002", "list:list-001", "list:list-002"]);
});

test("preflight accepts a safe source profile when display-only campaign metadata is absent", async (t) => {
  const { prisma } = prismaFixture();
  stubZoom(t, workingZoom({
    getCampaignPreparationProfile: async () => ({
      campaign: {
        ...campaignFixture,
        queueName: null,
        callerIdMasked: null,
        maxConcurrentCalls: null,
        businessHours: null,
        retryPolicy: null,
        dncPolicy: null,
      },
      profile: campaignProfileFixture,
    }),
  }));

  const result = await preflightZaadOneTime(prisma, valid);

  assert.deepEqual(result.operationProfile, {
    callerIdMasked: null,
    queueName: null,
    maxConcurrentCalls: campaignProfileFixture.maxConcurrentCalls,
    businessHours: null,
    retryPolicy: null,
    dncPolicy: null,
    alwaysRunning: false,
  });
});

test("preflight rejects a DNC source before listing contacts and writes a PII-safe audit", async (t) => {
  const { prisma, audits } = prismaFixture();
  let listed = false;
  stubZoom(t, workingZoom({
    getContactList: async () => ({ ...contactListFixture("list-001"), type: "dnc" }) as unknown as ZoomContactListDto,
    listContacts: async () => {
      listed = true;
      return [];
    },
  }));

  await assert.rejects(
    preflightZaadOneTime(prisma, valid),
    (error) => assertOneTimeError(error, ZAAD_ERROR_CODES.oneTimeRecipientsInvalid),
  );

  assert.equal(listed, false);
  assert.deepEqual(audits.map(({ resourceKind, action, result, stableErrorCode }) => ({
    resourceKind,
    action,
    result,
    stableErrorCode,
  })), [{
    resourceKind: "contact-list",
    action: "ONE_TIME_SOURCE_VALIDATE",
    result: "REJECTED",
    stableErrorCode: ZAAD_ERROR_CODES.oneTimeRecipientsInvalid,
  }]);
  assertOpaqueSafeAudits(audits, [
    "list-001",
    valid.name,
    valid.body,
    campaignFixture.queueName ?? "",
    "+819011111111",
  ]);
});

test("a later DNC source prevents contact enumeration for every selected list", async (t) => {
  const { prisma, audits } = prismaFixture();
  const calls: string[] = [];
  stubZoom(t, workingZoom({
    getContactList: async (id: string) => {
      calls.push(`get:${id}`);
      return id === "list-002"
        ? ({ ...contactListFixture(id), type: "dnc" }) as unknown as ZoomContactListDto
        : contactListFixture(id);
    },
    listContacts: async (id: string) => {
      calls.push(`list:${id}`);
      return [];
    },
  }));

  await assert.rejects(
    preflightZaadOneTime(prisma, valid),
    (error) => assertOneTimeError(error, ZAAD_ERROR_CODES.oneTimeRecipientsInvalid),
  );

  assert.deepEqual(calls, ["get:list-001", "get:list-002"]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.oneTimeRecipientsInvalid);
  assertOpaqueSafeAudits(audits, ["list-001", "list-002", valid.name, valid.body]);
});

test("preflight token uses domain-separated protected digests and contains no sensitive values", async (t) => {
  const { prisma } = prismaFixture();
  stubZoom(t, workingZoom());

  const preflight = await preflightZaadOneTime(prisma, valid);
  const [version, encoded] = preflight.preflightToken.split(".");
  assert.equal(version, "v2");
  const signed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
  const serialized = JSON.stringify(signed);
  for (const sensitive of [
    valid.operationKey,
    valid.name,
    valid.body,
    valid.baseCampaignId,
    ...valid.contactListIds,
    ...valid.residentSelections.map(({ id }) => id),
    "+819011111111",
    "PRIVATE CONTACT list-001",
    "PRIVATE QUEUE NAME",
    "PRIVATE CAMPAIGN REVISION",
  ]) {
    assert.equal(serialized.includes(sensitive), false, `token leaked ${sensitive}`);
  }
  assert.deepEqual(
    Object.keys(signed).sort(),
    [
      "duplicateCount",
      "expiresAt",
      "operationKeyDigest",
      "recipientCount",
      "recipientDigest",
      "requestDigest",
      "selectedListCount",
      "selectedResidentCount",
      "settingsDigest",
      "version",
    ],
  );
  assert.notEqual(signed.recipientDigest, signed.settingsDigest);

  const plainRecipientDigest = createHash("sha256").update(JSON.stringify([
    { phone: "+819011111111", displayName: "PRIVATE CONTACT list-001" },
    { phone: "+819022222222", displayName: "PRIVATE CONTACT list-002" },
    { phone: "+819012345670", displayName: "PRIVATE RESIDENT 0" },
    { phone: "+819012345671", displayName: "PRIVATE RESIDENT 1" },
  ])).digest("base64url");
  assert.notEqual(signed.recipientDigest, plainRecipientDigest);
  const plainSettingsDigest = createHash("sha256").update(JSON.stringify({
    id: campaignFixture.id,
    dialingMethod: campaignFixture.dialingMethod,
    status: campaignFixture.status,
    queueName: campaignFixture.queueName,
    callerIdMasked: campaignFixture.callerIdMasked,
    maxConcurrentCalls: campaignFixture.maxConcurrentCalls,
    businessHours: campaignFixture.businessHours,
    retryPolicy: campaignFixture.retryPolicy,
    dncPolicy: campaignFixture.dncPolicy,
    alwaysRunning: campaignFixture.alwaysRunning,
    revision: campaignFixture.revision,
  })).digest("base64url");
  assert.notEqual(signed.settingsDigest, plainSettingsDigest);
});

test("an existing matching dispatch is read back after token expiry with persisted progress and resources", async (t) => {
  const existing = persistedDispatch();
  const { prisma, audits } = prismaFixture(existing);
  stubZoom(t, workingZoom());
  const preflight = await expiredPreflight(t, prisma);

  const result = await prepareZaadOneTime(prisma, "actor-user", {
    ...valid,
    preflightToken: preflight.preflightToken,
    acknowledged: true,
  });

  assert.equal(result.state, existing.state);
  assert.equal(result.lastCompletedStep, existing.lastCompletedStep);
  assert.deepEqual(result.knownResources, {
    contactListId: existing.zoomContactListId,
    assetId: existing.zoomAssetId,
    campaignId: existing.zoomCampaignId,
  });
  assert.equal(result.stableErrorCode, existing.stableErrorCode);
  assert.deepEqual(audits, []);
});

test("idempotent readback fails closed for a different actor or request payload", async (t) => {
  const existing = persistedDispatch();
  const { prisma, audits } = prismaFixture(existing);
  stubZoom(t, workingZoom());
  const expired = await expiredPreflight(t, prisma);

  await assert.rejects(
    prepareZaadOneTime(prisma, "different-actor", {
      ...valid,
      preflightToken: expired.preflightToken,
      acknowledged: true,
    }),
    (error) => assertOneTimeError(error, ZAAD_ERROR_CODES.oneTimeSnapshotStale),
  );

  const changed = { ...valid, body: "CHANGED PRIVATE BODY" };
  const changedPreflight = await preflightZaadOneTime(prisma, changed);
  await assert.rejects(
    prepareZaadOneTime(prisma, "actor-user", {
      ...changed,
      preflightToken: changedPreflight.preflightToken,
      acknowledged: true,
    }),
    (error) => assertOneTimeError(error, ZAAD_ERROR_CODES.oneTimeSnapshotStale),
  );

  assert.equal(audits.length, 2);
  assert.deepEqual(audits.map(({ result, stableErrorCode }) => ({ result, stableErrorCode })), [
    { result: "REJECTED", stableErrorCode: ZAAD_ERROR_CODES.oneTimeSnapshotStale },
    { result: "REJECTED", stableErrorCode: ZAAD_ERROR_CODES.oneTimeSnapshotStale },
  ]);
  assertOpaqueSafeAudits(audits, [valid.operationKey, valid.body, changed.body]);
});

test("invalid, stale, and expired prepare rejections are audited against an opaque operation reference", async (t) => {
  const { prisma, audits } = prismaFixture();
  stubZoom(t, workingZoom());
  const current = await preflightZaadOneTime(prisma, valid);
  const expired = await expiredPreflight(t, prisma);

  await assert.rejects(
    prepareZaadOneTime(prisma, "actor-user", {
      ...valid,
      acknowledged: false,
      preflightToken: current.preflightToken,
    }),
    (error) => assertOneTimeError(error, ZAAD_ERROR_CODES.invalidRequest),
  );
  await assert.rejects(
    prepareZaadOneTime(prisma, "actor-user", {
      ...valid,
      preflightToken: `v2.${current.preflightToken.split(".")[1]}.${"A".repeat(43)}`,
      acknowledged: true,
    }),
    (error) => assertOneTimeError(error, ZAAD_ERROR_CODES.oneTimeSnapshotStale),
  );
  await assert.rejects(
    prepareZaadOneTime(prisma, "actor-user", {
      ...valid,
      preflightToken: expired.preflightToken,
      acknowledged: true,
    }),
    (error) => assertOneTimeError(error, ZAAD_ERROR_CODES.oneTimeSnapshotExpired),
  );

  assert.deepEqual(audits.map(({ action, result, stableErrorCode }) => ({ action, result, stableErrorCode })), [
    { action: "PREPARE", result: "REJECTED", stableErrorCode: ZAAD_ERROR_CODES.invalidRequest },
    { action: "PREPARE", result: "REJECTED", stableErrorCode: ZAAD_ERROR_CODES.oneTimeSnapshotStale },
    { action: "PREPARE", result: "REJECTED", stableErrorCode: ZAAD_ERROR_CODES.oneTimeSnapshotExpired },
  ]);
  assert.equal(new Set(audits.map(({ targetRef }) => targetRef)).size, 1);
  assertOpaqueSafeAudits(audits, [valid.operationKey, valid.name, valid.body]);
});

test("prepare checkpoints 100-contact batches through Draft and Ready readback without persisting recipient PII", async (t) => {
  const fixture = writablePrismaFixture(201);
  const input = {
    ...valid,
    contactListIds: [],
    residentSelections: fixture.residents.map(({ id, revision }) => ({ id, revision })),
  };
  const events: string[] = [];
  const batches: number[] = [];
  stubZoom(t, writableZoom(events, batches));
  const preflight = await preflightZaadOneTime(fixture.prisma, input);

  const result = await prepareZaadOneTime(fixture.prisma, "actor-user", {
    ...input,
    preflightToken: preflight.preflightToken,
    acknowledged: true,
  });

  assert.equal(result.state, "READY");
  assert.equal(result.lastCompletedStep, "READBACK_VERIFIED");
  assert.deepEqual(result.knownResources, {
    contactListId: "temporary-list-id",
    assetId: "temporary-asset-id",
    campaignId: "temporary-campaign-id",
  });
  assert.deepEqual(batches, [100, 100, 1]);
  assert.deepEqual(events, [
    "create-contact-list",
    "create-contacts-batch",
    "create-contacts-batch",
    "create-contacts-batch",
    "create-tts-asset",
    "create-draft-campaign",
    "readback-draft",
    "configure-draft-campaign",
    "readback-configured",
    "set-status-Ready",
    "readback-ready",
  ]);
  assert.deepEqual(fixture.checkpoints, [
    "CONTACT_LIST_CREATED",
    "CONTACTS_BATCH_1_CREATED",
    "CONTACTS_BATCH_2_CREATED",
    "CONTACTS_BATCH_3_CREATED",
    "TTS_ASSET_CREATED",
    "DRAFT_CAMPAIGN_CREATED",
    "DRAFT_READBACK_VERIFIED",
    "CAMPAIGN_CONFIGURED",
    "CONFIGURATION_READBACK_VERIFIED",
    "CAMPAIGN_READY_SET",
    "READBACK_VERIFIED",
  ]);
  assert.equal(fixture.createCount, 1);
  assert.deepEqual(fixture.audits.map(({ action, result }) => ({ action, result })), [
    { action: "SNAPSHOT_VERIFY", result: "SUCCESS" },
    { action: "PREPARE", result: "SUCCESS" },
  ]);
  assertOpaqueSafeAudits(fixture.audits, [
    input.operationKey,
    input.name,
    input.body,
    fixture.residents[0]?.name ?? "",
    fixture.residents[0]?.normalizedPhone ?? "",
  ]);
  const persisted = JSON.stringify(fixture.stored);
  assert.equal(persisted.includes(fixture.residents[0]?.name ?? ""), false);
  assert.equal(persisted.includes(fixture.residents[0]?.normalizedPhone ?? ""), false);
});

test("a failed contact batch is terminal FAILED, preserves the last checkpoint, and is not resent", async (t) => {
  const fixture = writablePrismaFixture(101);
  const input = {
    ...valid,
    contactListIds: [],
    residentSelections: fixture.residents.map(({ id, revision }) => ({ id, revision })),
  };
  const events: string[] = [];
  const batches: number[] = [];
  let batchNumber = 0;
  stubZoom(t, writableZoom(events, batches, {
    createContactsBatch: async (_listId, contacts) => {
      events.push("create-contacts-batch");
      batches.push(contacts.length);
      batchNumber += 1;
      return contacts.map((_, index) => batchNumber === 2 && index === 0
        ? { success: false as const, code: ZAAD_ERROR_CODES.zoomContactRejected }
        : { success: true as const });
    },
  }));
  const preflight = await preflightZaadOneTime(fixture.prisma, input);
  const payload = { ...input, preflightToken: preflight.preflightToken, acknowledged: true as const };

  let firstError: unknown;
  try {
    await prepareZaadOneTime(fixture.prisma, "actor-user", payload);
  } catch (error) {
    firstError = error;
  }
  assertOneTimeError(firstError, ZAAD_ERROR_CODES.zoomContactRejected);
  assert.equal((firstError as ZaadOneTimeError).dispatch?.state, "FAILED");
  assert.equal((firstError as ZaadOneTimeError).dispatch?.lastCompletedStep, "CONTACTS_BATCH_1_CREATED");
  assert.deepEqual((firstError as ZaadOneTimeError).dispatch?.knownResources, {
    contactListId: "temporary-list-id",
    assetId: null,
    campaignId: null,
  });
  assert.deepEqual(events, ["create-contact-list", "create-contacts-batch", "create-contacts-batch"]);
  assert.deepEqual(batches, [100, 1]);

  const resent = await prepareZaadOneTime(fixture.prisma, "actor-user", payload);
  assert.equal(resent.state, "FAILED");
  assert.deepEqual(events, ["create-contact-list", "create-contacts-batch", "create-contacts-batch"]);
  assert.equal(fixture.createCount, 1);
});

test("a write with an unknown result is terminal RESULT_UNKNOWN with no automatic resend or cleanup", async (t) => {
  const fixture = writablePrismaFixture();
  const events: string[] = [];
  const batches: number[] = [];
  stubZoom(t, writableZoom(events, batches, {
    createTtsAsset: async () => {
      events.push("create-tts-asset");
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
    },
  }));
  const preflight = await preflightZaadOneTime(fixture.prisma, valid);
  const payload = { ...valid, preflightToken: preflight.preflightToken, acknowledged: true as const };

  let firstError: unknown;
  try {
    await prepareZaadOneTime(fixture.prisma, "actor-user", payload);
  } catch (error) {
    firstError = error;
  }
  assertOneTimeError(firstError, ZAAD_ERROR_CODES.oneTimeResultUnknown);
  assert.equal((firstError as ZaadOneTimeError).dispatch?.state, "RESULT_UNKNOWN");
  assert.equal((firstError as ZaadOneTimeError).dispatch?.lastCompletedStep, "CONTACTS_BATCH_1_CREATED");
  assert.deepEqual((firstError as ZaadOneTimeError).dispatch?.knownResources, {
    contactListId: "temporary-list-id",
    assetId: null,
    campaignId: null,
  });
  assert.deepEqual(events, ["create-contact-list", "create-contacts-batch", "create-tts-asset"]);

  const resent = await prepareZaadOneTime(fixture.prisma, "actor-user", payload);
  assert.equal(resent.state, "RESULT_UNKNOWN");
  assert.deepEqual(events, ["create-contact-list", "create-contacts-batch", "create-tts-asset"]);
  assert.equal(fixture.audits.at(-1)?.result, "RESULT_UNKNOWN");
});

test("a non-Draft campaign readback stops before configure and preserves the campaign ID", async (t) => {
  const fixture = writablePrismaFixture();
  const events: string[] = [];
  const batches: number[] = [];
  stubZoom(t, writableZoom(events, batches, {
    getOneTimeCampaignReadback: async (id) => {
      events.push("readback-unexpected-ready");
      return {
        id,
        dialingMethod: "agentless",
        status: "ready",
        contactListId: "temporary-list-id",
        agentlessAmdOffAction: "hang_up",
        assetId: null,
        alwaysRunning: false,
        ...campaignReferenceReadback,
      };
    },
  }));
  const preflight = await preflightZaadOneTime(fixture.prisma, valid);

  let caught: unknown;
  try {
    await prepareZaadOneTime(fixture.prisma, "actor-user", {
      ...valid,
      preflightToken: preflight.preflightToken,
      acknowledged: true,
    });
  } catch (error) {
    caught = error;
  }

  assertOneTimeError(caught, ZAAD_ERROR_CODES.zoomInvalidResponse);
  assert.equal((caught as ZaadOneTimeError).dispatch?.state, "FAILED");
  assert.equal((caught as ZaadOneTimeError).dispatch?.lastCompletedStep, "DRAFT_CAMPAIGN_CREATED");
  assert.equal((caught as ZaadOneTimeError).dispatch?.knownResources.campaignId, "temporary-campaign-id");
  assert.deepEqual(events, [
    "create-contact-list",
    "create-contacts-batch",
    "create-tts-asset",
    "create-draft-campaign",
    "readback-unexpected-ready",
  ]);
});

test("configuration readback requires play_media and the dedicated asset before setting Ready", async (t) => {
  const fixture = writablePrismaFixture();
  const events: string[] = [];
  const batches: number[] = [];
  let readCount = 0;
  stubZoom(t, writableZoom(events, batches, {
    getOneTimeCampaignReadback: async (id) => {
      readCount += 1;
      events.push(readCount === 1 ? "readback-draft" : "readback-action-mismatch");
      return {
        id,
        dialingMethod: "agentless",
        status: "draft",
        contactListId: "temporary-list-id",
        agentlessAmdOffAction: readCount === 1 ? "hang_up" : "use_flow",
        assetId: readCount === 1 ? null : "temporary-asset-id",
        alwaysRunning: false,
        ...campaignReferenceReadback,
      };
    },
  }));
  const preflight = await preflightZaadOneTime(fixture.prisma, valid);

  let caught: unknown;
  try {
    await prepareZaadOneTime(fixture.prisma, "actor-user", {
      ...valid,
      preflightToken: preflight.preflightToken,
      acknowledged: true,
    });
  } catch (error) {
    caught = error;
  }

  assertOneTimeError(caught, ZAAD_ERROR_CODES.zoomInvalidResponse);
  assert.equal((caught as ZaadOneTimeError).dispatch?.state, "FAILED");
  assert.equal((caught as ZaadOneTimeError).dispatch?.lastCompletedStep, "CAMPAIGN_CONFIGURED");
  assert.equal(events.includes("set-status-Ready"), false);
  assert.equal(events.at(-1), "readback-action-mismatch");
});

test("the final readback must match Agentless, Ready, play_media, the temporary list, the dedicated asset, and always-running off", async (t) => {
  const fixture = writablePrismaFixture();
  const events: string[] = [];
  const batches: number[] = [];
  let readCount = 0;
  stubZoom(t, writableZoom(events, batches, {
    getOneTimeCampaignReadback: async (id) => {
      readCount += 1;
      events.push(readCount === 1 ? "readback-draft" : readCount === 2 ? "readback-configured" : "readback-mismatch");
      return {
        id,
        dialingMethod: "agentless",
        status: readCount < 3 ? "draft" : "ready",
        contactListId: "temporary-list-id",
        agentlessAmdOffAction: readCount === 1 ? "hang_up" : "play_media",
        assetId: readCount < 3 ? (readCount === 1 ? null : "temporary-asset-id") : "unexpected-asset-id",
        alwaysRunning: false,
        ...campaignReferenceReadback,
      };
    },
  }));
  const preflight = await preflightZaadOneTime(fixture.prisma, valid);

  let caught: unknown;
  try {
    await prepareZaadOneTime(fixture.prisma, "actor-user", {
      ...valid,
      preflightToken: preflight.preflightToken,
      acknowledged: true,
    });
  } catch (error) {
    caught = error;
  }

  assertOneTimeError(caught, ZAAD_ERROR_CODES.zoomInvalidResponse);
  assert.equal((caught as ZaadOneTimeError).dispatch?.state, "FAILED");
  assert.equal((caught as ZaadOneTimeError).dispatch?.lastCompletedStep, "CAMPAIGN_READY_SET");
  assert.deepEqual((caught as ZaadOneTimeError).dispatch?.knownResources, {
    contactListId: "temporary-list-id",
    assetId: "temporary-asset-id",
    campaignId: "temporary-campaign-id",
  });
  assert.equal(events.includes("set-status-Ready"), true);
  assert.equal(events.some((event) => event.includes("Running")), false);
});

test("campaign profile drift is rejected before the local row and every external write", async (t) => {
  const fixture = writablePrismaFixture();
  const events: string[] = [];
  let profileRead = 0;
  stubZoom(t, workingZoom({
    getCampaignPreparationProfile: async () => ({
      campaign: campaignFixture,
      profile: ({
        profileVersion: profileRead += 1,
      } as unknown as ZoomOneTimeCampaignProfile),
    }),
    createContactList: async () => {
      events.push("create-contact-list");
      return contactListFixture("temporary-list-id");
    },
  }));
  const preflight = await preflightZaadOneTime(fixture.prisma, valid);

  await assert.rejects(
    prepareZaadOneTime(fixture.prisma, "actor-user", {
      ...valid,
      preflightToken: preflight.preflightToken,
      acknowledged: true,
    }),
    (error) => assertOneTimeError(error, ZAAD_ERROR_CODES.oneTimeSnapshotStale),
  );

  assert.equal(fixture.createCount, 0);
  assert.deepEqual(events, []);
});

test("one-time prepare remains guarded by CREATE permission at the API boundary", () => {
  const source = readFileSync(new URL("../lib/server/zaad/api-routes.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /app\.post\("\/admin\/zaad\/one-time-dispatches", \(c\) => withZaadAuth\(c, "CREATE"/u,
  );
});

test("one-time prepare stops at Ready resources and never requests Running", () => {
  const source = readFileSync(
    new URL("../lib/server/zaad/one-time.ts", import.meta.url),
    "utf8",
  );
  const prepareStart = source.indexOf("export async function prepareZaadOneTime");
  const prepareEnd = source.indexOf("export async function listZaadOneTimeDispatches");
  const prepare = source.slice(prepareStart, prepareEnd);

  assert.match(prepare, /await client\.createContactList\(/u);
  assert.match(prepare, /await client\.createContactsBatch\(/u);
  assert.match(prepare, /await client\.createTtsAsset\(/u);
  assert.match(prepare, /await client\.createDraftOneTimeCampaign\(/u);
  assert.match(prepare, /await client\.configureDraftOneTimeCampaign\(/u);
  assert.match(prepare, /await client\.setCampaignStatus\(campaignId, "Ready"\)/u);
  assert.doesNotMatch(prepare, /["']Running["']/u);
  assert.match(prepare, /"RESULT_UNKNOWN"/u);
  assert.match(prepare, /"FAILED"/u);
  assert.match(prepare, /oneTimeResultUnknown/u);
});
