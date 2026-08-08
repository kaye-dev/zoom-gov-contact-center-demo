"use client";

import { useState } from "react";

import { useI18n } from "../../../i18n/LanguageProvider";

type CreatedUser = {
  email: string;
  temporaryPassword: string;
};

export function NewUserForm() {
  const { t } = useI18n();
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (formData: FormData) => {
    setError(null);
    setCreatedUser(null);
    setIsSubmitting(true);

    const response = await fetch(
      "/api/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          role: String(formData.get("role") ?? "user"),
        }),
      },
    );

    setIsSubmitting(false);

    const body = (await response.json().catch(() => null)) as
      | {
          user?: { email: string };
          temporaryPassword?: string;
          error?: string;
        }
      | null;

    if (!response.ok || !body?.temporaryPassword || !body.user) {
      setError(body?.error ?? t.auth.error);
      return;
    }

    setCreatedUser({
      email: body.user.email,
      temporaryPassword: body.temporaryPassword,
    });
  };

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t.admin.createUserTitle}</h1>
        <p className="text-sm leading-6 text-fg-muted">
          {t.admin.createUserDescription}
        </p>
      </div>

      {createdUser ? (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-primary-1100">
          <h2 className="text-lg font-bold">{t.admin.issuedPasswordTitle}</h2>
          <p className="mt-1 text-sm">{t.admin.issuedPasswordDescription}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="font-semibold">{t.auth.email}</dt>
              <dd>{createdUser.email}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.auth.temporaryPassword}</dt>
              <dd className="mt-1 rounded-md bg-white px-3 py-2 font-mono text-base text-primary-1200">
                {createdUser.temporaryPassword}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <form
        action={submit}
        className="space-y-4 rounded-lg border border-line bg-surface-raised p-6 shadow-sm"
      >
        <label className="block space-y-2">
          <span className="text-sm font-semibold">{t.auth.name}</span>
          <input
            name="name"
            required
            autoComplete="name"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
          />
        </label>
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
          <span className="text-sm font-semibold">{t.auth.role}</span>
          <select
            name="role"
            defaultValue="user"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none transition-colors focus:border-accent"
          >
            <option value="user">{t.auth.roleUser}</option>
            <option value="admin">{t.auth.roleAdmin}</option>
          </select>
        </label>
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="cursor-pointer rounded-md bg-primary px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.admin.createUser}
        </button>
      </form>
    </section>
  );
}
