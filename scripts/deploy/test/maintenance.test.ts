import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertMaintenanceConstraints,
  createMaintenancePublicExpectation,
  parseMaintenanceSettingRows,
  verifyMaintenanceSettingsDatabase,
  type MaintenanceDatabaseClient,
  type MaintenanceSettingsSnapshot,
} from "../lib/maintenance";
import {
  capturePublicSiteBaseline,
  resolvePublicSiteBaselineAt,
  verifyPublicSiteSmoke,
} from "../lib/smoke";

const disabled = {
  version: 1,
  mode: "DISABLED",
  scheduledStartAt: null,
  scheduledEndAt: null,
  revision: 1,
  updatedAt: "2026-08-11T00:00:00.000Z",
} as const;

const rows: Array<Record<string, unknown>> = [
  { environment: "PRODUCTION", ...disabled },
  {
    environment: "PREVIEW",
    version: 1,
    mode: "SCHEDULED",
    scheduledStartAt: "2026-08-11T01:00:00.000Z",
    scheduledEndAt: "2026-08-11T03:00:00.000Z",
    revision: 2,
    updatedAt: "2026-08-11T00:00:00.000Z",
  },
  {
    environment: "DEVELOPMENT",
    version: 1,
    mode: "ENABLED",
    scheduledStartAt: null,
    scheduledEndAt: null,
    revision: 3,
    updatedAt: "2026-08-11T00:00:00.000Z",
  },
];

const snapshot: MaintenanceSettingsSnapshot = {
  PRODUCTION: rows[0] as MaintenanceSettingsSnapshot["PRODUCTION"],
  PREVIEW: rows[1] as MaintenanceSettingsSnapshot["PREVIEW"],
  DEVELOPMENT: rows[2] as MaintenanceSettingsSnapshot["DEVELOPMENT"],
};

const constraints = [
  {
    name: "site_maintenance_settings_version_check",
    definition: 'CHECK (("version" = 1))',
  },
  {
    name: "site_maintenance_settings_revision_check",
    definition: 'CHECK (("revision" > 0))',
  },
  {
    name: "site_maintenance_settings_schedule_pair_check",
    definition:
      'CHECK ((("scheduledStartAt" IS NULL) = ("scheduledEndAt" IS NULL)))',
  },
  {
    name: "site_maintenance_settings_schedule_order_check",
    definition:
      'CHECK ((("scheduledStartAt" IS NULL) OR ("scheduledStartAt" < "scheduledEndAt")))',
  },
  {
    name: "site_maintenance_settings_scheduled_mode_check",
    definition:
      'CHECK ((("mode" <> \'SCHEDULED\'::"MaintenanceMode") OR (("scheduledStartAt" IS NOT NULL) AND ("scheduledEndAt" IS NOT NULL))))',
  },
];

test("all three database rows use the exact versioned value shape", () => {
  assert.deepEqual(parseMaintenanceSettingRows(rows), snapshot);

  assert.throws(
    () => parseMaintenanceSettingRows(rows.slice(0, 2)),
    /exactly three environment rows/,
  );

  const duplicate = structuredClone(rows);
  duplicate[2]!.environment = "PREVIEW";
  assert.throws(
    () => parseMaintenanceSettingRows(duplicate),
    /PREVIEW.*invalid/,
  );

  const extraField = structuredClone(rows);
  extraField[0]!.unexpected = true;
  assert.throws(
    () => parseMaintenanceSettingRows(extraField),
    /PRODUCTION.*invalid/,
  );

  const invalidVersion = structuredClone(rows);
  invalidVersion[0]!.version = 2;
  assert.throws(
    () => parseMaintenanceSettingRows(invalidVersion),
    /PRODUCTION.*invalid/,
  );

  const invalidRevision = structuredClone(rows);
  invalidRevision[0]!.revision = 0;
  assert.throws(
    () => parseMaintenanceSettingRows(invalidRevision),
    /PRODUCTION.*invalid/,
  );

  const invalidSchedule = structuredClone(rows);
  invalidSchedule[1]!.scheduledEndAt = "2026-08-11T00:30:00.000Z";
  assert.throws(
    () => parseMaintenanceSettingRows(invalidSchedule),
    /PREVIEW.*invalid/,
  );

  const retainedSchedule = structuredClone(rows);
  retainedSchedule[0]!.scheduledStartAt = "2026-08-12T01:00:00.000Z";
  retainedSchedule[0]!.scheduledEndAt = "2026-08-12T03:00:00.000Z";
  assert.equal(
    parseMaintenanceSettingRows(retainedSchedule).PRODUCTION.mode,
    "DISABLED",
  );

  const partialRetainedSchedule = structuredClone(rows);
  partialRetainedSchedule[2]!.scheduledStartAt =
    "2026-08-12T01:00:00.000Z";
  assert.throws(
    () => parseMaintenanceSettingRows(partialRetainedSchedule),
    /DEVELOPMENT.*invalid/,
  );

  const impossibleTimestamp = structuredClone(rows);
  impossibleTimestamp[0]!.updatedAt = "2026-02-31T00:00:00.000Z";
  assert.throws(
    () => parseMaintenanceSettingRows(impossibleTimestamp),
    /PRODUCTION.*invalid/,
  );
});

test("database constraint verification requires the exact five invariants", () => {
  assert.doesNotThrow(() => assertMaintenanceConstraints(constraints));
  assert.throws(
    () => assertMaintenanceConstraints(constraints.slice(0, 4)),
    /incomplete or unexpected/,
  );
  assert.throws(
    () =>
      assertMaintenanceConstraints([
        ...constraints.slice(0, 4),
        {
          ...constraints[4]!,
          definition: "CHECK (true)",
        },
      ]),
    /scheduled_mode_check.*invalid/,
  );
});

test("database verification reads constraints and three rows in one read-only transaction", async () => {
  const queries: string[] = [];
  let ended = false;
  const result = await verifyMaintenanceSettingsDatabase(
    "postgresql://synthetic.invalid/database",
    () =>
      ({
        connect: async () => undefined,
        query: async <T extends Record<string, unknown>>(sql: string) => {
          queries.push(sql);
          const resultRows = sql.includes("pg_catalog.pg_constraint")
            ? constraints
            : sql.includes('FROM public."site_maintenance_settings"')
              ? rows
              : [];
          return { rows: resultRows as T[] };
        },
        end: async () => {
          ended = true;
        },
      }) satisfies MaintenanceDatabaseClient,
  );

  assert.deepEqual(result, snapshot);
  assert.match(queries[0]!, /REPEATABLE READ READ ONLY/);
  assert.match(queries[1]!, /pg_catalog\.pg_constraint/);
  assert.match(queries[2]!, /site_maintenance_settings/);
  assert.equal(queries[3]!.trim(), "ROLLBACK");
  assert.equal(ended, true);
});

test("database verification fails closed without exposing connection errors", async () => {
  const secret = "synthetic-database-password";
  await assert.rejects(
    verifyMaintenanceSettingsDatabase(
      `postgresql://user:${secret}@example.invalid/database`,
      () =>
        ({
          connect: async () => {
            throw new Error(`connection failed for ${secret}`);
          },
          query: async <T extends Record<string, unknown>>() => ({
            rows: [] as T[],
          }),
          end: async () => undefined,
        }) satisfies MaintenanceDatabaseClient,
    ),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal(
        (error as Error).message,
        "Maintenance settings database verification failed.",
      );
      assert.doesNotMatch((error as Error).message, new RegExp(secret));
      return true;
    },
  );
});

test("maintenance expectation resolves enabled and half-open schedules", () => {
  assert.deepEqual(
    createMaintenancePublicExpectation(
      snapshot,
      "PRODUCTION",
      new Date("2026-08-11T02:00:00.000Z"),
    ),
    { environment: "PRODUCTION", status: 200 },
  );
  assert.deepEqual(
    createMaintenancePublicExpectation(
      snapshot,
      "PREVIEW",
      new Date("2026-08-11T02:00:00.000Z"),
    ),
    {
      environment: "PREVIEW",
      status: 503,
      retryAfter: "Tue, 11 Aug 2026 03:00:00 GMT",
    },
  );
  assert.equal(
    createMaintenancePublicExpectation(
      snapshot,
      "PREVIEW",
      new Date("2026-08-11T03:00:00.000Z"),
    ).status,
    200,
  );
  assert.deepEqual(
    createMaintenancePublicExpectation(snapshot, "DEVELOPMENT"),
    { environment: "DEVELOPMENT", status: 503 },
  );
});

test("503 public smoke preserves login, static assets, and raw Markdown", async () => {
  const baseUrl = new URL("https://candidate.vercel.app");
  const retryAfter = "Tue, 11 Aug 2026 03:00:00 GMT";
  const checks = await verifyPublicSiteSmoke(
    baseUrl,
    {
      environment: "PREVIEW",
      status: 503,
      retryAfter,
    },
    async (input) => {
      const url = new URL(String(input));
      if (
        [
          "/",
          "/docs/privacy-policy",
          "/life/frequently-asked-questions",
        ].includes(url.pathname)
      ) {
        return response(url, "<html>maintenance</html>", {
          status: 503,
          headers: {
            "cache-control": "private, no-cache, no-store, max-age=0",
            "content-type": "text/html; charset=utf-8",
            "retry-after": retryAfter,
          },
        });
      }
      if (url.pathname === "/login") {
        return response(url, "<html>login</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.pathname === "/robots.txt") {
        return response(url, "not found", {
          status: 404,
          headers: { "content-type": "text/plain" },
        });
      }
      if (url.pathname === "/news/news-default-item.png") {
        return response(url, "png", {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.pathname === "/docs/privacy-policy.md") {
        return response(url, "# プライバシーポリシー", {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      }
      throw new Error(`Unexpected smoke path: ${url.pathname}`);
    },
  );

  assert.deepEqual(checks, [
    "GET /",
    "GET /docs/privacy-policy",
    "GET /life/frequently-asked-questions",
    "maintenance exclusions: login/robots/static/raw Markdown",
  ]);
});

test("503 public smoke rejects a robots noindex meta", async () => {
  await assert.rejects(
    verifyPublicSiteSmoke(
      new URL("https://candidate.vercel.app"),
      { environment: "PREVIEW", status: 503 },
      async (input) => {
        const url = new URL(String(input));
        return response(
          url,
          '<html><meta name="robots" content="noindex, nofollow"></html>',
          {
            status: 503,
            headers: {
              "cache-control": "no-store",
              "content-type": "text/html",
            },
          },
        );
      },
    ),
    /unexpectedly used noindex/,
  );
});

test("existing canonical baseline captures one verified 503 and Retry-After state", async () => {
  const baseUrl = new URL("https://canonical.example.test");
  const retryAfter = "Tue, 11 Aug 2026 03:00:00 GMT";
  const requestedPaths: string[] = [];
  const baseline = await capturePublicSiteBaseline(baseUrl, async (input) => {
    const url = new URL(String(input));
    requestedPaths.push(url.pathname);
    if (
      [
        "/",
        "/docs/privacy-policy",
        "/life/frequently-asked-questions",
      ].includes(url.pathname)
    ) {
      return response(url, "<html>maintenance</html>", {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html",
          "retry-after": retryAfter,
        },
      });
    }
    if (url.pathname === "/login") {
      return response(url, "<html>login</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/robots.txt") {
      return response(url, "not found", {
        status: 404,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url.pathname === "/news/news-default-item.png") {
      return response(url, "png", {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    if (url.pathname === "/docs/privacy-policy.md") {
      return response(url, "# プライバシーポリシー", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      });
    }
    throw new Error(`Unexpected baseline path: ${url.pathname}`);
  });

  assert.deepEqual(baseline, {
    environment: "PRODUCTION",
    status: 503,
    retryAfter,
  });
  assert.deepEqual(
    resolvePublicSiteBaselineAt(
      baseline,
      new Date("2026-08-11T03:00:00.000Z"),
    ),
    { environment: "PRODUCTION", status: 200 },
  );
  assert.deepEqual(requestedPaths, [
    "/",
    "/docs/privacy-policy",
    "/life/frequently-asked-questions",
    "/login",
    "/robots.txt",
    "/news/news-default-item.png",
    "/docs/privacy-policy.md",
  ]);
});

test("existing canonical baseline rejects inconsistent public status", async () => {
  await assert.rejects(
    capturePublicSiteBaseline(
      new URL("https://canonical.example.test"),
      async (input) => {
        const url = new URL(String(input));
        return response(url, "<html>public</html>", {
          status: url.pathname === "/" ? 200 : 503,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/html",
          },
        });
      },
    ),
    /expected 200 for PRODUCTION/,
  );
});

function response(url: URL, body: BodyInit | null, init: ResponseInit): Response {
  const value = new Response(body, init);
  Object.defineProperty(value, "url", { value: url.href });
  return value;
}
