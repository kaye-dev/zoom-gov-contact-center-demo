BEGIN;

-- Serialize this invariant change with every application-level authority
-- mutation before inspecting existing assignments or creating the index.
SELECT pg_advisory_xact_lock(1515344707, 1);

-- The advisory lock serializes application writers. Lock the parent before the
-- child to avoid deadlocking user inserts, then keep direct SQL writers out
-- until the preflight, index, and triggers commit atomically.
LOCK TABLE "user" IN SHARE MODE;
LOCK TABLE "admin_access_role_assignments" IN SHARE MODE;

DO $single_role$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "user" AS u
        LEFT JOIN "admin_access_role_assignments" AS a
            ON a."userId" = u."id"
        GROUP BY u."id"
        HAVING count(a."roleId") <> 1
    ) THEN
        RAISE EXCEPTION
            'Cannot enforce exactly one access role per user while invalid assignment cardinality exists';
    END IF;
END
$single_role$;

CREATE UNIQUE INDEX "admin_access_role_assignments_userId_key"
ON "admin_access_role_assignments"("userId");

-- The unique index enforces at-most-one. This deferred constraint trigger also
-- enforces at-least-one without blocking the service's delete-then-insert
-- replacement inside one transaction.
CREATE FUNCTION "assert_exactly_one_admin_access_role"()
RETURNS TRIGGER AS $cardinality$
BEGIN
    IF TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION
            'Administrative access role assignments cannot be truncated';
    END IF;

    IF TG_OP <> 'INSERT'
       AND EXISTS (SELECT 1 FROM "user" WHERE "id" = OLD."userId")
       AND (
           SELECT count(*)
           FROM "admin_access_role_assignments"
           WHERE "userId" = OLD."userId"
       ) <> 1 THEN
        RAISE EXCEPTION
            'Every user must retain exactly one access role assignment';
    END IF;

    IF TG_OP <> 'DELETE'
       AND (TG_OP <> 'UPDATE' OR NEW."userId" IS DISTINCT FROM OLD."userId")
       AND EXISTS (SELECT 1 FROM "user" WHERE "id" = NEW."userId")
       AND (
           SELECT count(*)
           FROM "admin_access_role_assignments"
           WHERE "userId" = NEW."userId"
       ) <> 1 THEN
        RAISE EXCEPTION
            'Every user must retain exactly one access role assignment';
    END IF;

    RETURN NULL;
END
$cardinality$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "admin_access_role_assignment_exactly_one"
AFTER INSERT OR UPDATE OR DELETE ON "admin_access_role_assignments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_exactly_one_admin_access_role"();

CREATE TRIGGER "admin_access_role_assignment_no_truncate"
BEFORE TRUNCATE ON "admin_access_role_assignments"
FOR EACH STATEMENT EXECUTE FUNCTION "assert_exactly_one_admin_access_role"();

COMMIT;
