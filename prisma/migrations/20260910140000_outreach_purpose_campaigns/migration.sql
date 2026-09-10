CREATE TABLE "outreach_purpose_campaigns" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "siteKey" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "bindingId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "outreach_purpose_campaigns_valid_purpose" CHECK (
    "siteKey" = 'lg' AND (("mode" = 'regular' AND "purpose" IN ('ELDER_WATCH', 'PROCEDURE_SUPPORT', 'SERVICE_CONFIRMATION', 'FRAUD_ALERT')) OR ("mode" = 'one-time' AND "purpose" = 'FRAUD_ALERT'))
  ),
  CONSTRAINT "outreach_purpose_campaigns_siteKey_bindingId_fkey" FOREIGN KEY ("siteKey", "bindingId") REFERENCES "zoom_resource_bindings"("ownerSiteKey", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "outreach_purpose_campaigns_bindingId_key" ON "outreach_purpose_campaigns"("bindingId");
CREATE UNIQUE INDEX "outreach_purpose_campaigns_siteKey_mode_purpose_key" ON "outreach_purpose_campaigns"("siteKey", "mode", "purpose");
