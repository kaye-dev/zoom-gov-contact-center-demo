CREATE TYPE "ReservationApiPermission" AS ENUM (
  'LIST',
  'READ',
  'CREATE',
  'UPDATE',
  'DELETE'
);

ALTER TABLE "reservation_bookings"
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3);

CREATE TABLE "reservation_api_keys" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdByUserId" TEXT,
  "revokedByUserId" TEXT,

  CONSTRAINT "reservation_api_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_api_keys_name_check" CHECK (char_length("name") BETWEEN 1 AND 100),
  CONSTRAINT "reservation_api_keys_public_id_check" CHECK (char_length("publicId") = 16),
  CONSTRAINT "reservation_api_keys_secret_hash_check" CHECK (char_length("secretHash") = 64),
  CONSTRAINT "reservation_api_keys_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "reservation_api_key_permissions" (
  "apiKeyId" TEXT NOT NULL,
  "permission" "ReservationApiPermission" NOT NULL,

  CONSTRAINT "reservation_api_key_permissions_pkey" PRIMARY KEY ("apiKeyId", "permission")
);

CREATE TABLE "reservation_api_usage_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "monthlyLimit" BIGINT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedByUserId" TEXT,

  CONSTRAINT "reservation_api_usage_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_api_usage_settings_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "reservation_api_usage_settings_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "reservation_api_usage_settings_limit_check" CHECK (
    "monthlyLimit" IS NULL OR (
      "monthlyLimit" BETWEEN 100 AND 9223372036854775800
      AND ("monthlyLimit" <= 10000 OR MOD("monthlyLimit", 100) = 0)
    )
  )
);

CREATE TABLE "reservation_api_monthly_usage" (
  "periodStart" DATE NOT NULL,
  "requestCount" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reservation_api_monthly_usage_pkey" PRIMARY KEY ("periodStart"),
  CONSTRAINT "reservation_api_monthly_usage_count_check" CHECK ("requestCount" >= 0)
);

CREATE UNIQUE INDEX "reservation_api_keys_publicId_key" ON "reservation_api_keys"("publicId");
CREATE UNIQUE INDEX "reservation_api_keys_secretHash_key" ON "reservation_api_keys"("secretHash");
CREATE INDEX "reservation_api_keys_createdAt_id_idx" ON "reservation_api_keys"("createdAt", "id");
CREATE INDEX "reservation_api_keys_revokedAt_idx" ON "reservation_api_keys"("revokedAt");

ALTER TABLE "reservation_api_keys"
  ADD CONSTRAINT "reservation_api_keys_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservation_api_keys"
  ADD CONSTRAINT "reservation_api_keys_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservation_api_key_permissions"
  ADD CONSTRAINT "reservation_api_key_permissions_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "reservation_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_api_usage_settings"
  ADD CONSTRAINT "reservation_api_usage_settings_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "reservation_api_usage_settings" ("id", "monthlyLimit")
VALUES (1, 10000);
