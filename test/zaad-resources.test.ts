import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  createZaadContactList,
  deleteZaadContactList,
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
import { DEFAULT_TENANT_KEY } from "../lib/tenants";

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
  const prisma = {
    zaadAdminAudit: {
      create: async ({ data }: { data: AuditRecord }) => {
        audits.push(data);
        return { id: `audit-${audits.length}`, ...data };
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
  return { prisma: prisma as unknown as PrismaClient, audits, events };
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
    createZaadContactList(prisma, DEFAULT_TENANT_KEY, "actor-user", {
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
    updateZaadContactList(prisma, DEFAULT_TENANT_KEY, "actor-user", "contact-list-raw-id", {
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
    updateZaadContactList(prisma, DEFAULT_TENANT_KEY, "actor-user", "contact-list-raw-id", {
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
    deleteZaadContactList(prisma, DEFAULT_TENANT_KEY, "actor-user", "contact-list-raw-id"),
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
    deleteZaadContactList(prisma, DEFAULT_TENANT_KEY, "actor-user", "contact-list-raw-id"),
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
    updateZaadRegistrationSetting(prisma, DEFAULT_TENANT_KEY, "actor-user", {
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
    updateZaadCampaignStatus(prisma, DEFAULT_TENANT_KEY, "actor-user", "campaign-raw-id", {
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
    updateZaadCampaignStatus(prisma, DEFAULT_TENANT_KEY, "actor-user", "campaign-raw-id", {
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
    updateZaadCampaignStatus(prisma, DEFAULT_TENANT_KEY, "actor-user", "campaign-raw-id", {
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
