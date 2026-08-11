"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ArrowDropDownIcon } from "@/app/components/svg/ArrowDropDownIcon";
import { authClient } from "@/lib/auth-client";

import { useI18n } from "../i18n/LanguageProvider";

type AdminShellProps = {
  children: ReactNode;
  isAdmin: boolean;
};

type AdminMenuKey = "users" | "settings";

type AdminMenuGroup = {
  key: AdminMenuKey;
  label: string;
  items: Array<{
    href: string;
    label: string;
  }>;
};

export function AdminShell({ children, isAdmin }: AdminShellProps) {
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

  const menuGroups: AdminMenuGroup[] = [
    {
      key: "users",
      label: t.admin.users,
      items: [
        { href: "/admin/users", label: t.admin.users },
        { href: "/admin/users/new", label: t.admin.newUser },
        {
          href: "/admin/password-reset-requests",
          label: t.admin.passwordResets,
        },
      ],
    },
    {
      key: "settings",
      label: t.admin.settingsMenu,
      items: [
        { href: "/admin/phone-settings", label: t.admin.phoneSettings },
        { href: "/admin/chat-settings", label: t.admin.chatSettings },
        { href: "/admin/languages", label: t.admin.languageSettings },
        {
          href: "/admin/maintenance-settings",
          label: t.admin.maintenanceSettings,
        },
      ],
    },
  ];

  const signOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-surface text-fg">
      <header className="border-b border-line bg-surface-raised">
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
            {isAdmin ? (
              <>
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
                            const isCurrent = pathname === item.href;

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
              </>
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
