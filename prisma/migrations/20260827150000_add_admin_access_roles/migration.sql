BEGIN;

CREATE TYPE "AdminAccessAction" AS ENUM ('VIEW', 'CREATE', 'UPDATE', 'DELETE');
CREATE TYPE "AdminAccessEffect" AS ENUM ('ALLOW', 'DENY');
CREATE TYPE "AdminAccessSystemRole" AS ENUM ('FULL_ACCESS', 'NO_ACCESS');

ALTER TABLE "user"
ADD COLUMN "adminAccessRoleRevision" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "admin_access_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "description" TEXT,
    "systemKey" "AdminAccessSystemRole",
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_access_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_access_roles_revision_check" CHECK ("revision" > 0)
);

CREATE TABLE "admin_access_role_permissions" (
    "roleId" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "action" "AdminAccessAction" NOT NULL,
    "effect" "AdminAccessEffect" NOT NULL,

    CONSTRAINT "admin_access_role_permissions_pkey"
        PRIMARY KEY ("roleId", "resourceKey", "action")
);

CREATE TABLE "admin_access_role_assignments" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByUserId" TEXT,

    CONSTRAINT "admin_access_role_assignments_pkey"
        PRIMARY KEY ("userId", "roleId")
);

CREATE UNIQUE INDEX "admin_access_roles_nameKey_key"
ON "admin_access_roles"("nameKey");

CREATE UNIQUE INDEX "admin_access_roles_systemKey_key"
ON "admin_access_roles"("systemKey");

CREATE INDEX "admin_access_role_assignments_roleId_idx"
ON "admin_access_role_assignments"("roleId");

CREATE INDEX "admin_access_role_assignments_assignedByUserId_idx"
ON "admin_access_role_assignments"("assignedByUserId");

ALTER TABLE "admin_access_role_permissions"
ADD CONSTRAINT "admin_access_role_permissions_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "admin_access_roles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_access_role_assignments"
ADD CONSTRAINT "admin_access_role_assignments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_access_role_assignments"
ADD CONSTRAINT "admin_access_role_assignments_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "admin_access_roles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_access_role_assignments"
ADD CONSTRAINT "admin_access_role_assignments_assignedByUserId_fkey"
FOREIGN KEY ("assignedByUserId") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "admin_access_roles" (
    "id", "name", "nameKey", "description", "systemKey"
) VALUES
    (
        'system-full-access',
        'Full Access',
        'full access',
        'Built-in recovery role with every supported administrative action.',
        'FULL_ACCESS'
    ),
    (
        'system-no-access',
        'No Access',
        'no access',
        'Built-in neutral role used when no functional access role is assigned.',
        'NO_ACCESS'
    );

CREATE FUNCTION "bump_admin_access_role_revision"()
RETURNS TRIGGER AS $revision$
BEGIN
    UPDATE "admin_access_roles"
    SET "revision" = "revision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."roleId" ELSE NEW."roleId" END;
    RETURN COALESCE(NEW, OLD);
END
$revision$ LANGUAGE plpgsql;

CREATE TRIGGER "admin_access_role_assignment_revision"
AFTER INSERT OR DELETE ON "admin_access_role_assignments"
FOR EACH ROW EXECUTE FUNCTION "bump_admin_access_role_revision"();

CREATE FUNCTION "assign_initial_admin_access_role"()
RETURNS TRIGGER AS $assignment$
BEGIN
    INSERT INTO "admin_access_role_assignments" ("userId", "roleId")
    VALUES (
        NEW."id",
        CASE
            WHEN NEW."role" = 'admin' THEN 'system-full-access'
            ELSE 'system-no-access'
        END
    );
    RETURN NEW;
END
$assignment$ LANGUAGE plpgsql;

CREATE TRIGGER "user_initial_admin_access_role"
AFTER INSERT ON "user"
FOR EACH ROW EXECUTE FUNCTION "assign_initial_admin_access_role"();

INSERT INTO "admin_access_role_assignments" ("userId", "roleId")
SELECT
    "id",
    CASE
        WHEN "role" = 'admin' THEN 'system-full-access'
        ELSE 'system-no-access'
    END
FROM "user";

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "user" AS u
        LEFT JOIN "admin_access_role_assignments" AS a
            ON a."userId" = u."id"
        GROUP BY u."id"
        HAVING count(a."roleId") <> 1
    ) THEN
        RAISE EXCEPTION 'Every existing user must receive exactly one initial access role';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "admin_access_role_assignments" AS a
        LEFT JOIN "user" AS u ON u."id" = a."userId"
        LEFT JOIN "admin_access_roles" AS r ON r."id" = a."roleId"
        WHERE u."id" IS NULL OR r."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Access role migration created an orphan assignment';
    END IF;
END
$migration$;

COMMIT;
