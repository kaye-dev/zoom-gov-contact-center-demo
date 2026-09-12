import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import test from "node:test";
import { Client, Pool } from "pg";
import * as nodeModule from "node:module";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { configureEnvironment } from "../helpers/site-access-runtime";
import { saveSiteAccessSettings } from "../../lib/server/site-access-settings";
import { verifySiteAccess } from "../../lib/server/site-access-verification";
import { requirePublicAccess } from "../../lib/server/public-access-gate";

test('real DB: verification, revisions, direct API boundaries, throttling and failure closure',{timeout:180000},async()=>{
 await withIsolatedPostgresDatabase(async databaseUrl=>{
  const restore=configureEnvironment(databaseUrl),client=new Client({connectionString:databaseUrl});await client.connect();
  const previousFetch=globalThis.fetch;let externalCalls=0;globalThis.fetch=async()=>{externalCalls++;throw new Error('No external calls allowed');};
  try {
   const hooks=(nodeModule as unknown as {registerHooks(o:unknown):{deregister():void}}).registerHooks({resolve(s:string,c:unknown,next:(s:string,c:unknown)=>unknown){return next(s==='server-only'?'next/dist/compiled/server-only/empty.js':s,c);}});
   const route=await import('../../app/api/[[...route]]/route').finally(()=>hooks.deregister());
   const docs=await import('../../app/api/docs-md/[...slug]/route');
   const availability=await import('../../app/api/public/consultation-availability/route');
   await saveSiteAccessSettings('global','development',{enabled:true,code:'RuntimeCode2026',sessionDays:1,expectedRevision:1},'test',client);
   const verification=(origin='http://lg.localhost:3000',returnTo='/news?topic=test')=>new Request('http://lg.localhost:3000/api/site-access/verify',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({code:'RuntimeCode2026',returnTo})});
   assert.equal((await verifySiteAccess(verification('http://evil.test'),client)).status,403);
   const verified=await verifySiteAccess(verification(),client);assert.equal(verified.status,200,await verified.clone().text());assert.deepEqual(await verified.json(),{redirectTo:'/news?topic=test'});
   const cookie=verified.headers.get('set-cookie')!.split(';')[0];
   assert.equal((await requirePublicAccess(new Request('http://lg.localhost:3000/news',{headers:{cookie}}),{store:client})).response,null);
   const unsafe=await verifySiteAccess(verification('http://lg.localhost:3000','/%252f%252fevil.test'),client);assert.deepEqual(await unsafe.json(),{redirectTo:'/'});
   assert.equal((await docs.GET(new Request('http://lg.localhost:3000/api/docs-md/intro'),{params:Promise.resolve({slug:['intro']})})).status,401);
   const protectedDocument=await docs.GET(new Request('http://lg.localhost:3000/api/docs-md/terms-of-service',{headers:{cookie}}),{params:Promise.resolve({slug:['terms-of-service']})});
   assert.equal(protectedDocument.status,200);assert.equal(protectedDocument.headers.get('cache-control'),'private, no-store');assert.equal(protectedDocument.headers.get('x-robots-tag'),'noindex, nofollow');
   assert.equal((await availability.GET(new NextRequest('http://lg.localhost:3000/api/public/consultation-availability'))).status,401);
   for(const [path,method] of [['/api/public/v1/reservation-services','GET'],['/api/zaad/provider-events','POST'],['/api/disaster-radio-subscriptions','POST'],['/api/university-notification-registrations','POST']] as const) {
    const response=await route[method](new Request(`http://localhost:3000${path}`,{method,headers:{cookie,authorization:'Bearer valid-or-invalid-independent-of-key',origin:'http://localhost:3000'}}));
    assert.equal(response.status,503,path);assert.equal((await response.json()).code,'SITE_RESTRICTED');
   }
   assert.equal(externalCalls,0);assert.equal(Number((await client.query('SELECT count(*) FROM disaster_radio_subscriptions')).rows[0].count),0);
   await saveSiteAccessSettings('global','development',{enabled:true,sessionDays:7,expectedRevision:2},'test',client);
   assert.equal((await requirePublicAccess(new Request('http://lg.localhost:3000/news',{headers:{cookie}}),{store:client})).response?.status,401);
   await client.query('DELETE FROM site_access_attempts');
   const concurrentStore=new Pool({connectionString:databaseUrl,max:4});
   const attempts=await Promise.all(Array.from({length:11},()=>verifySiteAccess(verification(),concurrentStore))).finally(()=>concurrentStore.end());
   assert.equal(attempts.filter(r=>r.status===200).length,10);assert.equal(attempts.filter(r=>r.status===429).length,1);
   assert.ok(attempts.find(r=>r.status===429)?.headers.get('retry-after'));
   await saveSiteAccessSettings('global','development',{enabled:false,sessionDays:7,expectedRevision:3},'test',client);
   await saveSiteAccessSettings('lg','development',{enabled:true,code:'Municipal2026',sessionDays:1,expectedRevision:1},'test',client);
   assert.equal((await route.POST(new Request('http://localhost:3000/api/university-notification-registrations',{method:'POST'}))).status,403);
   await client.query("DELETE FROM site_access_settings WHERE scope='univ' AND environment='DEVELOPMENT'");
   assert.equal((await requirePublicAccess(new Request('http://lg.localhost:3000/news'),{store:client})).response?.status,503);
  } finally {globalThis.fetch=previousFetch;await client.end();restore();}
 });
});
