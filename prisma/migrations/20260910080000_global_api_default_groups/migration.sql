-- CreateTable
CREATE TABLE "global_developer_api_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "accountId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEncrypted" TEXT,
    "secretTokenEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_developer_api_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_default_groups" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "bindingId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "outreach_default_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_registration_memberships" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "defaultGroupId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "bindingRevision" INTEGER NOT NULL DEFAULT 0,
    "zoomContactId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "desiredDigest" TEXT,
    "observedDigest" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "lastErrorCode" TEXT,
    "retryAfter" TIMESTAMPTZ(3),
    "claimToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),

    CONSTRAINT "outreach_registration_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_group_sync_operations" (
    "id" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupKind" TEXT NOT NULL DEFAULT 'DEFAULT',
    "operationKey" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_group_sync_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_group_sync_items" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,

    CONSTRAINT "outreach_group_sync_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_default_groups_bindingId_key" ON "outreach_default_groups"("bindingId");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_default_groups_siteKey_topicKey_key" ON "outreach_default_groups"("siteKey", "topicKey");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_default_groups_siteKey_id_key" ON "outreach_default_groups"("siteKey", "id");

-- CreateIndex
CREATE INDEX "outreach_registration_memberships_siteKey_defaultGroupId_sy_idx" ON "outreach_registration_memberships"("siteKey", "defaultGroupId", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_registration_memberships_siteKey_defaultGroupId_or_key" ON "outreach_registration_memberships"("siteKey", "defaultGroupId", "origin", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_group_sync_operations_siteKey_actorId_operationKey_key" ON "outreach_group_sync_operations"("siteKey", "actorId", "operationKey");

-- CreateIndex
CREATE INDEX "outreach_group_sync_items_operationId_status_idx" ON "outreach_group_sync_items"("operationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_group_sync_items_operationId_membershipId_key" ON "outreach_group_sync_items"("operationId", "membershipId");

-- AddForeignKey
ALTER TABLE "outreach_default_groups" ADD CONSTRAINT "outreach_default_groups_siteKey_bindingId_fkey" FOREIGN KEY ("siteKey", "bindingId") REFERENCES "zoom_resource_bindings"("ownerSiteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_registration_memberships" ADD CONSTRAINT "outreach_registration_memberships_siteKey_defaultGroupId_fkey" FOREIGN KEY ("siteKey", "defaultGroupId") REFERENCES "outreach_default_groups"("siteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_group_sync_items" ADD CONSTRAINT "outreach_group_sync_items_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "outreach_group_sync_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The global credential store has exactly one possible key. Legacy ciphertexts
-- are deliberately left intact for the explicit migration command.
ALTER TABLE "global_developer_api_settings" ADD CONSTRAINT "global_api_singleton" CHECK ("id" = 'global');
CREATE UNIQUE INDEX "registration_membership_zoom_contact_key" ON "outreach_registration_memberships"("siteKey", "defaultGroupId", "zoomContactId");
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-lg-elder-watch', 'lg', 'elder-watch') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-lg-procedure-support', 'lg', 'procedure-support') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-lg-service-confirmation', 'lg', 'service-confirmation') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-lg-fraud-alert', 'lg', 'fraud-alert') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-lg-disaster-radio', 'lg', 'disaster-radio') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-univ-scholarship', 'univ', 'scholarship') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-univ-class-change', 'univ', 'class-change') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-univ-facility', 'univ', 'facility') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-univ-group', 'univ', 'group') ON CONFLICT DO NOTHING;
INSERT INTO "outreach_default_groups" ("id", "siteKey", "topicKey") VALUES ('default-univ-continuity', 'univ', 'continuity') ON CONFLICT DO NOTHING;

-- Adopt a proven legacy radio binding without contacting or mutating Zoom.
UPDATE "outreach_default_groups" g SET "bindingId" = b.id
FROM "zaad_registration_settings" s
JOIN "site_developer_api_settings" a ON a."siteKey" = s."siteKey"
JOIN "zoom_resource_bindings" b ON b."ownerSiteKey" = s."siteKey" AND b."accountId" = a."accountId" AND b."zoomId" = s."contactListId" AND b."resourceType" = 'CONTACT_LIST'
WHERE g.id = 'default-lg-disaster-radio' AND s."siteKey" = 'lg' AND b.purpose = 'REGULAR' AND b."dispatchId" IS NULL AND NOT b.tombstone
AND NOT EXISTS (SELECT 1 FROM "zoom_resource_bindings" other WHERE other."accountId" = b."accountId" AND other."resourceType" = 'CONTACT_LIST' AND other."zoomId" = b."zoomId" AND other."ownerSiteKey" <> 'lg' AND NOT other.tombstone);

INSERT INTO "outreach_registration_memberships" (id, "siteKey", "defaultGroupId", origin, "sourceId")
SELECT 'backfill-univ-' || md5(r.id || ':' || g.id), r."siteKey", g.id, 'UNIVERSITY_REGISTRATION', r.id
FROM "university_student_registrations" r JOIN "outreach_default_groups" g ON g."siteKey" = r."siteKey" AND g."topicKey" = ANY(CASE WHEN r."reviewedAt" IS NULL THEN r."topicIds" ELSE r."reviewedTopicIds" END)
WHERE r."siteKey" = 'univ' AND r.status NOT IN ('WITHDRAWN', 'REJECTED') AND r."consentedAt" IS NOT NULL AND r."consentVersion" <> ''
AND NOT EXISTS (SELECT 1 FROM "university_notification_preferences" p WHERE p."siteKey" = r."siteKey" AND p."contactId" = r."contactId" AND p."topicId" = g."topicKey" AND p."withdrawnAt" IS NOT NULL)
ON CONFLICT DO NOTHING;

INSERT INTO "outreach_registration_memberships" (id, "siteKey", "defaultGroupId", origin, "sourceId")
SELECT 'backfill-lg-' || md5(c.id || ':' || g.id), c."siteKey", g.id, 'MUNICIPAL_CONTACT', c.id
FROM "municipal_contacts" c JOIN "municipal_notification_preferences" p ON p."siteKey" = c."siteKey" AND p."contactId" = c.id
JOIN "outreach_default_groups" g ON g."siteKey" = c."siteKey" AND g."topicKey" = p.topic
WHERE c."siteKey" = 'lg' AND c."deletedAt" IS NULL AND c.status <> 'WITHDRAWN' AND p.requested AND p."withdrawnAt" IS NULL AND p."consentedAt" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "outreach_registration_memberships" (id, "siteKey", "defaultGroupId", origin, "sourceId", "zoomContactId", "bindingRevision", "syncStatus", "lastErrorCode")
SELECT 'backfill-radio-' || md5(r.id), r."siteKey", g.id, 'DISASTER_RADIO', r.id,
CASE WHEN b."zoomId" = r."zoomContactListId" THEN r."zoomContactId" ELSE NULL END,
CASE WHEN b."zoomId" = r."zoomContactListId" THEN g.revision ELSE 0 END,
CASE WHEN r."zoomContactId" IS NOT NULL THEN 'UNKNOWN' ELSE 'PENDING' END,
CASE WHEN r."zoomContactId" IS NOT NULL THEN 'PROVIDER_RESULT_REQUIRES_RECONCILIATION' ELSE NULL END
FROM "disaster_radio_subscriptions" r JOIN "outreach_default_groups" g ON g.id = 'default-lg-disaster-radio'
LEFT JOIN "zoom_resource_bindings" b ON b.id = g."bindingId"
WHERE r."siteKey" = 'lg' AND r."consentStatus" = 'CONSENTED'
ON CONFLICT DO NOTHING;

ALTER TABLE "outreach_registration_memberships" ADD COLUMN "attestation" TEXT, ADD COLUMN "reconciledBy" TEXT, ADD COLUMN "reconciledAt" TIMESTAMPTZ(3);
ALTER TABLE "outreach_group_sync_items" ADD COLUMN "claimedAt" TIMESTAMPTZ(3);
