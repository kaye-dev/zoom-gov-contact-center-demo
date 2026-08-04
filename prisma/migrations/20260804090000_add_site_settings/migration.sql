-- CreateEnum
CREATE TYPE "SiteLocale" AS ENUM ('JA', 'EN', 'ZH_HANS', 'ZH_HANT', 'KO');

-- CreateTable
CREATE TABLE "site_contact_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "representativePhoneDisplay" TEXT NOT NULL,
    "representativePhoneE164" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_contact_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_contact_settings_singleton" CHECK ("id" = 1)
);

-- CreateTable
CREATE TABLE "localized_ai_contact_settings" (
    "locale" "SiteLocale" NOT NULL,
    "aiPhoneE164" TEXT,
    "virtualAgentCampaignUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "localized_ai_contact_settings_pkey" PRIMARY KEY ("locale")
);

-- CreateTable
CREATE TABLE "locale_display_settings" (
    "locale" "SiteLocale" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locale_display_settings_pkey" PRIMARY KEY ("locale")
);

-- CreateIndex
CREATE INDEX "locale_display_settings_displayOrder_idx"
ON "locale_display_settings"("displayOrder");

-- Seed singleton and all supported locales.
INSERT INTO "site_contact_settings" (
    "id",
    "representativePhoneDisplay",
    "representativePhoneE164"
) VALUES (1, '(03)1234-5678', '+81312345678');

INSERT INTO "localized_ai_contact_settings" (
    "locale",
    "aiPhoneE164",
    "virtualAgentCampaignUrl"
) VALUES
    ('JA', NULL, NULL),
    ('EN', NULL, NULL),
    ('ZH_HANS', NULL, NULL),
    ('ZH_HANT', NULL, NULL),
    ('KO', NULL, NULL);

INSERT INTO "locale_display_settings" (
    "locale",
    "enabled",
    "displayOrder"
) VALUES
    ('JA', true, 0),
    ('EN', true, 1),
    ('ZH_HANS', true, 2),
    ('ZH_HANT', true, 3),
    ('KO', true, 4);
