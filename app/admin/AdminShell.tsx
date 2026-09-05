"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { CloseIcon } from "@/app/components/svg/CloseIcon";
import { LeftPanelCloseIcon } from "@/app/components/svg/LeftPanelCloseIcon";
import { LeftPanelOpenIcon } from "@/app/components/svg/LeftPanelOpenIcon";
import { MenuIcon } from "@/app/components/svg/MenuIcon";
import { authClient } from "@/lib/auth-client";

import { useI18n } from "../i18n/LanguageProvider";
import { AdminNavigation } from "./AdminNavigation";
import {
  buildAdminNavigation,
  resolveAdminNavigationState,
  type AdminNavigationItemKey,
  type AdminNavigationModel,
  type AdminNavigationState,
} from "./admin-navigation";

export type { AdminNavigationItemKey } from "./admin-navigation";

type AdminShellProps = {
  children: ReactNode;
  visibleItems: AdminNavigationItemKey[];
  currentUserName: string;
};

type AdminNavigationContextValue = {
  model: AdminNavigationModel;
  navigationState: AdminNavigationState;
};

const AdminNavigationContext = createContext<
  AdminNavigationContextValue | undefined
>(undefined);

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useAdminNavigationContext() {
  const value = useContext(AdminNavigationContext);
  if (!value) {
    throw new Error(
      "useAdminNavigationContext must be used within AdminShell",
    );
  }
  return value;
}

export function AdminShell({
  children,
  visibleItems,
  currentUserName,
}: AdminShellProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [accountMenuSurface, setAccountMenuSurface] = useState<
    "desktop" | "drawer" | null
  >(null);
  const accountMenuSurfaceRef = useRef(accountMenuSurface);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const previousPathnameRef = useRef(pathname);

  const model = useMemo(
    () => buildAdminNavigation(visibleItems, t),
    [t, visibleItems],
  );
  const navigationState = useMemo(
    () => resolveAdminNavigationState(pathname),
    [pathname],
  );
  const navigationContext = useMemo(
    () => ({ model, navigationState }),
    [model, navigationState],
  );

  const closeDrawer = useCallback(() => {
    setAccountMenuSurface(null);
    setIsDrawerOpen(false);
  }, []);
  const toggleSidebar = useCallback(() => {
    setAccountMenuSurface(null);
    setIsSidebarExpanded((current) => !current);
  }, []);

  useEffect(() => {
    accountMenuSurfaceRef.current = accountMenuSurface;
  }, [accountMenuSurface]);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    setAccountMenuSurface(null);
    setIsDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.key.toLowerCase() !== "b" ||
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isDrawerOpen ||
        !window.matchMedia("(min-width: 1024px)").matches
      ) {
        return;
      }

      event.preventDefault();
      toggleSidebar();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen, toggleSidebar]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const closeAccountMenu = () => setAccountMenuSurface(null);
    desktopQuery.addEventListener("change", closeAccountMenu);
    return () => desktopQuery.removeEventListener("change", closeAccountMenu);
  }, []);

  useEffect(() => {
    if (!isDrawerOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const drawerTrigger = drawerTriggerRef.current;
    const pageContent = pageContentRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousInert = pageContent?.inert ?? false;
    const previousAriaHidden = pageContent?.getAttribute("aria-hidden") ?? null;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");

    document.body.style.overflow = "hidden";
    if (pageContent) {
      pageContent.inert = true;
      pageContent.setAttribute("aria-hidden", "true");
    }
    drawerCloseButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (accountMenuSurfaceRef.current !== null) return;
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;

      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !drawer.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !drawer.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) closeDrawer();
    };

    document.addEventListener("keydown", onKeyDown);
    desktopQuery.addEventListener("change", closeAtDesktop);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktopQuery.removeEventListener("change", closeAtDesktop);
      document.body.style.overflow = previousOverflow;
      if (pageContent) {
        pageContent.inert = previousInert;
        if (previousAriaHidden === null) {
          pageContent.removeAttribute("aria-hidden");
        } else {
          pageContent.setAttribute("aria-hidden", previousAriaHidden);
        }
      }
      const focusTarget = desktopQuery.matches
        ? document.getElementById("admin-sidebar-toggle")
        : (drawerTrigger ?? previouslyFocused);
      focusTarget?.focus();
    };
  }, [closeDrawer, isDrawerOpen]);

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };

  const pageId = getAdminPageId(pathname);
  const sidebarLabelClassName = isSidebarExpanded
    ? "max-w-52 translate-x-0 opacity-100"
    : "pointer-events-none max-w-0 -translate-x-2 opacity-0";

  return (
    <AdminNavigationContext.Provider value={navigationContext}>
      <div id={pageId} className="min-h-screen bg-surface text-fg">
        <div
          id="admin-shell"
          data-sidebar-state={isSidebarExpanded ? "expanded" : "collapsed"}
          ref={pageContentRef}
          className={`min-h-screen lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out motion-reduce:transition-none ${
            isSidebarExpanded
              ? "lg:grid-cols-[18rem_minmax(0,1fr)]"
              : "lg:grid-cols-[4.25rem_minmax(0,1fr)]"
          }`}
        >
          <aside
            id="admin-desktop-sidebar"
            data-admin-sidebar
            data-expanded={isSidebarExpanded}
            className="hidden min-w-0 flex-col overflow-visible border-r border-line bg-surface-raised lg:sticky lg:top-0 lg:flex lg:h-screen"
          >
            <div
              data-admin-identity
              className="flex h-[76px] shrink-0 items-center gap-3 overflow-hidden px-4 py-5"
            >
              <button
                id="admin-sidebar-toggle"
                type="button"
                aria-label={
                  isSidebarExpanded
                    ? t.admin.navigation.collapseSidebar
                    : t.admin.navigation.expandSidebar
                }
                title={
                  isSidebarExpanded
                    ? t.admin.navigation.collapseSidebar
                    : t.admin.navigation.expandSidebar
                }
                aria-controls="admin-desktop-sidebar"
                aria-expanded={isSidebarExpanded}
                aria-keyshortcuts="Meta+B"
                onClick={toggleSidebar}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {isSidebarExpanded ? (
                  <LeftPanelCloseIcon className="h-6 w-6" />
                ) : (
                  <LeftPanelOpenIcon className="h-6 w-6" />
                )}
              </button>
              <span
                data-sidebar-label
                aria-hidden={!isSidebarExpanded}
                className={`overflow-hidden whitespace-nowrap text-lg font-bold leading-7 transition-[max-width,max-height,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                  isSidebarExpanded ? "max-h-9" : "max-h-0"
                } ${sidebarLabelClassName}`}
              >
                {t.cityName}
              </span>
            </div>
            <AdminNavigation
              model={model}
              currentPrimaryKey={navigationState.primaryKey}
              currentUserName={currentUserName}
              isExpanded={isSidebarExpanded}
              surface="desktop"
              isSigningOut={isSigningOut}
              isAccountMenuOpen={accountMenuSurface === "desktop"}
              onAccountMenuOpenChange={(open) =>
                setAccountMenuSurface(open ? "desktop" : null)
              }
              onSignOut={() => void signOut()}
            />
          </aside>

          <div className="min-w-0">
            <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-surface-raised px-4 lg:hidden">
              <span className="font-bold">{t.cityName}</span>
              <button
                ref={drawerTriggerRef}
                id="admin-menu-button"
                type="button"
                aria-label={t.admin.navigation.openMenu}
                aria-controls="admin-mobile-navigation"
                aria-expanded={isDrawerOpen}
                onClick={() => setIsDrawerOpen(true)}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <MenuIcon className="h-6 w-6" />
              </button>
            </header>
            <main className="w-full px-4 py-8 md:px-6 lg:pb-8 lg:pt-5">
              {children}
            </main>
          </div>
        </div>

        {isDrawerOpen ? (
          <div
            id="admin-mobile-navigation"
            className="fixed inset-0 z-[60] lg:hidden"
          >
            <button
              type="button"
              aria-label={t.admin.navigation.closeMenu}
              onClick={closeDrawer}
              className="absolute inset-0 cursor-default bg-black/45"
            />
            <div
              ref={drawerRef}
              id="admin-mobile-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={t.admin.title}
              tabIndex={-1}
              className="absolute inset-y-0 left-0 flex h-dvh w-80 max-w-[85vw] flex-col border-r border-line bg-surface-raised shadow-2xl"
            >
              <div
                data-admin-identity
                className="flex h-16 shrink-0 items-center justify-between px-4"
              >
                <span className="font-bold">{t.cityName}</span>
                <button
                  ref={drawerCloseButtonRef}
                  type="button"
                  aria-label={t.admin.navigation.closeMenu}
                  onClick={closeDrawer}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <CloseIcon className="h-6 w-6" />
                </button>
              </div>
              <AdminNavigation
                model={model}
                currentPrimaryKey={navigationState.primaryKey}
                currentUserName={currentUserName}
                isExpanded
                surface="drawer"
                isSigningOut={isSigningOut}
                isAccountMenuOpen={accountMenuSurface === "drawer"}
                onAccountMenuOpenChange={(open) =>
                  setAccountMenuSurface(open ? "drawer" : null)
                }
                onNavigate={closeDrawer}
                onSignOut={() => void signOut()}
              />
            </div>
          </div>
        ) : null}
      </div>
    </AdminNavigationContext.Provider>
  );
}

function getAdminPageId(pathname: string) {
  if (pathname === "/admin/reservations/bookings") {
    return "reservation-booking-list-page";
  }
  if (pathname === "/admin/reservations/api-keys") {
    return "reservation-api-keys-page";
  }
  if (pathname === "/admin/reservations/api-keys/logs") {
    return "reservation-api-logs-page";
  }
  if (pathname.startsWith("/admin/reservations/api-keys/logs/")) {
    return "reservation-api-log-detail-page";
  }
  if (pathname.startsWith("/admin/reservations")) {
    return "reservation-system-page";
  }
  return undefined;
}
