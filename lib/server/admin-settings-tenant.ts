import "server-only";
import { getAdminPageTenant } from "./admin-scope";
import type { AdminSettingsResource } from "../admin-settings-tenant";
export async function getAdminSettingsTenant(
  _value: string | string[] | undefined,
  resource: AdminSettingsResource,
) {
  return getAdminPageTenant(resource);
}
