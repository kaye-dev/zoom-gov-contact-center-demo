import { ZaadResidentError } from "./residents";
import type { Context } from "hono";
import type { AdminAccessAction } from "@/lib/admin-access/types";
import { authorizeAdminApi } from "@/lib/server/admin-access/api-guard";
import { parseAdminTenant } from "@/lib/admin-routing";
import { OutreachContractError } from "@/lib/zaad/outreach-contracts";
import type { ZaadApiEnvironment } from "./api-routes";
import { resolveOutreachScope, type OutreachScope } from "./outreach-scope";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { ZaadZoomError } from "./zoom-client";
import { OutreachError } from "@/lib/zaad/university/contracts";
import { normalizeRequestHostname } from "@/lib/hostname";
export type OutreachContext = Context<ZaadApiEnvironment>;
export function outreachError(c: OutreachContext, error: unknown) {
  if (error instanceof OutreachContractError || error instanceof OutreachError)
    return c.json({ code: error.code, error: error.code, tenantKey: c.get("tenantKey"), retryable: [429, 502, 503].includes(error.status), ...(error instanceof OutreachContractError && error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) }, error.status);
  if (error instanceof ZaadResidentError) return c.json({ code: error.code, error: error.code, tenantKey: c.get("tenantKey") }, error.status as 400 | 403 | 404 | 409 | 422 | 429 | 503);
  if (error instanceof ZaadZoomError) return c.json({ code: error.code, error: error.code, tenantKey: c.get("tenantKey"), retryable: !error.resultUnknown }, error.httpStatus as 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503);
  return c.json({ code: "SERVICE_UNAVAILABLE", error: "SERVICE_UNAVAILABLE", retryable: true }, 503);
}
export async function withOutreach(c: OutreachContext, action: AdminAccessAction | readonly AdminAccessAction[], fn: (db: PrismaClient, scope: OutreachScope) => Promise<unknown>, status: 200 | 202 = 200) {
  try {
    const tenant = parseAdminTenant(c.req.queries("tenant") ?? []);
    if (!tenant.ok) throw new OutreachContractError(tenant.code);
    const db = c.get("prisma"), actions = typeof action === "string" ? [action] : action;
    const auth = await authorizeAdminApi(c.get("auth"), db, c.req.raw.headers, "zaad", actions[0]);
    if (!auth.ok) return c.json({ code: auth.error, error: auth.error }, auth.status);
    for (const extra of actions.slice(1)) {
      const additional = await authorizeAdminApi(c.get("auth"), db, c.req.raw.headers, "zaad", extra);
      if (!additional.ok) return c.json({ code: additional.error, error: additional.error }, additional.status);
    }
    const scope = await resolveOutreachScope(db, auth.actor, tenant.tenantKey);
    const result = await fn(db, scope);
    // Preserve middleware headers (especially X-Admin-Tenant) for binary streams.
    if (result instanceof Response) return c.newResponse(result.body, result);
    return c.json(result as Record<string, unknown>, status);
  } catch (error) { return outreachError(c, error); }
}
export async function boundedBody(request: Request, maximum = 65536) {
  const stream = request.body?.getReader();
  if (!stream) throw new OutreachContractError("INVALID_REQUEST");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await stream.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { void stream.cancel().catch(() => undefined); throw new OutreachContractError("REQUEST_TOO_LARGE", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { stream.releaseLock(); }
}
export function requireSameOrigin(request: Request) {
  const target = new URL(request.url), host = request.headers.get("host");
  // Next's request URL can use the container port. Host retains the browser's
  // target authority; do not substitute untrusted X-Forwarded-* headers.
  if (host !== null) {
    if (!normalizeRequestHostname(host)) throw new OutreachContractError("INVALID_ORIGIN", 403);
    target.host = new URL(`${target.protocol}//${host}`).host;
  }
  if (request.headers.get("origin") !== target.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new OutreachContractError("INVALID_ORIGIN", 403);
}
export async function outreachJson(c: OutreachContext) {
  requireSameOrigin(c.req.raw);
  if (c.req.header("content-type")?.split(";", 1)[0].toLowerCase() !== "application/json") throw new OutreachContractError("INVALID_CONTENT_TYPE");
  let result: unknown;
  try { result = JSON.parse(await boundedBody(c.req.raw)); } catch (error) { if (error instanceof OutreachContractError) throw error; throw new OutreachContractError("INVALID_REQUEST"); }
  if (c.req.path.includes("/admin/") && result && typeof result === "object" && !Array.isArray(result)) {
    const value = result as Record<string, unknown>;
    for (const key of ["tenant", "tenantKey"]) {
      if (key in value) {
        if (value[key] !== c.get("tenantKey")) throw new OutreachContractError("TENANT_MISMATCH");
        delete value[key];
      }
    }
  }
  return result;
}
