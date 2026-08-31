CREATE TABLE "reservation_api_request_logs" (
  "id" TEXT NOT NULL,
  "apiKeyId" TEXT,
  "apiKeyName" TEXT NOT NULL,
  "apiKeyPreview" TEXT NOT NULL,
  "permission" "ReservationApiPermission" NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "pathParameters" JSONB,
  "query" JSONB,
  "requestBody" JSONB,
  "responseBody" JSONB,
  "statusCode" INTEGER NOT NULL,
  "errorCode" TEXT,
  "durationMs" INTEGER NOT NULL,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "reservation_api_request_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_api_request_logs_status_code_check" CHECK ("statusCode" BETWEEN 100 AND 599),
  CONSTRAINT "reservation_api_request_logs_duration_ms_check" CHECK ("durationMs" >= 0)
);

CREATE INDEX "reservation_api_request_logs_requestedAt_id_idx"
  ON "reservation_api_request_logs"("requestedAt", "id");

CREATE INDEX "reservation_api_request_logs_apiKeyId_requestedAt_idx"
  ON "reservation_api_request_logs"("apiKeyId", "requestedAt");

CREATE INDEX "reservation_api_request_logs_method_requestedAt_idx"
  ON "reservation_api_request_logs"("method", "requestedAt");

CREATE INDEX "reservation_api_request_logs_statusCode_requestedAt_idx"
  ON "reservation_api_request_logs"("statusCode", "requestedAt");

ALTER TABLE "reservation_api_request_logs"
  ADD CONSTRAINT "reservation_api_request_logs_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "reservation_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
