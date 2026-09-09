import { headers } from "next/headers";
import { cache } from "react";

import { resolveTenantFromHost, type TenantDefinition } from "@/lib/tenants";

/**
 * Resolves the tenant that owns the current request from its `Host` header.
 *
 * Cached per request so every server component and route handler in one render
 * observes the same tenant without re-parsing the header.
 */
export const getRequestTenant = cache(
  async (): Promise<TenantDefinition> =>
    resolveTenantFromHost((await headers()).get("host")),
);
