"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useI18n } from "../i18n/LanguageProvider";

export function ChangePasswordForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (formData: FormData) => {
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    const response = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: String(formData.get("currentPassword") ?? ""),
        newPassword: String(formData.get("newPassword") ?? ""),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? t.auth.error);
      return;
    }

    setSuccess(true);
    router.push("/admin");
    router.refresh();
  };

  return (
    <section className="mx-auto max-w-md rounded-lg border border-line bg-surface-raised p-6 shadow-sm">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold">{t.auth.changePasswordTitle}</h1>
        <p className="text-sm leading-6 text-fg-muted">
          {t.auth.changePasswordDescription}
        </p>
      </div>
      <form action={submit} className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-semibold">
            {t.auth.currentPassword}
          </span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-semibold">{t.auth.newPassword}</span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
          />
        </label>
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-1100">
            {t.auth.passwordChanged}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.auth.changePassword}
        </button>
      </form>
    </section>
  );
}
