import type { AdminAccessSystemRole } from "@/lib/admin-access/types";

type RoleDisplayCopy = {
  systemRoleNames: Record<AdminAccessSystemRole, string>;
  systemRoleDescriptions: Record<AdminAccessSystemRole, string>;
};

type DisplayableRole = {
  name: string;
  description?: string | null;
  systemKey: AdminAccessSystemRole | null;
};

export function getAdminRoleDisplayName(
  role: DisplayableRole,
  copy: RoleDisplayCopy,
) {
  return role.systemKey ? copy.systemRoleNames[role.systemKey] : role.name;
}

export function getAdminRoleDisplayDescription(
  role: DisplayableRole,
  copy: RoleDisplayCopy,
) {
  return role.systemKey
    ? copy.systemRoleDescriptions[role.systemKey]
    : role.description ?? null;
}
