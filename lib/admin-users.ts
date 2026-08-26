import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy";

export const ADMIN_USER_ERROR_CODES = {
  authenticationRequired: "AUTHENTICATION_REQUIRED",
  administratorRequired: "ADMINISTRATOR_REQUIRED",
  passwordChangeRequired: "PASSWORD_CHANGE_REQUIRED",
  invalidRequest: "INVALID_REQUEST",
  invalidName: "INVALID_NAME",
  invalidEmail: "INVALID_EMAIL",
  emailAlreadyExists: "EMAIL_ALREADY_EXISTS",
  invalidRole: "INVALID_ROLE",
  invalidPassword: "INVALID_PASSWORD",
  passwordMismatch: "PASSWORD_MISMATCH",
  userNotFound: "USER_NOT_FOUND",
  selfProtected: "SELF_PROTECTED",
  lastActiveAdmin: "LAST_ACTIVE_ADMIN",
  updateFailed: "UPDATE_FAILED",
  suspendFailed: "SUSPEND_FAILED",
  reactivateFailed: "REACTIVATE_FAILED",
  deleteFailed: "DELETE_FAILED",
  resetPasswordFailed: "RESET_PASSWORD_FAILED",
  sessionRevocationFailed: "SESSION_REVOCATION_FAILED",
} as const;

export type AdminUserErrorCode =
  (typeof ADMIN_USER_ERROR_CODES)[keyof typeof ADMIN_USER_ERROR_CODES];

export const ADMIN_USER_FIELDS = ["name", "email", "role"] as const;

export type AdminUserField = (typeof ADMIN_USER_FIELDS)[number];

export type AdminUserUpdate =
  | { field: "name"; value: string }
  | { field: "email"; value: string }
  | { field: "role"; value: "user" | "admin" };

export type AdminUserPasswordMode = "temporary" | "standard";

export type AdminUserPasswordReset = {
  mode: AdminUserPasswordMode;
  password: string;
  passwordConfirmation: string;
  revokeSessions: boolean;
};

type AdminUserUpdateResult =
  | { ok: true; value: AdminUserUpdate }
  | { ok: false; code: AdminUserErrorCode };

type AdminUserPasswordResetResult =
  | { ok: true; value: AdminUserPasswordReset }
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

export function parseAdminUserPasswordReset(
  value: unknown,
): AdminUserPasswordResetResult {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.keys(value).length !== 4 ||
    !("mode" in value) ||
    !("password" in value) ||
    !("passwordConfirmation" in value) ||
    !("revokeSessions" in value) ||
    (value.mode !== "temporary" && value.mode !== "standard") ||
    typeof value.password !== "string" ||
    typeof value.passwordConfirmation !== "string" ||
    typeof value.revokeSessions !== "boolean"
  ) {
    return { ok: false, code: ADMIN_USER_ERROR_CODES.invalidRequest };
  }

  if (
    value.password.length < PASSWORD_MIN_LENGTH ||
    value.password.length > PASSWORD_MAX_LENGTH
  ) {
    return { ok: false, code: ADMIN_USER_ERROR_CODES.invalidPassword };
  }

  if (value.password !== value.passwordConfirmation) {
    return { ok: false, code: ADMIN_USER_ERROR_CODES.passwordMismatch };
  }

  return {
    ok: true,
    value: {
      mode: value.mode,
      password: value.password,
      passwordConfirmation: value.passwordConfirmation,
      revokeSessions: value.revokeSessions,
    },
  };
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
