import { resolveMaintenanceEnvironment, type MaintenanceEnvironment } from "@/lib/maintenance-config";
import { isSiteAccessScope, parseSiteAccessUpdate, sessionExpiry, SITE_ACCESS_SCOPES,
  type SiteAccessScope, type SiteAccessSnapshot } from "@/lib/site-access";
import { hashAccessCode, isAccessCodeHash } from "./site-access-crypto";
import { siteAccessStore, type SiteAccessStore } from "./site-access-store";

export type StoredSiteAccess = SiteAccessSnapshot & { codeHash: string | null };
export class SiteAccessError extends Error {
  constructor(public code: string, public status: 400 | 401 | 403 | 409 | 429 | 503, public retryAfter?: number) {
    super(code);
  }
}

export function siteAccessEnvironment(hostname: string, env = process.env): MaintenanceEnvironment {
  return resolveMaintenanceEnvironment({ nodeEnv: env.NODE_ENV, requestHostname: hostname, appCanonicalOrigin: env.APP_CANONICAL_ORIGIN });
}

export async function readSiteAccessSettings(environment: MaintenanceEnvironment, store: SiteAccessStore = siteAccessStore()): Promise<StoredSiteAccess[]> {
  const { rows } = await store.query('SELECT * FROM site_access_settings WHERE environment = $1::"MaintenanceEnvironment"', [environment.toUpperCase()]);
  const settings = rows.map(row => parseRow(row, environment));
  if (settings.length !== 3 || SITE_ACCESS_SCOPES.some(scope => settings.filter(row => row.scope === scope).length !== 1)) {
    throw new SiteAccessError("SITE_ACCESS_UNAVAILABLE", 503);
  }
  return settings;
}

export function publicSiteAccessSnapshot(row: StoredSiteAccess): SiteAccessSnapshot {
  // Deliberately select fields; spreading a stored row would disclose the hash.
  return { scope: row.scope, environment: row.environment, enabled: row.enabled, hasCode: row.hasCode,
    sessionDays: row.sessionDays, revision: row.revision, updatedAt: row.updatedAt };
}

export async function saveSiteAccessSettings(scope: SiteAccessScope, environment: MaintenanceEnvironment, input: unknown,
  actorId: string, store: SiteAccessStore = siteAccessStore(), now = new Date()): Promise<SiteAccessSnapshot> {
  const parsed = parseSiteAccessUpdate(input, now);
  if (!parsed || !isSiteAccessScope(scope)) throw new SiteAccessError("INVALID_SITE_ACCESS_SETTINGS", 400);
  const current = (await readSiteAccessSettings(environment, store)).find(row => row.scope === scope)!;
  if (parsed.enabled && !parsed.code && !current.hasCode) throw new SiteAccessError("SITE_ACCESS_CODE_REQUIRED", 400);
  const hash = parsed.code ? await hashAccessCode(parsed.code) : null;
  // The update and audit are one atomic statement; concurrent revisions cannot both win.
  const result = await store.query(`WITH updated AS (
    UPDATE site_access_settings SET enabled = $3, "codeHash" = COALESCE($4, "codeHash"),
      "sessionDays" = $5, revision = revision + 1, "updatedAt" = $6
    WHERE scope = $1::"SiteAccessScope" AND environment = $2::"MaintenanceEnvironment" AND revision = $7
    RETURNING *
  ), audit AS (
    INSERT INTO site_access_audits (scope, environment, revision, "actorId", "createdAt")
    SELECT scope, environment, revision, $8, "updatedAt" FROM updated
  ) SELECT * FROM updated`, [scope, environment.toUpperCase(), parsed.enabled, hash, parsed.sessionDays, now, parsed.expectedRevision, actorId]);
  if (result.rows.length !== 1) throw new SiteAccessError("SITE_ACCESS_SETTINGS_CONFLICT", 409);
  return publicSiteAccessSnapshot(parseRow(result.rows[0], environment));
}

function parseRow(row: Record<string, unknown>, environment: MaintenanceEnvironment): StoredSiteAccess {
  if (!isSiteAccessScope(row.scope) || row.environment !== environment.toUpperCase() || typeof row.enabled !== "boolean" ||
    typeof row.sessionDays !== "number" || !sessionExpiry(row.sessionDays, new Date()) ||
    !Number.isInteger(row.revision) || Number(row.revision) < 1 ||
    (row.codeHash !== null && !isAccessCodeHash(row.codeHash)) || (row.enabled && !row.codeHash) ||
    !(row.updatedAt instanceof Date) || !Number.isFinite(row.updatedAt.getTime())) throw new SiteAccessError("SITE_ACCESS_UNAVAILABLE", 503);
  return { scope: row.scope, environment, enabled: row.enabled, hasCode: Boolean(row.codeHash), codeHash: row.codeHash as string | null,
    sessionDays: row.sessionDays, revision: Number(row.revision), updatedAt: row.updatedAt.toISOString() };
}
