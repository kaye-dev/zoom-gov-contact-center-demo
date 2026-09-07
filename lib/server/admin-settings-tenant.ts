import "server-only";
import { getRequestTenant } from "./tenant";
import {
  resolveAdminSettingsTenant,
  type AdminSettingsResource,
} from "../admin-settings-tenant";
export async function getAdminSettingsTenant(
  value: string | string[] | undefined,
  resource: AdminSettingsResource,
) {
  const host = await getRequestTenant();
  return resolveAdminSettingsTenant(
    value === undefined ? [] : Array.isArray(value) ? value : [value],
    host.key,
    resource,
  );
}
