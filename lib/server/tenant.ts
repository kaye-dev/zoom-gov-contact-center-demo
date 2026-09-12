import { headers } from "next/headers";
import { cache } from "react";

import { resolveTenantFromHost, type TenantDefinition } from "@/lib/tenants";
import { requirePublicPageAccess } from "./public-page-access";

/**
 * Resolves the tenant that owns the current request from its `Host` header.
 *
 * Cached per request so every server component and route handler in one render
 * observes the same tenant without re-parsing the header.
 */
export const getRequestTenant = cache(
  async (): Promise<TenantDefinition> => {
    await requirePublicPageAccess();
    return resolveTenantFromHost((await headers()).get("host"));
  },
);
