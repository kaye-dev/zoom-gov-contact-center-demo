-- Preserve legacy department values; current application uses explicit tenant grants.
ALTER TABLE "zaad_outbound_messages" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
ALTER TABLE "zaad_one_time_dispatches" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
ALTER TABLE "university_contacts" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "university_contacts_siteKey_departmentKey_id_idx";
CREATE INDEX "university_contacts_siteKey_id_idx" ON "university_contacts" ("siteKey", "id");
ALTER TABLE "zoom_resource_bindings" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "zoom_resource_bindings_ownerSiteKey_departmentKey_purpose_idx";
CREATE INDEX "zoom_resource_bindings_ownerSiteKey_purpose_idx" ON "zoom_resource_bindings" ("ownerSiteKey", "purpose");
ALTER TABLE "crm_import_jobs" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
ALTER TABLE "municipal_contacts" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "municipal_contacts_siteKey_departmentKey_createdAt_id_idx";
CREATE INDEX "municipal_contacts_siteKey_createdAt_id_idx" ON "municipal_contacts" ("siteKey", "createdAt", "id");
ALTER TABLE "municipal_workflow_revisions" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
ALTER TABLE "municipal_outreach_runs" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
ALTER TABLE "municipal_support_cases" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "municipal_support_cases_siteKey_departmentKey_status_dueAt_idx";
CREATE INDEX "municipal_support_cases_siteKey_status_dueAt_idx" ON "municipal_support_cases" ("siteKey", "status", "dueAt");
ALTER TABLE "university_contact_groups" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "university_contact_groups_siteKey_departmentKey_idx";
CREATE INDEX "university_contact_groups_siteKey_idx" ON "university_contact_groups" ("siteKey");
ALTER TABLE "university_outreach_batches" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "university_outreach_batches_siteKey_departmentKey_id_idx";
CREATE INDEX "university_outreach_batches_siteKey_id_idx" ON "university_outreach_batches" ("siteKey", "id");
ALTER TABLE "university_intakes" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "university_intakes_siteKey_departmentKey_id_idx";
CREATE INDEX "university_intakes_siteKey_id_idx" ON "university_intakes" ("siteKey", "id");
ALTER TABLE "university_support_cases" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "university_support_cases_siteKey_departmentKey_id_idx";
CREATE INDEX "university_support_cases_siteKey_id_idx" ON "university_support_cases" ("siteKey", "id");
ALTER TABLE "outreach_import_candidates" ALTER COLUMN "departmentKey" DROP NOT NULL, ALTER COLUMN "departmentKey" DROP DEFAULT;
DROP INDEX "outreach_import_candidates_siteKey_departmentKey_id_idx";
CREATE INDEX "outreach_import_candidates_siteKey_id_idx" ON "outreach_import_candidates" ("siteKey", "id");
CREATE TABLE "outreach_tenant_grants" (
  "id" TEXT NOT NULL,
  "siteKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessEnabled" BOOLEAN NOT NULL DEFAULT false,
  "liveExecution" BOOLEAN NOT NULL DEFAULT false,
  "serviceFullAccess" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "outreach_tenant_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outreach_tenant_grants_siteKey_userId_key" ON "outreach_tenant_grants"("siteKey", "userId");
-- Freeze both allowed and denied tenant entry for every existing user.
WITH previous AS (
 SELECT u.id,
   EXISTS (SELECT 1 FROM university_zaad_grants g WHERE g."userId"=u.id AND g."siteKey"='univ' AND g."departmentKey" IN ('ALL','admissions','student-affairs','exam-office','academic-affairs','facilities','international','student-support')) AS university,
   EXISTS (SELECT 1 FROM university_zaad_grants g WHERE g."userId"=u.id AND g."siteKey"='lg' AND g."departmentKey"='ALL') AS municipal_all,
   EXISTS (SELECT 1 FROM university_zaad_grants g WHERE g."userId"=u.id AND g."siteKey"='lg') AS municipal_any,
   EXISTS (SELECT 1 FROM university_zaad_grants g WHERE g."userId"=u.id AND g."siteKey"='lg' AND g."departmentKey" IN ('ALL','resident-support','welfare','procedures','services','community-safety')) AS municipal_valid
 FROM "user" u
)
INSERT INTO outreach_tenant_grants (id,"siteKey","userId","accessEnabled","liveExecution","serviceFullAccess")
SELECT 'tenant:' || t.site || ':' || p.id, t.site, p.id,
 CASE WHEN t.site='univ' THEN p.university ELSE (NOT p.university OR p.municipal_all) AND (NOT p.municipal_any OR p.municipal_valid) END,
 EXISTS (SELECT 1 FROM university_zaad_grants g WHERE g."userId"=p.id AND g."siteKey"=t.site AND g."liveExecution"),
 t.site='univ' AND EXISTS (SELECT 1 FROM university_zaad_grants g WHERE g."userId"=p.id AND g."siteKey"='univ' AND g."departmentKey"='ALL')
FROM previous p CROSS JOIN (VALUES ('lg'),('univ')) AS t(site);
