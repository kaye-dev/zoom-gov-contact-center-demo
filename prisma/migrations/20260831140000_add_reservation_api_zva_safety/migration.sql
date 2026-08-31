ALTER TABLE "reservation_bookings"
  ADD COLUMN "apiKeyId" TEXT;

ALTER TABLE "reservation_bookings"
  ADD COLUMN "externalReferenceId" TEXT;

ALTER TABLE "reservation_bookings"
  ADD COLUMN "revision" INTEGER;

ALTER TABLE "reservation_api_request_logs"
  ADD COLUMN "idempotencyOutcome" TEXT;

ALTER TABLE "reservation_api_request_logs"
  ADD COLUMN "responseLocation" TEXT;

ALTER TABLE "reservation_api_request_logs"
  ADD COLUMN "responseEtag" TEXT;

CREATE TABLE "reservation_api_idempotency_records" (
  "id" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "keyDigest" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "responseBody" JSONB NOT NULL,
  "responseLocation" TEXT NOT NULL,
  "responseEtag" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "reservation_api_idempotency_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_api_idempotency_records_status_code_check" CHECK ("statusCode" = 201),
  CONSTRAINT "reservation_api_idempotency_records_key_digest_check" CHECK ("keyDigest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reservation_api_idempotency_records_request_digest_check" CHECK ("requestDigest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reservation_api_idempotency_records_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "reservation_api_idempotency_records_apiKeyId_keyDigest_key"
  ON "reservation_api_idempotency_records"("apiKeyId", "keyDigest");

CREATE INDEX "reservation_api_idempotency_records_expiresAt_idx"
  ON "reservation_api_idempotency_records"("expiresAt");

CREATE INDEX "reservation_api_idempotency_records_reservationId_idx"
  ON "reservation_api_idempotency_records"("reservationId");

ALTER TABLE "reservation_api_idempotency_records"
  ADD CONSTRAINT "reservation_api_idempotency_records_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "reservation_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_api_request_logs"
  ADD CONSTRAINT "reservation_api_request_logs_idempotency_outcome_check"
  CHECK ("idempotencyOutcome" IS NULL OR "idempotencyOutcome" IN ('NEW', 'REPLAY', 'CONFLICT')) NOT VALID;
