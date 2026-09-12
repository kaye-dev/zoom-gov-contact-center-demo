import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { accessCodeScopes, sessionExpiry, SITE_ACCESS_COOKIE, SITE_ACCESS_SECURE_COOKIE, type SiteAccessScope } from "@/lib/site-access";
import type { PublicSite } from "@/lib/public-site-routing";
import type { MaintenanceEnvironment } from "@/lib/maintenance-config";
import { digestAccessToken, verifyAccessCodeHash } from "./site-access-crypto";
import { SiteAccessError, type StoredSiteAccess } from "./site-access-settings";
import { cleanupSiteAccess, siteAccessStore, type SiteAccessStore } from "./site-access-store";

export function isLocalHttp(url: URL) {
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
}
export function accessCookieName(url: URL) { return isLocalHttp(url) ? SITE_ACCESS_COOKIE : SITE_ACCESS_SECURE_COOKIE; }
export function readAccessCookie(headers: Headers, url: URL): string | null {
  const name = accessCookieName(url);
  const values = (headers.get("cookie") ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1);
  return /^[0-9a-f]{64}$/u.test(value) ? value : null;
}

export function serializeAccessCookie(url: URL, token: string, expiresAt: Date, now: Date): string {
  const maxAge = Math.max(0, Math.min(400 * 86_400, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)));
  return `${accessCookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isLocalHttp(url) ? "" : "; Secure"}`;
}

export function accessAttemptIdentity(headers: Headers, env = process.env): string {
  // Vercel owns this header on its edge. Other reverse proxies are not trusted.
  // Without a verified IP, use one shared bucket (never a spoofable header).
  const forwarded = env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  return forwarded && isIP(forwarded) ? forwarded : "unverified-client";
}

export async function consumeAccessAttempt(environment: MaintenanceEnvironment, identity: string, store: SiteAccessStore = siteAccessStore(), now = new Date()) {
  const duration = 15 * 60_000;
  const start = new Date(Math.floor(now.getTime() / duration) * duration);
  const expiresAt = new Date(start.getTime() + duration);
  const key = digestAccessToken(`${environment}:${identity}`);
  const { rows } = await store.query<{ count: number }>(`INSERT INTO site_access_attempts ("bucketKey", "windowStart", count, "expiresAt")
    VALUES ($1, $2, 1, $3) ON CONFLICT ("bucketKey", "windowStart") DO UPDATE SET count = LEAST(site_access_attempts.count + 1, 11) RETURNING count`, [key, start, expiresAt]);
  if (rows[0]?.count > 10) throw new SiteAccessError("SITE_ACCESS_RATE_LIMITED", 429, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
  if (!rows[0]) throw new SiteAccessError("SITE_ACCESS_UNAVAILABLE", 503);
}

export async function issueSiteAccessSession(code: string, site: PublicSite, hostname: string, environment: MaintenanceEnvironment,
  settings: StoredSiteAccess[], store: SiteAccessStore = siteAccessStore(), now = new Date()) {
  if (!/^[A-Za-z0-9]{8,64}$/u.test(code)) throw new SiteAccessError("INVALID_SITE_ACCESS_CODE", 401);
  for (const scope of accessCodeScopes(site)) {
    const setting = settings.find(row => row.scope === scope);
    if (!setting?.enabled || !setting.codeHash || !await verifyAccessCodeHash(code, setting.codeHash)) continue;
    const expiresAt = sessionExpiry(setting.sessionDays, now);
    if (!expiresAt) throw new SiteAccessError("SITE_ACCESS_UNAVAILABLE", 503);
    const token = randomBytes(32).toString("hex");
    await store.query(`INSERT INTO site_access_sessions ("tokenHash", scope, environment, hostname, revision, "issuedAt", "expiresAt")
      VALUES ($1, $2::"SiteAccessScope", $3::"MaintenanceEnvironment", $4, $5, $6, $7)`,
    [digestAccessToken(token), scope, environment.toUpperCase(), hostname, setting.revision, now, expiresAt]);
    await cleanupSiteAccess(store, now);
    return { token, expiresAt };
  }
  throw new SiteAccessError("INVALID_SITE_ACCESS_CODE", 401);
}

export async function hasSiteAccessSession(token: string | null, site: PublicSite, hostname: string, environment: MaintenanceEnvironment,
  settings: StoredSiteAccess[], store: SiteAccessStore = siteAccessStore(), now = new Date()): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/u.test(token)) return false;
  const { rows } = await store.query<{ scope: SiteAccessScope; revision: number }>(`SELECT scope, revision FROM site_access_sessions
    WHERE "tokenHash" = $1 AND hostname = $2 AND environment = $3::"MaintenanceEnvironment" AND "issuedAt" <= $4 AND "expiresAt" > $4`,
  [digestAccessToken(token), hostname, environment.toUpperCase(), now]);
  const session = rows[0];
  if (!session || !accessCodeScopes(site).includes(session.scope)) return false;
  return settings.some(row => row.scope === session.scope && row.enabled && row.revision === session.revision);
}
