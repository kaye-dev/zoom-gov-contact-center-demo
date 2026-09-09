-- DropIndex
DROP INDEX "zaad_one_time_dispatches_operationKey_key";

-- CreateTable
CREATE TABLE "university_zaad_grants" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "liveExecution" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "university_zaad_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_contacts" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "facultyCode" TEXT,
    "admissionYear" INTEGER,
    "serial" TEXT,
    "displayStudentNumber" TEXT,
    "registrationSource" TEXT NOT NULL,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneEligible" BOOLEAN NOT NULL DEFAULT false,
    "priorNoticeAt" TIMESTAMPTZ(3),
    "selectionReason" TEXT NOT NULL DEFAULT '',
    "externalReference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "university_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_student_registrations" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facultyCode" TEXT NOT NULL,
    "admissionYear" INTEGER NOT NULL,
    "serial" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "topicIds" TEXT[],
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedName" TEXT,
    "reviewedPhone" TEXT,
    "reviewedTopicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "note" TEXT NOT NULL DEFAULT '',
    "identityConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "phoneConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "contactId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "university_student_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_notification_preferences" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceRequestId" TEXT NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL,
    "withdrawnAt" TIMESTAMPTZ(3),

    CONSTRAINT "university_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_contact_groups" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "representativeContactId" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "university_contact_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_group_memberships" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "university_group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_outreach_batches" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DEMO',
    "trigger" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "questionVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "operationKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "executeKey" TEXT,
    "providerAccountKey" TEXT,
    "providerResourceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMPTZ(3),

    CONSTRAINT "university_outreach_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_outreach_targets" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "contactId" TEXT,
    "groupId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maskedContact" TEXT NOT NULL,
    "contactVersion" INTEGER,
    "eligible" BOOLEAN NOT NULL,
    "exclusionReason" TEXT NOT NULL,
    "priorNoticeAt" TIMESTAMPTZ(3),
    "groupMemberCount" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "university_outreach_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_call_attempts" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "operationKey" TEXT NOT NULL,
    "callState" TEXT NOT NULL,
    "identityState" TEXT NOT NULL,
    "ackState" TEXT NOT NULL,
    "recognitionState" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "university_call_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_responses" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "providerAccountKey" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "university_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_intakes" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "place" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "support" TEXT NOT NULL,
    "callback" TEXT NOT NULL,
    "identityState" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "university_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_support_cases" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "targetId" TEXT,
    "intakeId" TEXT,
    "assigneeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "procedureStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "verificationAt" TIMESTAMPTZ(3),
    "verificationReference" TEXT,
    "dueAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "university_support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_case_actions" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actionKind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "university_case_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_venue_reserves" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "personRef" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "university_venue_reserves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "university_zaad_grants_siteKey_userId_departmentKey_key" ON "university_zaad_grants"("siteKey", "userId", "departmentKey");

-- CreateIndex
CREATE INDEX "university_contacts_siteKey_departmentKey_id_idx" ON "university_contacts"("siteKey", "departmentKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_contacts_siteKey_id_key" ON "university_contacts"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_contacts_siteKey_facultyCode_admissionYear_seria_key" ON "university_contacts"("siteKey", "facultyCode", "admissionYear", "serial");

-- CreateIndex
CREATE INDEX "university_student_registrations_siteKey_status_id_idx" ON "university_student_registrations"("siteKey", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_student_registrations_siteKey_id_key" ON "university_student_registrations"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_student_registrations_siteKey_requestKey_key" ON "university_student_registrations"("siteKey", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "university_notification_preferences_siteKey_contactId_topic_key" ON "university_notification_preferences"("siteKey", "contactId", "topicId");

-- CreateIndex
CREATE INDEX "university_contact_groups_siteKey_departmentKey_idx" ON "university_contact_groups"("siteKey", "departmentKey");

-- CreateIndex
CREATE UNIQUE INDEX "university_contact_groups_siteKey_id_key" ON "university_contact_groups"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_group_memberships_siteKey_groupId_contactId_key" ON "university_group_memberships"("siteKey", "groupId", "contactId");

-- CreateIndex
CREATE INDEX "university_outreach_batches_siteKey_departmentKey_id_idx" ON "university_outreach_batches"("siteKey", "departmentKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_outreach_batches_siteKey_id_key" ON "university_outreach_batches"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_outreach_batches_siteKey_operationKey_key" ON "university_outreach_batches"("siteKey", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "university_outreach_targets_siteKey_id_key" ON "university_outreach_targets"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_outreach_targets_siteKey_batchId_sourceKey_key" ON "university_outreach_targets"("siteKey", "batchId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "university_call_attempts_siteKey_id_key" ON "university_call_attempts"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_call_attempts_siteKey_targetId_attemptNo_key" ON "university_call_attempts"("siteKey", "targetId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "university_call_attempts_siteKey_operationKey_key" ON "university_call_attempts"("siteKey", "operationKey");

-- CreateIndex
CREATE INDEX "university_responses_siteKey_attemptId_eventVersion_idx" ON "university_responses"("siteKey", "attemptId", "eventVersion");

-- CreateIndex
CREATE UNIQUE INDEX "university_responses_siteKey_providerAccountKey_providerEve_key" ON "university_responses"("siteKey", "providerAccountKey", "providerEventId");

-- CreateIndex
CREATE INDEX "university_intakes_siteKey_departmentKey_id_idx" ON "university_intakes"("siteKey", "departmentKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_intakes_siteKey_id_key" ON "university_intakes"("siteKey", "id");

-- CreateIndex
CREATE INDEX "university_support_cases_siteKey_departmentKey_id_idx" ON "university_support_cases"("siteKey", "departmentKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_support_cases_siteKey_id_key" ON "university_support_cases"("siteKey", "id");

-- CreateIndex
CREATE UNIQUE INDEX "university_support_cases_siteKey_targetId_key" ON "university_support_cases"("siteKey", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "university_support_cases_siteKey_intakeId_key" ON "university_support_cases"("siteKey", "intakeId");

-- CreateIndex
CREATE INDEX "university_case_actions_siteKey_caseId_occurredAt_idx" ON "university_case_actions"("siteKey", "caseId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "university_venue_reserves_siteKey_batchId_personRef_key" ON "university_venue_reserves"("siteKey", "batchId", "personRef");

-- CreateIndex
CREATE UNIQUE INDEX "zaad_one_time_dispatches_siteKey_operationKey_key" ON "zaad_one_time_dispatches"("siteKey", "operationKey");

-- AddForeignKey
ALTER TABLE "university_student_registrations" ADD CONSTRAINT "university_student_registrations_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "university_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_notification_preferences" ADD CONSTRAINT "university_notification_preferences_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "university_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_contact_groups" ADD CONSTRAINT "university_contact_groups_siteKey_representativeContactId_fkey" FOREIGN KEY ("siteKey", "representativeContactId") REFERENCES "university_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_group_memberships" ADD CONSTRAINT "university_group_memberships_siteKey_contactId_fkey" FOREIGN KEY ("siteKey", "contactId") REFERENCES "university_contacts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_group_memberships" ADD CONSTRAINT "university_group_memberships_siteKey_groupId_fkey" FOREIGN KEY ("siteKey", "groupId") REFERENCES "university_contact_groups"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_outreach_targets" ADD CONSTRAINT "university_outreach_targets_siteKey_batchId_fkey" FOREIGN KEY ("siteKey", "batchId") REFERENCES "university_outreach_batches"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_call_attempts" ADD CONSTRAINT "university_call_attempts_siteKey_targetId_fkey" FOREIGN KEY ("siteKey", "targetId") REFERENCES "university_outreach_targets"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_responses" ADD CONSTRAINT "university_responses_siteKey_attemptId_fkey" FOREIGN KEY ("siteKey", "attemptId") REFERENCES "university_call_attempts"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_support_cases" ADD CONSTRAINT "university_support_cases_siteKey_targetId_fkey" FOREIGN KEY ("siteKey", "targetId") REFERENCES "university_outreach_targets"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_support_cases" ADD CONSTRAINT "university_support_cases_siteKey_intakeId_fkey" FOREIGN KEY ("siteKey", "intakeId") REFERENCES "university_intakes"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_case_actions" ADD CONSTRAINT "university_case_actions_siteKey_caseId_fkey" FOREIGN KEY ("siteKey", "caseId") REFERENCES "university_support_cases"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_venue_reserves" ADD CONSTRAINT "university_venue_reserves_siteKey_batchId_fkey" FOREIGN KEY ("siteKey", "batchId") REFERENCES "university_outreach_batches"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain checks are additive; existing municipal records and IDs are retained.
ALTER TABLE university_contacts ADD CONSTRAINT university_contact_student_number_check CHECK (
  ("facultyCode" IS NULL AND "admissionYear" IS NULL AND serial IS NULL AND "displayStudentNumber" IS NULL)
  OR ("facultyCode" ~ '^[1-7]$' AND "admissionYear" BETWEEN 1900 AND 9999 AND serial ~ '^[0-9]{4}$'
      AND "displayStudentNumber" = "facultyCode" || right("admissionYear"::text, 2) || serial)
);
ALTER TABLE university_student_registrations ADD CONSTRAINT university_registration_status_check CHECK (status IN ('PENDING_REVIEW','ACTIVE','WITHDRAWN'));
ALTER TABLE university_student_registrations ADD CONSTRAINT university_registration_source_check CHECK (source IN ('STUDENT_PUBLIC','UNIVERSITY_STAFF'));
ALTER TABLE university_student_registrations ADD CONSTRAINT university_registration_identity_check CHECK ("facultyCode" ~ '^[1-7]$' AND serial ~ '^[0-9]{4}$' AND "admissionYear" BETWEEN 1900 AND 9999);
ALTER TABLE university_contact_groups ADD CONSTRAINT university_group_population_check CHECK ("memberCount" > 0);
ALTER TABLE university_outreach_targets ADD CONSTRAINT university_target_population_check CHECK ("groupMemberCount" > 0);
ALTER TABLE university_outreach_batches ADD CONSTRAINT university_batch_mode_check CHECK (mode IN ('DEMO','LIVE'));
ALTER TABLE university_outreach_batches ADD CONSTRAINT university_batch_purpose_check CHECK (purpose IN ('admissions','scholarship','staff','class-change','facility','group','continuity'));
ALTER TABLE university_intakes ADD CONSTRAINT university_intake_direction_check CHECK (direction='INBOUND');
ALTER TABLE university_support_cases ADD CONSTRAINT university_case_status_check CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED_UNREACHED'));
ALTER TABLE university_support_cases ADD CONSTRAINT university_case_parent_check CHECK (("targetId" IS NOT NULL)::int + ("intakeId" IS NOT NULL)::int = 1);
ALTER TABLE university_support_cases ADD CONSTRAINT university_procedure_verification_check CHECK ("procedureStatus" IN ('UNKNOWN','PLANNED','VERIFIED','NA') AND ("procedureStatus" <> 'VERIFIED' OR ("verificationAt" IS NOT NULL AND length(trim("verificationReference")) > 0)));
ALTER TABLE university_case_actions ADD CONSTRAINT university_action_minutes_check CHECK (minutes >= 0);
ALTER TABLE university_responses ADD CONSTRAINT university_response_version_check CHECK ("eventVersion" > 0);
