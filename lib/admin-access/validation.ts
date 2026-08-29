import {
  ADMIN_PERMISSION_CELL_COUNT,
  ADMIN_RESOURCE_CATALOG,
  isSupportedAdminAction,
} from "./catalog";
import {
  ADMIN_ROLE_DESCRIPTION_MAX_LENGTH,
  ADMIN_ROLE_NAME_MAX_LENGTH,
  createAdminRoleNameKey,
  normalizeAdminRoleDescription,
  normalizeAdminRoleName,
} from "./normalization";
import {
  ADMIN_ACCESS_ACTIONS,
  ADMIN_RESOURCE_KEYS,
  type AdminAccessAction,
  type AdminAccessEffect,
  type AdminResourceKey,
} from "./types";

export const ADMIN_ROLE_ERROR_CODES = {
  invalidRequest: "INVALID_ROLE_REQUEST",
  nameRequired: "ROLE_NAME_REQUIRED",
  nameTooLong: "ROLE_NAME_TOO_LONG",
  descriptionTooLong: "ROLE_DESCRIPTION_TOO_LONG",
  invalidPermissions: "INVALID_ROLE_PERMISSIONS",
  nameConflict: "ROLE_NAME_CONFLICT",
  roleConflict: "ROLE_CONFLICT",
  roleNotFound: "ROLE_NOT_FOUND",
  systemRoleImmutable: "SYSTEM_ROLE_IMMUTABLE",
  roleInUse: "ROLE_IN_USE",
  assignmentConflict: "ROLE_ASSIGNMENT_CONFLICT",
  selfAssignmentForbidden: "SELF_ROLE_ASSIGNMENT_FORBIDDEN",
  permissionEscalation: "PERMISSION_ESCALATION_FORBIDDEN",
  lastRecoveryAdmin: "LAST_RECOVERY_ADMIN",
} as const;

export type ParsedRoleMetadata = {
  name: string;
  nameKey: string;
  description: string | null;
};

export type PermissionInput = {
  resourceKey: AdminResourceKey;
  action: AdminAccessAction;
  effect: AdminAccessEffect | null;
};

export function parseAdminRoleMetadata(
  value: unknown,
): { ok: true; value: ParsedRoleMetadata } | { ok: false; code: string } {
  if (
    typeof value !== "object" ||
    value === null ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    ("description" in value &&
      value.description !== null &&
      typeof value.description !== "string")
  ) {
    return { ok: false, code: ADMIN_ROLE_ERROR_CODES.invalidRequest };
  }

  const name = normalizeAdminRoleName(value.name);
  const descriptionValue =
    "description" in value && typeof value.description === "string"
      ? value.description
      : null;
  const description = normalizeAdminRoleDescription(descriptionValue);

  if (!name) return { ok: false, code: ADMIN_ROLE_ERROR_CODES.nameRequired };
  if (name.length > ADMIN_ROLE_NAME_MAX_LENGTH) {
    return { ok: false, code: ADMIN_ROLE_ERROR_CODES.nameTooLong };
  }
  if (
    description !== null &&
    description.length > ADMIN_ROLE_DESCRIPTION_MAX_LENGTH
  ) {
    return { ok: false, code: ADMIN_ROLE_ERROR_CODES.descriptionTooLong };
  }

  return {
    ok: true,
    value: { name, nameKey: createAdminRoleNameKey(name), description },
  };
}

export function parsePermissionMatrix(
  value: unknown,
): { ok: true; value: PermissionInput[] } | { ok: false; code: string } {
  if (!Array.isArray(value) || value.length !== ADMIN_PERMISSION_CELL_COUNT) {
    return { ok: false, code: ADMIN_ROLE_ERROR_CODES.invalidPermissions };
  }

  const parsed: PermissionInput[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("resourceKey" in item) ||
      !("action" in item) ||
      !("effect" in item) ||
      typeof item.resourceKey !== "string" ||
      typeof item.action !== "string" ||
      (item.effect !== null && item.effect !== "ALLOW" && item.effect !== "DENY") ||
      !ADMIN_RESOURCE_KEYS.includes(item.resourceKey as AdminResourceKey) ||
      !ADMIN_ACCESS_ACTIONS.includes(item.action as AdminAccessAction) ||
      !isSupportedAdminAction(item.resourceKey, item.action as AdminAccessAction)
    ) {
      return { ok: false, code: ADMIN_ROLE_ERROR_CODES.invalidPermissions };
    }

    const key = `${item.resourceKey}:${item.action}`;
    if (seen.has(key)) {
      return { ok: false, code: ADMIN_ROLE_ERROR_CODES.invalidPermissions };
    }
    seen.add(key);
    parsed.push({
      resourceKey: item.resourceKey as AdminResourceKey,
      action: item.action as AdminAccessAction,
      effect: item.effect as AdminAccessEffect | null,
    });
  }

  for (const resource of ADMIN_RESOURCE_CATALOG) {
    for (const action of resource.supportedActions) {
      if (!seen.has(`${resource.key}:${action}`)) {
        return { ok: false, code: ADMIN_ROLE_ERROR_CODES.invalidPermissions };
      }
    }
  }

  return { ok: true, value: parsed };
}
