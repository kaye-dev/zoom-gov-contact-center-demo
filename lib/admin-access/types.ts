export const ADMIN_ACCESS_ACTIONS = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "DELETE",
] as const;

export type AdminAccessAction = (typeof ADMIN_ACCESS_ACTIONS)[number];
export type AdminAccessEffect = "ALLOW" | "DENY";
export type AdminAccessSystemRole = "FULL_ACCESS" | "NO_ACCESS";

export const ADMIN_RESOURCE_KEYS = [
  "users",
  "password-reset-requests",
  "roles",
  "role-assignments",
  "phone-settings",
  "chat-settings",
  "language-settings",
  "maintenance-settings",
  "developer-api",
  "reservations",
] as const;

export type AdminResourceKey = (typeof ADMIN_RESOURCE_KEYS)[number];

export type AdminAccessPermission = {
  resourceKey: string;
  action: AdminAccessAction;
  effect: AdminAccessEffect;
};

export type AdminAccessRoleSource = {
  id: string;
  name: string;
  systemKey: AdminAccessSystemRole | null;
  permissions: AdminAccessPermission[];
};

export type AdminAccessActor = {
  id: string;
  adminAttribute: "admin" | "user";
  banned: boolean;
  mustChangePassword: boolean;
  roles: AdminAccessRoleSource[];
};

export type AdminAccessDecisionReason =
  | "EXPLICIT_ALLOW"
  | "EXPLICIT_DENY"
  | "IMPLICIT_DENY"
  | "VIEW_REQUIRED"
  | "ADMIN_USER_REQUIRED"
  | "ACCOUNT_SUSPENDED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "UNSUPPORTED";

export type AdminAccessDecisionRoleReference = {
  id: string;
  name: string;
  systemKey: AdminAccessSystemRole | null;
};

export type AdminAccessDecision = {
  resourceKey: AdminResourceKey;
  action: AdminAccessAction;
  supported: boolean;
  allowed: boolean;
  reason: AdminAccessDecisionReason;
  allowSources: AdminAccessDecisionRoleReference[];
  denySources: AdminAccessDecisionRoleReference[];
  viewPrerequisite?: {
    allowed: boolean;
    reason: AdminAccessDecisionReason;
    allowSources: AdminAccessDecisionRoleReference[];
    denySources: AdminAccessDecisionRoleReference[];
  };
};
