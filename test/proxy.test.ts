import assert from "node:assert/strict";
import test from "node:test";

import { isRewrite } from "next/experimental/testing/server";
import { NextRequest } from "next/server";

import {
  MAINTENANCE_REWRITE_HEADER,
  MAINTENANCE_REWRITE_HEADER_VALUE,
} from "../lib/maintenance-request";
import { handleMaintenanceRequest } from "../lib/server/maintenance-request-gate";

const disabledConfig = {
  version: 1,
  mode: "DISABLED",
  scheduledStartAt: null,
  scheduledEndAt: null,
  updatedAt: "2026-08-11T00:00:00.000Z",
} as const;

test("proxy fails closed for public HTML when PostgreSQL is unavailable", async () => {
  const response = await handleMaintenanceRequest(
    requestWithExternalMaintenanceHeader(
      "https://localhost/life/child-education",
    ),
    async () => {
      throw new Error("synthetic database connection detail");
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("retry-after"), null);
  assert.equal(isRewrite(response), true);
  assert.equal(
    response.headers.get(
      `x-middleware-request-${MAINTENANCE_REWRITE_HEADER}`,
    ),
    MAINTENANCE_REWRITE_HEADER_VALUE,
  );
});

test("proxy bypasses admin, API, authentication, static, and raw Markdown requests", async () => {
  let readCount = 0;
  for (const pathname of [
    "/admin/maintenance-settings",
    "/api/health",
    "/login",
    "/maintenance-unavailable",
    "/_next/static/app.js",
    "/ai-chat-assistant.png",
    "/docs/privacy-policy.md",
  ]) {
    const response = await handleMaintenanceRequest(
      requestWithExternalMaintenanceHeader(`https://localhost${pathname}`),
      async () => {
        readCount += 1;
        throw new Error("excluded paths must not read PostgreSQL");
      },
    );
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
    assert.equal(isRewrite(response), false, pathname);
    assertMaintenanceHeaderRemoved(response);
  }
  assert.equal(readCount, 0);
});

test("proxy leaves public HTML available for a valid disabled config", async () => {
  const response = await handleMaintenanceRequest(
    requestWithExternalMaintenanceHeader("https://localhost/news"),
    async () => validSnapshot(disabledConfig),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(isRewrite(response), false);
  assertMaintenanceHeaderRemoved(response);
});

test("proxy emits schedule Retry-After only inside the active interval", async () => {
  const realDate = Date;
  const start = new Date(Date.now() - 60_000).toISOString();
  const end = new Date(Date.now() + 60 * 60_000).toISOString();

  const scheduledConfig = {
    ...disabledConfig,
    mode: "SCHEDULED" as const,
    scheduledStartAt: start,
    scheduledEndAt: end,
  };
  const response = await handleMaintenanceRequest(
    new NextRequest("https://localhost/"),
    async () => validSnapshot(scheduledConfig),
  );

  assert.equal(response.status, 503);
  assert.equal(
    response.headers.get("retry-after"),
    new realDate(end).toUTCString(),
  );
});

function validSnapshot(config: typeof disabledConfig | {
  version: 1;
  mode: "SCHEDULED";
  scheduledStartAt: string;
  scheduledEndAt: string;
  updatedAt: string;
}) {
  const now = Date.now();
  const active =
    config.mode === "SCHEDULED" &&
    Date.parse(config.scheduledStartAt!) <= now &&
    now < Date.parse(config.scheduledEndAt!);

  return {
    environment: "development" as const,
    configKey: "site_maintenance_development" as const,
    config,
    revision: 1,
    readStatus: "VALID" as const,
    effective: {
      active,
      reason: active ? ("SCHEDULED_ACTIVE" as const) : ("DISABLED" as const),
      retryAfter: active ? new Date(config.scheduledEndAt!).toUTCString() : null,
    },
  };
}

function requestWithExternalMaintenanceHeader(url: string): NextRequest {
  return new NextRequest(url, {
    headers: {
      [MAINTENANCE_REWRITE_HEADER]: MAINTENANCE_REWRITE_HEADER_VALUE,
    },
  });
}

function assertMaintenanceHeaderRemoved(response: Response): void {
  assert.equal(
    response.headers.get(`x-middleware-request-${MAINTENANCE_REWRITE_HEADER}`),
    null,
  );
  assert.equal(response.headers.has("x-middleware-override-headers"), true);
  assert.equal(
    (response.headers.get("x-middleware-override-headers") ?? "")
      .split(",")
      .includes(MAINTENANCE_REWRITE_HEADER),
    false,
  );
}
