import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createMaintenancePublicExpectation,
  parseMaintenanceEdgeConfigItems,
  validateMaintenanceEdgeConfigCredentials,
  verifyMaintenanceEdgeConfig,
  type MaintenanceEdgeConfigSnapshot,
} from "../lib/maintenance";
import { verifyPublicSiteSmoke } from "../lib/smoke";

const disabled = {
  version: 1,
  mode: "DISABLED",
  scheduledStartAt: null,
  scheduledEndAt: null,
  updatedAt: "2026-08-11T00:00:00.000Z",
} as const;

const snapshot: MaintenanceEdgeConfigSnapshot = {
  site_maintenance_production: disabled,
  site_maintenance_preview: {
    version: 1,
    mode: "SCHEDULED",
    scheduledStartAt: "2026-08-11T01:00:00.000Z",
    scheduledEndAt: "2026-08-11T03:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  },
  site_maintenance_development: {
    version: 1,
    mode: "ENABLED",
    scheduledStartAt: null,
    scheduledEndAt: null,
    updatedAt: "2026-08-11T00:00:00.000Z",
  },
};

test("Edge Config credentials require one canonical matching connection", () => {
  const credentials = validateMaintenanceEdgeConfigCredentials({
    connectionString:
      "https://edge-config.vercel.com/ecfg_demo?token=synthetic-read-token",
    edgeConfigId: "ecfg_demo",
    writeToken: "synthetic-write-token",
  });
  assert.equal(credentials.edgeConfigId, "ecfg_demo");
  assert.equal(credentials.readToken, "synthetic-read-token");

  for (const connectionString of [
    "http://edge-config.vercel.com/ecfg_demo?token=read-token",
    "https://example.test/ecfg_demo?token=read-token",
    "https://edge-config.vercel.com/ecfg_other?token=read-token",
    "https://edge-config.vercel.com/ecfg_demo?token=read-token&extra=value",
    "https://edge-config.vercel.com/ecfg_demo?token=first&token=second",
  ]) {
    assert.throws(
      () =>
        validateMaintenanceEdgeConfigCredentials({
          connectionString,
          edgeConfigId: "ecfg_demo",
          writeToken: "synthetic-write-token",
        }),
      /EDGE_CONFIG/,
    );
  }

  assert.throws(
    () =>
      validateMaintenanceEdgeConfigCredentials({
        connectionString:
          "https://edge-config.vercel.com/not-an-edge-config?token=read-token",
        edgeConfigId: "not-an-edge-config",
        writeToken: "synthetic-write-token",
      }),
    /MAINTENANCE_EDGE_CONFIG_ID/,
  );
});

test("all three maintenance keys use the exact versioned value shape", () => {
  assert.deepEqual(parseMaintenanceEdgeConfigItems(snapshot), snapshot);

  const missing = structuredClone(snapshot) as Record<string, unknown>;
  delete missing.site_maintenance_preview;
  assert.throws(
    () => parseMaintenanceEdgeConfigItems(missing),
    /site_maintenance_preview.*invalid/,
  );

  const extraField = structuredClone(snapshot) as Record<string, unknown>;
  extraField.site_maintenance_production = {
    ...disabled,
    unexpected: true,
  };
  assert.throws(
    () => parseMaintenanceEdgeConfigItems(extraField),
    /site_maintenance_production.*invalid/,
  );

  const invalidSchedule = structuredClone(snapshot) as Record<string, unknown>;
  invalidSchedule.site_maintenance_preview = {
    ...snapshot.site_maintenance_preview,
    scheduledEndAt: "2026-08-11T00:30:00.000Z",
  };
  assert.throws(
    () => parseMaintenanceEdgeConfigItems(invalidSchedule),
    /site_maintenance_preview.*invalid/,
  );

  const retainedSchedule = structuredClone(snapshot) as Record<string, unknown>;
  retainedSchedule.site_maintenance_production = {
    ...disabled,
    scheduledStartAt: "2026-08-12T01:00:00.000Z",
    scheduledEndAt: "2026-08-12T03:00:00.000Z",
  };
  assert.deepEqual(
    parseMaintenanceEdgeConfigItems(retainedSchedule)
      .site_maintenance_production,
    retainedSchedule.site_maintenance_production,
  );

  const partialRetainedSchedule = structuredClone(snapshot) as Record<
    string,
    unknown
  >;
  partialRetainedSchedule.site_maintenance_development = {
    ...snapshot.site_maintenance_development,
    scheduledStartAt: "2026-08-12T01:00:00.000Z",
  };
  assert.throws(
    () => parseMaintenanceEdgeConfigItems(partialRetainedSchedule),
    /site_maintenance_development.*invalid/,
  );

  const impossibleTimestamp = structuredClone(snapshot) as Record<
    string,
    unknown
  >;
  impossibleTimestamp.site_maintenance_production = {
    ...disabled,
    updatedAt: "2026-02-31T00:00:00.000Z",
  };
  assert.throws(
    () => parseMaintenanceEdgeConfigItems(impossibleTimestamp),
    /site_maintenance_production.*invalid/,
  );
});

test("maintenance expectation resolves enabled and half-open schedules", () => {
  assert.deepEqual(
    createMaintenancePublicExpectation(
      snapshot,
      "site_maintenance_production",
      new Date("2026-08-11T02:00:00.000Z"),
    ),
    { key: "site_maintenance_production", status: 200 },
  );
  assert.deepEqual(
    createMaintenancePublicExpectation(
      snapshot,
      "site_maintenance_preview",
      new Date("2026-08-11T02:00:00.000Z"),
    ),
    {
      key: "site_maintenance_preview",
      status: 503,
      retryAfter: "Tue, 11 Aug 2026 03:00:00 GMT",
    },
  );
  assert.equal(
    createMaintenancePublicExpectation(
      snapshot,
      "site_maintenance_preview",
      new Date("2026-08-11T03:00:00.000Z"),
    ).status,
    200,
  );
  assert.deepEqual(
    createMaintenancePublicExpectation(
      snapshot,
      "site_maintenance_development",
    ),
    { key: "site_maintenance_development", status: 503 },
  );
});

test("Edge Config preflight proves owner and both read paths without token URLs", async () => {
  const credentials = validateMaintenanceEdgeConfigCredentials({
    connectionString:
      "https://edge-config.vercel.com/ecfg_demo?token=synthetic-read-token",
    edgeConfigId: "ecfg_demo",
    writeToken: "synthetic-write-token",
  });
  const requests: Array<{ url: URL; authorization: string | null }> = [];
  const result = await verifyMaintenanceEdgeConfig(
    credentials,
    "team_demo",
    async (input, init = {}) => {
      const url = new URL(String(input));
      const headers = new Headers(init.headers);
      requests.push({
        url,
        authorization: headers.get("authorization"),
      });
      const payload =
        url.pathname === "/v1/edge-config/ecfg_demo"
          ? { id: "ecfg_demo", ownerId: "team_demo" }
          : snapshot;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );

  assert.deepEqual(result, snapshot);
  assert.equal(requests.length, 3);
  assert.equal(
    requests.every(
      ({ url }) =>
        !url.href.includes("synthetic-read-token") &&
        !url.href.includes("synthetic-write-token"),
    ),
    true,
  );
  assert.deepEqual(
    requests.map(({ authorization }) => authorization),
    [
      "Bearer synthetic-write-token",
      "Bearer synthetic-write-token",
      "Bearer synthetic-read-token",
    ],
  );
  assert.deepEqual(
    requests.map(({ url }) => url.searchParams.get("teamId")),
    ["team_demo", "team_demo", null],
  );
});

test("Edge Config preflight never surfaces response bodies or credentials", async () => {
  const credentials = validateMaintenanceEdgeConfigCredentials({
    connectionString:
      "https://edge-config.vercel.com/ecfg_demo?token=synthetic-read-token",
    edgeConfigId: "ecfg_demo",
    writeToken: "synthetic-write-token",
  });
  await assert.rejects(
    verifyMaintenanceEdgeConfig(
      credentials,
      "team_demo",
      async () =>
        new Response(
          "synthetic-read-token synthetic-write-token unexpected-payload",
          { status: 401 },
        ),
    ),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      const message = (error as Error).message;
      assert.match(message, /returned HTTP 401/);
      assert.doesNotMatch(message, /synthetic-(?:read|write)-token/);
      assert.doesNotMatch(message, /unexpected-payload/);
      return true;
    },
  );
});

test("503 public smoke preserves login, static assets, and raw Markdown", async () => {
  const baseUrl = new URL("https://candidate.vercel.app");
  const retryAfter = "Tue, 11 Aug 2026 03:00:00 GMT";
  const checks = await verifyPublicSiteSmoke(
    baseUrl,
    {
      key: "site_maintenance_preview",
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
      { key: "site_maintenance_preview", status: 503 },
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

function response(url: URL, body: BodyInit | null, init: ResponseInit): Response {
  const value = new Response(body, init);
  Object.defineProperty(value, "url", { value: url.href });
  return value;
}
