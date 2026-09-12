import { isTenantKey, type TenantKey } from "./tenants";

export const ADMIN_REQUEST_PATH_HEADER = "x-admin-request-path";
export const OUTREACH_VIEWS = ["contact-lists", "campaigns", "one-time", "messages"] as const;
export function resolveOutreachView(tenant: TenantKey, requested: string | null, workflow: string | null) {
  if (tenant === "lg" && workflow === "fraud") return "one-time";
  if (requested === "residents" || requested === "contacts") return "contact-lists";
  if (requested === "groups") return "contact-lists";
  if (requested === "dispatches") return "one-time";
  return OUTREACH_VIEWS.find(view => view === requested) ?? "contact-lists";
}
const LOCAL_ADMIN_ORIGIN = "http://localhost:3000";

/** The former dashboard preserves only supported entry context. */
export function adminHomeDestination(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  if (typeof params.tenant === "string" && isTenantKey(params.tenant)) query.set("tenant", params.tenant);
  if (params.error === "access-denied") query.set("error", params.error);
  return `/admin/my-page${query.size ? `?${query}` : ""}`;
}
const authPaths = new Set(["/admin/login", "/admin/change-password", "/admin/forgot-password"]);
const legacyAuthPaths = new Set(["/login", "/change-password", "/forgot-password"]);
const adminPagePattern = /^\/admin(?:\/(?:users(?:\/(?:new|[A-Za-z0-9_-]+))?|roles(?:\/[A-Za-z0-9_-]+)?|my-page|password-reset-requests|phone-settings|chat-settings|online-consultation-settings|languages|maintenance-settings|developer-api|zaad|reservations(?:\/(?:bookings|api-keys(?:\/logs(?:\/[A-Za-z0-9_-]+)?)?))?))?$/u;

export function parseAdminTenant(values: readonly string[]) {
  if (values.length === 0) return { ok: false, code: "TENANT_REQUIRED" } as const;
  if (values.length !== 1 || !isTenantKey(values[0]))
    return { ok: false, code: "INVALID_TENANT" } as const;
  return { ok: true, tenantKey: values[0] } as const;
}

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function classifyAdminApi(pathname: string) {
  const path = pathname.replace(/^\/api(?=\/)/u, "");
  if (!path.startsWith("/admin/")) return { kind: "public" } as const;
  const root = path.split("/")[2];
  if (["users", "roles", "password-reset-requests", "developer-api", "site-access-settings"].includes(root)) return { kind: "global" } as const;
  if (root === "online-consultation-settings") return { kind: "tenant", resource: "online-consultation-settings" } as const;
  if (["reservations", "reservation-api-keys", "reservation-api-usage-limit", "reservation-api-request-logs"].includes(root))
    return { kind: "tenant", resource: "reservations" } as const;
  if (root === "phone-settings" || root === "chat-settings" || root === "language-settings" || root === "maintenance-settings" || root === "zaad")
    return { kind: "tenant", resource: root } as const;
  return { kind: "unknown" } as const;
}

export function adminTenantHref(href: string, tenant: TenantKey) {
  const url = new URL(href, LOCAL_ADMIN_ORIGIN);
  url.searchParams.set("tenant", tenant);
  return url.pathname + url.search;
}

/** Only a verified admin destination can survive login/password-change. */
export function safeAdminCallback(value: unknown, origin = LOCAL_ADMIN_ORIGIN): string {
  if (typeof value !== "string" || /[\\\u0000-\u001f\u007f]/u.test(value)) return "/admin";
  let url: URL;
  try {
    // Reject encoded separators/control characters, including double encoding.
    let decoded = value;
    for (let i = 0; i < 3; i++) {
      decoded = decodeURIComponent(decoded);
      if (/[\\\u0000-\u001f\u007f]/u.test(decoded) || decoded.startsWith("//")) return "/admin";
    }
    if (!value.startsWith("/") && !value.startsWith(`${origin}/`)) return "/admin";
    url = new URL(value, origin);
  } catch { return "/admin"; }
  if (url.origin !== origin || url.username || url.password || url.hash ||
      !isAdminPath(url.pathname) || authPaths.has(url.pathname) ||
      !adminPagePattern.test(url.pathname)) return "/admin";
  const tenants = url.searchParams.getAll("tenant");
  if (tenants.length && !parseAdminTenant(tenants).ok) return "/admin";
  // A callback must not carry another redirect/callback through authentication.
  if (url.searchParams.has("callbackURL")) return "/admin";
  const destination = resolveOutreachDefaultRedirect(url, "GET") ?? url;
  return destination.pathname + destination.search;
}

export function adminAuthHref(path: "login" | "change-password", callback: unknown) {
  return `/admin/${path}?callbackURL=${encodeURIComponent(safeAdminCallback(callback))}`;
}

export function localAdminRequest(urlValue: string, method: string, production: boolean) {
  if (production) return { kind: "pass" } as const;
  const url = new URL(urlValue);
  const alias: TenantKey | undefined = url.hostname === "lg.localhost" ? "lg"
    : url.hostname === "univ.localhost" ? "univ" : undefined;
  if (!alias && url.hostname !== "localhost") return { kind: "pass" } as const;
  const legacy = legacyAuthPaths.has(url.pathname);
  const api = /^\/api\/(?:admin|auth|account)(?:\/|$)/u.test(url.pathname);
  if (!isAdminPath(url.pathname) && !legacy && !api) return { kind: "pass" } as const;
  if (alias && (api || !["GET", "HEAD"].includes(method)))
    return { kind: "reject", status: 400, code: "CANONICAL_ADMIN_ORIGIN_REQUIRED" } as const;
  if (alias || legacy) {
    const destination = new URL(LOCAL_ADMIN_ORIGIN);
    destination.pathname = legacy ? `/admin${url.pathname}` : url.pathname;
    destination.search = url.search;
    if (alias && !destination.searchParams.has("tenant")) destination.searchParams.set("tenant", alias);
    return { kind: "redirect", destination: destination.href } as const;
  }
  const values = url.searchParams.getAll("tenant");
  if (isAdminPath(url.pathname) && values.length && !parseAdminTenant(values).ok)
    return { kind: "reject", status: 400, code: "INVALID_TENANT" } as const;
  return { kind: "pass" } as const;
}

export function publicAdminHref(tenant: TenantKey, hostname?: string) {
  return `${hostname === "lg.localhost" || hostname === "univ.localhost" || hostname === "localhost" ? LOCAL_ADMIN_ORIGIN : ""}/admin?tenant=${tenant}`;
}

/** Settings may return only to the selected industry's outreach screen. */
export function safeOutreachReturnPath(value: unknown, tenant?: TenantKey): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  const safe = safeAdminCallback(value);
  const parsed = new URL(safe, LOCAL_ADMIN_ORIGIN);
  const scope = parseAdminTenant(parsed.searchParams.getAll("tenant"));
  if (parsed.pathname !== "/admin/zaad" || !scope.ok || (tenant !== undefined && scope.tenantKey !== tenant)) return null;
  for (const key of ["returnTo", "callbackURL", "state", "theme"]) parsed.searchParams.delete(key);
  return parsed.pathname + parsed.search;
}

/** Normalize only an absent tenant on the outreach page; preserve explicit values. */
export function resolveOutreachDefaultRedirect(url: URL, method: string): URL | null {
  if (!["GET", "HEAD"].includes(method) || url.pathname !== "/admin/zaad" || url.searchParams.has("tenant")) return null;
  const destination = new URL(url);
  destination.searchParams.set("tenant", "lg");
  return destination;
}

export function isOutreachDetailPage(view: string, query: URLSearchParams): boolean {
  const state = query.get("state") ?? "";
  if (query.get("section") === "contacts") return view === "contact-lists" && ["", "csv-upload", "csv-preview", "csv-error", "registration-settings"].includes(state);
  if (query.get("workflow") || query.get("step") === "cases") return false;
  const states: Record<string, readonly string[]> = {
    "contact-lists": ["default-group-detail", "group-detail", "group-edit", "group-create", "group-sync"],
    campaigns: ["campaign-detail", "campaign-sync"],
    "one-time": ["dispatch-create", "dispatch-history", "dispatch-edit", "dispatch-retry", "dispatch-confirm"],
    messages: ["message-create", "message-edit", "message-sync", "message-audio-detail"],
  };
  return Boolean(states[view]?.includes(state) && (state.endsWith("create") || state.endsWith("sync") || query.get("detail")));
}
export function outreachParentHref(tenant: TenantKey, query: URLSearchParams, parent: "section" | "contacts" = "section"): string {
  const params = new URLSearchParams(query);
  for (const key of ["state", "detail", "query", "search", "cursor", "section", "origin", "page", "trail", "importJob"]) params.delete(key);
  params.set("tenant", tenant);
  params.set("view", resolveOutreachView(tenant, query.get("view"), query.get("workflow")));
  if (parent === "contacts") params.set("section", "contacts");
  return `/admin/zaad?${params}`;
}
