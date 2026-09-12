import assert from "node:assert/strict";
import test from "node:test";
import { parseSiteAccessUpdate, SITE_ACCESS_SCOPES, siteIsRestricted } from "../lib/site-access";
import { publicSiteAccessSnapshot, readSiteAccessSettings } from "../lib/server/site-access-settings";
import { accessFixture } from "./helpers/site-access-store";

test("all eight combinations implement shared OR tenant restrictions", () => {
 for(let bits=0;bits<8;bits++) {
  const settings=SITE_ACCESS_SCOPES.map((scope,i)=>({scope,enabled:Boolean(bits & (1<<i))}));
  assert.equal(siteIsRestricted(settings,{kind:"entry"}), Boolean(bits&1));
  assert.equal(siteIsRestricted(settings,{kind:"tenant",tenantKey:"lg"}),Boolean(bits&3));
  assert.equal(siteIsRestricted(settings,{kind:"tenant",tenantKey:"univ"}),Boolean(bits&5));
 }
});
test("settings reject invalid input, missing rows and invalid stored state without leaking hashes",async()=>{
 const input={enabled:true,sessionDays:1,expectedRevision:1,code:"Example2026"};
 assert.ok(parseSiteAccessUpdate(input));
 for(const patch of [{sessionDays:0},{sessionDays:1.2},{sessionDays:Number.MAX_SAFE_INTEGER},{code:" test1234"},{extra:1},{expectedRevision:0},{code:"日本語コード"}]) assert.equal(parseSiteAccessUpdate({...input,...patch}),null);
 const fixture=await accessFixture();
 const rows=await readSiteAccessSettings("development",fixture.store);
 assert.equal(JSON.stringify(rows.map(publicSiteAccessSnapshot)).includes("scrypt"),false);
 fixture.rows.pop();await assert.rejects(readSiteAccessSettings("development",fixture.store));
});
