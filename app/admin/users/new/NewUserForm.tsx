"use client";

import { useState } from "react";

import { getAdminRoleDisplayName } from "@/app/components/admin/role-display";
import { Select } from "@/app/components/Select";

import { ContentCopyIcon } from "../../../components/svg/ContentCopyIcon";
import { useI18n } from "../../../i18n/LanguageProvider";
import { AdminSectionNavigation } from "../../AdminSectionNavigation";

type CreatedUser = {
  email: string;
  accessRoleName: string;
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
  const defaultAccessRoleId =
    availableRoles.find((role) => role.systemKey === "NO_ACCESS")?.id ?? "";

  const submit = async (formData: FormData) => {
    setError(null);
    setCopyFeedback(null);
    setCreatedUser(null);
    setIsSubmitting(true);
    const accessRoleId = canAssignRoles
      ? String(formData.get("accessRoleId") ?? "")
      : "";
    const selectedAccessRole = availableRoles.find(
      (role) => role.id === accessRoleId,
    );

    const response = await fetch(
      "/api/admin/users",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          role: String(formData.get("role") ?? "user"),
          accessRoleIds: accessRoleId ? [accessRoleId] : [],
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
      accessRoleName: selectedAccessRole
        ? getAdminRoleDisplayName(selectedAccessRole, t.admin.accessControl)
        : t.admin.accessControl.systemRoleNames.NO_ACCESS,
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
    <section>
      <div data-admin-page-chrome className="space-y-4">
        <div
          data-admin-page-header
          className="ml-1 mr-0 max-w-2xl space-y-2"
        >
          <h1 className="text-2xl font-bold">{t.admin.createUserTitle}</h1>
          <p className="text-sm leading-6 text-fg-muted">
            {t.admin.createUserDescription}
          </p>
        </div>
        <AdminSectionNavigation />
      </div>

      <div data-admin-page-body className="ml-1 mr-0 mt-6 max-w-2xl space-y-6">
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
              <dt className="font-semibold">
                {t.admin.userManagement.accessRoles}
              </dt>
              <dd>{createdUser.accessRoleName}</dd>
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
          <Select
            name="role"
            defaultValue="user"
          >
            <option value="user">{t.auth.roleUser}</option>
            <option value="admin">{t.auth.roleAdmin}</option>
          </Select>
          <span className="block text-xs leading-5 text-fg-muted">
            {t.admin.accessControl.adminAttributeHelp}
          </span>
        </label>
        {canAssignRoles ? (
          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              {t.admin.userManagement.accessRoles}
            </span>
            <Select
              name="accessRoleId"
              required
              defaultValue={defaultAccessRoleId}
            >
              {defaultAccessRoleId === "" ? (
                <option value="" disabled>
                  {t.admin.accessControl.noAssignedRoles}
                </option>
              ) : null}
              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {getAdminRoleDisplayName(role, t.admin.accessControl)}
                </option>
              ))}
            </Select>
            <span className="block text-xs leading-5 text-fg-muted">
              {t.admin.accessControl.assignedRolesHelp}
            </span>
          </label>
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
      </div>
    </section>
  );
}
