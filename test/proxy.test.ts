import assert from "node:assert/strict";
import test from "node:test";

import { isRewrite } from "next/experimental/testing/server";
import { NextRequest } from "next/server";

import {
  MAINTENANCE_REWRITE_HEADER,
  MAINTENANCE_REWRITE_HEADER_VALUE,
} from "../lib/maintenance-request";
import { proxy } from "../proxy";

const disabledConfig = {
  version: 1,
  mode: "DISABLED",
  scheduledStartAt: null,
  scheduledEndAt: null,
  updatedAt: "2026-08-11T00:00:00.000Z",
} as const;

test("proxy fails closed for public HTML when Edge Config is unavailable", async () => {
  await withMaintenanceEnvironment(
    { NODE_ENV: "development", EDGE_CONFIG: undefined },
    async () => {
      const response = await proxy(
        requestWithExternalMaintenanceHeader(
          "https://localhost/life/child-education",
        ),
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
    },
  );
});

test("proxy bypasses admin, API, authentication, static, and raw Markdown requests", async () => {
  await withMaintenanceEnvironment(
    { NODE_ENV: "development", EDGE_CONFIG: undefined },
    async () => {
      for (const pathname of [
        "/admin/maintenance-settings",
        "/api/health",
        "/login",
        "/maintenance-unavailable",
        "/_next/static/app.js",
        "/ai-chat-assistant.png",
        "/docs/privacy-policy.md",
      ]) {
        const response = await proxy(
          requestWithExternalMaintenanceHeader(
            `https://localhost${pathname}`,
          ),
        );
        assert.equal(response.status, 200, pathname);
        assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
        assert.equal(isRewrite(response), false, pathname);
        assertMaintenanceHeaderRemoved(response);
      }
    },
  );
});

test("proxy leaves public HTML available for a valid disabled config", async () => {
  await withMockEdgeConfig(disabledConfig, async () => {
    const response = await proxy(
      requestWithExternalMaintenanceHeader("https://localhost/news"),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(isRewrite(response), false);
    assertMaintenanceHeaderRemoved(response);
  });
});

test("proxy emits schedule Retry-After only inside the active interval", async () => {
  const realDate = Date;
  const start = new Date(Date.now() - 60_000).toISOString();
  const end = new Date(Date.now() + 60 * 60_000).toISOString();

  await withMockEdgeConfig(
    {
      ...disabledConfig,
      mode: "SCHEDULED",
      scheduledStartAt: start,
      scheduledEndAt: end,
    },
    async () => {
      const response = await proxy(new NextRequest("https://localhost/"));

      assert.equal(response.status, 503);
      assert.equal(
        response.headers.get("retry-after"),
        new realDate(end).toUTCString(),
      );
    },
  );
});

async function withMockEdgeConfig(
  value: unknown,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json(value)) as typeof fetch;

  try {
    await withMaintenanceEnvironment(
      {
        NODE_ENV: "development",
        EDGE_CONFIG:
          "https://edge-config.example.test/ecfg_test?token=synthetic-read-token",
      },
      run,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

async function withMaintenanceEnvironment(
  values: { NODE_ENV: string; EDGE_CONFIG: string | undefined },
  run: () => Promise<void>,
): Promise<void> {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEdgeConfig = process.env.EDGE_CONFIG;
  Reflect.set(process.env, "NODE_ENV", values.NODE_ENV);
  if (values.EDGE_CONFIG === undefined) {
    delete process.env.EDGE_CONFIG;
  } else {
    process.env.EDGE_CONFIG = values.EDGE_CONFIG;
  }

  try {
    await run();
  } finally {
    if (originalNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
    }
    if (originalEdgeConfig === undefined) delete process.env.EDGE_CONFIG;
    else process.env.EDGE_CONFIG = originalEdgeConfig;
  }
}
