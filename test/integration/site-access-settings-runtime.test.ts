import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import * as nodeModule from "node:module";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { configureEnvironment,createUser,createSession,signedSessionCookie,grantZaadViewOnly,assignNoAccess } from "../helpers/site-access-runtime";
import { readSiteAccessSettings,saveSiteAccessSettings } from "../../lib/server/site-access-settings";
import { allowedSiteAccessScopes } from "../../lib/server/site-access-admin";

test('real admin API enforces VIEW/UPDATE, CAS, environment separation and secret-free snapshots/audits',{timeout:180000},async t=>{
 await withIsolatedPostgresDatabase(async databaseUrl=>{
  const restore=configureEnvironment(databaseUrl),client=new Client({connectionString:databaseUrl});await client.connect();
  try {
   for(const id of ['access-full','access-view','access-none']) {await createUser(client,id);await createSession(client,id,`${id}-token`);}
   await grantZaadViewOnly(client,'access-view');await assignNoAccess(client,'access-none');
   const hooks=(nodeModule as unknown as {registerHooks(o:unknown):{deregister():void}}).registerHooks({resolve(specifier:string,context:unknown,next:(s:string,c:unknown)=>unknown){return next(specifier==='server-only'?'next/dist/compiled/server-only/empty.js':specifier,context);}});
   const route=await import('../../app/api/[[...route]]/route').finally(()=>hooks.deregister());
   const invoke=async(method:'GET'|'PUT',id?:string,body?:unknown,scope='global')=>route[method](new Request(`http://localhost:3000/api/admin/site-access-settings?scope=${scope}`,{method,headers:{origin:'http://localhost:3000','content-type':'application/json',...(id?{cookie:signedSessionCookie(`${id}-token`)}:{})},...(body?{body:JSON.stringify(body)}:{})}));
   assert.equal((await invoke('GET')).status,401);assert.equal((await invoke('GET','access-none')).status,403);
   assert.equal((await invoke('GET','access-view')).status,200);
   const issuedResponse=await route.POST(new Request('http://localhost:3000/api/admin/reservation-api-keys?tenant=lg',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json',cookie:signedSessionCookie('access-full-token')},body:JSON.stringify({name:'access-boundary-test',permissions:['LIST'],usageLimit:{mode:'UNLIMITED'}})}));
   assert.equal(issuedResponse.status,201,await issuedResponse.clone().text());
   const issued=await issuedResponse.json();
   const publicRequest=()=>new Request('http://localhost:3000/api/public/v1/reservation-services',{headers:{authorization:`Bearer ${issued.rawKey}`}});
   assert.equal((await route.GET(publicRequest())).status,200);
   const input={enabled:true,code:'RuntimeCode2026',sessionDays:7,expectedRevision:1};
   assert.equal((await invoke('PUT','access-view',input)).status,403);
   const results=await Promise.all([invoke('PUT','access-full',input),invoke('PUT','access-full',input)]);
   assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
   assert.equal((await route.GET(publicRequest())).status,503);
   const snapshot=await (await invoke('GET','access-full')).json();assert.equal(snapshot.sessionDays,7);assert.equal(snapshot.revision,2);
   assert.equal(JSON.stringify(snapshot).includes('RuntimeCode'),false);assert.equal('codeHash' in snapshot,false);
   const audit=(await client.query('SELECT * FROM site_access_audits')).rows;assert.equal(audit.length,1);assert.equal('codeHash' in audit[0],false);
   const prod=await readSiteAccessSettings('production',client);assert.equal(prod.find(r=>r.scope==='global')?.enabled,false);
   const actor={id:'fixture',adminAttribute:'admin',banned:false,mustChangePassword:false,roles:[{id:'full',name:'full',systemKey:'FULL_ACCESS',permissions:[]}]} as const;
   assert.deepEqual(allowedSiteAccessScopes({...actor,roles:actor.roles.map(r=>({...r,permissions:[]}))},'VIEW',['lg']),['lg']);
   await t.test('authenticated admin provider operation is still authorized while incoming API is blocked',async()=>{
    const {ZaadZoomClient}=await import('../../lib/server/zaad/zoom-client');let calls=0;
    const stub=t.mock.method(ZaadZoomClient,'fromDatabase',async()=>({accountId:'fixture',async listContactLists(){calls++;return {lists:[],nextPageToken:null};}}));
    try {
     const url='http://localhost:3000/api/admin/zaad/default-groups/default-lg-elder-watch/candidates?tenant=lg';
     const denied=await route.GET(new Request(url,{headers:{authorization:'Bearer public-api-key'}}));assert.equal(denied.status,401);
     const allowed=await route.GET(new Request(url,{headers:{cookie:signedSessionCookie('access-full-token')}}));assert.equal(allowed.status,200,await allowed.clone().text());assert.equal(calls,1);
    } finally {stub.mock.restore();}
   });
   const updated=await saveSiteAccessSettings('global','development',{enabled:false,sessionDays:7,expectedRevision:2},'access-full',client);assert.equal(updated.hasCode,true);
  } finally {await client.end();restore();}
 });
});
