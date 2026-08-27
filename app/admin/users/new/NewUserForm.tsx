"use client";

import { useState } from "react";

import {
  getAdminRoleDisplayDescription,
  getAdminRoleDisplayName,
} from "@/app/components/admin/role-display";

import { ContentCopyIcon } from "../../../components/svg/ContentCopyIcon";
import { useI18n } from "../../../i18n/LanguageProvider";

type CreatedUser = {
  email: string;
  temporaryPassword: string;
};

type CopyFeedback = {
  kind: "success" | "error";
  message: string;
};

export function NewUserForm({
  availableRoles,
  canAssignRoles,
}: {
  availableRoles: Array<{
    id: string;
    name: string;
    description: string | null;
    systemKey: "FULL_ACCESS" | "NO_ACCESS" | null;
  }>;
  canAssignRoles: boolean;
}) {
  const { t } = useI18n();
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (formData: FormData) => {
    setError(null);
    setCopyFeedback(null);
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
          accessRoleIds: canAssignRoles
            ? formData.getAll("accessRoleIds").map(String)
            : [],
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

  const copyTemporaryPassword = async () => {
    if (!createdUser) return;

    setCopyFeedback(null);

    try {
      await navigator.clipboard.writeText(createdUser.temporaryPassword);
      setCopyFeedback({
        kind: "success",
        message: t.auth.temporaryPasswordCopied,
      });
    } catch {
      setCopyFeedback({
        kind: "error",
        message: t.auth.temporaryPasswordCopyFailed,
      });
    }
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
        <div className="rounded-lg border border-accent/40 bg-surface-accent-subtle p-4 text-fg">
          <h2 className="text-lg font-bold">{t.admin.issuedPasswordTitle}</h2>
          <p className="mt-1 text-sm">{t.admin.issuedPasswordDescription}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="font-semibold">{t.auth.email}</dt>
              <dd>{createdUser.email}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t.auth.temporaryPassword}</dt>
              <dd className="mt-1 flex min-h-11 items-stretch rounded-md bg-surface-raised pl-3 font-mono text-base text-fg">
                <span className="min-w-0 flex-1 select-all overflow-x-auto py-2">
                  {createdUser.temporaryPassword}
                </span>
                <button
                  type="button"
                  aria-label={t.auth.copyTemporaryPassword}
                  aria-describedby={
                    copyFeedback ? "temporary-password-copy-feedback" : undefined
                  }
                  title={t.auth.copyTemporaryPassword}
                  onClick={copyTemporaryPassword}
                  className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-r-md text-fg-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:text-accent"
                >
                  <ContentCopyIcon height={20} width={20} />
                </button>
              </dd>
              {copyFeedback ? (
                <p
                  id="temporary-password-copy-feedback"
                  role={copyFeedback.kind === "error" ? "alert" : "status"}
                  aria-live={
                    copyFeedback.kind === "error" ? "assertive" : "polite"
                  }
                  className={`mt-2 text-xs font-semibold ${
                    copyFeedback.kind === "error"
                      ? "text-red-700 dark:text-red-200"
                      : "text-accent"
                  }`}
                >
                  {copyFeedback.message}
                </p>
              ) : null}
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
          <span className="block text-xs leading-5 text-fg-muted">
            {t.admin.accessControl.adminAttributeHelp}
          </span>
        </label>
        {canAssignRoles ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">
              {t.admin.accessControl.assignedRoles}
            </legend>
            <p className="text-xs leading-5 text-fg-muted">
              {t.admin.accessControl.assignedRolesHelp}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableRoles.map((role) => (
                <label key={role.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-surface-selected">
                  <input
                    type="checkbox"
                    name="accessRoleIds"
                    value={role.id}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  <span>
                    <span className="block font-semibold">
                      {getAdminRoleDisplayName(role, t.admin.accessControl)}
                    </span>
                    {getAdminRoleDisplayDescription(role, t.admin.accessControl) ? (
                      <span className="mt-1 block text-xs leading-5 text-fg-muted">
                        {getAdminRoleDisplayDescription(role, t.admin.accessControl)}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
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
