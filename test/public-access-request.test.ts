import assert from "node:assert/strict";
import test from "node:test";
import { classifyAccessRequest, externalRequestTenant } from "../lib/public-access-request";
import { requirePublicAccess } from "../lib/server/public-access-gate";
import { accessFixture } from "./helpers/site-access-store";

test("only precise admin/bootstrap/assets bypass the gate",()=>{
 for(const path of ['/admin','/admin/login','/admin/my-page','/api/admin/x','/api/auth/session','/api/account/change-password']) assert.equal(classifyAccessRequest(new URL(path,'http://lg.localhost'),'POST'),'admin');
 for(const path of ['/administrator','/private.pdf','/export.csv','/sitemap.xml','/_next/image?url=%2Fsecret.png']) assert.equal(classifyAccessRequest(new URL(path,'http://lg.localhost'),'GET'),'public');
 assert.equal(classifyAccessRequest(new URL('http://lg.localhost/api/docs-md/intro'),'GET'),'public');
 assert.equal(externalRequestTenant('/api/public/v1/reservations'),'lg');
 assert.equal(externalRequestTenant('/api/zaad/provider-events'),'univ');
 assert.equal(externalRequestTenant('/api/unknown-webhook'),null);
});
test("navigation redirects, RSC/actions/raw data return 401 despite forged grant headers",async()=>{
 const {store}=await accessFixture();
 for(const [path,method,headers,status] of [
  ['/news','GET',{accept:'text/html'},307],['/news','GET',{accept:'text/html',rsc:'1'},401],
  ['/news','POST',{'next-action':'forged'},401],['/secret.pdf','GET',{accept:'text/html'},401],
  ['/api/docs-md/intro','GET',{},401],['/sitemap.xml','GET',{},401],['/unknown','GET',{},401],
 ] as const) {
  const result=await requirePublicAccess(new Request(`http://lg.localhost${path}`,{method,headers:{...headers,'x-site-access-granted':'1','x-maintenance-rewrite':'1'}}),{store});
  assert.equal(result.response?.status,status,path);assert.equal(result.response?.headers.get('cache-control'),'private, no-store');
 }
 const badStore={query:async()=>{throw new Error('secret database detail');}};
 const unavailable=await requirePublicAccess(new Request('http://lg.localhost/news'),{store:badStore});
 assert.equal(unavailable.response?.status,503);assert.doesNotMatch(await unavailable.response!.text(),/secret/);
 assert.equal((await requirePublicAccess(new Request('http://lg.localhost/admin'),{store:badStore})).response,null);
});

test("fixed-sector browsing data cannot bypass its restriction using another Host",async()=>{
 const {store}=await accessFixture(['lg']);
 assert.equal((await requirePublicAccess(new Request('http://univ.localhost/api/municipal-notification-options'),{store})).response?.status,401);
 assert.equal((await requirePublicAccess(new Request('http://univ.localhost/api/university-notification-options'),{store})).response,null);
});
