BEGIN;

CREATE TABLE "admin_access_mutation_state" (
    "id" TEXT NOT NULL,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "freezeId" TEXT,
    "frozenAt" TIMESTAMP(3),
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_access_mutation_state_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_access_mutation_state_singleton_check" CHECK ("id" = 'global'),
    CONSTRAINT "admin_access_mutation_state_coherence_check" CHECK (
        ("frozen" AND "freezeId" IS NOT NULL AND "frozenAt" IS NOT NULL AND "reason" IS NOT NULL)
        OR
        (NOT "frozen" AND "freezeId" IS NULL AND "frozenAt" IS NULL AND "reason" IS NULL)
    )
);

INSERT INTO "admin_access_mutation_state" ("id") VALUES ('global');

COMMIT;
