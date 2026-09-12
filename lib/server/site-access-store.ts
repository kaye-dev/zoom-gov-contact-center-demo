import { Pool, type QueryResultRow } from "pg";

export type SiteAccessStore = {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
};

let pool: Pool | undefined;
let connectionString: string | undefined;

/** Separate bounded pool, also usable in Node.js Proxy without importing Prisma. */
export function siteAccessStore(): SiteAccessStore {
  const configured = process.env.DATABASE_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") throw new Error("Site access storage unavailable");
  const url = configured || "postgresql://postgres:postgres@localhost:5432/zoom_demo";
  if (!pool || connectionString !== url) {
    const old = pool;
    pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 10_000,
      query_timeout: 2_000, statement_timeout: 2_000, idleTimeoutMillis: 10_000,
      allowExitOnIdle: true, application_name: "site-access" });
    pool.on("error", () => { /* Never log connection details. The next request fails closed. */ });
    connectionString = url;
    if (old) void old.end().catch(() => {});
  }
  return pool;
}

export async function cleanupSiteAccess(store: SiteAccessStore, now: Date) {
  await store.query('DELETE FROM site_access_sessions WHERE "tokenHash" IN (SELECT "tokenHash" FROM site_access_sessions WHERE "expiresAt" <= $1 LIMIT 100)', [now]);
  await store.query('DELETE FROM site_access_attempts WHERE ("bucketKey", "windowStart") IN (SELECT "bucketKey", "windowStart" FROM site_access_attempts WHERE "expiresAt" <= $1 LIMIT 100)', [now]);
}
