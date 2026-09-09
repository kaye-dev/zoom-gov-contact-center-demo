-- ZAAD／防災無線の siteKey から既定値を外す。
--
-- 呼び出し経路へ tenantKey を通し終えたため、テナントの指定漏れを既定値で
-- 吸収する必要がなくなった。以降は指定漏れが実行時エラーになる。
ALTER TABLE "disaster_radio_subscriptions" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "zaad_outbound_messages" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "zaad_one_time_dispatches" ALTER COLUMN "siteKey" DROP DEFAULT;
ALTER TABLE "zaad_admin_audits" ALTER COLUMN "siteKey" DROP DEFAULT;
