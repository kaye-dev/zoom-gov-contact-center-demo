import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_EFFECTIVE_STATE_TIMER_DELAY_MS,
  createMaintenanceEffectiveRefreshPlan,
  createMaintenanceUpdateRequest,
  getScheduleFieldErrors,
  isMaintenanceSettingsConflict,
} from "../app/admin/maintenance-settings/MaintenanceSettingsForm";
import {
  dictionaries,
  locales,
} from "../app/i18n/dictionaries";

test("maintenance update request includes the revision and exact wire keys", () => {
  const request = createMaintenanceUpdateRequest({
    mode: "SCHEDULED",
    scheduledStartAtJst: "2026-08-17T09:00",
    scheduledEndAtJst: "2026-08-17T10:00",
    savedScheduledStartAtJst: "2026-08-16T09:00",
    savedScheduledEndAtJst: "2026-08-16T10:00",
    expectedRevision: 7,
  });

  assert.deepEqual(Object.keys(request).sort(), [
    "expectedRevision",
    "mode",
    "scheduledEndAtJst",
    "scheduledStartAtJst",
  ]);
  assert.deepEqual(request, {
    mode: "SCHEDULED",
    scheduledStartAtJst: "2026-08-17T09:00",
    scheduledEndAtJst: "2026-08-17T10:00",
    expectedRevision: 7,
  });
});

test("manual maintenance modes keep the last saved schedule pair", () => {
  const request = createMaintenanceUpdateRequest({
    mode: "DISABLED",
    scheduledStartAtJst: "2026-08-17T09:00",
    scheduledEndAtJst: "2026-08-17T10:00",
    savedScheduledStartAtJst: "2026-08-16T09:00",
    savedScheduledEndAtJst: "2026-08-16T10:00",
    expectedRevision: 8,
  });

  assert.deepEqual(request, {
    mode: "DISABLED",
    scheduledStartAtJst: "2026-08-16T09:00",
    scheduledEndAtJst: "2026-08-16T10:00",
    expectedRevision: 8,
  });
});

test("only the maintenance conflict response selects the conflict alert", () => {
  assert.equal(
    isMaintenanceSettingsConflict(409, "MAINTENANCE_SETTINGS_CONFLICT"),
    true,
  );
  assert.equal(
    isMaintenanceSettingsConflict(400, "MAINTENANCE_SETTINGS_CONFLICT"),
    false,
  );
  assert.equal(isMaintenanceSettingsConflict(409, "INVALID_REQUEST"), false);
});

test("saved scheduled config refreshes at both effective-state boundaries", () => {
  const config = {
    version: 1 as const,
    mode: "SCHEDULED" as const,
    scheduledStartAt: "2026-08-17T00:00:00.000Z",
    scheduledEndAt: "2026-08-17T01:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
  };

  const pending = createMaintenanceEffectiveRefreshPlan(
    config,
    new Date("2026-08-16T23:59:59.000Z"),
  );
  assert.equal(pending.effective.reason, "SCHEDULED_PENDING");
  assert.equal(pending.refreshDelayMs, 1_000);

  const active = createMaintenanceEffectiveRefreshPlan(
    config,
    new Date("2026-08-17T00:00:00.000Z"),
  );
  assert.equal(active.effective.reason, "SCHEDULED_ACTIVE");
  assert.equal(active.refreshDelayMs, 60 * 60 * 1_000);

  const ended = createMaintenanceEffectiveRefreshPlan(
    config,
    new Date("2026-08-17T01:00:00.000Z"),
  );
  assert.equal(ended.effective.reason, "SCHEDULED_ENDED");
  assert.equal(ended.refreshDelayMs, null);
});

test("manual effective state has no boundary and long timers are clamped", () => {
  const savedConfig = {
    version: 1 as const,
    mode: "DISABLED" as const,
    scheduledStartAt: null,
    scheduledEndAt: null,
    updatedAt: "2026-08-16T00:00:00.000Z",
  };
  const manual = createMaintenanceEffectiveRefreshPlan(
    savedConfig,
    new Date("2026-08-16T00:00:00.000Z"),
  );
  assert.equal(manual.effective.reason, "DISABLED");
  assert.equal(manual.refreshDelayMs, null);

  const farFuture = createMaintenanceEffectiveRefreshPlan(
    {
      ...savedConfig,
      mode: "SCHEDULED",
      scheduledStartAt: "2027-08-17T00:00:00.000Z",
      scheduledEndAt: "2027-08-17T01:00:00.000Z",
    },
    new Date("2026-08-16T00:00:00.000Z"),
  );
  assert.equal(farFuture.effective.reason, "SCHEDULED_PENDING");
  assert.equal(
    farFuture.refreshDelayMs,
    MAX_EFFECTIVE_STATE_TIMER_DELAY_MS,
  );
});

test("schedule validation marks and describes only the affected fields", () => {
  assert.deepEqual(
    getScheduleFieldErrors({
      error: "required",
      scheduledStartAtJst: "",
      scheduledEndAtJst: "2026-08-17T10:00",
    }),
    { start: true, end: false },
  );
  assert.deepEqual(
    getScheduleFieldErrors({
      error: "required",
      scheduledStartAtJst: "",
      scheduledEndAtJst: "",
    }),
    { start: true, end: true },
  );
  for (const error of ["order", "endFuture"] as const) {
    assert.deepEqual(
      getScheduleFieldErrors({
        error,
        scheduledStartAtJst: "2026-08-17T09:00",
        scheduledEndAtJst: "2026-08-17T08:00",
      }),
      { start: false, end: true },
    );
  }

  const source = readFileSync(
    new URL(
      "../app/admin/maintenance-settings/MaintenanceSettingsForm.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /<form onSubmit=\{submit\} noValidate/);
  assert.match(source, /aria-invalid=\{scheduleFieldErrors\.start\}/);
  assert.match(source, /aria-invalid=\{scheduleFieldErrors\.end\}/);
  assert.equal(
    source.match(/maintenance-settings-feedback/g)?.length,
    3,
  );
});

test("all locales explain conflicts and next-network-request propagation", () => {
  for (const locale of locales) {
    const copy = dictionaries[locale].admin.maintenanceManagement;
    assert.ok(copy.conflictError.length > 0, locale);
    assert.ok(copy.propagationNote.length > 0, locale);
    assert.doesNotMatch(copy.propagationNote, /10|秒|seconds?/i, locale);
  }
});

test("maintenance API passes Prisma, maps conflicts, and returns revision", () => {
  const source = readFileSync(
    new URL("../app/api/[[...route]]/route.ts", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf('app.put("/admin/maintenance-settings"'),
    source.indexOf('app.post("/account/change-password"'),
  );

  assert.match(handler, /const prisma = c\.get\("prisma"\)/);
  assert.match(handler, /saveMaintenanceSettings[\s\S]*\bprisma\b/);
  assert.match(
    handler,
    /result\.code === MAINTENANCE_SETTINGS_CONFLICT_CODE \? 409 : 400/,
  );
  assert.match(handler, /revision: result\.snapshot\.revision/);
  assert.doesNotMatch(handler, /Edge Config/);
});
