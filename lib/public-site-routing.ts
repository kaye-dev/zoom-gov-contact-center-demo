import { normalizeRequestHostname } from "./hostname";
import { getTenant, resolveTenantFromHost, type TenantKey } from "./tenants";

export type PublicSite = { kind: "entry" } | { kind: "tenant"; tenantKey: TenantKey };

export function resolvePublicSite(host: string | null | undefined, env = process.env): PublicSite {
  if (normalizeRequestHostname(host) === "localhost") return { kind: "entry" };
  return { kind: "tenant", tenantKey: resolveTenantFromHost(host, env).key };
}

/** Host comes from the current request; destination labels come from the registry. */
export function demoSiteHref(host: string, tenant: TenantKey): string {
  if (normalizeRequestHostname(host) !== "localhost") {
    return `https://${getTenant(tenant).productionHost}/`;
  }
  const url = new URL(`http://${host}`);
  url.hostname = `${getTenant(tenant).devHostLabel}.localhost`;
  url.pathname = "/";
  return url.href;
}

export function safePublicReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return "/";
  try {
    let decoded = value;
    for (let i = 0; i < 4; i++) {
      if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(decoded)) return "/";
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (i === 3) return "/";
    }
    const destination = new URL(value, "https://return.invalid");
    const decodedPath = new URL(decoded, "https://return.invalid").pathname;
    if (destination.origin !== "https://return.invalid" || destination.hash ||
      /^\/(?:access|api|admin)(?:\/|$)/u.test(decodedPath)) return "/";
    return destination.pathname + destination.search;
  } catch { return "/"; }
}
