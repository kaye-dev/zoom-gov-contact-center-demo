BEGIN;

-- Role revision is reserved for metadata and permission CAS. Assignment CAS is
-- owned by user.adminAccessRoleRevision in the application transaction.
DROP TRIGGER "admin_access_role_assignment_revision"
ON "admin_access_role_assignments";

DROP FUNCTION "bump_admin_access_role_revision"();

COMMIT;
