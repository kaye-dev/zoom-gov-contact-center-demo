-- Preserve existing text messages and Zoom audio; store only imported metadata.
CREATE TABLE "outreach_imported_audio_messages" (
  "id" TEXT NOT NULL,
  "siteKey" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "assetItemId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL,
  "voiceId" TEXT,
  "bodyState" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  "observedDigest" TEXT NOT NULL,
  "sourceModifiedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outreach_imported_audio_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outreach_imported_audio_messages_body_state_check" CHECK ("bodyState" = 'UNAVAILABLE')
);
CREATE UNIQUE INDEX "outreach_imported_audio_messages_bindingId_assetItemId_key"
  ON "outreach_imported_audio_messages"("bindingId", "assetItemId");
CREATE UNIQUE INDEX "outreach_imported_audio_messages_siteKey_id_key"
  ON "outreach_imported_audio_messages"("siteKey", "id");
CREATE INDEX "outreach_imported_audio_messages_siteKey_updatedAt_id_idx"
  ON "outreach_imported_audio_messages"("siteKey", "updatedAt", "id");
ALTER TABLE "outreach_imported_audio_messages"
  ADD CONSTRAINT "outreach_imported_audio_messages_siteKey_bindingId_fkey"
  FOREIGN KEY ("siteKey", "bindingId") REFERENCES "zoom_resource_bindings"("ownerSiteKey", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
