import assert from "node:assert/strict";
import { replayLegacy, applyMigration } from "../helpers/outreach-legacy-migrations";
import test from "node:test";
import { Client } from "pg";
import { withIsolatedPostgresDatabase } from "../helpers/isolated-postgres";
import { createDatabaseContext } from "../../lib/server/prisma";
import { saveOutreachMessage } from "../../lib/server/zaad/message-revisions";
import { digest } from "../../lib/server/zaad/outreach-data";

test("MESSAGE-COUNTER-01: migration preserves historical references and subsequent saves assign no counter", { timeout: 180000 }, async () => {
  await withIsolatedPostgresDatabase(async url => {
    const client = new Client({ connectionString: url }); await client.connect();
    try {
      await replayLegacy(client);
      await client.query(`INSERT INTO zaad_outbound_messages (id,"siteKey","departmentKey",name,body,"voiceId",revision) VALUES ('existing','lg','welfare','Existing','既存本文','Takumi',2),('missing','lg','procedures','Missing','改行'||chr(10)||'"引用"','Takumi',3)`);
      await client.query(`INSERT INTO outreach_message_revisions (id,"siteKey","messageId",revision,name,body,"voiceId","languageCode","contentDigest","createdBy") VALUES ('history','lg','existing',1,'Old','過去本文','Takumi','ja-JP','old-digest','actor'),('current','lg','existing',2,'Existing','既存本文','Takumi','ja-JP','current-digest','actor')`);
      await client.query(`INSERT INTO zaad_one_time_dispatches (id,"siteKey","operationKey","departmentKey",name,body,"voiceId","baseCampaignId","messageRevisionId",snapshot) VALUES ('dispatch','lg','legacy_dispatch','welfare','Past','過去本文','Takumi','campaign','history','{"departmentKey":"welfare","immutable":true}')`);
      await client.query(`INSERT INTO zoom_resource_bindings (id,"accountId","resourceType","zoomId","ownerSiteKey","departmentKey",purpose,"updatedAt") VALUES ('audio-binding','account','ASSET','asset','lg','welfare','REGULAR',now())`);
      await client.query(`INSERT INTO outreach_imported_audio_messages (id,"siteKey","bindingId","assetItemId",name,"languageCode","observedDigest","createdBy","updatedBy",version) VALUES ('audio','lg','audio-binding','item','Audio','ja-JP','digest','actor','actor',8)`);
      const oldSnapshots=(await client.query('SELECT * FROM outreach_message_revisions ORDER BY id')).rows;
      const oldDispatch=(await client.query('SELECT * FROM zaad_one_time_dispatches')).rows;
      await applyMigration(client,"20260911050000_outreach_tenant_scope");
      await applyMigration(client,"20260911051000_outreach_message_content");
      assert.deepEqual((await client.query("SELECT * FROM outreach_message_revisions WHERE id IN ('history','current') ORDER BY id")).rows,oldSnapshots);
      assert.deepEqual((await client.query('SELECT * FROM zaad_one_time_dispatches')).rows,oldDispatch);
      assert.equal((await client.query("SELECT \"currentRevisionId\" FROM zaad_outbound_messages WHERE id='existing'")).rows[0].currentRevisionId,'current');
      const fallback=(await client.query("SELECT * FROM outreach_message_revisions WHERE \"messageId\"='missing'")).rows[0];
      assert.equal(fallback.contentDigest,digest({body:'改行\n"引用"',languageCode:'ja-JP',voiceId:'Takumi'}));
      assert.equal(fallback.revision,3);
      const imported=(await client.query('SELECT * FROM outreach_imported_audio_messages')).rows[0];
      assert.equal(imported.bodyState,'UNCHECKED'); assert.equal(imported.providerBody,null); assert.equal('version' in imported,false);
      const context=createDatabaseContext({...process.env,DATABASE_URL:url,DATABASE_URL_UNPOOLED:url});
      try {
        const db=context.prisma,scope={siteKey:'lg' as const,actorId:'actor',all:true,live:false};
        await db.user.create({data:{id:'actor',name:'Test',email:'counter@example.invalid',emailVerified:true,createdAt:new Date(),updatedAt:new Date()}});
        const saved=await saveOutreachMessage(db,scope,{name:'New',body:'新本文',voiceId:'Takumi',languageCode:'ja-JP',departmentKey:'ignored'});
        assert.equal('revision' in saved,false); assert.equal('departmentKey' in saved,false);
        const next=await saveOutreachMessage(db,scope,{name:'Edited',body:'編集本文',voiceId:'Takumi',languageCode:'ja-JP',expectedUpdatedAt:saved.updatedAt.toISOString(),expectedDigest:saved.expectedDigest},saved.id);
        assert.notEqual(next.currentRevisionId,saved.currentRevisionId);
        await assert.rejects(saveOutreachMessage(db,scope,{name:'Stale',body:'古い入力',voiceId:'Takumi',languageCode:'ja-JP',expectedUpdatedAt:saved.updatedAt.toISOString(),expectedDigest:saved.expectedDigest},saved.id),{code:'CONTENT_CHANGED'});
        const counters=(await client.query('SELECT revision FROM outreach_message_revisions WHERE "messageId"=$1',[saved.id])).rows;
        assert.deepEqual(counters,[{revision:null},{revision:null}]);
        assert.equal((await client.query('SELECT "departmentKey" FROM zaad_outbound_messages WHERE id=$1',[saved.id])).rows[0].departmentKey,null);
        assert.deepEqual((await client.query('SELECT * FROM zaad_one_time_dispatches')).rows,oldDispatch);
      } finally {await context.close();}
    } finally {await client.end();}
  },{migrate:false});
});
