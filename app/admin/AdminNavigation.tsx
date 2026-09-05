"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  type ComponentType,
  type KeyboardEvent,
} from "react";

import { CalendarMonthIcon } from "@/app/components/svg/CalendarMonthIcon";
import { CodeIcon } from "@/app/components/svg/CodeIcon";
import { PhoneIcon } from "@/app/components/svg/PhoneIcon";
import { ChatIcon } from "@/app/components/svg/ChatIcon";
import { ShieldIcon } from "@/app/components/svg/ShieldIcon";
import { ChevronLeftIcon } from "@/app/components/svg/ChevronLeftIcon";
import { DashboardIcon } from "@/app/components/svg/DashboardIcon";
import { GroupIcon } from "@/app/components/svg/GroupIcon";
import { LogoutIcon } from "@/app/components/svg/LogoutIcon";
import { SettingsIcon } from "@/app/components/svg/SettingsIcon";
import { SmartToyIcon } from "@/app/components/svg/SmartToyIcon";

import { useI18n } from "../i18n/LanguageProvider";
import type {
  AdminNavigationModel,
  AdminPrimaryNavigationKey,
} from "./admin-navigation";

type AdminNavigationProps = {
  model: AdminNavigationModel;
  currentPrimaryKey: AdminPrimaryNavigationKey | null;
  currentUserName: string;
  isExpanded: boolean;
  surface: "desktop" | "drawer";
  isSigningOut: boolean;
  isAccountMenuOpen: boolean;
  onNavigate?: () => void;
  onAccountMenuOpenChange: (open: boolean) => void;
  onSignOut: () => void;
};

const primaryIcons: Record<
  AdminPrimaryNavigationKey,
  ComponentType<{ className?: string }>
> = {
  dashboard: DashboardIcon,
  users: GroupIcon,
  "phone-settings": PhoneIcon,
  "chat-settings": ChatIcon,
  settings: SettingsIcon,
  roles: ShieldIcon,
  "developer-api": CodeIcon,
  reservations: CalendarMonthIcon,
  zaad: SmartToyIcon,
};

const ACCOUNT_ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

export function AdminNavigation({
  model,
  currentPrimaryKey,
  currentUserName,
  isExpanded,
  surface,
  isSigningOut,
  isAccountMenuOpen,
  onNavigate,
  onAccountMenuOpenChange,
  onSignOut,
}: AdminNavigationProps) {
  const { t } = useI18n();
  const accountContainerRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const signOutRequestedRef = useRef(false);
  const showLabels = surface === "drawer" || isExpanded;
  const accountMenuId = `admin-account-menu-${surface}`;
  const avatarLabel = currentUserName.trim().charAt(0) || "?";
  const accountAccessibleLabel = (
    isAccountMenuOpen
      ? t.admin.navigation.closeAccountMenu
      : t.admin.navigation.openAccountMenu
  ).replace("{name}", currentUserName);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!accountContainerRef.current?.contains(event.target as Node)) {
        onAccountMenuOpenChange(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onAccountMenuOpenChange(false);
      accountTriggerRef.current?.focus();
    };

    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAccountMenuOpen, onAccountMenuOpenChange]);

  const openAccountMenu = (focus: "first" | "last") => {
    onAccountMenuOpenChange(true);
    window.requestAnimationFrame(() => {
      const items = Array.from(
        accountMenuRef.current?.querySelectorAll<HTMLElement>(
          ACCOUNT_ITEM_SELECTOR,
        ) ?? [],
      );
      (focus === "first" ? items[0] : items.at(-1))?.focus();
    });
  };

  const handleAccountMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      onAccountMenuOpenChange(false);
      return;
    }
    const items = Array.from(
      accountMenuRef.current?.querySelectorAll<HTMLElement>(
        ACCOUNT_ITEM_SELECTOR,
      ) ?? [],
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  const labelClassName = showLabels
    ? "max-w-52 translate-x-0 opacity-100"
    : "pointer-events-none max-w-0 -translate-x-2 opacity-0";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav
        data-admin-primary-navigation
        aria-label={t.admin.title}
        className="space-y-1 overflow-y-auto px-3 py-3"
      >
        {model.primaryItems.map((item) => {
          const Icon = primaryIcons[item.key];
          const isCurrent = currentPrimaryKey === item.key;

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={!showLabels ? item.label : undefined}
              title={!showLabels ? item.label : undefined}
              onClick={onNavigate}
              className={`flex h-12 items-center overflow-hidden rounded-lg px-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isCurrent
                  ? "bg-surface-selected text-accent"
                  : "text-fg-muted hover:bg-surface-hover hover:text-fg"
              }`}
            >
              <Icon className="h-6 w-6 shrink-0" />
              <span
                data-sidebar-label
                aria-hidden={!showLabels}
                className={`ml-3 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${labelClassName}`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        ref={accountContainerRef}
        data-admin-account
        className="relative mt-auto shrink-0 p-3"
        onBlur={(event) => {
          if (isSigningOut || signOutRequestedRef.current) return;
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            onAccountMenuOpenChange(false);
          }
        }}
      >
        {isAccountMenuOpen ? (
          <div
            ref={accountMenuRef}
            id={accountMenuId}
            role="menu"
            data-admin-account-menu
            aria-label={t.admin.navigation.accountMenuLabel}
            onKeyDown={handleAccountMenuKeyDown}
            className="absolute bottom-full left-3 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-line bg-surface-raised p-2 shadow-xl"
          >
            <Link
              href="/"
              role="menuitem"
              data-account-menu-item
              onClick={() => {
                onAccountMenuOpenChange(false);
                onNavigate?.();
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            >
              <ChevronLeftIcon className="h-5 w-5 shrink-0" />
              <span>{t.admin.navigation.backToSite}</span>
            </Link>
            <button
              type="button"
              role="menuitem"
              data-account-menu-item
              disabled={isSigningOut}
              onClick={() => {
                signOutRequestedRef.current = true;
                onSignOut();
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogoutIcon className="h-5 w-5 shrink-0" />
              <span>{t.auth.signOut}</span>
            </button>
          </div>
        ) : null}

        <button
          ref={accountTriggerRef}
          type="button"
          data-admin-account-trigger
          aria-haspopup="menu"
          aria-expanded={isAccountMenuOpen}
          aria-controls={accountMenuId}
          aria-label={accountAccessibleLabel}
          title={!showLabels ? accountAccessibleLabel : undefined}
          onClick={() => {
            if (isAccountMenuOpen) {
              onAccountMenuOpenChange(false);
            } else {
              openAccountMenu("first");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              openAccountMenu("first");
            }
          }}
          className="flex h-12 w-full cursor-pointer items-center overflow-hidden rounded-lg px-2 text-left text-sm font-semibold text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {avatarLabel}
          </span>
          <span
            data-admin-current-user
            data-sidebar-label
            aria-hidden={!showLabels}
            className={`ml-3 overflow-hidden text-ellipsis whitespace-nowrap transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${labelClassName}`}
          >
            {currentUserName}
          </span>
        </button>
      </div>
    </div>
  );
}
