import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { Hono } from "hono";
import type { withOutreach as WithOutreach } from "../lib/server/zaad/outreach-api";
import type { ZaadApiEnvironment } from "../lib/server/zaad/api-routes";

test("MESSAGE-PLAY-03: audio response preserves middleware tenant header, range and bytes", async () => {
  const filename = path.resolve("lib/server/zaad/outreach-api.ts"), require = createRequire(filename), target = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mocks: Record<string, unknown> = {
    "@/lib/server/admin-access/api-guard": { authorizeAdminApi: async () => ({ ok: true, actor: { id: "reader" } }) },
    "./outreach-scope": { resolveOutreachScope: async () => ({ siteKey: "lg", actorId: "reader", all: false, live: false }) },
  };
  new Function("require", "module", "exports", code)((id: string) => id in mocks ? mocks[id] : require(id), target, target.exports);
  const { withOutreach } = target.exports as { withOutreach: typeof WithOutreach };
  const app = new Hono<ZaadApiEnvironment>();
  app.use(async (c, next) => { c.header("X-Admin-Tenant", "lg"); await next(); });
  const bytes = new Uint8Array([73, 68, 51, 1]);
  app.get("/audio", c => withOutreach(c, "VIEW", async () => new Response(bytes, { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Range": "bytes 0-3/80", "Cache-Control": "private, no-store" } })));
  const response = await app.request("http://localhost/audio?tenant=lg");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("X-Admin-Tenant"), "lg");
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(response.headers.get("Content-Range"), "bytes 0-3/80");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});
