BEGIN;

-- CreateEnum
CREATE TYPE "ZoomChatMode" AS ENUM (
    'DISABLED',
    'CAMPAIGN',
    'CONTACT_CENTER_ENTRY_ID'
);

-- Split representative phone settings from the legacy contact singleton.
CREATE TABLE "site_phone_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "representativePhoneDisplay" TEXT NOT NULL,
    "representativePhoneE164" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_phone_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_phone_settings_singleton" CHECK ("id" = 1)
);

INSERT INTO "site_phone_settings" (
    "id",
    "representativePhoneDisplay",
    "representativePhoneE164",
    "updatedAt"
)
SELECT
    "id",
    "representativePhoneDisplay",
    "representativePhoneE164",
    "updatedAt"
FROM "site_contact_settings";

-- Keep only the locale-specific AI phone destination.
CREATE TABLE "localized_ai_phone_settings" (
    "locale" "SiteLocale" NOT NULL,
    "aiPhoneE164" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "localized_ai_phone_settings_pkey" PRIMARY KEY ("locale")
);

INSERT INTO "localized_ai_phone_settings" (
    "locale",
    "aiPhoneE164",
    "updatedAt"
)
SELECT
    "locale",
    "aiPhoneE164",
    "updatedAt"
FROM "localized_ai_contact_settings";

-- Store both supported Zoom tags while activating at most one mode.
CREATE TABLE "site_chat_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activeMode" "ZoomChatMode" NOT NULL DEFAULT 'DISABLED',
    "campaignWebTag" TEXT,
    "campaignMemo" TEXT,
    "contactCenterEntryIdWebTag" TEXT,
    "contactCenterEntryIdMemo" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_chat_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_chat_settings_singleton" CHECK ("id" = 1),
    CONSTRAINT "site_chat_settings_active_tag" CHECK (
        "activeMode" = 'DISABLED'
        OR ("activeMode" = 'CAMPAIGN' AND "campaignWebTag" IS NOT NULL)
        OR (
            "activeMode" = 'CONTACT_CENTER_ENTRY_ID'
            AND "contactCenterEntryIdWebTag" IS NOT NULL
        )
    ),
    CONSTRAINT "site_chat_settings_campaign_tag_length" CHECK (
        "campaignWebTag" IS NULL
        OR char_length("campaignWebTag") BETWEEN 1 AND 4096
    ),
    CONSTRAINT "site_chat_settings_entry_tag_length" CHECK (
        "contactCenterEntryIdWebTag" IS NULL
        OR char_length("contactCenterEntryIdWebTag") BETWEEN 1 AND 4096
    ),
    CONSTRAINT "site_chat_settings_campaign_memo" CHECK (
        "campaignMemo" IS NULL
        OR (
            char_length("campaignMemo") BETWEEN 1 AND 4000
            AND btrim("campaignMemo") <> ''
        )
    ),
    CONSTRAINT "site_chat_settings_entry_memo" CHECK (
        "contactCenterEntryIdMemo" IS NULL
        OR (
            char_length("contactCenterEntryIdMemo") BETWEEN 1 AND 4000
            AND btrim("contactCenterEntryIdMemo") <> ''
        )
    )
);

INSERT INTO "site_chat_settings" (
    "id",
    "activeMode",
    "campaignWebTag",
    "campaignMemo",
    "contactCenterEntryIdWebTag",
    "contactCenterEntryIdMemo",
    "updatedAt"
)
SELECT
    "id",
    CASE
        WHEN NULLIF(btrim("zoomVirtualAgentWebTag"), '') IS NULL
            THEN 'DISABLED'::"ZoomChatMode"
        ELSE 'CAMPAIGN'::"ZoomChatMode"
    END,
    NULLIF(btrim("zoomVirtualAgentWebTag"), ''),
    NULL,
    NULL,
    NULL,
    "updatedAt"
FROM "site_contact_settings";

-- Abort before destructive cleanup if the source rows were not copied exactly.
DO $migration$
BEGIN
    IF (SELECT count(*) FROM "site_phone_settings") <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one migrated site phone setting';
    END IF;

    IF (SELECT count(*) FROM "site_chat_settings") <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one migrated site chat setting';
    END IF;

    IF (SELECT count(*) FROM "localized_ai_phone_settings")
        <> (SELECT count(*) FROM "localized_ai_contact_settings") THEN
        RAISE EXCEPTION 'Localized AI phone setting row count changed during migration';
    END IF;
END
$migration$;

DROP TABLE "localized_ai_contact_settings";
DROP TABLE "site_contact_settings";

COMMIT;
