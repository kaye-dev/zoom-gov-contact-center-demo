import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  createZaadContactList,
  deleteZaadContactList,
  deleteZaadMessage,
  retryZaadMessage,
  updateZaadMessage,
  updateZaadCampaignStatus,
  updateZaadContactList,
  updateZaadRegistrationSetting,
  ZaadResourceError,
} from "../lib/server/zaad/resources";
import {
  ZaadZoomClient,
  ZaadZoomError,
  type ZoomCampaignDto,
  type ZoomContactListDto,
} from "../lib/server/zaad/zoom-client";
import { ZAAD_ERROR_CODES } from "../lib/zaad/contracts";

type AuditRecord = {
  actorUserId: string | null;
  resourceKind: string;
  targetRef: string;
  action: string;
  result: string;
  changedFieldNames: string[];
  fromCampaignStatus: string | null;
  toCampaignStatus: string | null;
  stableErrorCode: string | null;
};

function prismaFixture() {
  const audits: AuditRecord[] = [];
  const events: string[] = [];
  let messageDeleted = false;
  const message = {
    id: "message-raw-id",
    name: "synthetic message",
    body: "synthetic body",
    languageCode: "ja-JP",
    voiceId: "Tomoko",
    zoomAssetId: null as string | null,
    zoomAssetItemId: null as string | null,
    syncStatus: "SYNC_FAILED",
    syncErrorCode: ZAAD_ERROR_CODES.zoomUnavailable as string | null,
    syncedAt: null as Date | null,
    revision: 3,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  };
  const prisma = {
    zaadAdminAudit: {
      create: async ({ data }: { data: AuditRecord }) => {
        audits.push(data);
        return { id: `audit-${audits.length}`, ...data };
      },
    },
    zaadOutboundMessage: {
      updateMany: async ({ where, data }: {
        where: { id: string; revision?: number };
        data: {
          zoomAssetId?: string;
          zoomAssetItemId?: string;
          syncStatus?: string;
          syncErrorCode?: string | null;
          syncedAt?: Date | null;
          revision?: { increment: number };
        };
      }) => {
        if (messageDeleted || where.id !== message.id || (where.revision !== undefined && where.revision !== message.revision)) {
          return { count: 0 };
        }
        if (data.zoomAssetId) message.zoomAssetId = data.zoomAssetId;
        if (data.zoomAssetItemId) message.zoomAssetItemId = data.zoomAssetItemId;
        if (data.syncStatus) message.syncStatus = data.syncStatus;
        if (data.syncErrorCode !== undefined) message.syncErrorCode = data.syncErrorCode;
        if (data.syncedAt !== undefined) message.syncedAt = data.syncedAt;
        if (data.revision) message.revision += data.revision.increment;
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: string; revision: number } }) => {
        events.push("local-delete");
        if (messageDeleted || where.id !== message.id || where.revision !== message.revision) return { count: 0 };
        messageDeleted = true;
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id: string } }) => !messageDeleted && where.id === message.id ? message : null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        if (messageDeleted || where.id !== message.id) throw new Error("not found");
        return message;
      },
    },
    zaadRegistrationSetting: {
      count: async () => 0,
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({
        id: 1,
        contactListId: "contact-list-raw-id",
        contactListNameSnapshot: "synthetic list",
        revision: 2,
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
    },
    disasterRadioSubscription: { count: async () => 0 },
    zaadOneTimeDispatch: { count: async () => 0 },
    zaadOneTimeDispatchSourceList: { count: async () => 0 },
    $transaction: async <T>(run: (transaction: unknown) => Promise<T>) => run(prisma),
  };
  return { prisma: prisma as unknown as PrismaClient, audits, events, message, isMessageDeleted: () => messageDeleted };
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

function contactList(overrides: Partial<ZoomContactListDto> = {}): ZoomContactListDto {
  return {
    id: "contact-list-raw-id",
    name: "synthetic list",
    description: "synthetic description",
    type: "contact",
    contactCount: 2,
    revision: "revision-1",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function campaign(overrides: Partial<ZoomCampaignDto> = {}): ZoomCampaignDto {
  return {
    id: "campaign-raw-id",
    name: "synthetic campaign",
    dialingMethod: "agentless",
    status: "ready",
    contactListId: "contact-list-raw-id",
    contactListName: "synthetic list",
    contactCount: 2,
    queueName: "synthetic queue",
    callerIdMasked: "***-***-1234",
    maxConcurrentCalls: 1,
    businessHours: "synthetic hours",
    retryPolicy: "none",
    dncPolicy: "default",
    alwaysRunning: false,
    revision: "revision-1",
    ...overrides,
  };
}

function assertResourceError(error: unknown, code: string, resultUnknown = false) {
  assert.ok(error instanceof ZaadResourceError);
  assert.equal(error.code, code);
  assert.equal(error.resultUnknown, resultUnknown);
  return true;
}

function assertAuditSafe(audits: AuditRecord[], forbidden: string[]) {
  const serialized = JSON.stringify(audits);
  for (const value of forbidden) assert.equal(serialized.includes(value), false, `audit leaked ${value}`);
  for (const audit of audits) {
    assert.match(audit.targetRef, /^[A-Za-z0-9_-]{43}$/u);
    assert.deepEqual([...audit.changedFieldNames].sort(), audit.changedFieldNames);
  }
}

test("contact-list CREATE audits a known Zoom failure without request values", async (t) => {
  const { prisma, audits } = prismaFixture();
  stubZoom(t, {
    createContactList: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomScopeRequired, 503);
    },
  });

  await assert.rejects(
    createZaadContactList(prisma, "actor-user", {
      name: "PRIVATE LIST NAME",
      description: "PRIVATE LIST DESCRIPTION",
    }),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.zoomScopeRequired),
  );

  assert.deepEqual(audits.map(({ action, result, stableErrorCode }) => ({ action, result, stableErrorCode })), [{
    action: "CREATE",
    result: "FAILED",
    stableErrorCode: ZAAD_ERROR_CODES.zoomScopeRequired,
  }]);
  assertAuditSafe(audits, ["PRIVATE LIST NAME", "PRIVATE LIST DESCRIPTION"]);
});

test("contact-list UPDATE maps an uncertain Zoom write to result-unknown audit", async (t) => {
  const { prisma, audits } = prismaFixture();
  stubZoom(t, {
    getContactList: async () => contactList(),
    updateContactList: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
    },
  });

  await assert.rejects(
    updateZaadContactList(prisma, "actor-user", "contact-list-raw-id", {
      name: "PRIVATE UPDATED NAME",
      description: "PRIVATE UPDATED DESCRIPTION",
      revision: "revision-1",
    }),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.zoomResultUnknown, true),
  );

  assert.equal(audits[0]?.action, "UPDATE");
  assert.equal(audits[0]?.result, "RESULT_UNKNOWN");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  assertAuditSafe(audits, ["contact-list-raw-id", "PRIVATE UPDATED NAME", "PRIVATE UPDATED DESCRIPTION"]);
});

test("contact-list UPDATE rejects a stale safe-snapshot revision before the Zoom write", async (t) => {
  const { prisma, audits } = prismaFixture();
  let writes = 0;
  stubZoom(t, {
    getContactList: async () => contactList({ revision: "sha256:current-safe-snapshot" }),
    updateContactList: async () => {
      writes += 1;
      return contactList();
    },
  });

  await assert.rejects(
    updateZaadContactList(prisma, "actor-user", "contact-list-raw-id", {
      name: "PRIVATE UPDATED NAME",
      description: "PRIVATE UPDATED DESCRIPTION",
      revision: "sha256:stale-safe-snapshot",
    }),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.contactListConflict),
  );

  assert.equal(writes, 0);
  assert.equal(audits[0]?.result, "REJECTED");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.contactListConflict);
  assertAuditSafe(audits, ["contact-list-raw-id", "PRIVATE UPDATED NAME", "PRIVATE UPDATED DESCRIPTION"]);
});

test("contact-list DELETE audits an explicit Zoom rejection", async (t) => {
  const { prisma, audits } = prismaFixture();
  stubZoom(t, {
    deleteContactList: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomInUse, 409);
    },
  });

  await assert.rejects(
    deleteZaadContactList(prisma, "actor-user", "contact-list-raw-id"),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.zoomInUse),
  );

  assert.equal(audits[0]?.action, "DELETE");
  assert.equal(audits[0]?.result, "FAILED");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.zoomInUse);
  assertAuditSafe(audits, ["contact-list-raw-id"]);
});

test("contact-list DELETE preserves Zoom 404 as a stable not-found failure", async (t) => {
  const { prisma, audits } = prismaFixture();
  stubZoom(t, {
    deleteContactList: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotFound, 404);
    },
  });

  await assert.rejects(
    deleteZaadContactList(prisma, "actor-user", "contact-list-raw-id"),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.zoomNotFound),
  );

  assert.equal(audits[0]?.action, "DELETE");
  assert.equal(audits[0]?.result, "FAILED");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.zoomNotFound);
  assertAuditSafe(audits, ["contact-list-raw-id"]);
});

test("registration-setting audits a Zoom list lookup failure and never stores the list ID", async (t) => {
  const { prisma, audits } = prismaFixture();
  stubZoom(t, {
    getContactList: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotFound, 404);
    },
  });

  await assert.rejects(
    updateZaadRegistrationSetting(prisma, "actor-user", {
      contactListId: "contact-list-raw-id",
      revision: 1,
    }),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.zoomNotFound),
  );

  assert.equal(audits[0]?.resourceKind, "registration-setting");
  assert.equal(audits[0]?.result, "FAILED");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.zoomNotFound);
  assertAuditSafe(audits, ["contact-list-raw-id"]);
});

test("campaign status rejects non-Agentless campaigns with a PII-safe audit", async (t) => {
  const { prisma, audits } = prismaFixture();
  stubZoom(t, { getCampaign: async () => campaign({ dialingMethod: "preview" }) });

  await assert.rejects(
    updateZaadCampaignStatus(prisma, "actor-user", "campaign-raw-id", {
      status: "running",
      expectedStatus: "ready",
    }),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.campaignNotAgentless),
  );

  assert.deepEqual(audits.map(({ action, result, fromCampaignStatus, toCampaignStatus, stableErrorCode }) => ({
    action,
    result,
    fromCampaignStatus,
    toCampaignStatus,
    stableErrorCode,
  })), [{
    action: "START",
    result: "REJECTED",
    fromCampaignStatus: "ready",
    toCampaignStatus: "running",
    stableErrorCode: ZAAD_ERROR_CODES.campaignNotAgentless,
  }]);
  assertAuditSafe(audits, ["campaign-raw-id", "synthetic campaign", "synthetic list", "synthetic queue"]);
});

test("campaign status audits a known Zoom PATCH failure", async (t) => {
  const { prisma, audits } = prismaFixture();
  stubZoom(t, {
    getCampaign: async () => campaign(),
    setCampaignStatus: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomScopeRequired, 503);
    },
  });

  await assert.rejects(
    updateZaadCampaignStatus(prisma, "actor-user", "campaign-raw-id", {
      status: "running",
      expectedStatus: "ready",
    }),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.zoomScopeRequired),
  );

  assert.equal(audits[0]?.action, "START");
  assert.equal(audits[0]?.result, "FAILED");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.zoomScopeRequired);
  assertAuditSafe(audits, ["campaign-raw-id"]);
});

test("campaign status uses readback after an uncertain PATCH and audits unresolved state", async (t) => {
  const { prisma, audits } = prismaFixture();
  let reads = 0;
  stubZoom(t, {
    getCampaign: async () => {
      reads += 1;
      return campaign({ status: "ready" });
    },
    setCampaignStatus: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
    },
  });

  await assert.rejects(
    updateZaadCampaignStatus(prisma, "actor-user", "campaign-raw-id", {
      status: "running",
      expectedStatus: "ready",
    }),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.campaignStatusUnknown, true),
  );

  assert.equal(reads, 2);
  assert.equal(audits[0]?.result, "RESULT_UNKNOWN");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.campaignStatusUnknown);
  assertAuditSafe(audits, ["campaign-raw-id"]);
});

test("message sync retry records result-unknown with a distinct stable code", async (t) => {
  const { prisma, audits, message } = prismaFixture();
  stubZoom(t, {
    createTtsAsset: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
    },
  });

  const result = await retryZaadMessage(prisma, "actor-user", message.id, message.revision);

  assert.equal(result.syncStatus, "SYNC_FAILED");
  assert.equal(result.syncErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  assert.equal(audits[0]?.action, "SYNC_RETRY");
  assert.equal(audits[0]?.result, "RESULT_UNKNOWN");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  assertAuditSafe(audits, [message.id, message.name, message.body]);
});

test("message sync never retries an unreconciled TTS create result", async (t) => {
  const { prisma, audits, message } = prismaFixture();
  message.syncErrorCode = ZAAD_ERROR_CODES.zoomResultUnknown;
  let creates = 0;
  stubZoom(t, {
    createTtsAsset: async () => {
      creates += 1;
      return { assetId: "duplicate-asset", assetItemId: "duplicate-item" };
    },
  });

  await assert.rejects(
    retryZaadMessage(prisma, "actor-user", message.id, message.revision),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.zoomResultUnknown, true),
  );

  assert.equal(creates, 0);
  assert.equal(message.revision, 3);
  assert.equal(message.syncStatus, "SYNC_FAILED");
  assert.equal(message.syncErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  assert.deepEqual(audits.map(({ action, result, stableErrorCode }) => ({ action, result, stableErrorCode })), [{
    action: "SYNC_RETRY",
    result: "REJECTED",
    stableErrorCode: ZAAD_ERROR_CODES.zoomResultUnknown,
  }]);
  assertAuditSafe(audits, [message.id, message.name, message.body]);
});

test("message edit preserves the manual-reconciliation boundary after an unknown TTS create", async (t) => {
  const { prisma, message } = prismaFixture();
  message.syncErrorCode = ZAAD_ERROR_CODES.zoomResultUnknown;
  let creates = 0;
  stubZoom(t, {
    createTtsAsset: async () => {
      creates += 1;
      return { assetId: "duplicate-asset", assetItemId: "duplicate-item" };
    },
  });

  const result = await updateZaadMessage(prisma, "actor-user", message.id, {
    name: "updated synthetic message",
    body: "updated synthetic body",
    languageCode: "ja-JP",
    voiceId: "Tomoko",
    revision: message.revision,
  });

  assert.equal(creates, 0);
  assert.equal(result.revision, 4);
  assert.equal(result.syncStatus, "SYNC_FAILED");
  assert.equal(result.syncErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  assert.equal(result.zoomAssetId, null);
  assert.equal(result.zoomAssetItemId, null);
});

test("message sync persists SYNCED and both Zoom asset IDs after a confirmed TTS create", async (t) => {
  const { prisma, audits, message } = prismaFixture();
  stubZoom(t, {
    createTtsAsset: async (input) => {
      assert.deepEqual(input, {
        name: message.name,
        body: message.body,
        languageCode: "ja-JP",
        voiceId: "Tomoko",
      });
      return { assetId: "asset-created", assetItemId: "asset-item-created" };
    },
  });

  const result = await retryZaadMessage(prisma, "actor-user", message.id, message.revision);

  assert.equal(result.syncStatus, "SYNCED");
  assert.equal(result.syncErrorCode, null);
  assert.equal(result.zoomAssetId, "asset-created");
  assert.equal(result.zoomAssetItemId, "asset-item-created");
  assert.ok(message.syncedAt instanceof Date);
  assert.equal(audits[0]?.action, "SYNC_RETRY");
  assert.equal(audits[0]?.result, "SUCCESS");
});

test("message sync updates an existing Zoom TTS asset instead of creating a replacement", async (t) => {
  const { prisma, message } = prismaFixture();
  message.zoomAssetId = "asset-existing";
  message.zoomAssetItemId = "asset-item-existing";
  let creates = 0;
  stubZoom(t, {
    createTtsAsset: async () => {
      creates += 1;
      return { assetId: "unexpected", assetItemId: "unexpected" };
    },
    updateTtsAsset: async (assetId, assetItemId, input) => {
      assert.equal(assetId, "asset-existing");
      assert.equal(assetItemId, "asset-item-existing");
      assert.equal(input.body, message.body);
      return { assetId, assetItemId };
    },
  });

  const result = await retryZaadMessage(prisma, "actor-user", message.id, message.revision);

  assert.equal(creates, 0);
  assert.equal(result.syncStatus, "SYNCED");
  assert.equal(result.zoomAssetId, "asset-existing");
  assert.equal(result.zoomAssetItemId, "asset-item-existing");
});

test("message deletion removes the exact Zoom asset before the local record", async (t) => {
  const { prisma, audits, events, message, isMessageDeleted } = prismaFixture();
  message.zoomAssetId = "asset-existing";
  message.zoomAssetItemId = "asset-item-existing";
  stubZoom(t, {
    deleteTtsAsset: async (assetId) => {
      assert.equal(assetId, "asset-existing");
      events.push("zoom-delete");
    },
  });

  assert.deepEqual(await deleteZaadMessage(prisma, "actor-user", message.id, message.revision), { deleted: true });

  assert.deepEqual(events, ["zoom-delete", "local-delete"]);
  assert.equal(isMessageDeleted(), true);
  assert.equal(audits[0]?.action, "DELETE");
  assert.equal(audits[0]?.result, "SUCCESS");
  assertAuditSafe(audits, [message.id, message.name, message.body, "asset-existing"]);
});

test("message deletion preserves the local record when the Zoom delete is uncertain", async (t) => {
  const { prisma, audits, events, message, isMessageDeleted } = prismaFixture();
  message.zoomAssetId = "asset-existing";
  message.zoomAssetItemId = "asset-item-existing";
  stubZoom(t, {
    deleteTtsAsset: async () => {
      events.push("zoom-delete");
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
    },
  });

  await assert.rejects(
    deleteZaadMessage(prisma, "actor-user", message.id, message.revision),
    (error) => assertResourceError(error, ZAAD_ERROR_CODES.zoomResultUnknown, true),
  );

  assert.deepEqual(events, ["zoom-delete"]);
  assert.equal(isMessageDeleted(), false);
  assert.equal(audits[0]?.result, "RESULT_UNKNOWN");
  assert.equal(audits[0]?.stableErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  assertAuditSafe(audits, [message.id, message.name, message.body, "asset-existing"]);
});
