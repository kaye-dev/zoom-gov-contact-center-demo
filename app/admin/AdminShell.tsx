"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ArrowDropDownIcon } from "@/app/components/svg/ArrowDropDownIcon";
import { authClient } from "@/lib/auth-client";

import { useI18n } from "../i18n/LanguageProvider";

type AdminShellProps = {
  children: ReactNode;
  visibleItems: AdminNavigationItemKey[];
};

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
  | "roles";

type AdminMenuKey = "users" | "settings";

type AdminMenuGroup = {
  key: AdminMenuKey;
  label: string;
  items: Array<{
    key: AdminNavigationItemKey;
    href: string;
    label: string;
  }>;
};

export function AdminShell({ children, visibleItems }: AdminShellProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [openMenu, setOpenMenu] = useState<AdminMenuKey | null>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const usersMenuButtonRef = useRef<HTMLButtonElement>(null);
  const settingsMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      const trigger =
        openMenu === "users"
          ? usersMenuButtonRef.current
          : settingsMenuButtonRef.current;
      setOpenMenu(null);
      trigger?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const allMenuGroups: AdminMenuGroup[] = [
    {
      key: "users",
      label: t.admin.users,
      items: [
        { key: "users", href: "/admin/users", label: t.admin.users },
        { key: "new-user", href: "/admin/users/new", label: t.admin.newUser },
        {
          key: "password-reset-requests",
          href: "/admin/password-reset-requests",
          label: t.admin.passwordResets,
        },
      ],
    },
    {
      key: "settings",
      label: t.admin.settingsMenu,
      items: [
        { key: "phone-settings", href: "/admin/phone-settings", label: t.admin.phoneSettings },
        { key: "chat-settings", href: "/admin/chat-settings", label: t.admin.chatSettings },
        { key: "language-settings", href: "/admin/languages", label: t.admin.languageSettings },
        {
          key: "maintenance-settings",
          href: "/admin/maintenance-settings",
          label: t.admin.maintenanceSettings,
        },
        {
          key: "roles",
          href: "/admin/roles",
          label: t.admin.accessControl.rolesNav,
        },
        {
          key: "developer-api",
          href: "/admin/developer-api",
          label: t.admin.developerApi,
        },
      ],
    },
  ];
  const menuGroups = allMenuGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => visibleItems.includes(item.key)),
  })).filter((group) => group.items.length > 0);

  const signOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div
      id={
        pathname === "/admin/reservations/api-keys"
          ? "reservation-api-keys-page"
          : pathname === "/admin/reservations/api-keys/logs"
            ? "reservation-api-logs-page"
            : pathname.startsWith("/admin/reservations/api-keys/logs/")
              ? "reservation-api-log-detail-page"
          : pathname.startsWith("/admin/reservations")
            ? "reservation-system-page"
            : undefined
      }
      className="min-h-screen bg-surface text-fg"
    >
      <header className="sticky top-0 z-50 border-b border-line bg-surface-raised">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4 md:px-6">
          <Link
            href="/"
            className="text-lg font-bold text-fg transition-colors hover:text-accent"
          >
            {t.cityName}
          </Link>
          <span className="text-sm text-fg-muted">{t.admin.title}</span>
          <nav
            ref={navigationRef}
            aria-label={t.admin.title}
            className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto"
          >
            {menuGroups.map(({ key, label, items }) => {
                  const isOpen = openMenu === key;
                  const menuId = `admin-${key}-menu`;

                  return (
                    <div
                      key={key}
                      className="relative"
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        ) {
                          setOpenMenu((current) =>
                            current === key ? null : current,
                          );
                        }
                      }}
                    >
                      <button
                        ref={
                          key === "users"
                            ? usersMenuButtonRef
                            : settingsMenuButtonRef
                        }
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={menuId}
                        onClick={() =>
                          setOpenMenu((current) =>
                            current === key ? null : key,
                          )
                        }
                        className="flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover hover:text-accent"
                      >
                        <span>{label}</span>
                        <ArrowDropDownIcon className="h-6 w-6 shrink-0" />
                      </button>

                      {isOpen ? (
                        <ul
                          id={menuId}
                          className={`absolute top-full z-50 mt-2 min-w-48 overflow-hidden rounded-lg border border-line bg-surface-raised py-1 shadow-lg ${
                            key === "users" ? "left-0" : "right-0"
                          }`}
                        >
                          {items.map((item) => {
                            const isCurrent = isCurrentAdminItem(pathname, item.key);

                            return (
                              <li key={item.href}>
                                <Link
                                  href={item.href}
                                  aria-current={isCurrent ? "page" : undefined}
                                  onClick={() => setOpenMenu(null)}
                                  className={`block whitespace-nowrap px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover hover:text-accent ${
                                    isCurrent ? "text-accent" : "text-fg"
                                  }`}
                                >
                                  {item.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
            {visibleItems.includes("reservations") ? (
              <Link
                href="/admin/reservations"
                aria-current={pathname.startsWith("/admin/reservations") ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-hover hover:text-accent ${
                  pathname.startsWith("/admin/reservations") ? "text-accent" : "text-fg"
                }`}
              >
                {t.admin.reservations}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={signOut}
              disabled={isSigningOut}
              className="cursor-pointer rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.auth.signOut}
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
        {children}
      </main>
    </div>
  );
}

function isCurrentAdminItem(pathname: string, key: AdminNavigationItemKey) {
  if (key === "new-user") return pathname === "/admin/users/new";
  if (key === "users") {
    return (
      pathname === "/admin/users" ||
      (pathname.startsWith("/admin/users/") && pathname !== "/admin/users/new")
    );
  }
  if (key === "roles") return pathname.startsWith("/admin/roles");
  const exactPaths: Record<Exclude<AdminNavigationItemKey, "users" | "new-user" | "roles" | "reservations">, string> = {
    "password-reset-requests": "/admin/password-reset-requests",
    "phone-settings": "/admin/phone-settings",
    "chat-settings": "/admin/chat-settings",
    "language-settings": "/admin/languages",
    "maintenance-settings": "/admin/maintenance-settings",
    "developer-api": "/admin/developer-api",
  };
  if (key === "reservations") return pathname.startsWith("/admin/reservations");
  return pathname === exactPaths[key];
}
