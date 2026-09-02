import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/client";
import {
  createZaadResident,
  deleteZaadResident,
  importZaadResidents,
  retryZaadResidentSync,
  updateZaadResident,
  ZaadResidentError,
} from "../lib/server/zaad/residents";
import {
  clearZaadZoomTokenCache,
  ZaadZoomClient,
  ZaadZoomError,
  type ZoomContactDto,
  type ZaadZoomWriteGates,
} from "../lib/server/zaad/zoom-client";
import { ZAAD_ERROR_CODES } from "../lib/zaad/contracts";

type ResidentRow = {
  id: string;
  name: string;
  normalizedEmail: string;
  normalizedPhone: string;
  consentStatus: "CONSENTED" | "NOT_CONSENTED";
  consentVersion: string | null;
  consentedAt: Date | null;
  source: "PUBLIC_FORM" | "ADMIN_FORM" | "ADMIN_CSV";
  registeredByUserId: string | null;
  revision: number;
  zoomContactListId: string | null;
  zoomContactListNameSnapshot: string | null;
  zoomContactId: string | null;
  syncStatus: "NOT_ELIGIBLE" | "NOT_ASSIGNED" | "PENDING" | "SYNCED" | "FAILED";
  syncErrorCode: string | null;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AuditRecord = {
  actorUserId: string | null;
  targetRef: string;
  action: string;
  result: string;
  stableErrorCode: string | null;
};

type ResidentWhere = {
  id?: string;
  revision?: number;
  consentStatus?: ResidentRow["consentStatus"];
  syncStatus?: ResidentRow["syncStatus"];
  syncErrorCode?: string | null;
  zoomContactListId?: string | null;
  zoomContactId?: string | null;
};

type ResidentUpdate = Partial<Omit<ResidentRow, "revision">> & {
  revision?: { increment: number };
};

const FIXED_TIME = new Date("2026-09-01T00:00:00.000Z");

function resident(overrides: Partial<ResidentRow> = {}): ResidentRow {
  return {
    id: "resident-001",
    name: "山田 花子",
    normalizedEmail: "hanako@example.jp",
    normalizedPhone: "+819012345678",
    consentStatus: "CONSENTED",
    consentVersion: "admin-recorded-v1",
    consentedAt: new Date(FIXED_TIME),
    source: "ADMIN_FORM",
    registeredByUserId: "actor-001",
    revision: 1,
    zoomContactListId: "list-001",
    zoomContactListNameSnapshot: "防災連絡先",
    zoomContactId: "contact-001",
    syncStatus: "SYNCED",
    syncErrorCode: null,
    syncedAt: new Date(FIXED_TIME),
    createdAt: new Date(FIXED_TIME),
    updatedAt: new Date(FIXED_TIME),
    ...overrides,
  };
}

function cloneResident(row: ResidentRow): ResidentRow {
  return {
    ...row,
    consentedAt: row.consentedAt ? new Date(row.consentedAt) : null,
    syncedAt: row.syncedAt ? new Date(row.syncedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function prismaFixture(input: {
  rows?: ResidentRow[];
  setting?: { contactListId: string | null; contactListNameSnapshot: string | null };
  failDeleteClaim?: boolean;
} = {}) {
  const rows = new Map((input.rows ?? []).map((row) => [row.id, cloneResident(row)]));
  const audits: AuditRecord[] = [];
  const events: string[] = [];
  const setting = input.setting ?? {
    contactListId: "list-001",
    contactListNameSnapshot: "防災連絡先",
  };
  const prisma = {} as PrismaClient;

  const subscription = {
    create: async ({ data }: { data: Partial<ResidentRow> & Pick<ResidentRow, "id" | "name" | "normalizedEmail" | "normalizedPhone"> }) => {
      if (hasIdentityConflict(rows, data.normalizedEmail, data.normalizedPhone)) throw uniqueConflict();
      const row = resident({
        ...data,
        id: data.id,
        name: data.name,
        normalizedEmail: data.normalizedEmail,
        normalizedPhone: data.normalizedPhone,
        zoomContactId: data.zoomContactId ?? null,
        revision: 1,
        createdAt: new Date(FIXED_TIME),
        updatedAt: new Date(FIXED_TIME),
      });
      rows.set(row.id, row);
      events.push("local-create");
      return { id: row.id };
    },
    createMany: async ({ data }: { data: Array<Partial<ResidentRow> & Pick<ResidentRow, "id" | "name" | "normalizedEmail" | "normalizedPhone">> }) => {
      let count = 0;
      for (const candidate of data) {
        if (hasIdentityConflict(rows, candidate.normalizedEmail, candidate.normalizedPhone)) continue;
        const row = resident({
          ...candidate,
          id: candidate.id,
          name: candidate.name,
          normalizedEmail: candidate.normalizedEmail,
          normalizedPhone: candidate.normalizedPhone,
          zoomContactId: candidate.zoomContactId ?? null,
          revision: 1,
          createdAt: new Date(FIXED_TIME),
          updatedAt: new Date(FIXED_TIME),
        });
        rows.set(row.id, row);
        count += 1;
      }
      events.push("local-create-many");
      return { count };
    },
    findMany: async ({ where, select }: {
      where?: { id?: { in: string[] } };
      select?: Record<string, boolean>;
    }) => {
      const selected = [...rows.values()].filter((row) => !where?.id?.in || where.id.in.includes(row.id));
      return selected.map((row) => {
        const clone = cloneResident(row);
        if (!select) return clone;
        return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [
          key,
          clone[key as keyof ResidentRow],
        ]));
      });
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = rows.get(where.id);
      return row ? cloneResident(row) : null;
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const row = rows.get(where.id);
      if (!row) throw new Error("Resident not found");
      return cloneResident(row);
    },
    updateMany: async ({ where, data }: { where: ResidentWhere; data: ResidentUpdate }) => {
      const row = where.id ? rows.get(where.id) : undefined;
      if (!row || !matchesWhere(row, where)) return { count: 0 };
      if (input.failDeleteClaim && data.revision && data.syncStatus === "PENDING") return { count: 0 };
      const normalizedEmail = data.normalizedEmail ?? row.normalizedEmail;
      const normalizedPhone = data.normalizedPhone ?? row.normalizedPhone;
      if (hasIdentityConflict(rows, normalizedEmail, normalizedPhone, row.id)) throw uniqueConflict();
      for (const [key, value] of Object.entries(data)) {
        if (key === "revision") continue;
        (row as unknown as Record<string, unknown>)[key] = value;
      }
      if (data.revision) row.revision += data.revision.increment;
      row.updatedAt = new Date(FIXED_TIME);
      events.push("local-update");
      return { count: 1 };
    },
    deleteMany: async ({ where }: { where: ResidentWhere }) => {
      const row = where.id ? rows.get(where.id) : undefined;
      if (!row || !matchesWhere(row, where)) return { count: 0 };
      rows.delete(row.id);
      events.push("local-delete");
      return { count: 1 };
    },
  };

  const implementation = {
    disasterRadioSubscription: subscription,
    zaadRegistrationSetting: {
      findUniqueOrThrow: async () => ({ ...setting }),
    },
    zaadAdminAudit: {
      create: async ({ data }: { data: AuditRecord }) => {
        audits.push(data);
        return { id: `audit-${audits.length}`, ...data };
      },
    },
    $transaction: async <T>(run: (transaction: PrismaClient) => Promise<T>) => run(prisma),
  };
  Object.assign(prisma, implementation);

  return {
    prisma,
    audits,
    events,
    get: (id: string) => {
      const row = rows.get(id);
      return row ? cloneResident(row) : null;
    },
    mutate: (id: string, mutate: (row: ResidentRow) => void) => {
      const row = rows.get(id);
      if (!row) throw new Error("Resident not found");
      mutate(row);
    },
    all: () => [...rows.values()].map(cloneResident),
  };
}

function matchesWhere(row: ResidentRow, where: ResidentWhere) {
  for (const key of [
    "id",
    "revision",
    "consentStatus",
    "syncStatus",
    "syncErrorCode",
    "zoomContactListId",
    "zoomContactId",
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(where, key) && row[key] !== where[key]) return false;
  }
  return true;
}

function hasIdentityConflict(
  rows: Map<string, ResidentRow>,
  normalizedEmail: string,
  normalizedPhone: string,
  excludedId?: string,
) {
  return [...rows.values()].some((row) =>
    row.id !== excludedId &&
    row.normalizedEmail === normalizedEmail &&
    row.normalizedPhone === normalizedPhone,
  );
}

function uniqueConflict() {
  return Object.assign(new Error("Synthetic unique conflict"), { code: "P2002" });
}

async function withZoom<T>(zoom: Partial<ZaadZoomClient>, run: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(ZaadZoomClient, "fromDatabase");
  Object.defineProperty(ZaadZoomClient, "fromDatabase", {
    configurable: true,
    value: async () => zoom as ZaadZoomClient,
  });
  try {
    return await run();
  } finally {
    if (original) Object.defineProperty(ZaadZoomClient, "fromDatabase", original);
  }
}

function assertResidentError(error: unknown, code: string, status: number) {
  assert.ok(error instanceof ZaadResidentError);
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  return true;
}

type ZaadZoomClientConstructor = new (
  credentials: { accountId: string; clientId: string; clientSecret: string },
  fetchImpl: typeof fetch,
  apiBase: string,
  tokenUrl: string,
  writeGates: ZaadZoomWriteGates,
) => ZaadZoomClient;

test("resident create normalizes identity and uses the Zoom outbound-campaign contact contract", async () => {
  clearZaadZoomTokenCache();
  const fixture = prismaFixture();
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") {
      return Response.json({ access_token: "synthetic-token", expires_in: 3600 });
    }
    const method = init?.method ?? "GET";
    requests.push({
      url,
      method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : null,
    });
    return Response.json({ contact_id: "contact-created" }, { status: 201 });
  };
  const Constructor = ZaadZoomClient as unknown as ZaadZoomClientConstructor;
  const zoom = new Constructor(
    { accountId: "account", clientId: "client", clientSecret: "secret" },
    fetchImpl,
    "https://api.zoom.test/v2",
    "https://zoom.test/oauth/token",
    { contact: true, tts: false, campaign: false },
  );

  const dto = await withZoom(zoom, () => createZaadResident(fixture.prisma, "actor-001", {
    name: "  山田　花子  ",
    email: " HANAKO.YAMADA@EXAMPLE.JP ",
    phone: "090-1234-5678",
    consentStatus: "CONSENTED",
  }));

  assert.equal(dto.name, "山田 花子");
  assert.equal(dto.email, "hanako.yamada@example.jp");
  assert.equal(dto.phone, "+819012345678");
  assert.equal(dto.syncStatus, "SYNCED");
  assert.deepEqual(requests, [{
    url: new URL("https://api.zoom.test/v2/contact_center/outbound_campaign/contact_lists/list-001/contacts"),
    method: "POST",
    body: {
      contact_display_name: "山田 花子",
      contact_phones: [{ contact_phone_number: "+819012345678", contact_phone_type: "Main" }],
      contact_emails: ["hanako.yamada@example.jp"],
    },
  }]);
  assert.equal(fixture.get(dto.id)?.zoomContactId, "contact-created");
  clearZaadZoomTokenCache();
});

test("consent and nullable registration setting map to NOT_ELIGIBLE and NOT_ASSIGNED without Zoom writes", async () => {
  let zoomCalls = 0;
  const zoom = {
    createContact: async () => {
      zoomCalls += 1;
      return "unexpected";
    },
  };
  const unassigned = prismaFixture({
    setting: { contactListId: null, contactListNameSnapshot: null },
  });
  const notConsented = prismaFixture();

  const [unassignedDto, notConsentedDto] = await withZoom(zoom, async () => [
    await createZaadResident(unassigned.prisma, "actor-001", {
      name: "佐藤 健",
      email: "ken@example.jp",
      phone: "080-2345-6789",
      consentStatus: "CONSENTED",
    }),
    await createZaadResident(notConsented.prisma, "actor-001", {
      name: "鈴木 美咲",
      email: "misaki@example.jp",
      phone: "070-3456-7890",
      consentStatus: "NOT_CONSENTED",
    }),
  ]);

  assert.equal(unassignedDto.syncStatus, "NOT_ASSIGNED");
  assert.equal(unassignedDto.contactList, null);
  assert.equal(notConsentedDto.syncStatus, "NOT_ELIGIBLE");
  assert.equal(notConsentedDto.contactList, null);
  assert.equal(zoomCalls, 0);
});

test("resident update rejects unknown fields, stale revisions, and normalized identity conflicts", async () => {
  const first = resident({
    consentStatus: "NOT_CONSENTED",
    consentVersion: null,
    consentedAt: null,
    zoomContactListId: null,
    zoomContactListNameSnapshot: null,
    zoomContactId: null,
    syncStatus: "NOT_ELIGIBLE",
    syncedAt: null,
  });
  const second = resident({
    id: "resident-002",
    name: "佐藤 健",
    normalizedEmail: "ken@example.jp",
    normalizedPhone: "+818023456789",
  });
  const fixture = prismaFixture({ rows: [first, second] });

  await assert.rejects(
    updateZaadResident(fixture.prisma, "actor-001", first.id, {
      name: first.name,
      email: first.normalizedEmail,
      phone: first.normalizedPhone,
      consentStatus: first.consentStatus,
      revision: first.revision,
      unexpected: true,
    }),
    (error) => assertResidentError(error, ZAAD_ERROR_CODES.invalidRequest, 400),
  );
  await assert.rejects(
    updateZaadResident(fixture.prisma, "actor-001", first.id, {
      name: first.name,
      email: first.normalizedEmail,
      phone: first.normalizedPhone,
      consentStatus: first.consentStatus,
      revision: first.revision + 1,
    }),
    (error) => assertResidentError(error, ZAAD_ERROR_CODES.residentConflict, 409),
  );
  await assert.rejects(
    updateZaadResident(fixture.prisma, "actor-001", first.id, {
      name: "重複 住民",
      email: " KEN@EXAMPLE.JP ",
      phone: "080-2345-6789",
      consentStatus: "NOT_CONSENTED",
      revision: first.revision,
    }),
    (error) => assertResidentError(error, ZAAD_ERROR_CODES.residentConflict, 409),
  );

  assert.deepEqual(fixture.get(first.id), first);
});

test("resident sync retry enforces revision CAS and blocks RESULT_UNKNOWN while allowing known failures", async () => {
  const base = resident({
    revision: 3,
    zoomContactId: null,
    syncStatus: "FAILED",
    syncErrorCode: ZAAD_ERROR_CODES.zoomUnavailable,
    syncedAt: null,
  });
  const stale = prismaFixture({ rows: [base] });
  let zoomCalls = 0;
  const zoom = {
    createContact: async () => {
      zoomCalls += 1;
      return "contact-retried";
    },
  };

  await withZoom(zoom, async () => {
    await assert.rejects(
      retryZaadResidentSync(stale.prisma, "actor-001", base.id, base.revision - 1),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.residentConflict, 409),
    );
  });
  assert.equal(zoomCalls, 0);
  assert.equal(stale.get(base.id)?.syncStatus, "FAILED");

  const unknown = prismaFixture({
    rows: [resident({
      ...base,
      syncErrorCode: ZAAD_ERROR_CODES.zoomResultUnknown,
    })],
  });
  await withZoom(zoom, async () => {
    await assert.rejects(
      retryZaadResidentSync(unknown.prisma, "actor-001", base.id, base.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.zoomResultUnknown, 409),
    );
  });
  assert.equal(zoomCalls, 0);
  assert.equal(unknown.get(base.id)?.syncErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);

  const known = prismaFixture({ rows: [base] });
  const retried = await withZoom(zoom, () =>
    retryZaadResidentSync(known.prisma, "actor-001", base.id, base.revision));
  assert.equal(zoomCalls, 1);
  assert.equal(retried.syncStatus, "SYNCED");
  assert.equal(known.get(base.id)?.zoomContactId, "contact-retried");
  assert.equal(retried.revision, base.revision + 1);
  assert.deepEqual(known.audits.map(({ action, result, stableErrorCode }) => ({ action, result, stableErrorCode })), [{
    action: "SYNC_RETRY",
    result: "SUCCESS",
    stableErrorCode: null,
  }]);
});

test("concurrent resident sync retry claims once and performs exactly one external write", async () => {
  const base = resident({
    revision: 7,
    zoomContactId: null,
    syncStatus: "FAILED",
    syncErrorCode: ZAAD_ERROR_CODES.zoomUnavailable,
    syncedAt: null,
  });
  const fixture = prismaFixture({ rows: [base] });
  let zoomCalls = 0;
  let releaseWrite!: () => void;
  let signalStarted!: () => void;
  const writeStarted = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const writeReleased = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });

  await withZoom({
    createContact: async () => {
      zoomCalls += 1;
      signalStarted();
      await writeReleased;
      return "contact-concurrent-winner";
    },
  }, async () => {
    const winner = retryZaadResidentSync(fixture.prisma, "actor-001", base.id, base.revision);
    await writeStarted;
    await assert.rejects(
      retryZaadResidentSync(fixture.prisma, "actor-002", base.id, base.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.residentConflict, 409),
    );
    releaseWrite();
    const result = await winner;
    assert.equal(result.revision, base.revision + 1);
    assert.equal(result.syncStatus, "SYNCED");
  });

  assert.equal(zoomCalls, 1);
  assert.equal(fixture.get(base.id)?.zoomContactId, "contact-concurrent-winner");
  assert.equal(fixture.get(base.id)?.syncStatus, "SYNCED");
  assert.equal(fixture.get(base.id)?.syncErrorCode, null);
});

test("consent withdrawal claims the revision before Zoom delete and records failures for operator attention", async () => {
  for (const outcome of ["204", "404"] as const) {
    const current = resident();
    const fixture = prismaFixture({ rows: [current] });
    const zoom = {
      deleteContact: async (listId: string, contactId: string) => {
        fixture.events.push("zoom-delete");
        assert.equal(listId, current.zoomContactListId);
        assert.equal(contactId, current.zoomContactId);
        assert.equal(fixture.get(current.id)?.consentStatus, "CONSENTED");
        if (outcome === "404") throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotFound, 404);
      },
    };

    const dto = await withZoom(zoom, () => updateZaadResident(fixture.prisma, "actor-001", current.id, {
      name: current.name,
      email: current.normalizedEmail,
      phone: current.normalizedPhone,
      consentStatus: "NOT_CONSENTED",
      revision: current.revision,
    }));

    assert.deepEqual(fixture.events.slice(0, 3), ["local-update", "zoom-delete", "local-update"], outcome);
    assert.equal(dto.consentStatus, "NOT_CONSENTED", outcome);
    assert.equal(dto.syncStatus, "NOT_ELIGIBLE", outcome);
    assert.equal(fixture.get(current.id)?.zoomContactId, null, outcome);
    assert.equal(dto.revision, current.revision + 2, outcome);
  }

  const current = resident();
  const failed = prismaFixture({ rows: [current] });
  await withZoom({
    deleteContact: async () => {
      failed.events.push("zoom-delete");
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomScopeRequired, 503);
    },
  }, async () => {
    await assert.rejects(
      updateZaadResident(failed.prisma, "actor-001", current.id, {
        name: current.name,
        email: current.normalizedEmail,
        phone: current.normalizedPhone,
        consentStatus: "NOT_CONSENTED",
        revision: current.revision,
      }),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.zoomScopeRequired, 503),
    );
  });
  assert.deepEqual(failed.events, ["local-update", "zoom-delete", "local-update"]);
  assert.equal(failed.get(current.id)?.revision, current.revision + 1);
  assert.equal(failed.get(current.id)?.syncStatus, "FAILED");
  assert.equal(failed.get(current.id)?.syncErrorCode, ZAAD_ERROR_CODES.zoomScopeRequired);
  assert.deepEqual(failed.audits.slice(-1).map(({ action, result, stableErrorCode }) => ({ action, result, stableErrorCode })), [{
    action: "UPDATE",
    result: "FAILED",
    stableErrorCode: ZAAD_ERROR_CODES.zoomScopeRequired,
  }]);
});

test("resident delete claims the revision before Zoom delete and leaves failures visible", async () => {
  for (const outcome of ["204", "404"] as const) {
    const current = resident();
    const fixture = prismaFixture({ rows: [current] });
    const zoom = {
      deleteContact: async () => {
        fixture.events.push("zoom-delete");
        assert.ok(fixture.get(current.id));
        if (outcome === "404") throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomNotFound, 404);
      },
    };

    assert.deepEqual(
      await withZoom(zoom, () => deleteZaadResident(fixture.prisma, "actor-001", current.id, current.revision)),
      { deleted: true },
      outcome,
    );
    assert.deepEqual(fixture.events.slice(0, 3), ["local-update", "zoom-delete", "local-delete"], outcome);
    assert.equal(fixture.get(current.id), null, outcome);
  }

  const current = resident();
  const failed = prismaFixture({ rows: [current] });
  await withZoom({
    deleteContact: async () => {
      failed.events.push("zoom-delete");
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502);
    },
  }, async () => {
    await assert.rejects(
      deleteZaadResident(failed.prisma, "actor-001", current.id, current.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.zoomUnavailable, 502),
    );
  });
  assert.deepEqual(failed.events, ["local-update", "zoom-delete", "local-update"]);
  assert.equal(failed.get(current.id)?.revision, current.revision + 1);
  assert.equal(failed.get(current.id)?.syncStatus, "FAILED");
  assert.equal(failed.get(current.id)?.syncErrorCode, ZAAD_ERROR_CODES.zoomUnavailable);
  assert.deepEqual(failed.audits.slice(-1).map(({ action, result, stableErrorCode }) => ({ action, result, stableErrorCode })), [{
    action: "DELETE",
    result: "FAILED",
    stableErrorCode: ZAAD_ERROR_CODES.zoomUnavailable,
  }]);
});

test("initial sync result-unknown is PII-safe audited and cannot be retried automatically", async () => {
  const fixture = prismaFixture();
  const dto = await withZoom({
    createContact: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
    },
  }, () => createZaadResident(fixture.prisma, "actor-001", {
    name: "同期 失敗",
    email: "sync-failure@example.jp",
    phone: "090-9999-0001",
    consentStatus: "CONSENTED",
  }));

  assert.equal(dto.syncStatus, "FAILED");
  assert.equal(dto.syncErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  const audit = fixture.audits.at(-1);
  assert.equal(audit?.actorUserId, "actor-001");
  assert.equal(audit?.action, "SYNC_CREATE");
  assert.equal(audit?.result, "RESULT_UNKNOWN");
  assert.equal(audit?.stableErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  assert.notEqual(audit?.targetRef, dto.id);
  await assert.rejects(
    retryZaadResidentSync(fixture.prisma, "actor-001", dto.id, dto.revision),
    (error) => assertResidentError(error, ZAAD_ERROR_CODES.zoomResultUnknown, 409),
  );
});

test("resident contact POST 5xx becomes RESULT_UNKNOWN and blocks a second external write", async () => {
  clearZaadZoomTokenCache();
  const fixture = prismaFixture();
  let apiRequests = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/oauth/token") return Response.json({ access_token: "token", expires_in: 3600 });
    apiRequests += 1;
    return new Response(null, { status: 500 });
  };
  const Constructor = ZaadZoomClient as unknown as ZaadZoomClientConstructor;
  const zoom = new Constructor(
    { accountId: "account", clientId: "client", clientSecret: "secret" },
    fetchImpl,
    "https://api.zoom.test/v2",
    "https://zoom.test/oauth/token",
    { contact: true, tts: false, campaign: false },
  );

  const dto = await withZoom(zoom, () => createZaadResident(fixture.prisma, "actor-001", {
    name: "HTTP 失敗",
    email: "http-failure@example.jp",
    phone: "090-9999-0002",
    consentStatus: "CONSENTED",
  }));
  assert.equal(dto.syncStatus, "FAILED");
  assert.equal(dto.syncErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  await withZoom(zoom, async () => {
    await assert.rejects(
      retryZaadResidentSync(fixture.prisma, "actor-001", dto.id, dto.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.zoomResultUnknown, 409),
    );
  });
  assert.equal(apiRequests, 1);
  clearZaadZoomTokenCache();
});

test("delete claim conflict performs zero external writes and is audited as rejected", async () => {
  const current = resident();
  const fixture = prismaFixture({ rows: [current], failDeleteClaim: true });
  let zoomCalls = 0;
  await withZoom({
    deleteContact: async () => {
      zoomCalls += 1;
    },
  }, async () => {
    await assert.rejects(
      deleteZaadResident(fixture.prisma, "actor-001", current.id, current.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.residentConflict, 409),
    );
  });

  assert.equal(zoomCalls, 0);
  assert.deepEqual(fixture.get(current.id), current);
  assert.deepEqual(fixture.audits.slice(-1).map(({ action, result, stableErrorCode }) => ({ action, result, stableErrorCode })), [{
    action: "DELETE_REMOTE_DELETE_CLAIM",
    result: "REJECTED",
    stableErrorCode: ZAAD_ERROR_CODES.residentConflict,
  }]);
});

test("remote delete success followed by final CAS conflict leaves FAILED needs-attention state", async () => {
  const current = resident();
  const fixture = prismaFixture({ rows: [current] });
  let zoomCalls = 0;
  await withZoom({
    deleteContact: async () => {
      zoomCalls += 1;
      fixture.mutate(current.id, (row) => {
        row.revision += 1;
      });
    },
  }, async () => {
    await assert.rejects(
      deleteZaadResident(fixture.prisma, "actor-001", current.id, current.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.residentConflict, 409),
    );
  });

  assert.equal(zoomCalls, 1);
  assert.equal(fixture.get(current.id)?.syncStatus, "FAILED");
  assert.equal(fixture.get(current.id)?.syncErrorCode, ZAAD_ERROR_CODES.residentConflict);
  assert.equal(fixture.get(current.id)?.zoomContactId, null);
  assert.deepEqual(fixture.audits.slice(-1).map(({ action, result, stableErrorCode }) => ({ action, result, stableErrorCode })), [{
    action: "DELETE",
    result: "FAILED",
    stableErrorCode: ZAAD_ERROR_CODES.residentConflict,
  }]);

  const latest = fixture.get(current.id);
  assert.ok(latest);
  const retryWrites = { create: 0, update: 0, delete: 0 };
  await withZoom({
    createContact: async () => {
      retryWrites.create += 1;
      return "must-not-be-created";
    },
    updateContact: async () => {
      retryWrites.update += 1;
    },
    deleteContact: async () => {
      retryWrites.delete += 1;
    },
  }, async () => {
    await assert.rejects(
      retryZaadResidentSync(fixture.prisma, "actor-001", current.id, latest.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.residentConflict, 409),
    );
  });
  assert.deepEqual(retryWrites, { create: 0, update: 0, delete: 0 });
  assert.equal(zoomCalls, 1);
});

test("final delete CAS conflict does not clear a concurrently replaced contact link", async () => {
  const current = resident();
  const fixture = prismaFixture({ rows: [current] });
  await withZoom({
    deleteContact: async () => {
      fixture.mutate(current.id, (row) => {
        row.revision += 1;
        row.zoomContactId = "contact-concurrent";
      });
    },
  }, async () => {
    await assert.rejects(
      deleteZaadResident(fixture.prisma, "actor-001", current.id, current.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.residentConflict, 409),
    );
  });

  assert.equal(fixture.get(current.id)?.zoomContactId, "contact-concurrent");
  assert.equal(fixture.get(current.id)?.syncStatus, "FAILED");
  assert.equal(fixture.get(current.id)?.syncErrorCode, ZAAD_ERROR_CODES.residentConflict);
});

test("result-unknown remote delete keeps the contact link for operator reconciliation", async () => {
  const current = resident();
  const fixture = prismaFixture({ rows: [current] });
  await withZoom({
    deleteContact: async () => {
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
    },
  }, async () => {
    await assert.rejects(
      deleteZaadResident(fixture.prisma, "actor-001", current.id, current.revision),
      (error) => assertResidentError(error, ZAAD_ERROR_CODES.zoomResultUnknown, 502),
    );
  });

  assert.equal(fixture.get(current.id)?.zoomContactId, current.zoomContactId);
  assert.equal(fixture.get(current.id)?.syncStatus, "FAILED");
  assert.equal(fixture.get(current.id)?.syncErrorCode, ZAAD_ERROR_CODES.zoomResultUnknown);
  assert.equal(fixture.audits.at(-1)?.result, "RESULT_UNKNOWN");
});

test("idempotent delete of a missing resident writes an opaque success audit", async () => {
  const fixture = prismaFixture();
  assert.deepEqual(
    await deleteZaadResident(fixture.prisma, "actor-001", "resident-missing", 1),
    { deleted: true },
  );
  const audit = fixture.audits.at(-1);
  assert.equal(audit?.actorUserId, "actor-001");
  assert.equal(audit?.action, "DELETE");
  assert.equal(audit?.result, "SUCCESS");
  assert.notEqual(audit?.targetRef, "resident-missing");
});

test("CSV sync chunks official batch writes and maps partial failures to each resident", async () => {
  const fixture = prismaFixture();
  const batchSizes: number[] = [];
  const remoteContacts: ZoomContactDto[] = [];
  let listCalls = 0;
  const zoom = {
    listContacts: async () => {
      listCalls += 1;
      return listCalls === 1 ? [] : remoteContacts;
    },
    createContactsBatch: async (_listId: string, contacts: Array<{ name: string; phone: string; email: string }>) => {
      const batchNumber = batchSizes.length;
      batchSizes.push(contacts.length);
      return contacts.map((contact, index) => {
        const failed = batchNumber === 1 && index === 3;
        if (!failed) {
          remoteContacts.push({
            id: `contact-${batchNumber}-${index}`,
            displayName: contact.name,
            phones: [{ type: "Main", number: contact.phone }],
            emails: [contact.email],
          });
        }
        return failed
          ? { success: false as const, code: ZAAD_ERROR_CODES.zoomContactRejected }
          : { success: true as const };
      });
    },
  };
  const rows = Array.from({ length: 205 }, (_, index) => {
    const suffix = String(index).padStart(3, "0");
    return `住民${suffix},resident${suffix}@example.jp,+819000000${suffix},CONSENTED`;
  });
  const csv = new TextEncoder().encode(["name,email,phone,consent_status", ...rows].join("\n"));

  const result = await withZoom(zoom, () => importZaadResidents(fixture.prisma, "actor-001", csv));
  assert.deepEqual(result, { totalRows: 205, createdCount: 205, duplicateCount: 0 });
  assert.deepEqual(batchSizes, [100, 100, 5]);
  assert.equal(listCalls, 2);
  const imported = fixture.all();
  assert.equal(imported.filter(({ syncStatus }) => syncStatus === "SYNCED").length, 204);
  const failed = imported.find(({ normalizedEmail }) => normalizedEmail === "resident103@example.jp");
  assert.equal(failed?.syncStatus, "FAILED");
  assert.equal(failed?.syncErrorCode, ZAAD_ERROR_CODES.zoomContactRejected);
  assert.equal(imported.filter(({ zoomContactId }) => zoomContactId !== null).length, 204);
  const syncAudits = fixture.audits.filter(({ action }) => action === "SYNC_BATCH_CREATE");
  assert.equal(syncAudits.length, 205);
  assert.equal(syncAudits.filter(({ result }) => result === "FAILED").length, 1);
  assert.ok(syncAudits.every(({ actorUserId, targetRef }) => actorUserId === "actor-001" && !targetRef.includes("@")));
});

test("CSV batch result-unknown stops later chunks and marks every remaining row non-retryable", async () => {
  const fixture = prismaFixture();
  let batchCalls = 0;
  const zoom = {
    listContacts: async () => [],
    createContactsBatch: async () => {
      batchCalls += 1;
      throw new ZaadZoomError(ZAAD_ERROR_CODES.zoomUnavailable, 502, true);
    },
  };
  const rows = Array.from({ length: 150 }, (_, index) => {
    const suffix = String(index).padStart(3, "0");
    return `住民${suffix},unknown${suffix}@example.jp,+818000000${suffix},CONSENTED`;
  });
  const csv = new TextEncoder().encode(["name,email,phone,consent_status", ...rows].join("\n"));

  await withZoom(zoom, () => importZaadResidents(fixture.prisma, "actor-001", csv));
  assert.equal(batchCalls, 1);
  assert.equal(fixture.all().filter(({ syncStatus }) => syncStatus === "FAILED").length, 150);
  assert.ok(fixture.all().every(({ syncErrorCode, zoomContactId }) =>
    syncErrorCode === ZAAD_ERROR_CODES.zoomResultUnknown && zoomContactId === null));
  assert.equal(fixture.audits.filter(({ action, result }) =>
    action === "SYNC_BATCH_CREATE" && result === "RESULT_UNKNOWN").length, 150);
});
