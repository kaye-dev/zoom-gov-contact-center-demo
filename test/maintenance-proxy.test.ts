import assert from "node:assert/strict";
import test from "node:test";

import {
  getRewrittenUrl,
  isRewrite,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";

import {
  MAINTENANCE_REWRITE_HEADER,
  MAINTENANCE_REWRITE_HEADER_VALUE,
} from "../lib/maintenance-request";
import { createMaintenanceRewriteResponse } from "../lib/server/maintenance-proxy";

test("maintenance rewrite returns uncached 503 and preserves the browser URL", () => {
  const request = new NextRequest(
    "https://city.example.jp/life/child-education?from=menu",
  );
  const response = createMaintenanceRewriteResponse(request, null);

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("retry-after"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(isRewrite(response), true);
  assert.equal(
    getRewrittenUrl(response),
    "https://city.example.jp/maintenance-unavailable",
  );
  assert.equal(
    response.headers.get(`x-middleware-request-${MAINTENANCE_REWRITE_HEADER}`),
    MAINTENANCE_REWRITE_HEADER_VALUE,
  );
});

test("maintenance rewrite includes Retry-After only when supplied", () => {
  const request = new NextRequest("https://city.example.jp/news");
  const retryAfter = "Tue, 11 Aug 2026 12:00:00 GMT";
  const response = createMaintenanceRewriteResponse(request, retryAfter);

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), retryAfter);
});
