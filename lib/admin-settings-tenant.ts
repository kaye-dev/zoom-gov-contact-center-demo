import { getTenant, isTenantKey, TENANTS, type TenantKey } from "./tenants";

export const ADMIN_SETTINGS_RESOURCES = [
  "phone-settings",
  "chat-settings",
  "online-consultation-settings",
] as const;
export type AdminSettingsResource = (typeof ADMIN_SETTINGS_RESOURCES)[number];
export function resolveAdminSettingsTenant(
  values: readonly string[],
  fallback: TenantKey,
  resource: AdminSettingsResource,
) {
  if (values.length > 1 || (values.length === 1 && !isTenantKey(values[0]))) {
    return {
      ok: false,
      status: 400,
      error: "INVALID_SETTINGS_TENANT",
    } as const;
  }
  const key = values.length === 0 ? fallback : values[0];
  if (!isTenantKey(key))
    return {
      ok: false,
      status: 400,
      error: "INVALID_SETTINGS_TENANT",
    } as const;
  const tenant = getTenant(key);
  if (!tenant.adminSettings.includes(resource))
    return { ok: false, status: 404, error: "NOT_FOUND" } as const;
  return { ok: true, tenant } as const;
}
export function settingsTenantOptions(resource: AdminSettingsResource) {
  return TENANTS.filter((t) => t.adminSettings.includes(resource)).map(
    (t) => t.key,
  );
}
