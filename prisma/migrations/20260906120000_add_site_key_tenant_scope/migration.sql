-- 業種テナント境界の導入。
--
-- 既存行はすべて自治体デモ（siteKey = 'lg'）のデータなので、いったん既定値付きで
-- 列を追加して backfill し、そのあとに既定値を落とす。既定値を残すと、テナントを
-- 指定し忘れた書き込みが暗黙のうちに 'lg' へ入ってしまうため。
--
-- user / session / account / admin_access_* は業種をまたいで共有する運用のため
-- 対象外。

-- DropIndex
DROP INDEX "disaster_radio_subscriptions_consentStatus_syncStatus_idx";

-- DropIndex
DROP INDEX "disaster_radio_subscriptions_createdAt_id_idx";

-- DropIndex
DROP INDEX "disaster_radio_subscriptions_normalizedEmail_normalizedPhone_ke";

-- DropIndex
DROP INDEX "reservation_api_keys_createdAt_id_idx";

-- DropIndex
DROP INDEX "reservation_api_keys_revokedAt_idx";

-- DropIndex
DROP INDEX "reservation_api_request_logs_apiKeyId_requestedAt_idx";

-- DropIndex
DROP INDEX "reservation_api_request_logs_method_requestedAt_idx";

-- DropIndex
DROP INDEX "reservation_api_request_logs_requestedAt_id_idx";

-- DropIndex
DROP INDEX "reservation_api_request_logs_statusCode_requestedAt_idx";

-- DropIndex
DROP INDEX "reservation_bookings_reservationDate_isDemo_idx";

-- DropIndex
DROP INDEX "reservation_bookings_serviceKey_reservationDate_startMinute_idx";

-- DropIndex
DROP INDEX "zaad_admin_audits_actorUserId_createdAt_idx";

-- DropIndex
DROP INDEX "zaad_admin_audits_createdAt_id_idx";

-- DropIndex
DROP INDEX "zaad_admin_audits_resourceKind_createdAt_idx";

-- DropIndex
DROP INDEX "zaad_one_time_dispatches_createdAt_id_idx";

-- DropIndex
DROP INDEX "zaad_one_time_dispatches_state_updatedAt_idx";

-- DropIndex
DROP INDEX "zaad_outbound_messages_updatedAt_id_idx";

-- AlterTable
ALTER TABLE "demo_records" ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg';

-- AlterTable
ALTER TABLE "disaster_radio_subscriptions" ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg';

-- AlterTable
ALTER TABLE "locale_display_settings" DROP CONSTRAINT "locale_display_settings_pkey",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "locale_display_settings_pkey" PRIMARY KEY ("siteKey", "locale");

-- AlterTable
ALTER TABLE "localized_ai_phone_settings" DROP CONSTRAINT "localized_ai_phone_settings_pkey",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "localized_ai_phone_settings_pkey" PRIMARY KEY ("siteKey", "locale");

-- AlterTable
ALTER TABLE "reservation_api_keys" ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg';

-- AlterTable
ALTER TABLE "reservation_api_monthly_usage" DROP CONSTRAINT "reservation_api_monthly_usage_pkey",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "reservation_api_monthly_usage_pkey" PRIMARY KEY ("siteKey", "periodStart");

-- AlterTable
ALTER TABLE "reservation_api_request_logs" ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg';

-- AlterTable
ALTER TABLE "reservation_api_usage_settings" DROP CONSTRAINT "reservation_api_usage_settings_pkey",
DROP COLUMN "id",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "reservation_api_usage_settings_pkey" PRIMARY KEY ("siteKey");

-- AlterTable
ALTER TABLE "reservation_bookings" ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg';

-- AlterTable
ALTER TABLE "site_chat_settings" DROP CONSTRAINT "site_chat_settings_pkey",
DROP COLUMN "id",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "site_chat_settings_pkey" PRIMARY KEY ("siteKey");

-- AlterTable
ALTER TABLE "site_developer_api_settings" DROP CONSTRAINT "site_developer_api_settings_pkey",
DROP COLUMN "id",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "site_developer_api_settings_pkey" PRIMARY KEY ("siteKey");

-- AlterTable
ALTER TABLE "site_maintenance_settings" DROP CONSTRAINT "site_maintenance_settings_pkey",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "site_maintenance_settings_pkey" PRIMARY KEY ("siteKey", "environment");

-- AlterTable
ALTER TABLE "site_phone_settings" DROP CONSTRAINT "site_phone_settings_pkey",
DROP COLUMN "id",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "site_phone_settings_pkey" PRIMARY KEY ("siteKey");

-- AlterTable
ALTER TABLE "zaad_admin_audits" ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg';

-- AlterTable
ALTER TABLE "zaad_one_time_dispatches" ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg';

-- AlterTable
ALTER TABLE "zaad_outbound_messages" ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg';

-- AlterTable
ALTER TABLE "zaad_registration_settings" DROP CONSTRAINT "zaad_registration_settings_pkey",
DROP COLUMN "id",
ADD COLUMN     "siteKey" TEXT NOT NULL DEFAULT 'lg',
ADD CONSTRAINT "zaad_registration_settings_pkey" PRIMARY KEY ("siteKey");

-- CreateIndex
CREATE INDEX "demo_records_siteKey_created_at_idx" ON "demo_records"("siteKey", "created_at");

-- CreateIndex
CREATE INDEX "disaster_radio_subscriptions_siteKey_createdAt_id_idx" ON "disaster_radio_subscriptions"("siteKey", "createdAt", "id");

-- CreateIndex
CREATE INDEX "disaster_radio_subscriptions_siteKey_consentStatus_syncStat_idx" ON "disaster_radio_subscriptions"("siteKey", "consentStatus", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "disaster_radio_subscriptions_normalizedEmail_normalizedPhone_ke" ON "disaster_radio_subscriptions"("siteKey", "normalizedEmail", "normalizedPhone");

-- CreateIndex
CREATE INDEX "reservation_api_keys_siteKey_createdAt_id_idx" ON "reservation_api_keys"("siteKey", "createdAt", "id");

-- CreateIndex
CREATE INDEX "reservation_api_keys_siteKey_revokedAt_idx" ON "reservation_api_keys"("siteKey", "revokedAt");

-- CreateIndex
CREATE INDEX "reservation_api_request_logs_siteKey_requestedAt_id_idx" ON "reservation_api_request_logs"("siteKey", "requestedAt", "id");

-- CreateIndex
CREATE INDEX "reservation_api_request_logs_siteKey_apiKeyId_requestedAt_idx" ON "reservation_api_request_logs"("siteKey", "apiKeyId", "requestedAt");

-- CreateIndex
CREATE INDEX "reservation_api_request_logs_siteKey_method_requestedAt_idx" ON "reservation_api_request_logs"("siteKey", "method", "requestedAt");

-- CreateIndex
CREATE INDEX "reservation_api_request_logs_siteKey_statusCode_requestedAt_idx" ON "reservation_api_request_logs"("siteKey", "statusCode", "requestedAt");

-- CreateIndex
CREATE INDEX "reservation_bookings_siteKey_serviceKey_reservationDate_sta_idx" ON "reservation_bookings"("siteKey", "serviceKey", "reservationDate", "startMinute");

-- CreateIndex
CREATE INDEX "reservation_bookings_siteKey_reservationDate_isDemo_idx" ON "reservation_bookings"("siteKey", "reservationDate", "isDemo");

-- CreateIndex
CREATE INDEX "zaad_admin_audits_siteKey_createdAt_id_idx" ON "zaad_admin_audits"("siteKey", "createdAt", "id");

-- CreateIndex
CREATE INDEX "zaad_admin_audits_siteKey_actorUserId_createdAt_idx" ON "zaad_admin_audits"("siteKey", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "zaad_admin_audits_siteKey_resourceKind_createdAt_idx" ON "zaad_admin_audits"("siteKey", "resourceKind", "createdAt");

-- CreateIndex
CREATE INDEX "zaad_one_time_dispatches_siteKey_createdAt_id_idx" ON "zaad_one_time_dispatches"("siteKey", "createdAt", "id");

-- CreateIndex
CREATE INDEX "zaad_one_time_dispatches_siteKey_state_updatedAt_idx" ON "zaad_one_time_dispatches"("siteKey", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "zaad_outbound_messages_siteKey_updatedAt_id_idx" ON "zaad_outbound_messages"("siteKey", "updatedAt", "id");

-- 既定値を外し、以降の書き込みでテナントの指定を必須にする
ALTER TABLE "demo_records" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "disaster_radio_subscriptions" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "locale_display_settings" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "localized_ai_phone_settings" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "reservation_api_keys" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "reservation_api_monthly_usage" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "reservation_api_request_logs" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "reservation_api_usage_settings" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "reservation_bookings" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "site_chat_settings" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "site_developer_api_settings" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "site_maintenance_settings" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "site_phone_settings" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "zaad_admin_audits" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "zaad_one_time_dispatches" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "zaad_outbound_messages" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "zaad_registration_settings" ALTER COLUMN "siteKey" DROP DEFAULT;

-- 予約APIキーの siteKey に既定値を戻す。
--
-- 発行処理を持つ lib/server/reservation-api-keys.ts を本変更では編集できなかったため、
-- 明示指定がない発行を自治体テナントへ倒す。テナントを2つ目に増やす前に、発行時の
-- 明示指定を入れてこの既定値を外す必要がある。
ALTER TABLE "reservation_api_keys" ALTER COLUMN "siteKey" SET DEFAULT 'lg';

-- ZAAD／防災無線テーブルの siteKey に既定値を置く。
--
-- これらのサブシステムはテナント引数の配線を次段へ送っており、features.zaad が
-- 自治体テナント限定である前提に依存する。他テナントで有効化する前に、呼び出し経路へ
-- tenantKey を通したうえでこの既定値を外すこと。
ALTER TABLE "disaster_radio_subscriptions" ALTER COLUMN "siteKey" SET DEFAULT 'lg';
ALTER TABLE "zaad_outbound_messages" ALTER COLUMN "siteKey" SET DEFAULT 'lg';
ALTER TABLE "zaad_one_time_dispatches" ALTER COLUMN "siteKey" SET DEFAULT 'lg';
ALTER TABLE "zaad_admin_audits" ALTER COLUMN "siteKey" SET DEFAULT 'lg';
