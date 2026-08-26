export const ADMIN_USER_ERROR_CODES = {
  authenticationRequired: "AUTHENTICATION_REQUIRED",
  administratorRequired: "ADMINISTRATOR_REQUIRED",
  passwordChangeRequired: "PASSWORD_CHANGE_REQUIRED",
  invalidRequest: "INVALID_REQUEST",
  invalidName: "INVALID_NAME",
  invalidEmail: "INVALID_EMAIL",
  emailAlreadyExists: "EMAIL_ALREADY_EXISTS",
  invalidRole: "INVALID_ROLE",
  userNotFound: "USER_NOT_FOUND",
  selfProtected: "SELF_PROTECTED",
  lastActiveAdmin: "LAST_ACTIVE_ADMIN",
  updateFailed: "UPDATE_FAILED",
  suspendFailed: "SUSPEND_FAILED",
  reactivateFailed: "REACTIVATE_FAILED",
  deleteFailed: "DELETE_FAILED",
} as const;

export type AdminUserErrorCode =
  (typeof ADMIN_USER_ERROR_CODES)[keyof typeof ADMIN_USER_ERROR_CODES];

export const ADMIN_USER_FIELDS = ["name", "email", "role"] as const;

export type AdminUserField = (typeof ADMIN_USER_FIELDS)[number];

export type AdminUserUpdate =
  | { field: "name"; value: string }
  | { field: "email"; value: string }
  | { field: "role"; value: "user" | "admin" };

type AdminUserUpdateResult =
  | { ok: true; value: AdminUserUpdate }
  | { ok: false; code: AdminUserErrorCode };

type ProtectedUser = {
  id: string;
  role: string | null;
  banned: boolean | null;
};

export function parseAdminUserUpdate(value: unknown): AdminUserUpdateResult {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.keys(value).length !== 2 ||
    !("field" in value) ||
    !("value" in value) ||
    typeof value.field !== "string" ||
    typeof value.value !== "string" ||
    !isAdminUserField(value.field)
  ) {
    return { ok: false, code: ADMIN_USER_ERROR_CODES.invalidRequest };
  }

  if (value.field === "name") {
    const name = value.value.trim();
    return name
      ? { ok: true, value: { field: "name", value: name } }
      : { ok: false, code: ADMIN_USER_ERROR_CODES.invalidName };
  }

  if (value.field === "email") {
    const email = normalizeAdminUserEmail(value.value);
    return isAdminUserEmail(email)
      ? { ok: true, value: { field: "email", value: email } }
      : { ok: false, code: ADMIN_USER_ERROR_CODES.invalidEmail };
  }

  return value.value === "user" || value.value === "admin"
    ? { ok: true, value: { field: "role", value: value.value } }
    : { ok: false, code: ADMIN_USER_ERROR_CODES.invalidRole };
}

export function getProtectedAdminActionError({
  activeAdminCount,
  actorUserId,
  target,
}: {
  activeAdminCount: number;
  actorUserId: string;
  target: ProtectedUser;
}): AdminUserErrorCode | null {
  if (target.id === actorUserId) {
    return ADMIN_USER_ERROR_CODES.selfProtected;
  }

  if (
    target.role === "admin" &&
    target.banned !== true &&
    activeAdminCount <= 1
  ) {
    return ADMIN_USER_ERROR_CODES.lastActiveAdmin;
  }

  return null;
}

export function isActiveAdmin(user: Pick<ProtectedUser, "role" | "banned">) {
  return user.role === "admin" && user.banned !== true;
}

function isAdminUserField(value: string): value is AdminUserField {
  return ADMIN_USER_FIELDS.includes(value as AdminUserField);
}

function normalizeAdminUserEmail(email: string) {
  return email.trim().toLowerCase();
}

function isAdminUserEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
