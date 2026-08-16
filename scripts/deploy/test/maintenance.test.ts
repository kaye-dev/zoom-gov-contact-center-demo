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

test("503 public smoke requires noindex and preserves search endpoints and exclusions", async () => {
  const baseUrl = new URL("https://candidate.vercel.app");
  const canonicalOrigin = new URL("https://demo.example.test");
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
        return protectedResponse(url, `<html>${ROBOTS_META}maintenance</html>`, {
          status: 503,
          headers: {
            "cache-control": "private, no-cache, no-store, max-age=0",
            "content-type": "text/html; charset=utf-8",
            "retry-after": retryAfter,
          },
        });
      }
      if (url.pathname === "/login") {
        return protectedResponse(url, `<html>${ROBOTS_META}login</html>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.pathname === "/robots.txt") {
        return protectedResponse(
          url,
          `User-agent: *\nAllow: /\nSitemap: ${canonicalOrigin.origin}/sitemap.xml\n`,
          {
            status: 200,
            headers: { "content-type": "text/plain" },
          },
        );
      }
      if (url.pathname === "/sitemap.xml") {
        return protectedResponse(url, sitemapXml(canonicalOrigin), {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      if (url.pathname === "/news/news-default-item.png") {
        return protectedResponse(url, "png", {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.pathname === "/docs/privacy-policy.md") {
        return protectedResponse(url, "# プライバシーポリシー", {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      }
      throw new Error(`Unexpected smoke path: ${url.pathname}`);
    },
    { canonicalOrigin },
  );

  assert.deepEqual(checks, [
    "GET /",
    "GET /docs/privacy-policy",
    "GET /life/frequently-asked-questions",
    "search protection: login/robots/sitemap/static/raw Markdown",
  ]);
});

test("503 public smoke requires a robots noindex, nofollow meta", async () => {
  await assert.rejects(
    verifyPublicSiteSmoke(
      new URL("https://candidate.vercel.app"),
      { environment: "PREVIEW", status: 503 },
      async (input) => {
        const url = new URL(String(input));
        return protectedResponse(url, "<html>maintenance</html>", {
          status: 503,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/html",
          },
        });
      },
    ),
    /did not contain a robots noindex, nofollow meta tag/,
  );
});

test("503 public smoke rejects a platform-only X-Robots-Tag noindex", async () => {
  await assert.rejects(
    verifyPublicSiteSmoke(
      new URL("https://candidate.vercel.app"),
      { environment: "PREVIEW", status: 503 },
      async (input) => {
        const url = new URL(String(input));
        return response(url, `<html>${ROBOTS_META}maintenance</html>`, {
          status: 503,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/html",
            "x-robots-tag": "noindex",
          },
        });
      },
    ),
    /did not return X-Robots-Tag: noindex, nofollow/,
  );
});

test("public smoke rejects excluded sitemap locations", async () => {
  const baseUrl = new URL("https://candidate.vercel.app");
  const canonicalOrigin = new URL("https://demo.example.test");
  await assert.rejects(
    verifyPublicSiteSmoke(
      baseUrl,
      { environment: "PREVIEW", status: 503 },
      protectedPublicSearchRequest(baseUrl, canonicalOrigin, ["/admin/users"]),
      { canonicalOrigin },
    ),
    /contained an excluded path: \/admin\/users/,
  );
});

test("public smoke rejects a truncated sitemap document", async () => {
  const baseUrl = new URL("https://candidate.vercel.app");
  const canonicalOrigin = new URL("https://demo.example.test");
  const validRequest = protectedPublicSearchRequest(
    baseUrl,
    canonicalOrigin,
    [],
  );
  await assert.rejects(
    verifyPublicSiteSmoke(
      baseUrl,
      { environment: "PREVIEW", status: 503 },
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/sitemap.xml") {
          return protectedResponse(
            url,
            sitemapXml(canonicalOrigin).replace(/<\/urlset>$/u, ""),
            { status: 200, headers: { "content-type": "application/xml" } },
          );
        }
        return validRequest(input);
      },
      { canonicalOrigin },
    ),
    /not a complete sitemap XML document/,
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
    if (url.pathname === "/sitemap.xml") {
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
    "/sitemap.xml",
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

const ROBOTS_META = '<meta name="robots" content="noindex, nofollow">';

function protectedResponse(
  url: URL,
  body: BodyInit | null,
  init: ResponseInit,
): Response {
  const headers = new Headers(init.headers);
  headers.set("x-robots-tag", "noindex, nofollow");
  return response(url, body, { ...init, headers });
}

function sitemapXml(origin: URL, additionalPaths: string[] = []): string {
  const requiredPaths = [
    "/",
    "/life",
    "/life/trash-recycling",
    "/life/trash-recycling/sorting-and-collection",
    "/news/assembly-session-june-2026",
    "/life/frequently-asked-questions/administrative-service-center/location-and-access",
    "/docs/privacy-policy",
    ...additionalPaths,
  ];
  const paths = [
    ...requiredPaths,
    ...Array.from(
      { length: 275 - requiredPaths.length },
      (_, index) => `/life/maintenance-smoke-${index}`,
    ),
  ];
  const urls = paths
    .map((path) => `<url><loc>${new URL(path, origin).href}</loc></url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function protectedPublicSearchRequest(
  baseUrl: URL,
  canonicalOrigin: URL,
  additionalSitemapPaths: string[],
) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    if (
      [
        "/",
        "/docs/privacy-policy",
        "/life/frequently-asked-questions",
      ].includes(url.pathname)
    ) {
      return protectedResponse(url, `<html>${ROBOTS_META}maintenance</html>`, {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html",
        },
      });
    }
    if (url.pathname === "/login") {
      return protectedResponse(url, `<html>${ROBOTS_META}login</html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.pathname === "/robots.txt") {
      return protectedResponse(
        url,
        `User-agent: *\nAllow: /\nSitemap: ${canonicalOrigin.origin}/sitemap.xml\n`,
        { status: 200, headers: { "content-type": "text/plain" } },
      );
    }
    if (url.pathname === "/sitemap.xml") {
      return protectedResponse(
        url,
        sitemapXml(canonicalOrigin, additionalSitemapPaths),
        { status: 200, headers: { "content-type": "application/xml" } },
      );
    }
    if (url.pathname === "/news/news-default-item.png") {
      return protectedResponse(url, "png", {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    if (url.pathname === "/docs/privacy-policy.md") {
      return protectedResponse(url, "# プライバシーポリシー", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      });
    }
    throw new Error(
      `Unexpected smoke path for ${baseUrl.origin}: ${url.pathname}`,
    );
  };
}
