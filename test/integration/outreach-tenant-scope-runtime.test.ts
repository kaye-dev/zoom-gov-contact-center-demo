import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { replayLegacy, applyMigration } from "../helpers/outreach-legacy-migrations";
import { createDatabaseContext } from "../../lib/server/prisma";
import { outreachTenants, universityScope } from "../../lib/server/zaad/university/permissions";
import { resolveOutreachScope, requireFullAccess } from "../../lib/server/zaad/outreach-scope";
import type { AdminAccessActor } from "../../lib/admin-access/types";
import { getCrmImport, applyCrmImport } from "../../lib/server/zaad/crm-imports";
import { parseCrmCsv } from "../../lib/zaad/crm-csv";
import { digest } from "../../lib/server/zaad/outreach-data";

const ordinary: AdminAccessActor={id:'actor',adminAttribute:'user',banned:false,mustChangePassword:false,roles:[{id:'view',name:'View',systemKey:null,permissions:[{resourceKey:'zaad',action:'VIEW',effect:'ALLOW'}]}]};
test("DEPARTMENT-MIGRATION/AUTH: explicit entry and live permissions preserve legacy outcomes; CSV and history survive", {timeout:180000},async()=>{
 await withIsolatedPostgresDatabase(async url=>{
  const client=new Client({connectionString:url});await client.connect();
  try {
   await replayLegacy(client);
   const users=['none','univ','both','all','invalid','invalid-lg','full','mixed'];
   for(const id of users)await client.query('INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,$1,$2,true,now(),now())',[id,`${id}@example.invalid`]);
   const grants:[string,string,string,boolean][]=[['univ','univ','admissions',false],['both','univ','facilities',true],['both','lg','ALL',false],['all','univ','ALL',false],['invalid','univ','unknown',true],['invalid-lg','lg','unknown',false],['mixed','univ','admissions',false],['mixed','lg','welfare',true]];
   for(const [i,[user,site,department,live]] of grants.entries())await client.query('INSERT INTO university_zaad_grants (id,"userId","siteKey","departmentKey","liveExecution") VALUES ($1,$2,$3,$4,$5)',[`grant-${i}`,user,site,department,live]);
   await client.query(`INSERT INTO municipal_contacts (id,"siteKey","departmentKey",name,phone,source,status,"updatedAt") VALUES ('old-welfare','lg','welfare','Legacy','+819000000001','CSV','WITHDRAWN',now())`);
   await client.query(`INSERT INTO municipal_notification_preferences (id,"siteKey","contactId",topic,requested,enabled,"withdrawnAt") VALUES ('preference','lg','old-welfare','elder-watch',true,false,now())`);
   const rows=parseCrmCsv(Buffer.from('name,phone,topicIds\nCSV Person,09000000002,elder-watch\n'),'lg');
   const oldDigest=digest({siteKey:'lg',actorId:'none',departmentKey:'welfare',rows});
   await client.query(`INSERT INTO crm_import_jobs (id,"siteKey","actorId","operationKey",source,"departmentKey","previewDigest","expiresAt") VALUES ('old-preview','lg','none','old_preview','CSV','welfare',$1,now()+interval '20 minutes')`,[oldDigest]);
   for(const row of rows)await client.query(`INSERT INTO crm_import_rows (id,"siteKey","jobId","rowKey","rowNumber",candidate,status) VALUES ($1,'lg','old-preview',$2,$3,$4,$5)`,[`row-${row.rowNumber}`,row.rowKey,row.rowNumber,JSON.stringify(row),row.status]);
   const before=(await client.query('SELECT * FROM municipal_contacts')).rows,preferences=(await client.query('SELECT * FROM municipal_notification_preferences')).rows,oldGrants=(await client.query('SELECT * FROM university_zaad_grants ORDER BY id')).rows;
   await applyMigration(client,'20260911050000_outreach_tenant_scope');
   await applyMigration(client,'20260911051000_outreach_message_content');
   const context=createDatabaseContext({...process.env,DATABASE_URL:url,DATABASE_URL_UNPOOLED:url});
   try {
    const db=context.prisma,expected:Record<string,string[]>={none:['lg'],univ:['univ'],both:['lg','univ'],all:['univ'],invalid:['lg'],'invalid-lg':[],mixed:['univ']};
    for(const [id,tenants]of Object.entries(expected))assert.deepEqual(await outreachTenants(db,{...ordinary,id}),tenants,id);
    const full={...ordinary,id:'full',roles:[{id:'full',name:'Full',systemKey:'FULL_ACCESS' as const,permissions:[]}]};
    assert.deepEqual(await outreachTenants(db,full),['lg','univ']);
    assert.equal((await resolveOutreachScope(db,full,'lg')).live,false);
    assert.equal((await resolveOutreachScope(db,{...ordinary,id:'both'},'univ')).live,true);
    assert.equal((await resolveOutreachScope(db,{...ordinary,id:'both'},'lg')).live,false);
    const legacyAll={...ordinary,id:'all'};
    assert.equal((await universityScope(db,'univ',legacyAll)).all,true);
    assert.throws(()=>requireFullAccess({siteKey:'univ',actorId:'all',all:false,live:false}),{code:'FULL_ACCESS_REQUIRED'});
    assert.equal((await resolveOutreachScope(db,legacyAll,'univ')).all,false);
    for(const denied of [{...full,banned:true},{...full,mustChangePassword:true},{...ordinary,id:'all',roles:[]}])assert.deepEqual(await outreachTenants(db,denied),[]);
    assert.deepEqual((await client.query('SELECT * FROM municipal_contacts')).rows,before);
    assert.deepEqual((await client.query('SELECT * FROM municipal_notification_preferences')).rows,preferences);
    assert.deepEqual((await client.query('SELECT * FROM university_zaad_grants ORDER BY id')).rows,oldGrants);
    const scope=await resolveOutreachScope(db,{...ordinary,id:'none'},'lg');
    const restored=await getCrmImport(db,scope,'old-preview');assert.equal(restored.previewDigest,oldDigest);assert.equal('departmentKey' in restored,false);
    const applied=await applyCrmImport(db,scope,{jobId:restored.id,previewDigest:oldDigest,rowKeys:rows.map(row=>row.rowKey)});
    assert.equal(applied.status,'COMPLETED');
    const created=await db.municipalContact.findFirstOrThrow({where:{name:'CSV Person'}});assert.equal(created.identityVerified,false);assert.equal(created.phoneVerified,false);
    assert.equal((await client.query('SELECT "departmentKey" FROM municipal_contacts WHERE id=$1',[created.id])).rows[0].departmentKey,null);
    await assert.rejects(getCrmImport(db,{...scope,actorId:'both'},restored.id),{code:'NOT_FOUND'});
    await assert.rejects(getCrmImport(db,{...scope,siteKey:'univ'},restored.id),{code:'NOT_FOUND'});
    await db.crmImportJob.update({where:{id:restored.id},data:{expiresAt:new Date(0)}});
    await assert.rejects(applyCrmImport(db,scope,{jobId:restored.id,previewDigest:oldDigest,rowKeys:rows.map(row=>row.rowKey)}),{code:'PREVIEW_EXPIRED'});
   } finally{await context.close();}
  }finally{await client.end();}
 },{migrate:false});
});
