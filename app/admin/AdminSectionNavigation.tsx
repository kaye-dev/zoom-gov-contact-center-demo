"use client";

import Link from "next/link";

import { useI18n } from "../i18n/LanguageProvider";
import { useAdminNavigationContext } from "./AdminShell";

export function AdminSectionNavigation() {
  const { t } = useI18n();
  const { model, navigationState } = useAdminNavigationContext();
  const sectionKey = navigationState.sectionKey;

  if (!sectionKey) return null;
  const items = model.sections[sectionKey];
  if (!items?.length) return null;

  const label =
    sectionKey === "users"
      ? t.admin.navigation.usersSectionNavigation
      : t.admin.navigation.settingsSectionNavigation;

  return (
    <nav
      id="admin-section-navigation"
      aria-label={label}
      className="-mx-4 overflow-x-auto border-b border-line px-4 md:-mx-6 md:px-6"
    >
      <div className="flex min-w-max gap-8">
        {items.map((item) => {
          const isCurrent = navigationState.sectionItemKey === item.key;

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                isCurrent
                  ? "border-accent font-bold text-accent"
                  : "border-transparent font-semibold text-fg-muted hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
