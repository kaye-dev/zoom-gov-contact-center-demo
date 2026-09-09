-- Preserve IDs, memberships and existing ownership; only contact lists may be shared across sites.
BEGIN;
CREATE UNIQUE INDEX "zoom_resource_bindings_site_resource_key"
ON "zoom_resource_bindings"("accountId", "resourceType", "zoomId", "ownerSiteKey");
CREATE UNIQUE INDEX "zoom_resource_bindings_exclusive_resource_key"
ON "zoom_resource_bindings"("accountId", "resourceType", "zoomId")
WHERE "resourceType" <> 'CONTACT_LIST';
DROP INDEX "zoom_resource_bindings_accountId_resourceType_zoomId_key";
COMMIT;
