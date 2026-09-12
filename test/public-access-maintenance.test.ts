import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { requirePublicAccess } from "../lib/server/public-access-gate";
import { handleMaintenanceRequest } from "../lib/server/maintenance-request-gate";
import { resolvePublicSite } from "../lib/public-site-routing";
import { issueSiteAccessSession } from "../lib/server/site-access-session";
import { readSiteAccessSettings } from "../lib/server/site-access-settings";
import { accessFixture } from "./helpers/site-access-store";

test("access gate precedes maintenance, and a grant never disables maintenance",async()=>{
 const {store}=await accessFixture();const settings=await readSiteAccessSettings('development',store);
 const request=new NextRequest('http://lg.localhost/news',{headers:{accept:'text/html'}});
 assert.equal((await requirePublicAccess(request,{store})).response?.status,307);
 const grant=await issueSiteAccessSession('Example2026',{kind:'tenant',tenantKey:'lg'},'lg.localhost','development',settings,store);
 const authenticated=new NextRequest(request,{headers:{accept:'text/html',cookie:`site-access=${grant.token}`}});
 assert.equal((await requirePublicAccess(authenticated,{store})).response,null);
 for(const mode of ['enabled','scheduled']) {
  const maintenance=await handleMaintenanceRequest(authenticated,async()=>({effective:{active:true,retryAfter:3600,mode}} as never));
  assert.equal(maintenance.status,503);
 }
 assert.deepEqual(resolvePublicSite('localhost'),{kind:'entry'});
});
