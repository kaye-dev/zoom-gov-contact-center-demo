import { classifyAdminApi, parseAdminTenant } from "./admin-routing";

/** Capture scope before the request; never accept another screen's response. */
export async function adminFetch(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
  const route = classifyAdminApi(url.pathname);
  if (url.origin !== window.location.origin || route.kind !== "tenant") return globalThis.fetch(input, init);
  const selected = parseAdminTenant(new URL(window.location.href).searchParams.getAll("tenant"));
  if (!selected.ok) throw new Error(selected.code);
  const supplied = url.searchParams.getAll("tenant");
  if (supplied.length && (supplied.length !== 1 || supplied[0] !== selected.tenantKey)) throw new Error("TENANT_MISMATCH");
  url.searchParams.set("tenant", selected.tenantKey);
  const response = await globalThis.fetch(input instanceof Request ? new Request(url, input) : url, { cache: "no-store", ...init });
  const current = parseAdminTenant(new URL(window.location.href).searchParams.getAll("tenant"));
  if (!current.ok || current.tenantKey !== selected.tenantKey) throw new DOMException("Scope changed", "AbortError");
  const observed = response.headers.get("X-Admin-Tenant");
  if (response.ok && observed !== selected.tenantKey) throw new Error("TENANT_MISMATCH");
  return response;
}
