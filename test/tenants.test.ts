import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveMaintenanceEnvironment } from "../lib/maintenance-config";
import {
  DEFAULT_TENANT_KEY,
  TENANTS,
  TENANT_KEYS,
  getDefaultTenant,
  getTenant,
  isTenantKey,
  listTenantProductionOrigins,
  resolveTenantFromHost,
} from "../lib/tenants";

const canonicalEnvironment = {
  APP_CANONICAL_ORIGIN: `https://${getDefaultTenant().productionHost}`,
};

test("the tenant registry is internally consistent", () => {
  assert.ok(TENANT_KEYS.length > 0);
  assert.equal(TENANTS.length, TENANT_KEYS.length);
  assert.ok(isTenantKey(DEFAULT_TENANT_KEY));

  for (const key of TENANT_KEYS) {
    assert.equal(getTenant(key).key, key);
  }

  // Hosts, dev labels, and knowledge-base directories must be unique so a
  // request can never resolve to two tenants.
  for (const field of ["productionHost", "devHostLabel", "knowledgeBaseDir"] as const) {
    const values = TENANTS.map((tenant) => tenant[field]);
    assert.equal(
      new Set(values).size,
      values.length,
      `${field} must be unique across tenants`,
    );
  }

  assert.deepEqual(
    listTenantProductionOrigins(),
    TENANTS.map((tenant) => `https://${tenant.productionHost}`),
  );
});

test("page metadata is resolved per tenant instead of hardcoded", () => {
  for (const tenant of TENANTS) {
    for (const field of ["title", "description", "shortName"] as const) {
      assert.ok(
        tenant.metadata[field].trim().length > 0,
        `tenant ${tenant.key} must define metadata.${field}`,
      );
    }
  }

  const layoutSource = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layoutSource, /export async function generateMetadata\(\)/);
  assert.match(layoutSource, /const tenant = await getRequestTenant\(\)/);
  assert.match(layoutSource, /title: tenant\.metadata\.title/);
  assert.match(layoutSource, /description: tenant\.metadata\.description/);
  // The site name must not be reintroduced as a literal.
  assert.doesNotMatch(layoutSource, /未来市/);

  const maintenanceSource = readFileSync(
    new URL("../app/maintenance-unavailable/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(maintenanceSource, /export async function generateMetadata\(\)/);
  assert.match(maintenanceSource, /\$\{tenant\.metadata\.shortName\}/);
  assert.doesNotMatch(maintenanceSource, /未来市/);
});

test("production hostnames resolve to their tenant", () => {
  for (const tenant of TENANTS) {
    assert.equal(
      resolveTenantFromHost(tenant.productionHost, canonicalEnvironment).key,
      tenant.key,
    );
    // Host headers may carry a port, uppercase letters, or a trailing dot.
    assert.equal(
      resolveTenantFromHost(
        `${tenant.productionHost.toUpperCase()}:443`,
        canonicalEnvironment,
      ).key,
      tenant.key,
    );
    assert.equal(
      resolveTenantFromHost(`${tenant.productionHost}.`, canonicalEnvironment)
        .key,
      tenant.key,
    );
  }
});

test("local development hostnames resolve through the dev label", () => {
  for (const tenant of TENANTS) {
    assert.equal(
      resolveTenantFromHost(`${tenant.devHostLabel}.localhost:3000`, {}).key,
      tenant.key,
    );
    assert.equal(
      resolveTenantFromHost(`${tenant.devHostLabel}.localhost`, {}).key,
      tenant.key,
    );
  }

  // A bare loopback host has no tenant label and falls back to the default.
  assert.equal(
    resolveTenantFromHost("localhost:3000", {}).key,
    DEFAULT_TENANT_KEY,
  );
  assert.equal(
    resolveTenantFromHost("unknown.localhost:3000", {}).key,
    DEFAULT_TENANT_KEY,
  );
});

test("unregistered hosts fall back to the canonical origin tenant", () => {
  for (const tenant of TENANTS) {
    assert.equal(
      resolveTenantFromHost("zoom-gov-demo-git-sha.vercel.app", {
        APP_CANONICAL_ORIGIN: `https://${tenant.productionHost}`,
      }).key,
      tenant.key,
    );
  }

  // Without a usable canonical origin the default tenant still renders.
  assert.equal(
    resolveTenantFromHost("zoom-gov-demo.vercel.app", {}).key,
    DEFAULT_TENANT_KEY,
  );
  assert.equal(
    resolveTenantFromHost("preview.example.com", {
      APP_CANONICAL_ORIGIN: "https://not-a-tenant.example.com",
    }).key,
    DEFAULT_TENANT_KEY,
  );
});

test("malformed hosts never throw and resolve to the default tenant", () => {
  for (const host of [
    null,
    undefined,
    "",
    "   ",
    "https://demo.lg.keien.dev",
    "demo.lg.keien.dev/admin",
    "demo.lg.keien.dev?x=1",
    "demo.lg.keien.dev#x",
    "user:pass@demo.lg.keien.dev",
    "..",
    "demo..lg.keien.dev",
  ]) {
    assert.equal(
      resolveTenantFromHost(host, {}).key,
      DEFAULT_TENANT_KEY,
      `host ${JSON.stringify(host)} must resolve to the default tenant`,
    );
  }
});

test("every registered tenant hostname counts as the production environment", () => {
  const canonicalOrigin = `https://${getDefaultTenant().productionHost}`;

  for (const tenant of TENANTS) {
    assert.equal(
      resolveMaintenanceEnvironment({
        nodeEnv: "production",
        requestHostname: tenant.productionHost,
        appCanonicalOrigin: canonicalOrigin,
      }),
      "production",
    );
  }

  // Deployment URLs and tunnels remain preview.
  assert.equal(
    resolveMaintenanceEnvironment({
      nodeEnv: "production",
      requestHostname: "zoom-gov-demo-git-sha.vercel.app",
      appCanonicalOrigin: canonicalOrigin,
    }),
    "preview",
  );
});
