"use client";

import Link from "next/link";
import { useState } from "react";

import { fetchWithAwsPayloadHash } from "@/lib/client-fetch";

import { useI18n } from "../i18n/LanguageProvider";

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (formData: FormData) => {
    setError(null);
    setIsSubmitting(true);

    const response = await fetchWithAwsPayloadHash(
      "/api/password-reset-requests",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") ?? ""),
        }),
      },
    );

    setIsSubmitting(false);

    if (!response.ok) {
      setError(t.auth.error);
      return;
    }

    setIsDone(true);
  };

  return (
    <section className="mx-auto max-w-md rounded-lg border border-line bg-surface-raised p-6 shadow-sm">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold">{t.auth.forgotPasswordTitle}</h1>
        <p className="text-sm leading-6 text-fg-muted">
          {t.auth.forgotPasswordDescription}
        </p>
      </div>
      {isDone ? (
        <div className="space-y-4">
          <p className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-1100">
            {t.auth.resetRequestSent}
          </p>
          <Link
            href="/login"
            className="inline-flex text-sm font-semibold text-accent hover:underline"
          >
            {t.auth.login}
          </Link>
        </div>
      ) : (
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
            {t.auth.requestReset}
          </button>
        </form>
      )}
    </section>
  );
}
