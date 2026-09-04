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
  | "settings"
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

const settingsPaths: Record<Extract<AdminNavigationItemKey, "phone-settings" | "chat-settings" | "language-settings" | "maintenance-settings" | "roles" | "developer-api">, string> = {
  "phone-settings": "/admin/phone-settings",
  "chat-settings": "/admin/chat-settings",
  "language-settings": "/admin/languages",
  "maintenance-settings": "/admin/maintenance-settings",
  roles: "/admin/roles",
  "developer-api": "/admin/developer-api",
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
      key: "phone-settings",
      href: settingsPaths["phone-settings"],
      label: t.admin.phoneSettings,
    },
    {
      key: "chat-settings",
      href: settingsPaths["chat-settings"],
      label: t.admin.chatSettings,
    },
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
    {
      key: "roles",
      href: settingsPaths.roles,
      label: t.admin.accessControl.rolesNav,
    },
    {
      key: "developer-api",
      href: settingsPaths["developer-api"],
      label: t.admin.developerApi,
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
  if (users[0]) {
    primaryItems.push({
      key: "users",
      href: users[0].href,
      label: t.admin.navigation.usersSection,
    });
  }
  if (settings[0]) {
    primaryItems.push({
      key: "settings",
      href: settings[0].href,
      label: t.admin.navigation.settingsSection,
    });
  }
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
  if (pathname.startsWith(settingsPaths.roles)) {
    return {
      primaryKey: "settings",
      sectionKey: "settings",
      sectionItemKey: "roles",
    };
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
