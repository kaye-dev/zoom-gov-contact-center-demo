import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import ts from "typescript";
import { parseZoomVideoTag } from "../lib/zoom-video-tag";

test("availability respects public access, tenant, valid configuration and production hours", async () => {
  const file = new URL("../app/api/public/consultation-availability/route.ts", import.meta.url);
  const localRequire = createRequire(file);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const tag = '<script src="https://us01ccistatic.zoom.us/us01cci/web-sdk/video-client.js" data-entry-id="entry" data-apikey="public"></script>';
  let denied = false, hours = false, reads = 0;
  const target = { exports: {} as { GET: (request: NextRequest) => Promise<Response> } };
  new Function("require", "module", "exports", code)((name: string) => {
    if (name === "@/lib/server/public-access-gate") return { requirePublicAccess: async () => ({ response: denied ? new Response(null, { status: 401 }) : null }) };
    if (name === "@/lib/tenants") return { resolveTenantFromHost: (host: string) => ({ key: "univ", features: { universityPortal: host === "univ.localhost:3000" } }) };
    if (name === "@/lib/server/online-consultation-settings") return { getOnlineConsultationSettings: async () => {
      reads++;
      return [{ serviceKey: "admissions", enabled: true, webClientTag: tag }, { serviceKey: "careers", enabled: false, webClientTag: tag }, { serviceKey: "student-support", enabled: true, webClientTag: "invalid" }];
    } };
    if (name === "@/lib/consultation-hours") return { isConsultationBusinessHours: () => hours };
    if (name === "@/lib/search-indexing") return { X_ROBOTS_TAG_VALUE: "noindex" };
    if (name === "@/lib/zoom-video-tag") return { parseZoomVideoTag };
    return localRequire(name);
  }, target, target.exports);
  const request = (host = "univ.localhost:3000") => new NextRequest(`http://${host}/api/public/consultation-availability`, { headers: { host } });
  const oldMode = process.env.NODE_ENV, oldDemo = process.env.CONSULTATION_DEMO_ALWAYS_OPEN;
  try {
    Object.assign(process.env, { NODE_ENV: "production", CONSULTATION_DEMO_ALWAYS_OPEN: "1" });
    denied = true;
    assert.equal((await target.exports.GET(request())).status, 401);
    denied = false;
    assert.equal((await target.exports.GET(request("lg.localhost:3000"))).status, 404);
    assert.equal(reads, 0);
    const closed = await (await target.exports.GET(request())).json();
    assert.equal(closed.open, false);
    assert.equal(closed.services[0].video, null);
    hours = true;
    const open = await target.exports.GET(request());
    assert.equal(open.headers.get("cache-control"), "no-store");
    const body = await open.json();
    assert.equal(body.services[0].video.entryId, "entry");
    assert.equal(body.services[1].available, false);
    assert.equal(body.services[2].available, false);
    hours = false;
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.equal((await (await target.exports.GET(request())).json()).open, true);
  } finally {
    if (oldMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: oldMode });
    if (oldDemo === undefined) delete process.env.CONSULTATION_DEMO_ALWAYS_OPEN; else process.env.CONSULTATION_DEMO_ALWAYS_OPEN = oldDemo;
  }
});
