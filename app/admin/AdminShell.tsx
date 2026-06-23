"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { authClient } from "@/lib/auth-client";

import { useI18n } from "../i18n/LanguageProvider";

type AdminShellProps = {
  children: ReactNode;
  isAdmin: boolean;
};

export function AdminShell({ children, isAdmin }: AdminShellProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
          <nav className="ml-auto flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <>
                <Link
                  href="/admin/users"
                  className="rounded-md px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover hover:text-accent"
                >
                  {t.admin.users}
                </Link>
                <Link
                  href="/admin/users/new"
                  className="rounded-md px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover hover:text-accent"
                >
                  {t.admin.newUser}
                </Link>
                <Link
                  href="/admin/password-reset-requests"
                  className="rounded-md px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-hover hover:text-accent"
                >
                  {t.admin.passwordResets}
                </Link>
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
