BEGIN;

-- CreateEnum
CREATE TYPE "MaintenanceEnvironment" AS ENUM (
    'PRODUCTION',
    'PREVIEW',
    'DEVELOPMENT'
);

-- CreateEnum
CREATE TYPE "MaintenanceMode" AS ENUM (
    'DISABLED',
    'ENABLED',
    'SCHEDULED'
);

-- CreateTable
CREATE TABLE "site_maintenance_settings" (
    "environment" "MaintenanceEnvironment" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "mode" "MaintenanceMode" NOT NULL DEFAULT 'DISABLED',
    "scheduledStartAt" TIMESTAMPTZ(3),
    "scheduledEndAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_maintenance_settings_pkey" PRIMARY KEY ("environment"),
    CONSTRAINT "site_maintenance_settings_version_check" CHECK ("version" = 1),
    CONSTRAINT "site_maintenance_settings_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "site_maintenance_settings_schedule_pair_check" CHECK (
        ("scheduledStartAt" IS NULL) = ("scheduledEndAt" IS NULL)
    ),
    CONSTRAINT "site_maintenance_settings_schedule_order_check" CHECK (
        "scheduledStartAt" IS NULL
        OR "scheduledStartAt" < "scheduledEndAt"
    ),
    CONSTRAINT "site_maintenance_settings_scheduled_mode_check" CHECK (
        "mode" <> 'SCHEDULED'
        OR (
            "scheduledStartAt" IS NOT NULL
            AND "scheduledEndAt" IS NOT NULL
        )
    )
);

-- Seed every runtime scope in a fail-safe, normally available state.
INSERT INTO "site_maintenance_settings" (
    "environment",
    "version",
    "mode",
    "scheduledStartAt",
    "scheduledEndAt",
    "revision"
) VALUES
    ('PRODUCTION', 1, 'DISABLED', NULL, NULL, 1),
    ('PREVIEW', 1, 'DISABLED', NULL, NULL, 1),
    ('DEVELOPMENT', 1, 'DISABLED', NULL, NULL, 1);

COMMIT;
