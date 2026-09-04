import {
  ADMIN_ACCESS_ACTIONS,
  type AdminAccessAction,
  type AdminResourceKey,
} from "./types";

export type AdminResourceDefinition = {
  key: AdminResourceKey;
  displayPaths: readonly string[];
  supportedActions: readonly AdminAccessAction[];
  requiresAdminUser: boolean;
};

export const ADMIN_RESOURCE_CATALOG = [
  {
    key: "users",
    displayPaths: [
      "/admin/users",
      "/admin/users/new",
      "/admin/users/[id]",
      "/admin/users/[id]/access",
    ],
    supportedActions: ADMIN_ACCESS_ACTIONS,
    requiresAdminUser: true,
  },
  {
    key: "password-reset-requests",
    displayPaths: ["/admin/password-reset-requests"],
    supportedActions: ["VIEW", "UPDATE"],
    requiresAdminUser: true,
  },
  {
    key: "roles",
    displayPaths: ["/admin/roles", "/admin/roles/[id]"],
    supportedActions: ADMIN_ACCESS_ACTIONS,
    requiresAdminUser: false,
  },
  {
    key: "role-assignments",
    displayPaths: [
      "/admin/roles/[id]#members",
      "/admin/users/[id]",
      "/admin/users/[id]/access",
    ],
    supportedActions: ["VIEW", "UPDATE"],
    requiresAdminUser: true,
  },
  {
    key: "phone-settings",
    displayPaths: ["/admin/phone-settings"],
    supportedActions: ["VIEW", "UPDATE"],
    requiresAdminUser: false,
  },
  {
    key: "chat-settings",
    displayPaths: ["/admin/chat-settings"],
    supportedActions: ["VIEW", "UPDATE"],
    requiresAdminUser: false,
  },
  {
    key: "language-settings",
    displayPaths: ["/admin/languages"],
    supportedActions: ["VIEW", "UPDATE"],
    requiresAdminUser: false,
  },
  {
    key: "maintenance-settings",
    displayPaths: ["/admin/maintenance-settings"],
    supportedActions: ["VIEW", "UPDATE"],
    requiresAdminUser: false,
  },
  {
    key: "developer-api",
    displayPaths: ["/admin/developer-api"],
    supportedActions: ["VIEW", "UPDATE"],
    requiresAdminUser: false,
  },
  {
    key: "reservations",
    displayPaths: [
      "/admin/reservations",
      "/admin/reservations/bookings",
      "/admin/reservations/api-keys",
      "/admin/reservations/api-keys/logs",
      "/admin/reservations/api-keys/logs/[id]",
    ],
    supportedActions: ["VIEW", "UPDATE"],
    requiresAdminUser: false,
  },
  {
    key: "zaad",
    displayPaths: ["/admin/zaad"],
    supportedActions: ADMIN_ACCESS_ACTIONS,
    requiresAdminUser: false,
  },
] as const satisfies readonly AdminResourceDefinition[];

export function getAdminResourceDefinition(resourceKey: string) {
  return ADMIN_RESOURCE_CATALOG.find((resource) => resource.key === resourceKey);
}

export function isSupportedAdminAction(
  resourceKey: string,
  action: AdminAccessAction,
) {
  return Boolean(
    getAdminResourceDefinition(resourceKey)?.supportedActions.includes(
      action as never,
    ),
  );
}

export const ADMIN_PERMISSION_CELL_COUNT = ADMIN_RESOURCE_CATALOG.reduce(
  (total, resource) => total + resource.supportedActions.length,
  0,
);
