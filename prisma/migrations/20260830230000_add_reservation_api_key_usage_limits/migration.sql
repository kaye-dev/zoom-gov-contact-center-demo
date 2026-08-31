ALTER TABLE "reservation_api_keys"
  ADD COLUMN "monthlyLimit" BIGINT;

ALTER TABLE "reservation_api_keys"
  ADD CONSTRAINT "reservation_api_keys_monthly_limit_check" CHECK (
    "monthlyLimit" IS NULL OR (
      "monthlyLimit" BETWEEN 100 AND 9223372036854775800
      AND ("monthlyLimit" <= 10000 OR MOD("monthlyLimit", 100) = 0)
    )
  ) NOT VALID;

CREATE TABLE "reservation_api_key_monthly_usage" (
  "apiKeyId" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "requestCount" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reservation_api_key_monthly_usage_pkey" PRIMARY KEY ("apiKeyId", "periodStart"),
  CONSTRAINT "reservation_api_key_monthly_usage_count_check" CHECK ("requestCount" >= 0)
);

CREATE INDEX "reservation_api_key_monthly_usage_periodStart_idx"
  ON "reservation_api_key_monthly_usage"("periodStart");

ALTER TABLE "reservation_api_key_monthly_usage"
  ADD CONSTRAINT "reservation_api_key_monthly_usage_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "reservation_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
