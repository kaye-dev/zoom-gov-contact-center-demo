CREATE TYPE "SiteAccessScope" AS ENUM ('global', 'lg', 'univ');

CREATE TABLE site_access_settings (
  scope "SiteAccessScope" NOT NULL,
  environment "MaintenanceEnvironment" NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  "codeHash" TEXT,
  "sessionDays" INTEGER NOT NULL DEFAULT 1 CHECK ("sessionDays" >= 1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT site_access_settings_pkey PRIMARY KEY (scope, environment),
  CONSTRAINT site_access_enabled_code CHECK (NOT enabled OR "codeHash" IS NOT NULL)
);

INSERT INTO site_access_settings (scope, environment)
SELECT scope, environment FROM unnest(enum_range(NULL::"SiteAccessScope")) AS scope
CROSS JOIN unnest(enum_range(NULL::"MaintenanceEnvironment")) AS environment;

CREATE TABLE site_access_sessions (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  scope "SiteAccessScope" NOT NULL,
  environment "MaintenanceEnvironment" NOT NULL,
  hostname TEXT NOT NULL,
  revision INTEGER NOT NULL,
  "issuedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "site_access_sessions_expiresAt_idx" ON site_access_sessions ("expiresAt");

CREATE TABLE site_access_attempts (
  "bucketKey" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  count INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT site_access_attempts_pkey PRIMARY KEY ("bucketKey", "windowStart")
);
CREATE INDEX "site_access_attempts_expiresAt_idx" ON site_access_attempts ("expiresAt");

CREATE TABLE site_access_audits (
  scope "SiteAccessScope" NOT NULL,
  environment "MaintenanceEnvironment" NOT NULL,
  revision INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT site_access_audits_pkey PRIMARY KEY (scope, environment, revision)
);
