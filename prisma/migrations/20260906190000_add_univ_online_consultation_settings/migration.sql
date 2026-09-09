CREATE TABLE "site_online_consultation_settings" (
  "siteKey" TEXT NOT NULL,
  "serviceKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "webClientTag" TEXT,
  "queueId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_online_consultation_settings_pkey" PRIMARY KEY ("siteKey", "serviceKey")
);

INSERT INTO "site_phone_settings" ("siteKey", "representativePhoneDisplay", "representativePhoneE164")
VALUES ('univ', '', '') ON CONFLICT ("siteKey") DO NOTHING;

INSERT INTO "localized_ai_phone_settings" ("siteKey", "locale", "aiPhoneE164")
VALUES ('univ', 'JA', NULL), ('univ', 'EN', NULL), ('univ', 'ZH_HANS', NULL), ('univ', 'ZH_HANT', NULL), ('univ', 'KO', NULL)
ON CONFLICT ("siteKey", "locale") DO NOTHING;

INSERT INTO "site_chat_settings" ("siteKey", "activeMode")
VALUES ('univ', 'DISABLED') ON CONFLICT ("siteKey") DO NOTHING;

INSERT INTO "locale_display_settings" ("siteKey", "locale", "enabled", "displayOrder")
VALUES ('univ', 'JA', true, 0), ('univ', 'EN', true, 1), ('univ', 'ZH_HANS', true, 2), ('univ', 'ZH_HANT', true, 3), ('univ', 'KO', true, 4)
ON CONFLICT ("siteKey", "locale") DO NOTHING;

INSERT INTO "site_maintenance_settings" ("siteKey", "environment", "mode")
VALUES ('univ', 'PRODUCTION', 'DISABLED'), ('univ', 'PREVIEW', 'DISABLED'), ('univ', 'DEVELOPMENT', 'DISABLED')
ON CONFLICT ("siteKey", "environment") DO NOTHING;

INSERT INTO "site_online_consultation_settings" ("siteKey", "serviceKey", "enabled")
VALUES ('univ', 'admissions', false), ('univ', 'student-support', false), ('univ', 'careers', false)
ON CONFLICT ("siteKey", "serviceKey") DO NOTHING;
