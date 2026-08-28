import { caseFold } from "unicode-case-folding";

export const ADMIN_ROLE_NAME_MAX_LENGTH = 64;
export const ADMIN_ROLE_DESCRIPTION_MAX_LENGTH = 100;

export function normalizeAdminRoleName(value: string) {
  return value.trim().normalize("NFKC");
}

export function createAdminRoleNameKey(value: string) {
  return caseFold(normalizeAdminRoleName(value));
}

export function normalizeAdminRoleDescription(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
