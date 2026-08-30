CREATE TABLE "site_developer_api_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "accountId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEncrypted" TEXT,
    "secretTokenEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_developer_api_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_developer_api_settings_singleton" CHECK ("id" = 1)
);
