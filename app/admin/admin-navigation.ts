import type { Dictionary } from "@/app/i18n/dictionaries";

export type AdminNavigationItemKey =
  | "users"
  | "new-user"
  | "password-reset-requests"
  | "phone-settings"
  | "chat-settings"
  | "language-settings"
  | "maintenance-settings"
  | "developer-api"
  | "reservations"
  | "zaad"
  | "roles";

export type AdminPrimaryNavigationKey =
  | "dashboard"
  | "users"
  | "phone-settings"
  | "chat-settings"
  | "settings"
  | "roles"
  | "developer-api"
  | "reservations"
  | "zaad";

export type AdminSectionKey = "users" | "settings";

export type AdminSectionNavigationItem = {
  key: AdminNavigationItemKey;
  href: string;
  label: string;
};

export type AdminPrimaryNavigationItem = {
  key: AdminPrimaryNavigationKey;
  href: string;
  label: string;
};

export type AdminNavigationModel = {
  primaryItems: AdminPrimaryNavigationItem[];
  sections: Partial<Record<AdminSectionKey, AdminSectionNavigationItem[]>>;
};

export type AdminNavigationState = {
  primaryKey: AdminPrimaryNavigationKey | null;
  sectionKey: AdminSectionKey | null;
  sectionItemKey: AdminNavigationItemKey | null;
};

const userPaths: Record<Extract<AdminNavigationItemKey, "users" | "new-user" | "password-reset-requests">, string> = {
  users: "/admin/users",
  "new-user": "/admin/users/new",
  "password-reset-requests": "/admin/password-reset-requests",
};

const settingsPaths: Record<Extract<AdminNavigationItemKey, "language-settings" | "maintenance-settings">, string> = {
  "language-settings": "/admin/languages",
  "maintenance-settings": "/admin/maintenance-settings",
};

export function buildAdminNavigation(
  visibleItems: AdminNavigationItemKey[],
  t: Dictionary,
): AdminNavigationModel {
  const visible = new Set(visibleItems);
  const users = ([
    { key: "users", href: userPaths.users, label: t.admin.users },
    { key: "new-user", href: userPaths["new-user"], label: t.admin.newUser },
    {
      key: "password-reset-requests",
      href: userPaths["password-reset-requests"],
      label: t.admin.passwordResets,
    },
  ] satisfies AdminSectionNavigationItem[]).filter((item) =>
    visible.has(item.key),
  );
  const settings = ([
    {
      key: "language-settings",
      href: settingsPaths["language-settings"],
      label: t.admin.languageSettings,
    },
    {
      key: "maintenance-settings",
      href: settingsPaths["maintenance-settings"],
      label: t.admin.maintenanceSettings,
    },
  ] satisfies AdminSectionNavigationItem[]).filter((item) =>
    visible.has(item.key),
  );

  const primaryItems: AdminPrimaryNavigationItem[] = [
    {
      key: "dashboard",
      href: "/admin",
      label: t.admin.navigation.dashboard,
    },
  ];
  // Daily operations first, followed by access administration and configuration.
  if (visible.has("reservations")) {
    primaryItems.push({
      key: "reservations",
      href: "/admin/reservations",
      label: t.admin.reservations,
    });
  }
  if (visible.has("zaad")) {
    primaryItems.push({
      key: "zaad",
      href: "/admin/zaad",
      label: t.admin.zaad.navLabel,
    });
  }
  if (users[0]) {
    primaryItems.push({
      key: "users",
      href: users[0].href,
      label: t.admin.navigation.usersSection,
    });
  }
  if (visible.has("roles")) {
    primaryItems.push({ key: "roles", href: "/admin/roles", label: t.admin.accessControl.rolesNav });
  }
  if (visible.has("phone-settings")) {
    primaryItems.push({ key: "phone-settings", href: "/admin/phone-settings", label: t.admin.phoneSettings });
  }
  if (visible.has("chat-settings")) {
    primaryItems.push({ key: "chat-settings", href: "/admin/chat-settings", label: t.admin.chatSettings });
  }
  if (visible.has("developer-api")) {
    primaryItems.push({ key: "developer-api", href: "/admin/developer-api", label: t.admin.developerApi });
  }
  if (settings[0]) {
    primaryItems.push({
      key: "settings",
      href: settings[0].href,
      label: t.admin.navigation.settingsSection,
    });
  }

  return {
    primaryItems,
    sections: {
      ...(users.length > 0 ? { users } : {}),
      ...(settings.length > 0 ? { settings } : {}),
    },
  };
}

export function resolveAdminNavigationState(
  pathname: string,
): AdminNavigationState {
  if (pathname === "/admin") {
    return { primaryKey: "dashboard", sectionKey: null, sectionItemKey: null };
  }
  if (pathname === userPaths["new-user"]) {
    return {
      primaryKey: "users",
      sectionKey: "users",
      sectionItemKey: "new-user",
    };
  }
  if (pathname === userPaths["password-reset-requests"]) {
    return {
      primaryKey: "users",
      sectionKey: "users",
      sectionItemKey: "password-reset-requests",
    };
  }
  if (pathname === userPaths.users || pathname.startsWith(`${userPaths.users}/`)) {
    return {
      primaryKey: "users",
      sectionKey: "users",
      sectionItemKey: "users",
    };
  }
  if (pathname === "/admin/roles" || pathname.startsWith("/admin/roles/")) {
    return { primaryKey: "roles", sectionKey: null, sectionItemKey: null };
  }
  if (pathname === "/admin/developer-api") {
    return { primaryKey: "developer-api", sectionKey: null, sectionItemKey: null };
  }
  if (pathname === "/admin/phone-settings") {
    return { primaryKey: "phone-settings", sectionKey: null, sectionItemKey: null };
  }
  if (pathname === "/admin/chat-settings") {
    return { primaryKey: "chat-settings", sectionKey: null, sectionItemKey: null };
  }
  const setting = Object.entries(settingsPaths).find(([, href]) => pathname === href);
  if (setting) {
    return {
      primaryKey: "settings",
      sectionKey: "settings",
      sectionItemKey: setting[0] as AdminNavigationItemKey,
    };
  }
  if (pathname.startsWith("/admin/reservations")) {
    return { primaryKey: "reservations", sectionKey: null, sectionItemKey: null };
  }
  if (pathname.startsWith("/admin/zaad")) {
    return { primaryKey: "zaad", sectionKey: null, sectionItemKey: null };
  }
  return { primaryKey: null, sectionKey: null, sectionItemKey: null };
}
