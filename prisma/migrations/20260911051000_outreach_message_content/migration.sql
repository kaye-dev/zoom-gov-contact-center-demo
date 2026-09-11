-- Keep historical snapshots and references; stop assigning sequential message versions.
ALTER TABLE "zaad_outbound_messages" ADD COLUMN "currentRevisionId" TEXT;
ALTER TABLE "outreach_message_revisions" ALTER COLUMN "revision" DROP NOT NULL, ALTER COLUMN "revision" DROP DEFAULT;
INSERT INTO "outreach_message_revisions" ("id","siteKey","messageId","revision","name","body","voiceId","languageCode","contentDigest","generationState","zoomAssetId","zoomAssetItemId","createdBy","createdAt")
SELECT 'legacy-current:' || md5(m."siteKey" || ':' || m.id), m."siteKey", m.id, m.revision, m.name, m.body, m."voiceId", m."languageCode", encode(sha256(convert_to('{"body":' || to_json(m.body)::text || ',"languageCode":' || to_json(m."languageCode")::text || ',"voiceId":' || to_json(m."voiceId")::text || '}', 'UTF8')), 'hex'), CASE WHEN m."zoomAssetId" IS NULL THEN 'NOT_GENERATED' ELSE 'LEGACY_UNVERIFIED' END, m."zoomAssetId",m."zoomAssetItemId",COALESCE(m."createdByUserId",'migration'),m."createdAt"
FROM "zaad_outbound_messages" m WHERE NOT EXISTS (SELECT 1 FROM "outreach_message_revisions" r WHERE r."siteKey"=m."siteKey" AND r."messageId"=m.id AND r.revision=m.revision);
UPDATE "zaad_outbound_messages" m SET "currentRevisionId"=r.id FROM "outreach_message_revisions" r WHERE r."siteKey"=m."siteKey" AND r."messageId"=m.id AND r.revision=m.revision;
CREATE UNIQUE INDEX "zaad_outbound_messages_siteKey_currentRevisionId_key" ON "zaad_outbound_messages"("siteKey","currentRevisionId");
ALTER TABLE "zaad_outbound_messages" ADD CONSTRAINT "zaad_outbound_messages_siteKey_currentRevisionId_fkey" FOREIGN KEY ("siteKey","currentRevisionId") REFERENCES "outreach_message_revisions"("siteKey","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zaad_outbound_messages" DROP COLUMN "revision";
ALTER TABLE "outreach_imported_audio_messages" DROP COLUMN "version", ADD COLUMN "providerBody" TEXT, ADD COLUMN "bodyFetchedAt" TIMESTAMPTZ(3), ADD COLUMN "submittedBody" TEXT, ADD COLUMN "unlinkedAt" TIMESTAMPTZ(3), ALTER COLUMN "bodyState" SET DEFAULT 'UNCHECKED';
ALTER TABLE "outreach_imported_audio_messages" DROP CONSTRAINT "outreach_imported_audio_messages_body_state_check";
ALTER TABLE "outreach_imported_audio_messages" ADD CONSTRAINT "outreach_imported_audio_messages_body_state_check" CHECK ("bodyState" IN ('PROVIDER_RETURNED','UNAVAILABLE','UNCHECKED','USER_AUTHORED'));
-- Existing imports were parsed without observing content; do not claim the provider omitted it.
UPDATE "outreach_imported_audio_messages" SET "bodyState"='UNCHECKED';
CREATE TABLE "outreach_message_locks" (
 "resourceKey" TEXT NOT NULL,
 "operationId" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "outreach_message_locks_pkey" PRIMARY KEY ("resourceKey")
);
CREATE UNIQUE INDEX "outreach_message_locks_operationId_key" ON "outreach_message_locks"("operationId");
