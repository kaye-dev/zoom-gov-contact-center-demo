import type { MaintenanceEnvironment } from "./maintenance-config";
import type { PublicSite } from "./public-site-routing";

export const SITE_ACCESS_SCOPES = ["global", "lg", "univ"] as const;
export type SiteAccessScope = typeof SITE_ACCESS_SCOPES[number];
export const SITE_ACCESS_COOKIE = "site-access";
export const SITE_ACCESS_SECURE_COOKIE = "__Host-site-access";
export const PUBLIC_REQUEST_PATH_HEADER = "x-public-request-path";
export const PUBLIC_REQUEST_METHOD_HEADER = "x-public-request-method";
export const PUBLIC_REQUEST_PROTOCOL_HEADER = "x-public-request-protocol";
export const SITE_ACCESS_CACHE_CONTROL = "private, no-store";
export type SiteAccessSnapshot = {
  scope: SiteAccessScope;
  environment: MaintenanceEnvironment;
  enabled: boolean;
  hasCode: boolean;
  sessionDays: number;
  revision: number;
  updatedAt: string;
};
export type SiteAccessUpdate = { enabled: boolean; code?: string; sessionDays: number; expectedRevision: number };

export function isSiteAccessScope(value: unknown): value is SiteAccessScope {
  return SITE_ACCESS_SCOPES.includes(value as SiteAccessScope);
}

export function sessionExpiry(days: number, issuedAt: Date): Date | null {
  if (!Number.isSafeInteger(days) || days < 1) return null;
  const expires = issuedAt.getTime() + days * 86_400_000;
  // PostgreSQL timestamptz supports a smaller upper range than JavaScript Date.
  if (!Number.isSafeInteger(expires) || expires > 8_000_000_000_000_000) return null;
  const result = new Date(expires);
  return Number.isFinite(result.getTime()) ? result : null;
}

export function parseSiteAccessUpdate(input: unknown, now = new Date()): SiteAccessUpdate | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some(key => !["enabled", "code", "sessionDays", "expectedRevision"].includes(key)) ||
    typeof v.enabled !== "boolean" || typeof v.sessionDays !== "number" || !sessionExpiry(v.sessionDays, now) ||
    !Number.isInteger(v.expectedRevision) || Number(v.expectedRevision) < 1 || Number(v.expectedRevision) >= 2_147_483_647 ||
    (v.code !== undefined && (typeof v.code !== "string" || (v.code !== "" && !/^[A-Za-z0-9]{8,64}$/u.test(v.code))))) return null;
  return { enabled: v.enabled, sessionDays: v.sessionDays, expectedRevision: Number(v.expectedRevision), ...(v.code ? { code: v.code as string } : {}) };
}

export function accessCodeScopes(site: PublicSite): readonly SiteAccessScope[] {
  return site.kind === "entry" ? SITE_ACCESS_SCOPES : ["global", site.tenantKey];
}

export function siteIsRestricted(settings: readonly Pick<SiteAccessSnapshot, "scope" | "enabled">[], site: PublicSite): boolean {
  return settings.some(setting => setting.enabled && (setting.scope === "global" || (site.kind === "tenant" && setting.scope === site.tenantKey)));
}
