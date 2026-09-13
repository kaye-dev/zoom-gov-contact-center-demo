import assert from "node:assert/strict";
import test from "node:test";
import { demoSiteHref, resolvePublicSite, safePublicReturnTo } from "../lib/public-site-routing";
import { resolveTenantFromHost } from "../lib/tenants";

test("localhost is neutral and sector links preserve the current port", () => {
 for (const port of [3000,3002]) {
  assert.deepEqual(resolvePublicSite(`localhost:${port}`), {kind:"entry"});
  for (const tenant of ["lg","univ"] as const) assert.equal(demoSiteHref(`localhost:${port}`,tenant),`http://${tenant}.localhost:${port}/`);
 }
 for (const host of ["lg.localhost:3002","univ.localhost:3002","preview.example.com","127.0.0.1:3002"])
  assert.deepEqual(resolvePublicSite(host),{kind:"tenant",tenantKey:resolveTenantFromHost(host).key});
});
test("returnTo preserves relative page queries and rejects unsafe/looping destinations", () => {
 assert.equal(safePublicReturnTo('/news?topic=test'),'/news?topic=test');
 assert.equal(safePublicReturnTo('/news?q=two%20words'),'/news?q=two%20words');
 for (const value of ['https://evil.test/','//evil.test','/\\evil.test','/%2f%2fevil.test','/%252f%252fevil.test','/a\n','/access','/access?q=1','/a/../access','/api/data','/admin','/%zz','/#anchor']) assert.equal(safePublicReturnTo(value),'/',value);
});

test("production common domain is an entry with explicit tenant destinations", () => {
 for (const host of ["demo.keien.dev", "DEMO.KEIEN.DEV:443"]) {
  assert.deepEqual(resolvePublicSite(host), {kind:"entry"});
  assert.equal(demoSiteHref(host,"lg"),"https://demo.lg.keien.dev/");
  assert.equal(demoSiteHref(host,"univ"),"https://demo.univ.keien.dev/");
 }
 for (const [host,key] of [["demo.lg.keien.dev","lg"],["demo.univ.keien.dev","univ"]])
  assert.deepEqual(resolvePublicSite(host), {kind:"tenant",tenantKey:key});
 assert.equal(resolvePublicSite("demo.keien.dev.evil.example").kind,"tenant");
});
