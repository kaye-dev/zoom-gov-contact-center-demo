import { adminFetch } from "@/lib/admin-fetch";
import type { TenantKey } from "@/lib/tenants";
export class OutreachApiError extends Error { constructor(readonly code: string, readonly status: number) { super(code); } }
export async function outreachRequest<T>(tenant: TenantKey, path: string, init: RequestInit = {}): Promise<T> {
  const [route, query = ""] = path.split("?"), params = new URLSearchParams(query); params.set("tenant", tenant);
  const response = await adminFetch(`/api/admin/zaad/${route}?${params}`, { ...init, headers: { Accept: "application/json", ...(init.body && !(init.body instanceof Blob) ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new OutreachApiError(typeof body?.code === "string" ? body.code : "SERVICE_UNAVAILABLE", response.status);
  if (body.tenantKey !== tenant) throw new OutreachApiError("TENANT_MISMATCH", 409);
  return body as T;
}
export const outreachMutation = <T>(tenant: TenantKey, path: string, body: unknown, method = "POST") => outreachRequest<T>(tenant, path, { method, body: JSON.stringify(body) });
export type ListResult<T> = { tenantKey: TenantKey; items: T[]; total: number | null; nextCursor: string | null };
export async function outreachAll<T>(tenant: TenantKey, path: string, init: RequestInit = {}): Promise<T[]> {
  const [route, query = ""] = path.split("?"), params = new URLSearchParams(query), seen = new Set<string>(), items: T[] = [];
  params.set("limit", "100");
  for (let page = 0; page < 100; page++) {
    const result = await outreachRequest<ListResult<T>>(tenant, `${route}?${params}`, init);
    if (!Array.isArray(result.items)) throw new OutreachApiError("INVALID_RESPONSE", 502);
    items.push(...result.items);
    if (items.length > 1000) throw new OutreachApiError("SELECTION_LIMIT_EXCEEDED", 409);
    if (!result.nextCursor) return items;
    if (seen.has(result.nextCursor)) throw new OutreachApiError("PAGINATION_LOOP", 502);
    seen.add(result.nextCursor); params.set("cursor", result.nextCursor);
  }
  throw new OutreachApiError("PAGINATION_LIMIT", 502);
}
