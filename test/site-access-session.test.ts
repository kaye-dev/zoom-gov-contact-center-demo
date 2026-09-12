import assert from "node:assert/strict";
import test from "node:test";
import { issueSiteAccessSession,hasSiteAccessSession,serializeAccessCookie,readAccessCookie,accessAttemptIdentity } from "../lib/server/site-access-session";
import { readSiteAccessSettings } from "../lib/server/site-access-settings";
import { hashAccessCode } from "../lib/server/site-access-crypto";
import { accessFixture } from "./helpers/site-access-store";
const site={kind:"tenant",tenantKey:"lg"} as const;
const now=new Date("2026-09-12T00:00:00Z");
test("opaque session expires exactly, binds host/environment and invalidates only its revision",async()=>{
 const f=await accessFixture(["global","lg"]);let settings=await readSiteAccessSettings("development",f.store);
 const grant=await issueSiteAccessSession("Example2026",site,"lg.localhost","development",settings,f.store,now);
 assert.equal(grant.token.length,64);assert.notEqual(f.sessions[0].tokenHash,grant.token);assert.equal(f.sessions[0].scope,"global");
 const has=(date=now,host="lg.localhost",env:"development"|"production"="development")=>hasSiteAccessSession(grant.token,site,host,env,settings,f.store,date);
 assert.equal(await has(new Date(grant.expiresAt.getTime()-1)),true);assert.equal(await has(grant.expiresAt),false);
 assert.equal(await has(now,"univ.localhost"),false);assert.equal(await has(now,"lg.localhost","production"),false);
 f.rows[1].revision++;settings=await readSiteAccessSettings("development",f.store);assert.equal(await has(),true);
 f.rows[0].revision++;settings=await readSiteAccessSettings("development",f.store);assert.equal(await has(),false);
 assert.equal(await hasSiteAccessSession('a'.repeat(64),site,"lg.localhost","development",settings,f.store,now),false);
});
test("tenant code grants only its sector; active common code wins; seven-day lifetime",async()=>{
 const f=await accessFixture(["lg","univ"]);f.rows[1].sessionDays=7;f.rows[2].codeHash=await hashAccessCode("University2026");
 const settings=await readSiteAccessSettings("development",f.store);
 const grant=await issueSiteAccessSession("Example2026",site,"lg.localhost","development",settings,f.store,now);
 assert.equal(grant.expiresAt.getTime()-now.getTime(),7*86400000);
 await assert.rejects(issueSiteAccessSession("Example2026",{kind:"tenant",tenantKey:"univ"},"univ.localhost","development",settings,f.store,now));
 await assert.rejects(issueSiteAccessSession("example2026",site,"lg.localhost","development",settings,f.store,now));
 await issueSiteAccessSession("University2026",{kind:"entry"},"localhost","development",settings,f.store,now);
});
test("host-only cookies use Secure outside local HTTP; no arbitrary forwarded identity",()=>{
 for(const origin of ['http://localhost:3001','https://example.com']) {
  const url=new URL(origin),cookie=serializeAccessCookie(url,'a'.repeat(64),new Date(now.getTime()+86400000),now);
  assert.match(cookie,/HttpOnly; SameSite=Lax/);assert.doesNotMatch(cookie,/Domain=/);assert.equal(cookie.includes('; Secure'),origin.startsWith('https:'));
  assert.equal(readAccessCookie(new Headers({cookie}),url),'a'.repeat(64));
 }
 assert.equal(accessAttemptIdentity(new Headers({'x-forwarded-for':'1.2.3.4'}),{NODE_ENV:'development'}),'unverified-client');
 assert.equal(accessAttemptIdentity(new Headers({'x-vercel-forwarded-for':'1.2.3.4'}),{NODE_ENV:'development',VERCEL:'1'}),'1.2.3.4');
});
