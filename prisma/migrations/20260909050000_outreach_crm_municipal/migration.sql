-- AlterTable
ALTER TABLE "zaad_outbound_messages" ADD COLUMN     "departmentKey" TEXT,
ADD COLUMN     "retiredAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "zaad_one_time_dispatches" ADD COLUMN     "appState" TEXT,
ADD COLUMN     "connectionMode" TEXT,
ADD COLUMN     "departmentKey" TEXT,
ADD COLUMN     "draft" JSONB,
ADD COLUMN     "expiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "flowBindingId" TEXT,
ADD COLUMN     "messageRevisionId" TEXT,
ADD COLUMN     "parentDispatchId" TEXT,
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "snapshotDigest" TEXT;

-- AlterTable
ALTER TABLE "university_contacts" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "registrationStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW';

-- CreateTable
CREATE TABLE "zoom_resource_bindings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "zoomId" TEXT NOT NULL,
    "ownerSiteKey" TEXT NOT NULL,
    "departmentKey" TEXT,
    "purpose" TEXT NOT NULL,
    "notificationTopic" TEXT,
    "dispatchId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "observedDigest" TEXT,
    "tombstone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "zoom_resource_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zoom_contact_memberships" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "zoomContactId" TEXT NOT NULL,
    "personOrigin" TEXT,
    "personId" TEXT,
    "observedDigest" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "attestation" TEXT,
    "lastSyncedVersion" INTEGER,
    "syncState" TEXT NOT NULL DEFAULT 'UNLINKED',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "zoom_contact_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_operations" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_import_jobs" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "previewDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_import_rows" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "candidate" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "personOrigin" TEXT,
    "personId" TEXT,

    CONSTRAINT "crm_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_message_revisions" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "generationState" TEXT NOT NULL DEFAULT 'NOT_GENERATED',
    "accountId" TEXT,
    "zoomAssetId" TEXT,
    "zoomAssetItemId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_message_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_contacts" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL DEFAULT 'resident-support',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "district" TEXT,
    "contactKind" TEXT NOT NULL DEFAULT 'RESIDENT',
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmationMethod" TEXT,
    "attestation" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "municipal_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_notification_registrations" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "topics" TEXT[],
    "availability" JSONB,
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMPTZ(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'HP',
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_notification_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_notification_preferences" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "requested" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "consentVersion" TEXT,
    "consentedAt" TIMESTAMPTZ(3),
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "withdrawnAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "municipal_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_availability" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "requested" JSONB NOT NULL,
    "confirmed" JSONB,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),

    CONSTRAINT "municipal_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_legacy_links" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "legacyOrigin" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "attestation" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_legacy_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_caller_notices" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "callerPhone" TEXT NOT NULL,
    "officeUrl" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "municipal_caller_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_workflow_revisions" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "questionVersion" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "flowBindingId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_workflow_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_workflow_targets" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "workflowRevisionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "businessEvidence" JSONB NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "verifiedBy" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "municipal_workflow_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_outreach_runs" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "workflowRevisionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREVIEW',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_outreach_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_target_snapshots" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactVersion" INTEGER NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "municipal_target_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_call_attempts" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "targetSnapshotId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "questionVersion" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "flowBindingId" TEXT NOT NULL,
    "engagementId" TEXT,
    "capabilityDigest" TEXT,
    "capabilityExpiresAt" TIMESTAMPTZ(3),
    "callState" TEXT NOT NULL DEFAULT 'QUEUED',
    "identityState" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "ackState" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
    "recognitionState" TEXT NOT NULL DEFAULT 'NONE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_call_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_responses" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "questionVersion" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "outcome" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_support_cases" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "targetSnapshotId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "reasons" TEXT[],
    "assigneeId" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "handoff" JSONB,
    "businessVerification" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_case_actions" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_case_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_schedule_jobs" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "scheduleRevision" INTEGER NOT NULL,
    "targetSnapshotId" TEXT NOT NULL,
    "dueSlot" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),

    CONSTRAINT "municipal_schedule_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_outbox" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'READY',
    "providerResult" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "municipal_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_provider_inbox" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT,
    "accountId" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "eventKind" TEXT NOT NULL,
    "engagementId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RECEIVED',
    "errorCode" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_provider_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_zoom_audio_revisions" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "messageRevisionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT,
    "assetItemId" TEXT,
    "voiceId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "syncState" TEXT NOT NULL DEFAULT 'NOT_GENERATED',
    "operationKey" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_zoom_audio_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_consent_evidence" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "personOrigin" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "contactVersion" INTEGER NOT NULL,
    "topics" TEXT[],
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMPTZ(3) NOT NULL,
    "method" TEXT NOT NULL,
    "attestation" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_consent_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_import_candidates" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "studentNumber" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ZCC',
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "linkedContactId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "outreach_import_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zoom_resource_bindings_ownerSiteKey_departmentKey_purpose_idx" ON "zoom_resource_bindings"("ownerSiteKey", "departmentKey", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "zoom_resource_bindings_accountId_resourceType_zoomId_key" ON "zoom_resource_bindings"("accountId", "resourceType", "zoomId");

-- CreateIndex
CREATE UNIQUE INDEX "zoom_resource_bindings_ownerSiteKey_id_key" ON "zoom_resource_bindings"("ownerSiteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "zoom_contact_memberships_siteKey_bindingId_zoomContactId_key" ON "zoom_contact_memberships"("siteKey", "bindingId", "zoomContactId");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_operations_siteKey_actorId_kind_operationKey_key" ON "outreach_operations"("siteKey", "actorId", "kind", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "crm_import_jobs_siteKey_id_key" ON "crm_import_jobs"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_import_jobs_siteKey_actorId_operationKey_key" ON "crm_import_jobs"("siteKey", "actorId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "crm_import_rows_siteKey_jobId_rowKey_key" ON "crm_import_rows"("siteKey", "jobId", "rowKey");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_message_revisions_siteKey_messageId_revision_key" ON "outreach_message_revisions"("siteKey", "messageId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_message_revisions_siteKey_id_key" ON "outreach_message_revisions"("siteKey", "id");

-- CreateIndex
CREATE INDEX "municipal_contacts_siteKey_departmentKey_createdAt_id_idx" ON "municipal_contacts"("siteKey", "departmentKey", "createdAt", "id");

-- CreateIndex
CREATE INDEX "municipal_contacts_siteKey_phone_idx" ON "municipal_contacts"("siteKey", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_contacts_siteKey_id_key" ON "municipal_contacts"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_notification_registrations_siteKey_operationKey_key" ON "municipal_notification_registrations"("siteKey", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_notification_preferences_siteKey_contactId_topic_key" ON "municipal_notification_preferences"("siteKey", "contactId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_availability_siteKey_contactId_revision_key" ON "municipal_availability"("siteKey", "contactId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_legacy_links_siteKey_legacyOrigin_legacyId_key" ON "municipal_legacy_links"("siteKey", "legacyOrigin", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_caller_notices_siteKey_departmentKey_key" ON "municipal_caller_notices"("siteKey", "departmentKey");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_workflow_revisions_siteKey_id_key" ON "municipal_workflow_revisions"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_workflow_revisions_siteKey_workflowId_revision_key" ON "municipal_workflow_revisions"("siteKey", "workflowId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_workflow_targets_siteKey_id_key" ON "municipal_workflow_targets"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_workflow_targets_siteKey_workflowRevisionId_conta_key" ON "municipal_workflow_targets"("siteKey", "workflowRevisionId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_outreach_runs_siteKey_id_key" ON "municipal_outreach_runs"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_outreach_runs_siteKey_actorId_operationKey_key" ON "municipal_outreach_runs"("siteKey", "actorId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_target_snapshots_siteKey_id_key" ON "municipal_target_snapshots"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_target_snapshots_siteKey_runId_contactId_key" ON "municipal_target_snapshots"("siteKey", "runId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_call_attempts_siteKey_id_key" ON "municipal_call_attempts"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_call_attempts_siteKey_targetSnapshotId_attemptNo_key" ON "municipal_call_attempts"("siteKey", "targetSnapshotId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_call_attempts_providerAccountId_engagementId_key" ON "municipal_call_attempts"("providerAccountId", "engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_responses_siteKey_attemptId_receiptId_key" ON "municipal_responses"("siteKey", "attemptId", "receiptId");

-- CreateIndex
CREATE INDEX "municipal_support_cases_siteKey_departmentKey_status_dueAt_idx" ON "municipal_support_cases"("siteKey", "departmentKey", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_support_cases_siteKey_id_key" ON "municipal_support_cases"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_support_cases_siteKey_targetSnapshotId_key" ON "municipal_support_cases"("siteKey", "targetSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_case_actions_siteKey_caseId_actorId_operationKey_key" ON "municipal_case_actions"("siteKey", "caseId", "actorId", "operationKey");

-- CreateIndex
CREATE INDEX "municipal_schedule_jobs_state_dueAt_idx" ON "municipal_schedule_jobs"("state", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_schedule_jobs_siteKey_id_key" ON "municipal_schedule_jobs"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_job_slot_target_attempt_key" ON "municipal_schedule_jobs"("siteKey", "workflowId", "scheduleRevision", "dueSlot", "targetSnapshotId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_outbox_siteKey_jobId_key" ON "municipal_outbox"("siteKey", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_outbox_siteKey_operationKey_key" ON "municipal_outbox"("siteKey", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_provider_inbox_dedupKey_key" ON "municipal_provider_inbox"("dedupKey");

-- CreateIndex
CREATE INDEX "municipal_provider_inbox_state_receivedAt_idx" ON "municipal_provider_inbox"("state", "receivedAt");

-- CreateIndex
CREATE INDEX "outreach_zoom_audio_revisions_siteKey_messageRevisionId_idx" ON "outreach_zoom_audio_revisions"("siteKey", "messageRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_zoom_audio_revisions_siteKey_operationKey_key" ON "outreach_zoom_audio_revisions"("siteKey", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_zoom_audio_revisions_accountId_assetId_assetItemId_key" ON "outreach_zoom_audio_revisions"("accountId", "assetId", "assetItemId");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_consent_evidence_siteKey_personOrigin_personId_con_key" ON "outreach_consent_evidence"("siteKey", "personOrigin", "personId", "contactVersion");

-- CreateIndex
CREATE INDEX "outreach_import_candidates_siteKey_departmentKey_id_idx" ON "outreach_import_candidates"("siteKey", "departmentKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_import_candidates_siteKey_id_key" ON "outreach_import_candidates"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "zaad_outbound_messages_siteKey_id_key" ON "zaad_outbound_messages"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "zaad_one_time_dispatches_siteKey_id_key" ON "zaad_one_time_dispatches"("siteKey", "id");

-- AddForeignKey
ALTER TABLE "zaad_one_time_dispatches" ADD CONSTRAINT "zaad_one_time_dispatches_siteKey_messageRevisionId_fkey" FOREIGN KEY ("siteKey", "messageRevisionId") REFERENCES "outreach_message_revisions"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zoom_contact_memberships" ADD CONSTRAINT "zoom_contact_memberships_siteKey_bindingId_fkey" FOREIGN KEY ("siteKey", "bindingId") REFERENCES "zoom_resource_bindings"("ownerSiteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_import_rows" ADD CONSTRAINT "crm_import_rows_siteKey_jobId_fkey" FOREIGN KEY ("siteKey", "jobId") REFERENCES "crm_import_jobs"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_message_revisions" ADD CONSTRAINT "outreach_message_revisions_siteKey_messageId_fkey" FOREIGN KEY ("siteKey", "messageId") REFERENCES "zaad_outbound_messages"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_notification_registrations" ADD CONSTRAINT "municipal_notification_registrations_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "municipal_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_notification_preferences" ADD CONSTRAINT "municipal_notification_preferences_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "municipal_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_availability" ADD CONSTRAINT "municipal_availability_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "municipal_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_legacy_links" ADD CONSTRAINT "municipal_legacy_links_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "municipal_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_workflow_revisions" ADD CONSTRAINT "municipal_workflow_revisions_siteKey_flowBindingId_fkey" FOREIGN KEY ("siteKey", "flowBindingId") REFERENCES "zoom_resource_bindings"("ownerSiteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_workflow_targets" ADD CONSTRAINT "municipal_workflow_targets_siteKey_workflowRevisionId_fkey" FOREIGN KEY ("siteKey", "workflowRevisionId") REFERENCES "municipal_workflow_revisions"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_workflow_targets" ADD CONSTRAINT "municipal_workflow_targets_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "municipal_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_outreach_runs" ADD CONSTRAINT "municipal_outreach_runs_siteKey_workflowRevisionId_fkey" FOREIGN KEY ("siteKey", "workflowRevisionId") REFERENCES "municipal_workflow_revisions"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_target_snapshots" ADD CONSTRAINT "municipal_target_snapshots_siteKey_runId_fkey" FOREIGN KEY ("siteKey", "runId") REFERENCES "municipal_outreach_runs"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_target_snapshots" ADD CONSTRAINT "municipal_target_snapshots_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "municipal_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_target_snapshots" ADD CONSTRAINT "municipal_target_snapshots_siteKey_targetId_fkey" FOREIGN KEY ("siteKey", "targetId") REFERENCES "municipal_workflow_targets"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_call_attempts" ADD CONSTRAINT "municipal_call_attempts_siteKey_targetSnapshotId_fkey" FOREIGN KEY ("siteKey", "targetSnapshotId") REFERENCES "municipal_target_snapshots"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_call_attempts" ADD CONSTRAINT "municipal_call_attempts_siteKey_flowBindingId_fkey" FOREIGN KEY ("siteKey", "flowBindingId") REFERENCES "zoom_resource_bindings"("ownerSiteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_responses" ADD CONSTRAINT "municipal_responses_siteKey_attemptId_fkey" FOREIGN KEY ("siteKey", "attemptId") REFERENCES "municipal_call_attempts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_support_cases" ADD CONSTRAINT "municipal_support_cases_siteKey_targetSnapshotId_fkey" FOREIGN KEY ("siteKey", "targetSnapshotId") REFERENCES "municipal_target_snapshots"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_case_actions" ADD CONSTRAINT "municipal_case_actions_siteKey_caseId_fkey" FOREIGN KEY ("siteKey", "caseId") REFERENCES "municipal_support_cases"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_schedule_jobs" ADD CONSTRAINT "municipal_schedule_jobs_siteKey_targetSnapshotId_fkey" FOREIGN KEY ("siteKey", "targetSnapshotId") REFERENCES "municipal_target_snapshots"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_outbox" ADD CONSTRAINT "municipal_outbox_siteKey_jobId_fkey" FOREIGN KEY ("siteKey", "jobId") REFERENCES "municipal_schedule_jobs"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_zoom_audio_revisions" ADD CONSTRAINT "outreach_zoom_audio_revisions_siteKey_messageRevisionId_fkey" FOREIGN KEY ("siteKey", "messageRevisionId") REFERENCES "outreach_message_revisions"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
