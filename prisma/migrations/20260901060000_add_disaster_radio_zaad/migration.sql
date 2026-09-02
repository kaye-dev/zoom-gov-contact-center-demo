-- CreateEnum
CREATE TYPE "DisasterRadioConsentStatus" AS ENUM ('CONSENTED', 'NOT_CONSENTED');

-- CreateEnum
CREATE TYPE "DisasterRadioRegistrationSource" AS ENUM ('PUBLIC_FORM', 'ADMIN_FORM', 'ADMIN_CSV');

-- CreateEnum
CREATE TYPE "ZoomContactSyncStatus" AS ENUM ('NOT_ELIGIBLE', 'NOT_ASSIGNED', 'PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "ZaadMessageSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'SYNC_FAILED');

-- CreateEnum
CREATE TYPE "ZaadOneTimeDispatchState" AS ENUM ('DRAFT', 'PREPARING', 'READY', 'FAILED', 'RESULT_UNKNOWN');

-- CreateTable
CREATE TABLE "disaster_radio_subscriptions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "consentStatus" "DisasterRadioConsentStatus" NOT NULL,
    "consentVersion" TEXT,
    "consentedAt" TIMESTAMPTZ(3),
    "source" "DisasterRadioRegistrationSource" NOT NULL,
    "registeredByUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "zoomContactListId" TEXT,
    "zoomContactListNameSnapshot" TEXT,
    "zoomContactId" TEXT,
    "syncStatus" "ZoomContactSyncStatus" NOT NULL,
    "syncErrorCode" TEXT,
    "syncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disaster_radio_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "disaster_radio_subscriptions_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "disaster_radio_subscriptions_consent_check" CHECK (
      ("consentStatus" = 'CONSENTED' AND "consentVersion" IS NOT NULL AND "consentedAt" IS NOT NULL)
      OR ("consentStatus" = 'NOT_CONSENTED' AND "consentVersion" IS NULL AND "consentedAt" IS NULL)
    ),
    CONSTRAINT "disaster_radio_subscriptions_sync_check" CHECK (
      ("consentStatus" = 'NOT_CONSENTED' AND "syncStatus" = 'NOT_ELIGIBLE')
      OR (
        "consentStatus" = 'CONSENTED'
        AND "syncStatus" IN ('NOT_ASSIGNED', 'PENDING', 'SYNCED', 'FAILED')
      )
    )
);

-- CreateTable
CREATE TABLE "zaad_registration_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "contactListId" TEXT,
    "contactListNameSnapshot" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zaad_registration_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zaad_registration_settings_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "zaad_registration_settings_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "zaad_registration_settings_snapshot_check" CHECK (
      ("contactListId" IS NULL AND "contactListNameSnapshot" IS NULL)
      OR ("contactListId" IS NOT NULL AND "contactListNameSnapshot" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "zaad_outbound_messages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'ja-JP',
    "voiceId" TEXT NOT NULL,
    "zoomAssetId" TEXT,
    "zoomAssetItemId" TEXT,
    "syncStatus" "ZaadMessageSyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncErrorCode" TEXT,
    "syncedAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zaad_outbound_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zaad_outbound_messages_language_check" CHECK ("languageCode" = 'ja-JP'),
    CONSTRAINT "zaad_outbound_messages_revision_check" CHECK ("revision" > 0)
);

-- CreateTable
CREATE TABLE "zaad_one_time_dispatches" (
    "id" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'ja-JP',
    "voiceId" TEXT NOT NULL,
    "state" "ZaadOneTimeDispatchState" NOT NULL DEFAULT 'DRAFT',
    "baseCampaignId" TEXT NOT NULL,
    "selectedListCount" INTEGER NOT NULL DEFAULT 0,
    "selectedResidentCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "lastCompletedStep" TEXT,
    "zoomContactListId" TEXT,
    "zoomAssetId" TEXT,
    "zoomAssetItemId" TEXT,
    "zoomCampaignId" TEXT,
    "stableErrorCode" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zaad_one_time_dispatches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zaad_one_time_dispatches_language_check" CHECK ("languageCode" = 'ja-JP'),
    CONSTRAINT "zaad_one_time_dispatches_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "zaad_one_time_dispatches_counts_check" CHECK (
      "selectedListCount" >= 0
      AND "selectedResidentCount" >= 0
      AND "duplicateCount" >= 0
      AND "recipientCount" >= 0
      AND "recipientCount" <= 1000
    )
);

-- CreateTable
CREATE TABLE "zaad_one_time_dispatch_source_lists" (
    "dispatchId" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,
    "selectedOrder" INTEGER NOT NULL,

    CONSTRAINT "zaad_one_time_dispatch_source_lists_pkey" PRIMARY KEY ("dispatchId", "contactListId"),
    CONSTRAINT "zaad_one_time_dispatch_source_lists_order_check" CHECK ("selectedOrder" >= 0)
);

-- CreateTable
CREATE TABLE "zaad_one_time_dispatch_residents" (
    "dispatchId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentRevision" INTEGER NOT NULL,
    "selectedOrder" INTEGER NOT NULL,

    CONSTRAINT "zaad_one_time_dispatch_residents_pkey" PRIMARY KEY ("dispatchId", "residentId"),
    CONSTRAINT "zaad_one_time_dispatch_residents_revision_check" CHECK ("residentRevision" > 0),
    CONSTRAINT "zaad_one_time_dispatch_residents_order_check" CHECK ("selectedOrder" >= 0)
);

-- CreateTable
CREATE TABLE "zaad_admin_audits" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "resourceKind" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "changedFieldNames" TEXT[] NOT NULL,
    "fromConsentStatus" TEXT,
    "toConsentStatus" TEXT,
    "fromCampaignStatus" TEXT,
    "toCampaignStatus" TEXT,
    "stableErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zaad_admin_audits_pkey" PRIMARY KEY ("id")
);

-- Seed singleton without changing existing rows.
INSERT INTO "zaad_registration_settings" ("id", "revision", "updatedAt")
VALUES (1, 1, CURRENT_TIMESTAMP);

-- CreateIndex
CREATE UNIQUE INDEX "disaster_radio_subscriptions_normalizedEmail_normalizedPhone_key" ON "disaster_radio_subscriptions"("normalizedEmail", "normalizedPhone");

-- CreateIndex
CREATE INDEX "disaster_radio_subscriptions_createdAt_id_idx" ON "disaster_radio_subscriptions"("createdAt", "id");

-- CreateIndex
CREATE INDEX "disaster_radio_subscriptions_consentStatus_syncStatus_idx" ON "disaster_radio_subscriptions"("consentStatus", "syncStatus");

-- CreateIndex
CREATE INDEX "disaster_radio_subscriptions_zoomContactListId_idx" ON "disaster_radio_subscriptions"("zoomContactListId");

-- CreateIndex
CREATE INDEX "zaad_outbound_messages_updatedAt_id_idx" ON "zaad_outbound_messages"("updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "zaad_one_time_dispatches_operationKey_key" ON "zaad_one_time_dispatches"("operationKey");

-- CreateIndex
CREATE INDEX "zaad_one_time_dispatches_createdAt_id_idx" ON "zaad_one_time_dispatches"("createdAt", "id");

-- CreateIndex
CREATE INDEX "zaad_one_time_dispatches_state_updatedAt_idx" ON "zaad_one_time_dispatches"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "zaad_one_time_dispatch_source_lists_dispatchId_selectedOrder_key" ON "zaad_one_time_dispatch_source_lists"("dispatchId", "selectedOrder");

-- CreateIndex
CREATE UNIQUE INDEX "zaad_one_time_dispatch_residents_dispatchId_selectedOrder_key" ON "zaad_one_time_dispatch_residents"("dispatchId", "selectedOrder");

-- CreateIndex
CREATE INDEX "zaad_admin_audits_createdAt_id_idx" ON "zaad_admin_audits"("createdAt", "id");

-- CreateIndex
CREATE INDEX "zaad_admin_audits_actorUserId_createdAt_idx" ON "zaad_admin_audits"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "zaad_admin_audits_resourceKind_createdAt_idx" ON "zaad_admin_audits"("resourceKind", "createdAt");

-- AddForeignKey
ALTER TABLE "disaster_radio_subscriptions" ADD CONSTRAINT "disaster_radio_subscriptions_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaad_registration_settings" ADD CONSTRAINT "zaad_registration_settings_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaad_outbound_messages" ADD CONSTRAINT "zaad_outbound_messages_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaad_outbound_messages" ADD CONSTRAINT "zaad_outbound_messages_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaad_one_time_dispatches" ADD CONSTRAINT "zaad_one_time_dispatches_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaad_one_time_dispatch_source_lists" ADD CONSTRAINT "zaad_one_time_dispatch_source_lists_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "zaad_one_time_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zaad_one_time_dispatch_residents" ADD CONSTRAINT "zaad_one_time_dispatch_residents_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "zaad_one_time_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
