"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import { useI18n } from "../i18n/LanguageProvider";

export function LoginForm({ callbackURL }: { callbackURL: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (formData: FormData) => {
    setError(null);
    setIsSubmitting(true);

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await authClient.signIn.email({
      email,
      password,
    });

    if (result.error) {
      setError(result.error.message ?? t.auth.error);
      setIsSubmitting(false);
      return;
    }

    const session = await authClient.getSession();
    const user = session.data?.user as
      | { mustChangePassword?: boolean | null }
      | undefined;

    router.push(user?.mustChangePassword ? "/change-password" : callbackURL);
    router.refresh();
  };

  return (
    <section className="mx-auto max-w-md rounded-lg border border-line bg-surface-raised p-6 shadow-sm">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold">{t.auth.loginTitle}</h1>
        <p className="text-sm leading-6 text-fg-muted">
          {t.auth.loginDescription}
        </p>
      </div>
      <form action={submit} className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-semibold">{t.auth.email}</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-semibold">{t.auth.password}</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
          />
        </label>
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.auth.login}
        </button>
      </form>
      <Link
        href="/forgot-password"
        className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline"
      >
        {t.auth.forgotPassword}
      </Link>
    </section>
  );
}
